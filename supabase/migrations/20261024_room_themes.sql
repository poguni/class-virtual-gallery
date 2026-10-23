-- =====================================================================
-- 우리 반 가상 미술관 — 전시실 테마·소품 설정 (Phase 8-4, 2026-10-24)
-- ---------------------------------------------------------------------
-- rooms.theme      : 전시실 테마 (js/themes.js의 ROOM_THEMES 키와 같아야 함). 기존 전시실은 모두 'classic'
-- rooms.show_props : 테마 소품 표시 여부 (기본 켬)
-- 권한: 기존 RLS("내 전시의 전시실만 수정")가 그대로 적용되므로 정책 변경 없음
-- 되돌리기: supabase/rollback/20261024_room_themes_rollback.sql
-- =====================================================================

alter table public.rooms
  add column theme text not null default 'classic'
    constraint rooms_theme_check check (theme in ('classic', 'whitecube', 'forest', 'ocean', 'night', 'crayon')),
  add column show_props boolean not null default true;
