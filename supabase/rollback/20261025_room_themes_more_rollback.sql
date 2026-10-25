-- 되돌리기: 20261025_room_themes_more.sql 적용 이전 상태로 복원
-- ⚠️ 새 테마(space·winter·hanok)를 고른 전시실은 클래식으로 바뀝니다.
update public.rooms set theme = 'classic' where theme in ('space', 'winter', 'hanok');
alter table public.rooms drop constraint rooms_theme_check;
alter table public.rooms add constraint rooms_theme_check
  check (theme in ('classic', 'whitecube', 'forest', 'ocean', 'night', 'crayon'));
