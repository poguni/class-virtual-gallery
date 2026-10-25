-- =====================================================================
-- 우리 반 가상 미술관 — 댓글 부적절어 필터 (Phase 10-4, 2026-10-25)
-- ---------------------------------------------------------------------
-- 댓글을 저장(등록·이름/내용 수정)하기 직전에 DB가 이름과 내용을 검사해, 금지어가 있으면 저장을 거절한다.
-- 앱·주소를 거치지 않고 API로 직접 넣어도 똑같이 막힌다. (교사의 숨김 처리는 이름·내용을 바꾸지 않으므로 검사 안 함)
--  · 비교 전에 띄어쓰기·숫자·특수문자를 지워 "시 발", "시1발", "시.발" 같은 우회를 막는다
--  · 정상 낱말 속에 금지어가 들어 있는 경우(예: 시발점, 졸라맨)는 예외 목록으로 먼저 지운 뒤 비교한다
--  · 목록은 API로 노출되지 않는 private 스키마에 있어 방문자가 읽거나 바꿀 수 없다
-- 기존 댓글은 그대로 둔다 (새로 저장하는 댓글부터 적용)
-- 목록 추가/삭제: insert into private.banned_words(word) values ('낱말'); / delete from private.banned_words where word = '낱말';
--   (낱말은 띄어쓰기·숫자·특수문자 없이, 영어는 소문자로)
-- 되돌리기: supabase/rollback/20261025_comment_word_filter_rollback.sql
-- =====================================================================

create table private.banned_words (word text primary key, note text);
create table private.allowed_words (word text primary key, note text);
revoke all on private.banned_words, private.allowed_words from public, anon, authenticated;

-- 띄어쓰기·숫자·특수문자를 지우고 영어는 소문자로 (한글 완성형·자모, 영문만 남김)
create function private.normalize_comment_text(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(coalesce(t, ''), '[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z]', '', 'g'));
$$;

create function private.has_banned_word(t text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  n text := private.normalize_comment_text(t);
  a record;
begin
  for a in select word from private.allowed_words loop
    n := replace(n, a.word, '');
  end loop;
  return exists (select 1 from private.banned_words b where strpos(n, b.word) > 0);
end;
$$;

create function private.check_comment_words() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.has_banned_word(new.nickname) or private.has_banned_word(new.content) then
    raise exception 'BANNED_WORD' using hint = '바르고 고운 말로 다시 써 주세요.';
  end if;
  return new;
end;
$$;

revoke all on function private.normalize_comment_text(text), private.has_banned_word(text), private.check_comment_words() from public, anon, authenticated;

create trigger comments_word_filter
  before insert or update of nickname, content on public.comments
  for each row execute function private.check_comment_words();

-- 처음 목록 (교사 검토 후 더하거나 뺄 수 있음)
insert into private.banned_words (word, note) values
  ('시발','욕설'), ('씨발','욕설'), ('씨바','욕설'), ('씨팔','욕설'), ('시팔','욕설'), ('쓰발','욕설'), ('씨빨','욕설'), ('십알','욕설'), ('슈발','욕설'),
  ('ㅅㅂ','욕설(초성)'), ('ㅆㅂ','욕설(초성)'), ('ㅅㅍ','욕설(초성)'),
  ('개새끼','욕설'), ('개새','욕설'), ('개색','욕설'), ('개세끼','욕설'), ('개쉐','욕설'), ('개같','욕설'), ('개소리','욕설'),
  ('병신','욕설'), ('븅신','욕설'), ('빙신','욕설'), ('ㅂㅅ','욕설(초성)'), ('ㅄ','욕설(초성)'),
  ('지랄','욕설'), ('ㅈㄹ','욕설(초성)'),
  ('존나','비속어'), ('졸라','비속어'), ('존내','비속어'), ('ㅈㄴ','비속어(초성)'),
  ('좆','욕설'), ('좃','욕설'), ('엿먹','욕설'),
  ('미친놈','욕설'), ('미친년','욕설'), ('미친새','욕설'), ('또라이','비하'), ('돌아이','비하'), ('찐따','비하'), ('등신','비하'),
  ('닥쳐','공격적 표현'), ('닥치라','공격적 표현'), ('꺼지라','공격적 표현'), ('뒤질래','공격적 표현'), ('죽을래','공격적 표현'), ('디질래','공격적 표현'),
  ('니애미','패드립'), ('느금마','패드립'), ('엠창','패드립'),
  ('fuck','영어 욕설'), ('shit','영어 욕설'), ('bitch','영어 욕설'), ('asshole','영어 욕설');

insert into private.allowed_words (word, note) values
  ('시발점','출발점'), ('시발역','처음 출발하는 역'),
  ('졸라맨','막대 인형 그림'), ('졸라매','허리띠를 졸라매다'),
  ('등신대','사람 크기 그림·조각');
