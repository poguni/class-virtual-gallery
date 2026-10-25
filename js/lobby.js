/* =========================================================================
   로비 리뉴얼 (Phase 9)
   9-1: 로비 입구 쪽(z = LOBBY.maxZ)에 유리벽을 세우고, 창밖에 낮 정원 풍경을 둔다.
        예전에는 이쪽이 열려 있어 뒤를 돌아보면 3D 공간 바깥의 검은 화면이 보였다.
   9-2: 흰 천장 선 조명 (로비 벽·바닥·천장의 흰 재질은 scene.js의 lobby*Mat)
   9-3: 창가 벤치·큰 화분 (props.js의 placeProp으로 놓아 부딪힘 처리)
   - 바깥 풍경은 모두 canvas로 그린 그림이며, 조명·안개 영향을 받지 않는 재질(MeshBasic, fog:false)이라
     실제 광원을 늘리지 않는다 (조명 수가 바뀌면 셰이더 재컴파일로 화면이 멈춤 — scene.js 조명 풀 참고)
   - 하늘 돔은 실내 벽에 가려지므로 유리창 너머로만 보인다
   10-3: 바깥 풍경이 접속한 기기의 날짜·시각에 따라 바뀐다 (계절 4 × 시간대 3).
        여름 낮은 9-1의 원래 색 그대로이고, 들어올 때 한 번만 그리므로 성능 부담·조명 변화 없음
   ========================================================================= */

const LOBBY_GLASS_Z = LOBBY.maxZ;

// 계절별 색: 잔디 [바탕, 풀결1, 풀결2], 먼 숲 [먼 줄, 가까운 줄], 땅, 나무 머리 [그늘, 중간, 햇빛], 산울타리, 꽃(봄)
const LOBBY_SEASONS = {
  spring: { lawn: ["#8fc062", "rgba(80,130,50,0.35)", "rgba(190,225,140,0.35)"], forest: ["#a9c98f", "#8db576"], ground: "#8fbf6a",
            crowns: ["#5d8f45", "#7fb05e", "#a6cf82"], hedge: ["#5f9447", "#74a85a"], blossom: ["#f7c6d4", "#f2a7bd", "#fbe3ea"] },
  summer: { lawn: ["#86b45c", "rgba(70,120,45,0.35)", "rgba(175,210,120,0.35)"], forest: ["#9dbb8a", "#7fa36c"], ground: "#88ad6a",
            crowns: ["#4f7d3f", "#68984f", "#8cb86a"], hedge: ["#5c8a45", "#6f9d54"] },
  autumn: { lawn: ["#a9a65e", "rgba(130,110,50,0.35)", "rgba(210,190,110,0.35)"], forest: ["#c9a46a", "#b07d48"], ground: "#a89a60",
            crowns: ["#a8481f", "#d9782f", "#efbf4a"], hedge: ["#8a6a34", "#a57d3c"] },
  winter: { lawn: ["#e6ecf1", "rgba(180,195,212,0.45)", "rgba(255,255,255,0.6)"], forest: ["#cbd6df", "#aebccb"], ground: "#dfe6ec",
            crowns: ["#3e5e48", "#cfdbe4", "#f4f7fa"], hedge: ["#dbe3ea", "#c8d3dd"] },
};
// 시간대별 하늘 [꼭대기, 중간, 지평선], 구름 색, 땅·나무에 곱하는 빛 색(tint)
const LOBBY_TIMES = {
  day:   { sky: ["#6fa6dc", "#a9cdea", "#e3eff6"], cloud: "rgba(255,255,255,0.75)", tint: "#ffffff" },
  dusk:  { sky: ["#4f5596", "#e58b72", "#ffd29a"], cloud: "rgba(255,186,160,0.7)", tint: "#ffd6bd" },
  night: { sky: ["#070d2a", "#16224f", "#33457a"], cloud: "rgba(110,125,170,0.3)", tint: "#56628f", stars: true },
};

// 접속한 기기의 날짜·시각으로 계절(3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울)과
// 시간대(6~17시 낮, 17~19시 노을, 그 밖은 밤)를 정한다
function getLobbyScenery(now) {
  const m = now.getMonth() + 1, h = now.getHours();
  const season = m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
  const time = h >= 6 && h < 17 ? "day" : h >= 17 && h < 19 ? "dusk" : "night";
  return { season, time, ...LOBBY_SEASONS[season], ...LOBBY_TIMES[time] };
}
const LOBBY_SCENERY = getLobbyScenery(new Date());

// 색에 빛 색을 곱해 노을·밤에 어둡게 (먼 숲처럼 하늘 그림 안에 그린 것에 사용)
function tintColor(hex, tint) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(tint.slice(1), 16);
  const ch = (sh) => Math.round(((a >> sh) & 255) * ((b >> sh) & 255) / 255);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function makeCanvasTexture(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

// 바깥 풍경 공통 재질: 조명 없이 그린 색 그대로, 안개도 받지 않음
// (땅·나무는 color에 시간대 빛 색을 넣어 노을·밤에 어둡게 — 하늘은 그림 자체가 시간대 색)
function outdoorMat(map, extra) {
  return new THREE.MeshBasicMaterial(Object.assign({ map, fog:false }, extra));
}
function outdoorLitMat(map, extra) {
  return outdoorMat(map, Object.assign({ color: new THREE.Color(LOBBY_SCENERY.tint) }, extra));
}

// 하늘 돔: 위는 파란 하늘, 지평선 쪽은 밝은 하늘색, 지평선 바로 위에 먼 숲, 군데군데 구름
function drawSkyDome(ctx, w, h, look) {
  const horizon = h / 2;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, look.sky[0]);
  sky.addColorStop(0.65, look.sky[1]);
  sky.addColorStop(1, look.sky[2]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = tintColor(look.ground, look.tint); ctx.fillRect(0, horizon, w, h - horizon); // 지평선 아래 (땅에 가려짐)

  if (look.stars) { // 밤: 별 (구름·숲 무늬가 시간대마다 같도록 따로 seed)
    const starRand = seededRandom(9151);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 260; i++) {
      ctx.globalAlpha = 0.35 + starRand() * 0.65;
      ctx.beginPath(); ctx.arc(starRand() * w, starRand() * horizon * 0.85, 0.5 + starRand() * 1.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const rand = seededRandom(9101);
  // 구름: 납작한 흰 타원 여러 개를 겹쳐 뭉게구름처럼
  for (let i = 0; i < 14; i++) {
    const cx = rand() * w, cy = horizon * (0.35 + rand() * 0.45), size = 30 + rand() * 50;
    ctx.fillStyle = look.cloud;
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.ellipse(cx + (rand() - 0.5) * size * 2.2, cy + (rand() - 0.5) * size * 0.35,
        size * (0.5 + rand() * 0.5), size * (0.22 + rand() * 0.15), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 먼 숲: 지평선 위로 둥근 나무 머리가 이어진 실루엣 (멀수록 흐린 초록)
  [[look.forest[0], 26, 0.9], [look.forest[1], 16, 1]].forEach(([color, height, step]) => {
    ctx.fillStyle = tintColor(color, look.tint);
    for (let x = 0; x < w; x += 9 * step) {
      const r = 6 + rand() * height * 0.5;
      ctx.beginPath(); ctx.arc(x, horizon - height * 0.4 - rand() * height * 0.5, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillRect(0, horizon - height * 0.45, w, height * 0.45 + 1);
  });
}

// 잔디: 연두 바탕에 짧은 풀결 (타일 반복)
function drawLawn(ctx, w, h, look) {
  ctx.fillStyle = look.lawn[0]; ctx.fillRect(0, 0, w, h);
  const rand = seededRandom(9203);
  for (let i = 0; i < 1400; i++) {
    const x = rand() * w, y = rand() * h;
    ctx.strokeStyle = rand() < 0.5 ? look.lawn[1] : look.lawn[2];
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rand() - 0.5) * 3, y - 4 - rand() * 4); ctx.stroke();
  }
}

// 돌길: 밝은 화강석 판을 엇갈려 깐 무늬 (타일 반복)
function drawPaving(ctx, w, h) {
  ctx.fillStyle = "#b9b2a6"; ctx.fillRect(0, 0, w, h);
  const rows = 4, rowH = h / rows, rand = seededRandom(9307);
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? w / 4 : 0;
    for (let x = -w / 4; x < w; x += w / 2) {
      const tone = 196 + Math.floor(rand() * 22);
      ctx.fillStyle = `rgb(${tone},${tone - 5},${tone - 14})`;
      ctx.fillRect(x + offset + 2, r * rowH + 2, w / 2 - 4, rowH - 4);
    }
  }
}

// 정원 나무 띠: 투명 배경 위에 둥근 나무 여러 그루와 앞쪽 산울타리 (가운데 돌길 자리는 비움)
function drawGardenTrees(ctx, w, h, look) {
  const rand = seededRandom(9419);
  const blossomRand = seededRandom(9467); // 봄꽃은 따로 seed (나무 모양이 계절마다 같도록)
  const ground = h - 8;
  const gap = w * 0.04; // 가운데 돌길이 이어지는 방향은 트여 있게 비우는 반폭
  const count = Math.round(w / 90);
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) / count * w + (rand() - 0.5) * 40;
    if (Math.abs(x - w / 2) < gap) continue;
    const crownR = 34 + rand() * 30, trunkH = 40 + rand() * 50;
    const top = ground - trunkH - crownR * 1.4;
    ctx.fillStyle = "#6b5040";
    ctx.fillRect(x - 4, top + crownR, 8, ground - top - crownR);
    // 나무 머리: 짙은 초록 덩어리 위에 밝은 초록을 왼쪽 위로 비켜 겹쳐 햇빛 받은 느낌
    [[look.crowns[0], 0, 0, 1], [look.crowns[1], -0.18, -0.2, 0.75], [look.crowns[2], -0.3, -0.38, 0.42]].forEach(([color, dx, dy, s]) => {
      ctx.fillStyle = color;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(x + dx * crownR + (rand() - 0.5) * crownR * 0.6, top + crownR + dy * crownR + (rand() - 0.5) * crownR * 0.4,
          crownR * s * (0.6 + rand() * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
    });
    if (look.blossom) { // 봄: 나무 머리 위에 분홍 꽃송이
      for (let k = 0; k < 26; k++) {
        const a = blossomRand() * Math.PI * 2, r = Math.sqrt(blossomRand()) * crownR * 0.95;
        ctx.fillStyle = look.blossom[Math.floor(blossomRand() * look.blossom.length)];
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, top + crownR + Math.sin(a) * r * 0.8, 3 + blossomRand() * 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // 산울타리: 바닥을 따라 낮게 이어진 둥근 관목 줄
  for (let x = 0; x < w; x += 14) {
    if (Math.abs(x - w / 2) < gap) continue;
    ctx.fillStyle = rand() < 0.5 ? look.hedge[0] : look.hedge[1];
    ctx.beginPath(); ctx.arc(x, ground - 10, 14 + rand() * 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = look.hedge[0];
  ctx.fillRect(0, ground - 10, w / 2 - gap, 10);
  ctx.fillRect(w / 2 + gap, ground - 10, w / 2 - gap, 10);
}

function buildLobbyGarden() {
  const center = new THREE.Vector3(0, 0, LOBBY_GLASS_Z);

  // 하늘 돔 (안쪽 면을 그림)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(70, 48, 24),
    outdoorMat(makeCanvasTexture(1024, 512, (ctx, w, h) => drawSkyDome(ctx, w, h, LOBBY_SCENERY)), { side: THREE.BackSide })
  );
  sky.position.copy(center);
  scene.add(sky);

  // 잔디밭: 유리벽 바로 바깥부터 하늘 돔 끝까지
  const lawnTex = makeCanvasTexture(256, 256, (ctx, w, h) => drawLawn(ctx, w, h, LOBBY_SCENERY));
  lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping;
  lawnTex.repeat.set(35, 18);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(140, 72), outdoorLitMat(lawnTex));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, -0.02, LOBBY_GLASS_Z + 36);
  scene.add(lawn);

  // 입구 문에서 정원 쪽으로 곧게 뻗은 돌길
  const pathLen = 14;
  const pavingTex = makeCanvasTexture(256, 256, drawPaving);
  pavingTex.wrapS = pavingTex.wrapT = THREE.RepeatWrapping;
  pavingTex.repeat.set(1, pathLen / 2.4);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, pathLen), outdoorLitMat(pavingTex));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, -0.01, LOBBY_GLASS_Z + pathLen / 2);
  scene.add(path);

  // 정원 나무 띠: 정원을 반원으로 둘러싼 그림 띠 (하늘 돔 앞이라 나무가 더 가까워 보임).
  // 평평한 판이면 창가에서 비스듬히 볼 때 판 끝이 보여서, 양끝이 건물 옆벽 뒤로 숨는 반원 기둥 면에 그린다.
  // theta 0 = +z(돌길 방향)이 그림 가운데(빈 자리)와 맞도록 -π/2보다 조금 더 앞에서 시작
  const treeRingR = pathLen + 2, overlap = 0.15;
  const trees = new THREE.Mesh(
    new THREE.CylinderGeometry(treeRingR, treeRingR, 12, 64, 1, true, -Math.PI / 2 - overlap, Math.PI + overlap * 2),
    outdoorLitMat(makeCanvasTexture(2048, 384, (ctx, w, h) => drawGardenTrees(ctx, w, h, LOBBY_SCENERY)), { transparent: true, alphaTest: 0.02, side: THREE.BackSide })
  );
  trees.position.set(0, 5.6, LOBBY_GLASS_Z);
  scene.add(trees);
}

// 유리벽: 바닥~천장 통유리, 가는 창틀로 5칸, 가운데 칸은 양여닫이 유리문
function buildLobbyGlassWall() {
  const z = LOBBY_GLASS_Z, h = LOBBY.h;
  const innerMinX = LOBBY.minX + 0.12, innerMaxX = LOBBY.maxX - 0.12; // 옆벽(두께 0.25) 안쪽 면
  const width = innerMaxX - innerMinX;
  const transomY = 3.0;   // 가로 창틀 높이 (문 높이와 같음)
  const doorHalf = 1.2;   // 가운데 문 칸 반폭

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(width, h),
    new THREE.MeshBasicMaterial({ color: 0xdfeef3, transparent: true, opacity: 0.08, depthWrite: false })
  );
  glass.position.set(0, h / 2, z);
  scene.add(glass);

  const frameMatGlass = new THREE.MeshStandardMaterial({ color: 0x2e2b28, roughness: 0.45, metalness: 0.6 });
  const bar = (w, hh, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.14), frameMatGlass);
    m.position.set(x, y, z);
    scene.add(m);
  };
  const t = 0.1; // 창틀 굵기
  bar(width, 0.12, 0, 0.06);           // 아래 틀
  bar(width, 0.16, 0, h - 0.08);       // 위 틀
  bar(t, h, innerMinX + t / 2, h / 2); // 양 끝 세로 틀
  bar(t, h, innerMaxX - t / 2, h / 2);
  [-3.6, -doorHalf, doorHalf, 3.6].forEach((x) => bar(t, h, x, h / 2)); // 칸 나누는 세로 틀
  bar(width, t, 0, transomY);          // 가로 창틀
  bar(0.06, transomY, 0, transomY / 2); // 문 두 짝이 맞닿는 선

  // 문 손잡이: 로비 문틀과 같은 브라스 세로 막대
  [-0.14, 0.14].forEach((x) => {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 12), lobbyBrassMat);
    handle.position.set(x, 1.25, z - 0.12);
    scene.add(handle);
  });
}

// 9-2: 흰 천장을 가로지르는 가는 선 조명 3줄 (빛나는 재질일 뿐 실제 광원은 아님)
function buildLobbyCeilingLines() {
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xfffaf0 });
  const geo = new THREE.BoxGeometry(LOBBY.maxX - LOBBY.minX - 2.4, 0.03, 0.09);
  const depth = LOBBY.maxZ - LOBBY.minZ;
  [0.25, 0.5, 0.75].forEach((t) => {
    const line = new THREE.Mesh(geo, lineMat);
    line.position.set(0, LOBBY.h - 0.015, LOBBY.minZ + depth * t);
    scene.add(line);
  });
}

// 9-3: 로비 소품 — 창가 벤치 2개, 창가 양 모서리 큰 화분 2개.
// 로비 조명이 약해서 흰 재질이 회색으로 가라앉지 않도록, 로비 벽처럼 자체 밝기(emissive)를 조금 준다.
// 바닥 면적은 placeProp(props.js)이 PROP_OBSTACLES에 넣어 지나갈 수 없게 막는다.
const LOBBY_PROP_BUILDERS = {
  // 원목 상판 + 창틀과 같은 검은 철제 다리, 길이 방향이 x (창과 나란히)
  windowBench() {
    const g = new THREE.Group();
    const oak = propMat("lobbyOak", { color: 0xb98a55, emissive: 0x8a5a2e, emissiveIntensity: 0.35, roughness: 0.55 });
    const steel = propMat("lobbySteel", { color: 0x2e2b28, roughness: 0.45, metalness: 0.6 });
    g.add(mesh(new THREE.BoxGeometry(2.4, 0.08, 0.5), oak, 0, 0.44, 0));
    [-1.0, 1.0].forEach((x) => g.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.42), steel, x, 0.2, 0)));
    return { group: g, w: 2.4, d: 0.5 };
  },
  // 흰 원통 화분 + 키 큰 나무(올리브 나무처럼 가는 줄기에 잎 뭉치 여러 개)
  tallPlanter() {
    const g = new THREE.Group();
    const pot = propMat("lobbyPot", { color: 0xeeeae3, emissive: 0xfff1e0, emissiveIntensity: 0.35, roughness: 0.6 });
    const trunk = propMat("lobbyTrunk", { color: 0x5e4330, roughness: 0.9 });
    // (sRGB 출력에서 색이 밝고 옅어 보여서 잎은 일부러 짙게 지정)
    const leaf = propMat("lobbyLeaf", { color: 0x255e1a, emissive: 0x12340c, emissiveIntensity: 0.6, roughness: 0.9, flatShading: true });
    const leafLight = propMat("lobbyLeafLight", { color: 0x3a7a26, emissive: 0x1d4612, emissiveIntensity: 0.6, roughness: 0.9, flatShading: true });
    g.add(mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.7, 24), pot, 0, 0.35, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.5, 8), trunk, 0, 1.4, 0));
    [[0, 2.35, 0, 0.44, leaf], [0.28, 2.05, 0.1, 0.34, leafLight], [-0.26, 2.12, -0.08, 0.36, leaf],
     [0.08, 1.85, -0.24, 0.3, leafLight], [-0.1, 2.6, 0.12, 0.3, leafLight]].forEach(([x, y, z, r, m]) =>
      g.add(mesh(new THREE.IcosahedronGeometry(r, 1), m, x, y, z)));
    return { group: g, w: 0.72, d: 0.72 };
  },
};

function buildLobbyProps() {
  const nearGlassZ = LOBBY_GLASS_Z - 0.75;   // 창에서 조금 떨어진 줄 (가운데 입장 위치 x=0 근처는 비워 둠)
  [-3.2, 3.2].forEach((x) => placeProp(LOBBY_PROP_BUILDERS.windowBench(), x, nearGlassZ));
  [LOBBY.minX + 0.75, LOBBY.maxX - 0.75].forEach((x) => placeProp(LOBBY_PROP_BUILDERS.tallPlanter(), x, LOBBY_GLASS_Z - 0.75));
}

buildLobbyGarden();
buildLobbyGlassWall();
buildLobbyCeilingLines();
buildLobbyProps();
