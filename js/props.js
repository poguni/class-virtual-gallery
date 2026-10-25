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
  // 우주정거장: 받침대 위 로켓
  rocket() {
    const g = new THREE.Group();
    const red = propMat("rocketRed", { color: 0xd8432f, roughness: 0.5 });
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.2, 24), propMat("rocketStand", { color: 0x55595f, roughness: 0.4, metalness: 0.6 }), 0, 0.1, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 1.5, 20), propMat("rocketBody", { color: 0xeef0f3, roughness: 0.4, metalness: 0.2 }), 0, 1.05, 0));
    g.add(mesh(new THREE.ConeGeometry(0.26, 0.55, 20), red, 0, 2.08, 0));
    for (let i = 0; i < 3; i++) {
      const fin = mesh(new THREE.BoxGeometry(0.04, 0.5, 0.3), red, 0, 0.5, 0);
      fin.rotation.y = i * Math.PI * 2 / 3;
      fin.translateZ(0.32);
      g.add(fin);
    }
    const win = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 16), propMat("rocketWindow", { color: 0x3d8fd6, emissive: 0x1d5fa0, emissiveIntensity: 0.8, roughness: 0.2 }), 0, 1.35, 0.28);
    win.rotation.x = Math.PI / 2;
    g.add(win);
    return { group: g, w: 0.9, d: 0.9 };
  },
  // 우주정거장: 태양전지판을 단 인공위성 (기둥 위)
  satellite() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.2, 8), propMat("post", { color: 0x8a8fb0, roughness: 0.4, metalness: 0.6 }), 0, 0.6, 0));
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), propMat("satBody", { color: 0xd2a84a, roughness: 0.35, metalness: 0.75 }), 0, 1.4, 0));
    const panel = propMat("satPanel", { color: 0x22346b, roughness: 0.3, metalness: 0.5, emissive: 0x0b1a40, emissiveIntensity: 0.5 });
    [-0.5, 0.5].forEach(x => g.add(mesh(new THREE.BoxGeometry(0.55, 0.3, 0.03), panel, x * 1.1, 1.4, 0)));
    const dish = mesh(new THREE.ConeGeometry(0.16, 0.12, 16, 1, true), propMat("satDish", { color: 0xeef0f3, roughness: 0.4, side: THREE.DoubleSide }), 0, 1.68, 0);
    dish.rotation.x = Math.PI;
    g.add(dish);
    return { group: g, w: 1.6, d: 0.5 };
  },
  // 우주정거장: 달 표면 바위 무더기
  moonRocks() {
    const g = new THREE.Group();
    const rock = propMat("moonRock", { color: 0x9a9890, roughness: 1, flatShading: true });
    [[0, 0.2, 0, 0.36], [0.32, 0.12, 0.2, 0.22], [-0.28, 0.1, 0.18, 0.18], [0.1, 0.1, -0.32, 0.2]].forEach(([x, y, z, r]) => {
      const m = mesh(new THREE.IcosahedronGeometry(r, 0), rock, x, y, z);
      m.scale.y = 0.7;
      g.add(m);
    });
    return { group: g, w: 1.0, d: 1.0 };
  },
  // 겨울: 눈사람 (목도리·모자)
  snowman() {
    const g = new THREE.Group();
    const snow = propMat("snowBall", { color: 0xe9eef3, roughness: 0.9 });
    const black = propMat("coal", { color: 0x222222, roughness: 0.8 });
    g.add(mesh(new THREE.SphereGeometry(0.45, 20, 14), snow, 0, 0.42, 0));
    g.add(mesh(new THREE.SphereGeometry(0.32, 20, 14), snow, 0, 1.06, 0));
    g.add(mesh(new THREE.SphereGeometry(0.23, 20, 14), snow, 0, 1.52, 0));
    const scarf = mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 24), propMat("scarf", { color: 0xc23b3b, roughness: 0.8 }), 0, 1.33, 0);
    scarf.rotation.x = Math.PI / 2;
    g.add(scarf);
    [-0.08, 0.08].forEach(x => g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), black, x, 1.58, 0.2)));
    const nose = mesh(new THREE.ConeGeometry(0.04, 0.18, 10), propMat("carrot", { color: 0xf07f2a, roughness: 0.7 }), 0, 1.52, 0.29);
    nose.rotation.x = Math.PI / 2;
    g.add(nose);
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20), black, 0, 1.71, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.24, 20), black, 0, 1.84, 0));
    return { group: g, w: 0.9, d: 0.9 };
  },
  // 겨울: 눈 쌓인 전나무
  snowyPine() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 8), propMat("trunk", { color: 0x6b4a2b, roughness: 0.9 }), 0, 0.25, 0));
    const pine = propMat("pine", { color: 0x2f5d3a, roughness: 0.9, flatShading: true });
    const cap = propMat("snowCap", { color: 0xeef2f6, roughness: 0.9, flatShading: true });
    [[0.55, 0.9, 0.85], [0.42, 0.75, 1.45], [0.28, 0.6, 1.95]].forEach(([r, h, y]) => {
      g.add(mesh(new THREE.ConeGeometry(r, h, 10), pine, 0, y, 0));
      g.add(mesh(new THREE.ConeGeometry(r * 0.6, h * 0.45, 10), cap, 0, y + h * 0.3, 0));
    });
    return { group: g, w: 1.1, d: 1.1 };
  },
  // 겨울: 나무 썰매 (길이 방향이 z)
  sled() {
    const g = new THREE.Group();
    const wood = propMat("sledWood", { color: 0xb5372e, roughness: 0.6 });
    const metal = propMat("sledRunner", { color: 0x9aa1ab, roughness: 0.3, metalness: 0.7 });
    [-0.24, 0.24].forEach(x => {
      g.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 1.2), metal, x, 0.02, 0));
      const tip = mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 12, Math.PI), metal, x, 0.14, 0.6);
      tip.rotation.set(0, Math.PI / 2, -Math.PI / 2);
      g.add(tip);
      [-0.35, 0.35].forEach(z => g.add(mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), metal, x, 0.13, z)));
    });
    [-0.4, -0.13, 0.13, 0.4].forEach(z => g.add(mesh(new THREE.BoxGeometry(0.6, 0.04, 0.2), wood, 0, 0.26, z)));
    return { group: g, w: 0.6, d: 1.4 };
  },
  // 한옥: 장독대 (돌 단 위 옹기 항아리, 길이 방향이 z)
  jangdokdae() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.16, 1.4), propMat("stoneBase", { color: 0x8f8a80, roughness: 1 }), 0, 0.08, 0));
    const onggi = propMat("onggi", { color: 0x5a3a26, roughness: 0.35, metalness: 0.05 });
    [[-0.38, 0.3], [0.08, 0.24], [0.45, 0.2]].forEach(([z, r]) => {
      const jar = mesh(new THREE.SphereGeometry(r, 18, 12), onggi, 0, 0.16 + r * 1.05, z);
      jar.scale.y = 1.15;
      g.add(jar);
      g.add(mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.55, 0.06, 18), onggi, 0, 0.16 + r * 2.25, z));
    });
    return { group: g, w: 0.8, d: 1.4 };
  },
  // 한옥: 소반 (낮은 둥근 상 위 그릇)
  soban() {
    const g = new THREE.Group();
    const wood = propMat("sobanWood", { color: 0x7a4e2c, roughness: 0.45 });
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 28), wood, 0, 0.34, 0));
    [[0.25, 0.25], [-0.25, 0.25], [0.25, -0.25], [-0.25, -0.25]].forEach(([x, z]) => g.add(mesh(new THREE.BoxGeometry(0.05, 0.32, 0.05), wood, x, 0.16, z)));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.08, 16), propMat("bowl", { color: 0xe9e4d8, roughness: 0.3 }), 0.1, 0.41, 0.05));
    return { group: g, w: 0.84, d: 0.84 };
  },
  // 한옥: 청사초롱 (나무 걸대에 매단 등 — 발광 재질이라 실제 조명은 늘지 않음)
  lantern() {
    const g = new THREE.Group();
    const wood = propMat("lanternWood", { color: 0x5a3a22, roughness: 0.6 });
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), wood, 0, 0.03, 0));
    g.add(mesh(new THREE.BoxGeometry(0.06, 1.9, 0.06), wood, 0, 0.95, 0));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), wood, 0, 1.88, 0.17));
    const z = 0.32;
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 16), propMat("chorongBlue", { color: 0x2c4f9e, emissive: 0x1d3a8a, emissiveIntensity: 0.7, roughness: 0.7 }), 0, 1.6, z));
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 16), propMat("chorongRed", { color: 0xd23a32, emissive: 0xc8402a, emissiveIntensity: 0.8, roughness: 0.7 }), 0, 1.39, z));
    g.add(mesh(new THREE.BoxGeometry(0.01, 0.08, 0.01), wood, 0, 1.74, z));
    return { group: g, w: 0.5, d: 0.5 };
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
  space:     { center: [["rocket"]], corners: [["satellite"], ["moonRocks"]] },
  winter:    { center: [["sled"], ["snowman"]], corners: [["snowyPine"], ["snowyPine"]] },
  hanok:     { center: [["jangdokdae"], ["soban"]], corners: [["lantern"], ["lantern"]] },
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
