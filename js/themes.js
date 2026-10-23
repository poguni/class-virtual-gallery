/* =========================================================================
   전시실 테마 (Phase 8)
   - 테마마다 전시실의 벽·바닥·천장·액자 재질과 방 구분용 강조색을 정의한다.
     (로비·복도는 테마와 상관없이 기존 재질 그대로)
   - 재질은 테마마다 처음 쓸 때 한 번만 만들어, 같은 테마의 방끼리 함께 쓴다.
   - "classic"은 기존 전시실 모습 그대로(scene.js의 공용 재질을 그대로 사용)이며,
     값이 없거나 모르는 테마 이름이면 항상 classic으로 처리한다.
   ========================================================================= */
const DEFAULT_ROOM_THEME = "classic";

const ROOM_THEMES = {
  classic: {
    label: "클래식 (기본)",
    accent: null, // null이면 방 순서대로 ROOM_ACCENT_COLORS를 돌려 씀 (기존 동작)
    createMaterials: () => ({ wall: wallMat, floor: floorMat, ceil: ceilMat, frame: frameMat }),
  },
};

// 테스트용 미리보기: 주소에 ?theme=테마키 를 붙이면 모든 전시실을 그 테마로 보여줌 (Phase 8-4에서 제거 예정)
const THEME_PREVIEW = new URLSearchParams(location.search).get("theme");

const roomThemeMaterialCache = {};
function getRoomTheme(key) {
  const k = ROOM_THEMES[THEME_PREVIEW] ? THEME_PREVIEW : (ROOM_THEMES[key] ? key : DEFAULT_ROOM_THEME);
  if (!roomThemeMaterialCache[k]) roomThemeMaterialCache[k] = ROOM_THEMES[k].createMaterials();
  return { key: k, ...ROOM_THEMES[k], mats: roomThemeMaterialCache[k] };
}
