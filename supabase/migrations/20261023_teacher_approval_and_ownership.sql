-- =====================================================================
-- 우리 반 가상 미술관 — 교사 승인제 & 교사별 전시 소유 (2026-10-23)
-- ---------------------------------------------------------------------
-- 1) 회원가입 → teachers 테이블에 'pending'으로 자동 등록 → 관리자가 'approved'로 바꿔야 관리 기능 사용 가능
-- 2) 전시마다 소유 교사(owner_id)를 두고, 교사는 자기 전시만 조회·수정·삭제 가능
-- 3) 교사마다 '현재 전시'(is_active) 하나 → 방문자는 교사별 공유 코드(?t=코드)로 그 전시를 관람
--    지난 전시(is_active=false)는 소유 교사 외에는 아무도 볼 수 없음
-- 4) 좋아요: 방문자 키를 요청 헤더(x-visitor-key)로 받아 '본인 것만' 조회·취소, 집계는 like_counts()로
-- 5) 댓글 길이 제한(이름 10자, 내용 80자)을 DB 규칙으로 강제
-- 6) 보안 진단 대응: rls_auto_enable() 실행 권한 회수, 버킷 용량·형식 제한
--
-- ⚠️ 이 SQL은 앱(index.html) 수정과 "동시에" 반영해야 합니다.
--    (좋아요 헤더, 공유 코드 링크, 현재 전시 설정 방식이 바뀌기 때문)
-- 되돌리기: supabase/rollback/20261023_teacher_approval_and_ownership_rollback.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. 정책 전용 헬퍼 함수를 둘 비공개 스키마 (API로 노출되지 않음)
-- ---------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. 교사 명단
-- ---------------------------------------------------------------------
create table public.teachers (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_admin    boolean not null default false,
  share_code  text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_at  timestamptz not null default now(),
  approved_at timestamptz
);
alter table public.teachers enable row level security;

-- 회원가입 시 자동으로 'pending' 등록
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.teachers (user_id, email) values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created_teacher
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- 기존 계정 등록 (모두 pending) → 관리자 계정만 승인
insert into public.teachers (user_id, email)
select id, coalesce(email, '') from auth.users
on conflict (user_id) do nothing;

update public.teachers
   set status = 'approved', is_admin = true, approved_at = now()
 where email = 'jhbaek0817@naver.com';   -- ← 관리자 계정 (기존 전시 4개를 올린 계정)

do $$
begin
  if not exists (select 1 from public.teachers where is_admin) then
    raise exception '관리자 계정을 찾지 못했습니다. 위 이메일을 확인하세요.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. 전시 소유자 & 현재 전시
-- ---------------------------------------------------------------------
alter table public.exhibitions
  add column owner_id  uuid references auth.users(id) on delete set null default auth.uid(),
  add column is_active boolean not null default false;

-- 기존 전시 4개는 모두 관리자 소유로, 가장 최근 전시를 현재 전시로
update public.exhibitions
   set owner_id = (select user_id from public.teachers where is_admin limit 1)
 where owner_id is null;
update public.exhibitions
   set is_active = true
 where id = (select id from public.exhibitions order by created_at desc limit 1);

create unique index exhibitions_one_active_per_owner on public.exhibitions (owner_id) where is_active;
create index idx_exhibitions_owner on public.exhibitions (owner_id);

-- ---------------------------------------------------------------------
-- 3. 정책 헬퍼 함수 (private 스키마)
-- ---------------------------------------------------------------------
create function private.is_approved_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teachers t
                  where t.user_id = auth.uid() and t.status = 'approved');
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teachers t
                  where t.user_id = auth.uid() and t.status = 'approved' and t.is_admin);
$$;

-- 로그인한 승인 교사가 이 전시의 소유자인가
create function private.can_manage_exhibition(p_ex uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.exhibitions e
                   join public.teachers t on t.user_id = e.owner_id
                  where e.id = p_ex and e.owner_id = auth.uid() and t.status = 'approved');
$$;

-- 방문자에게 공개된 전시인가 (승인 교사의 현재 전시)
create function private.is_public_exhibition(p_ex uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.exhibitions e
                   join public.teachers t on t.user_id = e.owner_id
                  where e.id = p_ex and e.is_active and t.status = 'approved');
$$;

create function private.room_exhibition(p_room uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select r.exhibition_id from public.rooms r where r.id = p_room;
$$;

create function private.artwork_exhibition(p_art uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select r.exhibition_id from public.artworks a
    join public.rooms r on r.id = a.room_id
   where a.id = p_art;
$$;

-- Storage 경로 "전시ID/전시실ID/파일명"의 첫 폴더로 소유 여부 판단
create function private.can_manage_storage_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return private.can_manage_exhibition(split_part(p_name, '/', 1)::uuid);
exception when invalid_text_representation then
  return false;
end;
$$;

-- 요청 헤더 x-visitor-key (앱이 supabase-js global headers로 전달)
create function private.request_visitor_key() returns text
language sql stable set search_path = '' as $$
  select nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-visitor-key', '');
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. 앱에서 호출하는 RPC (public 스키마)
-- ---------------------------------------------------------------------
-- 공유 코드 → 그 교사의 현재 전시
-- 코드 없이(p_code null) 접속하면 관리자의 현재 전시 (기존에 배포된 QR·링크 호환)
create function public.get_active_exhibition(p_code text)
returns table (id uuid, title text, grade integer, class text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.grade, e.class
    from public.exhibitions e
    join public.teachers t on t.user_id = e.owner_id
   where t.status = 'approved' and e.is_active
     and (t.share_code = p_code or (p_code is null and t.is_admin))
   limit 1;
$$;

-- 작품별 좋아요 수 (likes 행 자체는 본인 것만 보이므로 집계는 이 함수로)
create function public.like_counts(p_artwork_ids uuid[])
returns table (artwork_id uuid, like_count bigint)
language sql stable security definer set search_path = '' as $$
  select l.artwork_id, count(*)
    from public.likes l
   where l.artwork_id = any (p_artwork_ids)
     and (private.is_public_exhibition(private.artwork_exhibition(l.artwork_id))
          or private.can_manage_exhibition(private.artwork_exhibition(l.artwork_id)))
   group by l.artwork_id;
$$;

-- 내 전시 중 하나를 현재 전시로 (호출자 권한으로 실행 → RLS 적용)
create function public.set_active_exhibition(p_ex uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.exhibitions set is_active = false
   where owner_id = auth.uid() and is_active and id <> p_ex;
  update public.exhibitions set is_active = true
   where id = p_ex and owner_id = auth.uid();
  if not found then
    raise exception '내 전시가 아니거나 존재하지 않는 전시입니다.';
  end if;
end;
$$;

revoke all on function public.get_active_exhibition(text) from public;
revoke all on function public.like_counts(uuid[])          from public;
revoke all on function public.set_active_exhibition(uuid)   from public;
grant execute on function public.get_active_exhibition(text) to anon, authenticated;
grant execute on function public.like_counts(uuid[])          to anon, authenticated;
grant execute on function public.set_active_exhibition(uuid)   to authenticated;

-- ---------------------------------------------------------------------
-- 5. 기존 정책 삭제
-- ---------------------------------------------------------------------
drop policy "교사만 전시 생성/수정/삭제 가능"         on public.exhibitions;
drop policy "누구나 전시 조회 가능"                   on public.exhibitions;
drop policy "교사만 전시실 생성/수정/삭제 가능"       on public.rooms;
drop policy "누구나 전시실 조회 가능"                 on public.rooms;
drop policy "교사만 작품 생성/수정/삭제 가능"         on public.artworks;
drop policy "누구나 작품 조회 가능"                   on public.artworks;
drop policy "교사만 댓글 삭제 가능"                   on public.comments;
drop policy "누구나 댓글 등록 가능 (숨김 상태로는 등록 불" on public.comments;
drop policy "교사는 숨김 댓글 포함 전체 조회 가능"    on public.comments;
drop policy "숨김 처리되지 않은 댓글은 누구나 조회 가능" on public.comments;
drop policy "교사만 댓글 수정(숨김 처리) 가능"        on public.comments;
drop policy "누구나 자신의 좋아요 취소 가능"          on public.likes;
drop policy "누구나 좋아요 등록 가능"                 on public.likes;
drop policy "누구나 좋아요 조회 가능"                 on public.likes;
drop policy "교사만 작품 이미지 삭제 가능"            on storage.objects;
drop policy "교사만 작품 이미지 업로드 가능"          on storage.objects;
-- ("누구나 작품 이미지 조회 가능"은 그대로 유지)

-- ---------------------------------------------------------------------
-- 6. 새 정책
-- ---------------------------------------------------------------------
-- teachers: 본인 행 조회, 관리자는 전체 조회·승인
create policy "본인 교사 정보 조회" on public.teachers for select
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "관리자만 교사 승인/변경" on public.teachers for update
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- exhibitions
create policy "공개 전시 또는 내 전시 조회" on public.exhibitions for select
  using (private.is_public_exhibition(id) or owner_id = (select auth.uid()));
create policy "승인 교사만 내 전시 생성" on public.exhibitions for insert
  with check (owner_id = (select auth.uid()) and (select private.is_approved_teacher()));
create policy "내 전시만 수정" on public.exhibitions for update
  using (private.can_manage_exhibition(id))
  with check (owner_id = (select auth.uid()) and (select private.is_approved_teacher()));
create policy "내 전시만 삭제" on public.exhibitions for delete
  using (private.can_manage_exhibition(id));

-- rooms
create policy "공개 전시 또는 내 전시의 전시실 조회" on public.rooms for select
  using (private.is_public_exhibition(exhibition_id) or private.can_manage_exhibition(exhibition_id));
create policy "내 전시에만 전시실 생성" on public.rooms for insert
  with check (private.can_manage_exhibition(exhibition_id));
create policy "내 전시의 전시실만 수정" on public.rooms for update
  using (private.can_manage_exhibition(exhibition_id))
  with check (private.can_manage_exhibition(exhibition_id));
create policy "내 전시의 전시실만 삭제" on public.rooms for delete
  using (private.can_manage_exhibition(exhibition_id));

-- artworks
create policy "공개 전시 또는 내 전시의 작품 조회" on public.artworks for select
  using (private.is_public_exhibition(private.room_exhibition(room_id))
         or private.can_manage_exhibition(private.room_exhibition(room_id)));
create policy "내 전시에만 작품 생성" on public.artworks for insert
  with check (private.can_manage_exhibition(private.room_exhibition(room_id)));
create policy "내 전시의 작품만 수정" on public.artworks for update
  using (private.can_manage_exhibition(private.room_exhibition(room_id)))
  with check (private.can_manage_exhibition(private.room_exhibition(room_id)));
create policy "내 전시의 작품만 삭제" on public.artworks for delete
  using (private.can_manage_exhibition(private.room_exhibition(room_id)));

-- comments
create policy "공개 댓글 또는 내 전시의 전체 댓글 조회" on public.comments for select
  using ((not is_hidden and private.is_public_exhibition(private.artwork_exhibition(artwork_id)))
         or private.can_manage_exhibition(private.artwork_exhibition(artwork_id)));
create policy "공개 전시에 댓글 등록 (숨김 상태로는 불가)" on public.comments for insert
  with check (not is_hidden
              and (private.is_public_exhibition(private.artwork_exhibition(artwork_id))
                   or private.can_manage_exhibition(private.artwork_exhibition(artwork_id))));
create policy "내 전시의 댓글만 수정(숨김)" on public.comments for update
  using (private.can_manage_exhibition(private.artwork_exhibition(artwork_id)))
  with check (private.can_manage_exhibition(private.artwork_exhibition(artwork_id)));
create policy "내 전시의 댓글만 삭제" on public.comments for delete
  using (private.can_manage_exhibition(private.artwork_exhibition(artwork_id)));

alter table public.comments
  add constraint comments_nickname_len check (char_length(nickname) between 1 and 10),
  add constraint comments_content_len  check (char_length(btrim(content)) between 1 and 80);

-- likes
create policy "내 좋아요 또는 내 전시의 좋아요 조회" on public.likes for select
  using (visitor_key = private.request_visitor_key()
         or private.can_manage_exhibition(private.artwork_exhibition(artwork_id)));
create policy "내 방문자 키로만 좋아요 등록" on public.likes for insert
  with check (visitor_key = private.request_visitor_key()
              and (private.is_public_exhibition(private.artwork_exhibition(artwork_id))
                   or private.can_manage_exhibition(private.artwork_exhibition(artwork_id))));
create policy "내 좋아요만 취소" on public.likes for delete
  using (visitor_key = private.request_visitor_key());

-- storage.objects (artwork-images): 내 전시 폴더에만 업로드·수정·삭제
create policy "내 전시 폴더에만 이미지 업로드" on storage.objects for insert
  with check (bucket_id = 'artwork-images' and private.can_manage_storage_path(name));
create policy "내 전시 폴더의 이미지만 수정" on storage.objects for update
  using (bucket_id = 'artwork-images' and private.can_manage_storage_path(name))
  with check (bucket_id = 'artwork-images' and private.can_manage_storage_path(name));
create policy "내 전시 폴더의 이미지만 삭제" on storage.objects for delete
  using (bucket_id = 'artwork-images' and private.can_manage_storage_path(name));

-- ---------------------------------------------------------------------
-- 7. 보안 진단 대응 & 버킷 제한
-- ---------------------------------------------------------------------
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

update storage.buckets
   set file_size_limit = 10485760,   -- 10MB (현재 최대 3.2MB)
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 where id = 'artwork-images';

commit;
