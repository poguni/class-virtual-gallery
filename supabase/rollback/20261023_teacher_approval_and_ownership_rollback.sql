-- =====================================================================
-- 되돌리기: 20261023_teacher_approval_and_ownership.sql 적용 이전 상태로 복원
-- (기존 정책 16개는 2026-10-23 pg_policies 조회 결과를 그대로 옮김)
-- ⚠️ teachers 테이블과 exhibitions.owner_id / is_active 값은 삭제됩니다.
-- =====================================================================

begin;

-- 새 정책 삭제
drop policy if exists "본인 교사 정보 조회"                      on public.teachers;
drop policy if exists "관리자만 교사 승인/변경"                  on public.teachers;
drop policy if exists "공개 전시 또는 내 전시 조회"              on public.exhibitions;
drop policy if exists "승인 교사만 내 전시 생성"                 on public.exhibitions;
drop policy if exists "내 전시만 수정"                           on public.exhibitions;
drop policy if exists "내 전시만 삭제"                           on public.exhibitions;
drop policy if exists "공개 전시 또는 내 전시의 전시실 조회"     on public.rooms;
drop policy if exists "내 전시에만 전시실 생성"                  on public.rooms;
drop policy if exists "내 전시의 전시실만 수정"                  on public.rooms;
drop policy if exists "내 전시의 전시실만 삭제"                  on public.rooms;
drop policy if exists "공개 전시 또는 내 전시의 작품 조회"       on public.artworks;
drop policy if exists "내 전시에만 작품 생성"                    on public.artworks;
drop policy if exists "내 전시의 작품만 수정"                    on public.artworks;
drop policy if exists "내 전시의 작품만 삭제"                    on public.artworks;
drop policy if exists "공개 댓글 또는 내 전시의 전체 댓글 조회"  on public.comments;
drop policy if exists "공개 전시에 댓글 등록 (숨김 상태로는 불가)" on public.comments;
drop policy if exists "내 전시의 댓글만 수정(숨김)"              on public.comments;
drop policy if exists "내 전시의 댓글만 삭제"                    on public.comments;
drop policy if exists "내 좋아요 또는 내 전시의 좋아요 조회"     on public.likes;
drop policy if exists "내 방문자 키로만 좋아요 등록"             on public.likes;
drop policy if exists "내 좋아요만 취소"                         on public.likes;
drop policy if exists "내 전시 폴더에만 이미지 업로드"           on storage.objects;
drop policy if exists "내 전시 폴더의 이미지만 수정"             on storage.objects;
drop policy if exists "내 전시 폴더의 이미지만 삭제"             on storage.objects;

-- 기존 정책 복원
create policy "교사만 전시 생성/수정/삭제 가능" on public.exhibitions for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "누구나 전시 조회 가능" on public.exhibitions for select using (true);
create policy "교사만 전시실 생성/수정/삭제 가능" on public.rooms for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "누구나 전시실 조회 가능" on public.rooms for select using (true);
create policy "교사만 작품 생성/수정/삭제 가능" on public.artworks for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "누구나 작품 조회 가능" on public.artworks for select using (true);
create policy "교사만 댓글 삭제 가능" on public.comments for delete
  using (auth.role() = 'authenticated');
create policy "누구나 댓글 등록 가능 (숨김 상태로는 등록 불" on public.comments for insert
  with check (is_hidden = false);
create policy "교사는 숨김 댓글 포함 전체 조회 가능" on public.comments for select
  using (auth.role() = 'authenticated');
create policy "숨김 처리되지 않은 댓글은 누구나 조회 가능" on public.comments for select
  using (is_hidden = false);
create policy "교사만 댓글 수정(숨김 처리) 가능" on public.comments for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "누구나 자신의 좋아요 취소 가능" on public.likes for delete using (true);
create policy "누구나 좋아요 등록 가능" on public.likes for insert with check (true);
create policy "누구나 좋아요 조회 가능" on public.likes for select using (true);
create policy "교사만 작품 이미지 삭제 가능" on storage.objects for delete
  using (bucket_id = 'artwork-images' and auth.role() = 'authenticated');
create policy "교사만 작품 이미지 업로드 가능" on storage.objects for insert
  with check (bucket_id = 'artwork-images' and auth.role() = 'authenticated');

-- 제약·컬럼·함수·테이블 제거
alter table public.comments drop constraint if exists comments_nickname_len;
alter table public.comments drop constraint if exists comments_content_len;

drop function if exists public.get_active_exhibition(text);
drop function if exists public.like_counts(uuid[]);
drop function if exists public.set_active_exhibition(uuid);

drop index if exists public.exhibitions_one_active_per_owner;
drop index if exists public.idx_exhibitions_owner;
alter table public.exhibitions drop column if exists owner_id, drop column if exists is_active;

drop trigger if exists on_auth_user_created_teacher on auth.users;
drop table if exists public.teachers;
drop schema if exists private cascade;

-- 버킷 제한 해제, rls_auto_enable 권한 복원
update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'artwork-images';
grant execute on function public.rls_auto_enable() to public, anon, authenticated;

commit;
