-- =====================================================================
-- 우리 반 가상 미술관 — 전시실 테마 3종 추가 (Phase 10-2, 2026-10-25)
-- ---------------------------------------------------------------------
-- rooms.theme 허용 값에 space(우주정거장), winter(눈 내린 겨울), hanok(한옥) 추가
-- (js/themes.js의 ROOM_THEMES 키와 같아야 함). 기존 전시실 값은 바뀌지 않음
-- 권한: 정책 변경 없음
-- 되돌리기: supabase/rollback/20261025_room_themes_more_rollback.sql
-- =====================================================================

alter table public.rooms drop constraint rooms_theme_check;
alter table public.rooms add constraint rooms_theme_check
  check (theme in ('classic', 'whitecube', 'forest', 'ocean', 'night', 'crayon', 'space', 'winter', 'hanok'));
