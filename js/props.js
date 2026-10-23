/* =========================================================================
   전시실 소품 (Phase 8-3)
   - 테마마다 기본 도형(상자·원기둥·구 등)으로 만든 소품을 전시실에 놓는다. (외부 3D 모델 파일 없음)
   - 배치 구역: 양쪽 작품 벽 앞 감상 공간, 문에서 문으로 가는 통로, 입구 쪽 띠(방 안내판·색 띠)는 비워 둔다.
       · 가운데 소품: 남은 가운데 구역의 중심선을 따라 (방이 짧아 안 들어가는 소품은 빼고 놓음)
       · 모서리 소품(키 큰 것): 작품이 걸리지 않는 방 안쪽 끝의 양 모서리
   - 소품의 바닥 면적은 PROP_OBSTACLES에 넣어 controls.js의 isWalkable()이 통과하지 못하게 막는다.
   - 성능: 소품은 그림자를 만들지 않고, 재질은 테마마다 한 번만 만든다.
   ========================================================================= */
const PROP_OBSTACLES = []; // [{minX,maxX,minZ,maxZ}] — 몸(PLAYER_RADIUS)이 겹치면 서 있을 수 없음

// 테스트용: 주소에 ?props=0 을 붙이면 모든 전시실의 소품을 끔 (Phase 8-4에서 제거 예정)
const PROPS_PREVIEW = new URLSearchParams(location.search).get("props");

const ZONE_WALL_BAND = 2.2;   // 작품 벽 앞 감상 공간
const ZONE_PATH_GAP = 0.7;    // 문-문 통로 옆 여유
const ZONE_END_GAP = 1.6;     // 앞뒤 벽(입구·뒷문 쪽) 여유
const CORNER_INSET = 1.2;     // 모서리 소품이 벽에서 떨어진 거리
const CENTER_ITEM_GAP = 1.0;  // 가운데 소품끼리 간격

/* ---------- 소품 재료 ---------- */
const propMatCache = {};
function propMat(key, params) {
  if (!propMatCache[key]) propMatCache[key] = new THREE.MeshStandardMaterial(params);
  return propMatCache[key];
}
function mesh(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  return m;
}

/* ---------- 소품 만들기 ----------
   각 함수는 { group, w, d } 를 돌려준다. group의 원점은 바닥 가운데, w는 x 폭, d는 z 길이(바닥 면적) */
const PROP_BUILDERS = {
  // 화이트 큐브: 긴 벤치 (길이 방향이 z)
  bench() {
    const g = new THREE.Group();
    const wood = propMat("benchWood", { color: 0xb08a5c, roughness: 0.6 });
    const metal = propMat("benchMetal", { color: 0x55595f, roughness: 0.4, metalness: 0.6 });
    g.add(mesh(new THREE.BoxGeometry(0.6, 0.1, 2.4), wood, 0, 0.45, 0));
    [-0.95, 0.95].forEach(z => g.add(mesh(new THREE.BoxGeometry(0.5, 0.4, 0.08), metal, 0, 0.2, z)));
    return { group: g, w: 0.6, d: 2.4 };
  },
  // 화이트 큐브: 흰 받침대 위 조형물 (kind 0: 다면체, 1: 고리)
  plinthSculpture(kind) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.6, 1.0, 0.6), propMat("plinth", { color: 0xf4f2ee, roughness: 0.85 }), 0, 0.5, 0));
    const art = propMat(kind ? "sculptGold" : "sculptBlue", kind
      ? { color: 0xd2a84a, roughness: 0.3, metalness: 0.75 }
      : { color: 0x3d6a99, roughness: 0.35, metalness: 0.2, flatShading: true });
    const geo = kind ? new THREE.TorusGeometry(0.26, 0.08, 12, 32) : new THREE.IcosahedronGeometry(0.3, 0);
    const s = mesh(geo, art, 0, 1.36, 0);
    s.rotation.set(0.4, 0.6, kind ? 0.2 : 0);
    g.add(s);
    return { group: g, w: 0.6, d: 0.6 };
  },
  // 숲속 정원: 화분 나무
  pottedTree() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.5, 16), propMat("pot", { color: 0xb86b45, roughness: 0.8 }), 0, 0.25, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 8), propMat("trunk", { color: 0x6b4a2b, roughness: 0.9 }), 0, 1.0, 0));
    const leaf = propMat("leaf", { color: 0x5f9447, roughness: 0.9, flatShading: true });
    [[0, 1.75, 0, 0.5], [0.22, 1.55, 0.1, 0.36], [-0.2, 1.6, -0.12, 0.38]].forEach(([x, y, z, r]) =>
      g.add(mesh(new THREE.IcosahedronGeometry(r, 1), leaf, x, y, z)));
    return { group: g, w: 0.8, d: 0.8 };
  },
  // 숲속 정원: 덤불 화단 (길이 방향이 z)
  bushPlanter() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.4, 1.6), propMat("planter", { color: 0x8b5e34, roughness: 0.8 }), 0, 0.2, 0));
    const bush = propMat("bush", { color: 0x6fa452, roughness: 0.9, flatShading: true });
    [-0.5, 0, 0.5].forEach((z, i) => g.add(mesh(new THREE.IcosahedronGeometry(0.28 + (i % 2) * 0.05, 1), bush, 0, 0.55, z)));
    return { group: g, w: 0.5, d: 1.6 };
  },
  // 숲속 정원: 통나무 벤치 (길이 방향이 z)
  logBench() {
    const g = new THREE.Group();
    const bark = propMat("log", { color: 0x7a5233, roughness: 0.95 });
    const log = mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.8, 12), bark, 0, 0.42, 0);
    log.rotation.x = Math.PI / 2;
    g.add(log);
    [-0.6, 0.6].forEach(z => g.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.22, 10), bark, 0, 0.11, z)));
    return { group: g, w: 0.5, d: 1.8 };
  },
  // 바닷속: 산호 조형 (모래 언덕 + 가지들)
  coral() {
    const g = new THREE.Group();
    const mound = mesh(new THREE.SphereGeometry(0.55, 16, 8), propMat("mound", { color: 0xd9c08e, roughness: 1 }), 0, 0, 0);
    mound.scale.set(1, 0.35, 1);
    g.add(mound);
    const colors = [0xff7f6e, 0xffa35c, 0xf06a9a];
    // [x, 높이 중심 y, z, 가지 길이] — 굵은 가지 여러 개를 사방으로 기울여 덤불처럼
    [[0, 0.7, 0, 1.1], [0.25, 0.5, 0.12, 0.8], [-0.24, 0.55, -0.08, 0.9], [0.06, 0.45, -0.28, 0.7], [-0.1, 0.42, 0.28, 0.65], [0.3, 0.38, -0.18, 0.55]].forEach(([x, y, z, h], i) => {
      const mat = propMat("coral" + i % 3, { color: colors[i % 3], roughness: 0.7 });
      const b = mesh(new THREE.CylinderGeometry(0.08, 0.15, h, 10), mat, x, y, z);
      b.rotation.set(z * 1.2, 0, -x * 1.4);
      g.add(b);
      const tip = new THREE.Vector3(0, h / 2, 0).applyEuler(b.rotation).add(b.position);
      g.add(mesh(new THREE.SphereGeometry(0.13, 12, 10), mat, tip.x, tip.y, tip.z));
    });
    return { group: g, w: 1.1, d: 1.1 };
  },
  // 바닷속: 둥근 의자
  roundSeat() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.36, 28), propMat("seatBase", { color: 0xf2f4f4, roughness: 0.6 }), 0, 0.18, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.08, 28), propMat("seatTop", { color: 0x2f8fa8, roughness: 0.8 }), 0, 0.4, 0));
    return { group: g, w: 1.4, d: 1.4 };
  },
  // 밤하늘: 고리 달린 행성 (받침대 위)
  planet() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.5, 20), propMat("planetBase", { color: 0x232a5c, roughness: 0.6 }), 0, 0.25, 0));
    g.add(mesh(new THREE.SphereGeometry(0.55, 24, 16), propMat("planet", { color: 0xe08a4a, roughness: 0.7, emissive: 0x5a2a10, emissiveIntensity: 0.6 }), 0, 1.1, 0));
    const ring = mesh(new THREE.TorusGeometry(0.82, 0.035, 8, 48), propMat("ring", { color: 0xf5d98a, roughness: 0.4, emissive: 0xb08a30, emissiveIntensity: 0.8 }), 0, 1.1, 0);
    ring.rotation.set(Math.PI / 2 - 0.45, 0.2, 0);
    g.add(ring);
    return { group: g, w: 1.7, d: 1.7 };
  },
  // 밤하늘: 빛나는 달 기둥 (발광 재질이라 실제 조명은 늘지 않음)
  moonPost() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.3, 8), propMat("post", { color: 0x8a8fb0, roughness: 0.4, metalness: 0.6 }), 0, 0.65, 0));
    g.add(mesh(new THREE.SphereGeometry(0.24, 20, 14), propMat("moon", { color: 0xfff4cf, emissive: 0xfff0c0, emissiveIntensity: 0.9, roughness: 0.6 }), 0, 1.5, 0));
    return { group: g, w: 0.5, d: 0.5 };
  },
  // 크레파스 놀이터: 색색 동그란 의자 3개 (z 방향으로 나란히)
  crayonStools() {
    const g = new THREE.Group();
    [0xff6f61, 0x4fa3e0, 0x7cc66a].forEach((c, i) =>
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.44, 20), propMat("stool" + i, { color: c, roughness: 0.7 }), 0, 0.22, (i - 1) * 0.75)));
    return { group: g, w: 0.6, d: 2.1 };
  },
  // 크레파스 놀이터: 바닥에 누운 대형 크레파스 (길이 방향이 z)
  giantCrayon() {
    const g = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.4, 16), propMat("crayonBody", { color: 0x8a6be0, roughness: 0.75 }), 0, 0.17, -0.1);
    body.rotation.x = Math.PI / 2;
    const band = mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.5, 16), propMat("crayonBand", { color: 0xfff3da, roughness: 0.9 }), 0, 0.17, -0.1);
    band.rotation.x = Math.PI / 2;
    const tip = mesh(new THREE.ConeGeometry(0.17, 0.35, 16), propMat("crayonBody", {}), 0, 0.17, 0.775);
    tip.rotation.x = Math.PI / 2;
    g.add(body, band, tip);
    return { group: g, w: 0.4, d: 1.9 };
  },
  // 크레파스 놀이터: 쌓기 블록
  blockStack() {
    const g = new THREE.Group();
    [[0xffd35c, 0, 0.25, 0, 0.5, 0.1], [0xff6f61, 0.05, 0.72, 0.03, 0.44, -0.25], [0x4fa3e0, -0.03, 1.12, -0.02, 0.36, 0.35]].forEach(([c, x, y, z, s, ry], i) => {
      const b = mesh(new THREE.BoxGeometry(s, s, s), propMat("block" + i, { color: c, roughness: 0.6 }), x, y, z);
      b.rotation.y = ry;
      g.add(b);
    });
    return { group: g, w: 0.75, d: 0.75 };
  },
};

// 테마별 배치 — center: 가운데 중심선(입구 쪽부터), corners: [바깥쪽 안 모서리, 통로 쪽 안 모서리]
const THEME_PROP_LAYOUTS = {
  classic:   { center: [], corners: [] },
  whitecube: { center: [["bench"]], corners: [["plinthSculpture", 0], ["plinthSculpture", 1]] },
  forest:    { center: [["logBench"], ["bushPlanter"]], corners: [["pottedTree"], ["pottedTree"]] },
  ocean:     { center: [["roundSeat"]], corners: [["coral"], ["coral"]] },
  night:     { center: [["planet"]], corners: [["moonPost"], ["moonPost"]] },
  crayon:    { center: [["crayonStools"], ["giantCrayon"]], corners: [["blockStack"], ["blockStack"]] },
};

function placeProp(built, x, z) {
  built.group.position.set(x, 0, z);
  built.group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  scene.add(built.group);
  PROP_OBSTACLES.push({ minX: x - built.w / 2, maxX: x + built.w / 2, minZ: z - built.d / 2, maxZ: z + built.d / 2 });
}

// room: 전시실 사각형 / centerX: 그 동의 통로 중심 x / outward: 방이 뻗은 방향(-1: A동, +1: B동)
function buildRoomProps(theme, room, centerX, outward) {
  const layout = THEME_PROP_LAYOUTS[theme.key];
  if (!layout) return;
  const outerX = outward < 0 ? room.minX : room.maxX;       // 통로 반대편(바깥쪽) 벽
  const pathEdge = centerX + outward * CORR_HALF;            // 통로의 바깥쪽 가장자리 (A동 -5.4, B동 5.4)
  const zone = {
    minX: outward < 0 ? outerX + ZONE_WALL_BAND : pathEdge + ZONE_PATH_GAP,
    maxX: outward < 0 ? pathEdge - ZONE_PATH_GAP : outerX - ZONE_WALL_BAND,
    minZ: room.minZ + ZONE_END_GAP,
    maxZ: room.maxZ - ZONE_END_GAP,
  };

  // 가운데 소품: 입구 쪽부터 중심선에 이어 놓되, 남은 길이에 안 들어가는 소품은 뺀다
  const items = layout.center.map(([name, arg]) => PROP_BUILDERS[name](arg));
  const fits = [];
  let total = 0;
  items.forEach(it => {
    const need = total + (fits.length ? CENTER_ITEM_GAP : 0) + it.d;
    if (it.w <= zone.maxX - zone.minX && need <= zone.maxZ - zone.minZ) { fits.push(it); total = need; }
  });
  const cx = (zone.minX + zone.maxX) / 2;
  let z = (zone.minZ + zone.maxZ) / 2 + total / 2; // 가운데 정렬, 입구(+z) 쪽부터
  fits.forEach(it => { placeProp(it, cx, z - it.d / 2); z -= it.d + CENTER_ITEM_GAP; });

  // 모서리 소품: 방 안쪽 끝(뒷문 쪽, 작품이 걸리지 않는 띠)의 바깥쪽·통로 쪽 모서리
  const cornerXs = [outerX - outward * CORNER_INSET, pathEdge + outward * (ZONE_PATH_GAP + 0.5)];
  layout.corners.forEach(([name, arg], i) => {
    placeProp(PROP_BUILDERS[name](arg), cornerXs[i], room.minZ + CORNER_INSET);
  });
}
