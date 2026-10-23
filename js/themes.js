/* =========================================================================
   전시실 테마 (Phase 8)
   - 테마마다 전시실의 벽·바닥·천장·액자 재질, 방 구분용 강조색, 보조광을 정의한다.
     (로비·복도는 테마와 상관없이 기존 재질 그대로)
   - 재질은 테마마다 처음 쓸 때 한 번만 만들어, 같은 테마의 방끼리 함께 쓴다.
   - "classic"은 기존 전시실 모습 그대로(scene.js의 공용 재질을 그대로 사용)이며,
     값이 없거나 모르는 테마 이름이면 항상 classic으로 처리한다.
   - 질감은 이미지 파일 없이 캔버스로 그린다. seededRandom(demo-data.js)을 써서 매번 같은 무늬가 나온다.
   ========================================================================= */
const DEFAULT_ROOM_THEME = "classic";

// 캔버스에 그린 그림을 반복 가능한 텍스처로 만든다
function makeThemeTexture(size, draw) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// tile: 무늬가 몇 m마다 반복되는지. 벽·바닥을 만들 때 applyTileUV()가 이 값으로 무늬 좌표를 늘린다
function tiledMaterial(tile, params) {
  const mat = new THREE.MeshStandardMaterial(params);
  mat.userData.tile = tile;
  return mat;
}

// 벽(가로 width × 세로 height)이나 바닥(width × depth)의 크기에 맞춰 UV를 늘려, 무늬가 늘어나 보이지 않게 함
// (tile 값이 없는 재질 — 클래식·로비·복도 — 은 아무것도 바꾸지 않음)
function applyTileUV(geometry, width, height, material) {
  const tile = material && material.userData.tile;
  if (!tile) return;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / tile, uv.getY(i) * height / tile);
  uv.needsUpdate = true;
}

/* ---------- 질감 그리기 ---------- */
function drawSpeckles(ctx, size, rand, count, colors, maxR, alpha) {
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * (0.5 + rand() * 0.5);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.beginPath(); ctx.arc(rand() * size, rand() * size, 0.6 + rand() * maxR, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// 화이트 큐브 바닥: 밝은 회색 콘크리트(잔 알갱이 + 은은한 얼룩)
function drawConcrete(ctx, s) {
  const rand = seededRandom(11);
  ctx.fillStyle = "#cfcbc4"; ctx.fillRect(0, 0, s, s);
  drawSpeckles(ctx, s, rand, 40, ["#c4bfb7", "#d8d4ce"], 40, 0.25);
  drawSpeckles(ctx, s, rand, 1800, ["#b9b4ac", "#e2dfda", "#a9a49c"], 1.2, 0.6);
}

// 숲속 정원 벽: 연두색 바탕에 옅은 나뭇잎 무늬
function drawLeaves(ctx, s) {
  const rand = seededRandom(23);
  ctx.fillStyle = "#b5cca4"; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 46; i++) {
    const x = rand() * s, y = rand() * s, r = 10 + rand() * 16, a = rand() * Math.PI;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.globalAlpha = 0.35 + rand() * 0.25;
    ctx.fillStyle = rand() < 0.5 ? "#a3bd90" : "#c4d8b5";
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#93ad80"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// 숲속 정원 바닥: 잔디색 카펫(짧은 결)
function drawGrass(ctx, s) {
  const rand = seededRandom(31);
  ctx.fillStyle = "#6f9a52"; ctx.fillRect(0, 0, s, s);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5000; i++) {
    const x = rand() * s, y = rand() * s;
    ctx.globalAlpha = 0.35 + rand() * 0.4;
    ctx.strokeStyle = ["#5d8742", "#80ab60", "#6a944c"][Math.floor(rand() * 3)];
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rand() - 0.5) * 3, y - 3 - rand() * 4); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// 바닷속 벽: 청록색 바탕에 가로 물결 무늬 (세로로 반복돼도 이어지도록 그라데이션 없이)
function drawWaves(ctx, s) {
  ctx.fillStyle = "#5aa8b6"; ctx.fillRect(0, 0, s, s);
  ctx.lineWidth = 3; ctx.lineCap = "round";
  for (let row = 0; row < 8; row++) {
    const y0 = row * (s / 8) + s / 16;
    ctx.strokeStyle = row % 2 ? "rgba(140,205,214,0.32)" : "rgba(70,150,166,0.35)"; // 작품보다 튀지 않게 옅게
    ctx.beginPath();
    for (let x = 0; x <= s; x += 4) {
      const y = y0 + Math.sin((x / s) * Math.PI * 4 + row) * 5;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// 바닷속 바닥: 모래(알갱이)
function drawSand(ctx, s) {
  const rand = seededRandom(47);
  ctx.fillStyle = "#e2cda0"; ctx.fillRect(0, 0, s, s);
  drawSpeckles(ctx, s, rand, 2600, ["#d3bb88", "#efddb6", "#c8ae7a"], 1.1, 0.7);
}

// 밤하늘: 검은 바탕에 별 — 빛나는 재질(emissiveMap)에 써서 실제 조명 없이 별만 은은하게 빛나게 함
function drawStars(ctx, s) {
  const rand = seededRandom(59);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 140; i++) {
    const x = rand() * s, y = rand() * s, big = rand() < 0.08;
    ctx.globalAlpha = 0.45 + rand() * 0.55;
    ctx.fillStyle = rand() < 0.2 ? "#ffe9a8" : "#ffffff";
    ctx.beginPath(); ctx.arc(x, y, big ? 2.2 : 0.6 + rand() * 0.9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// 크레파스 놀이터 벽: 크림색 바탕에 파스텔 도형(동그라미·세모·물결)
function drawCrayonShapes(ctx, s) {
  const rand = seededRandom(71);
  const colors = ["#f7b7c3", "#a8d8f0", "#bfe5a8", "#ffe08a", "#cdb8f0"];
  ctx.fillStyle = "#fff3da"; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 100; i++) { // 큰 캔버스에 많이 흩뿌려 반복 무늬가 바둑판처럼 보이지 않게
    const x = rand() * s, y = rand() * s, r = 7 + rand() * 9, kind = Math.floor(rand() * 3);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = ctx.strokeStyle = colors[Math.floor(rand() * colors.length)];
    ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath();
    if (kind === 0) { ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    else if (kind === 1) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); ctx.fill(); }
    else { for (let k = 0; k <= 3; k++) { const px = x - r + k * (r * 2 / 3), py = y + (k % 2 ? -r / 2 : r / 2); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}

// 크레파스 놀이터 바닥: 알록달록 퍼즐 매트(2×2 칸)
function drawCheckerMat(ctx, s) {
  const h = s / 2;
  [["#f6b6b6", 0, 0], ["#a9d6f2", h, 0], ["#fbe39a", 0, h], ["#b9e3b0", h, h]].forEach(([c, x, y]) => {
    ctx.fillStyle = c; ctx.fillRect(x, y, h, h);
  });
  ctx.strokeStyle = "rgba(120,100,80,0.25)"; ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, s - 3, s - 3);
  ctx.beginPath(); ctx.moveTo(h, 0); ctx.lineTo(h, s); ctx.moveTo(0, h); ctx.lineTo(s, h); ctx.stroke();
}

/* ---------- 테마 정의 ----------
   accent: 입구 안쪽 색 띠 (null이면 방 순서대로 ROOM_ACCENT_COLORS)
   fill:   방 가운데 보조광 { color, intensity, distance } — 밝은 벽이 어둡게 보이지 않도록 (없으면 보조광 없음) */
const ROOM_THEMES = {
  classic: {
    label: "클래식 (기본)",
    accent: null,
    fill: null,
    createMaterials: () => ({ wall: wallMat, floor: floorMat, ceil: ceilMat, frame: frameMat }),
  },
  whitecube: {
    label: "화이트 큐브",
    accent: 0x3a3d42,
    fill: { color: 0xfff6ea, intensity: 1.15, distance: 26 },
    createMaterials: () => ({
      wall: new THREE.MeshStandardMaterial({ color: 0xeeeae3, roughness: 0.92 }),
      floor: tiledMaterial(3, { map: makeThemeTexture(256, drawConcrete), roughness: 0.55, metalness: 0.05 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xd9d5cd, roughness: 1 }),
      frame: new THREE.MeshStandardMaterial({ color: 0xc9cdd3, roughness: 0.32, metalness: 0.65 }),
    }),
  },
  forest: {
    label: "숲속 정원",
    accent: 0x4f8a3c,
    fill: { color: 0xf1ffe6, intensity: 1.0, distance: 26 },
    createMaterials: () => ({
      wall: tiledMaterial(2.2, { map: makeThemeTexture(256, drawLeaves), roughness: 0.95 }),
      floor: tiledMaterial(1.6, { map: makeThemeTexture(256, drawGrass), roughness: 1 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xdfe8d3, roughness: 1 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x8b5e34, roughness: 0.6, metalness: 0.05 }),
    }),
  },
  ocean: {
    label: "바닷속",
    accent: 0x1f6e8c,
    fill: { color: 0xe3f9ff, intensity: 1.0, distance: 26 },
    createMaterials: () => ({
      wall: tiledMaterial(2.4, { map: makeThemeTexture(256, drawWaves), roughness: 0.9 }),
      floor: tiledMaterial(2, { map: makeThemeTexture(256, drawSand), roughness: 1 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xb9dde4, roughness: 1 }),
      frame: new THREE.MeshStandardMaterial({ color: 0xf2f4f4, roughness: 0.45, metalness: 0.1 }),
    }),
  },
  night: {
    label: "밤하늘",
    accent: 0xe7b33f,
    fill: { color: 0x9aa8ff, intensity: 0.2, distance: 22 }, // 분위기는 어둡게(벽이 남색으로 보이도록), 작품은 스포트라이트로
    createMaterials: () => {
      const stars = makeThemeTexture(512, drawStars);
      return {
        wall: tiledMaterial(3, { color: 0x141a40, roughness: 0.9, emissive: 0xffffff, emissiveMap: stars, emissiveIntensity: 0.85 }),
        floor: new THREE.MeshStandardMaterial({ color: 0x0f1330, roughness: 0.75, metalness: 0.1 }),
        ceil: tiledMaterial(3, { color: 0x0c1030, roughness: 1, emissive: 0xffffff, emissiveMap: stars, emissiveIntensity: 1 }),
        frame: new THREE.MeshStandardMaterial({ color: 0xd4a944, roughness: 0.3, metalness: 0.7 }),
      };
    },
  },
  crayon: {
    label: "크레파스 놀이터",
    accent: 0xff6f61,
    fill: { color: 0xfff4e0, intensity: 1.1, distance: 26 },
    createMaterials: () => ({
      wall: tiledMaterial(4.8, { map: makeThemeTexture(512, drawCrayonShapes), roughness: 0.95 }),
      floor: tiledMaterial(1.6, { map: makeThemeTexture(256, drawCheckerMat), roughness: 0.85 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xfff6e6, roughness: 1 }),
      frame: new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5, metalness: 0.05 }),
    }),
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
