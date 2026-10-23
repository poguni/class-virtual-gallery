-- 되돌리기: 20261024_room_themes.sql 적용 이전 상태로 복원
-- ⚠️ 전시실마다 고른 테마·소품 설정 값은 삭제됩니다.
alter table public.rooms
  drop column if exists theme,
  drop column if exists show_props;
