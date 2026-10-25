-- 되돌리기: 20261025_comment_word_filter.sql 적용 이전 상태로 복원
-- ⚠️ 금지어·예외 목록도 함께 삭제됩니다. (댓글 데이터에는 영향 없음)
drop trigger if exists comments_word_filter on public.comments;
drop function if exists private.check_comment_words();
drop function if exists private.has_banned_word(text);
drop function if exists private.normalize_comment_text(text);
drop table if exists private.banned_words;
drop table if exists private.allowed_words;
