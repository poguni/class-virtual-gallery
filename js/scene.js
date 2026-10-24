/* =========================================================================
   THREE.JS 씬 구성
   ========================================================================= */
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0806, 0.028);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 120);
camera.position.set(0, 1.65, 5);

const renderer = new THREE.WebGLRenderer({ antialias:true, logarithmicDepthBuffer:true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

// 은은한 전체 환경광 + 위에서 내려오는 약한 half light
scene.add(new THREE.AmbientLight(0x3d4470, 0.55));
const hemi = new THREE.HemisphereLight(0x4a4a5e, 0x14100c, 0.4);
scene.add(hemi);

// 로비 입구 쪽 은은한 보조등 (초반 시야 확보용)
const lobbyFill = new THREE.PointLight(0xfff0d8, 0.9, 14, 2);
lobbyFill.position.set(0, 4.2, 3);
scene.add(lobbyFill);

/* ---------- 재질 ---------- */
function makeFloorTexture() {
  const c = document.createElement("canvas"); c.width=256; c.height=256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#8a6a45"; ctx.fillRect(0,0,256,256);
  for (let i=0;i<16;i++){
    ctx.fillStyle = i%2===0 ? "#7d5f3d" : "#93714b";
    ctx.fillRect(0, i*16, 256, 15);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10,10);
  return tex;
}
const floorMat = new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness:0.85, metalness:0.05 });
const wallMat  = new THREE.MeshStandardMaterial({ color:0x2a2621, roughness:0.95 });
const ceilMat  = new THREE.MeshStandardMaterial({ color:0x100e0c, roughness:1 });
const frameMat = new THREE.MeshStandardMaterial({ color:0xe8ddc6, roughness:0.5, metalness:0.15 });
// 복도는 전시실과 바닥 톤을 다르게 줘서(쿨톤 그레이) "지금 이동 중"이라는 느낌을 시각적으로 구분
const corridorFloorMat = new THREE.MeshStandardMaterial({ color:0x4d4f57, roughness:0.9, metalness:0.05 });
// 출입구(문/아치) 프레임 — 전시실 경계를 눈에 띄게 표시하는 용도
const doorFrameMat = new THREE.MeshStandardMaterial({ color:0xcaa15a, roughness:0.4, metalness:0.35 });
// 로비 전용 브라스 라인 디테일 — doorFrameMat보다 더 밝고 광택 있게 잡아, 로비 출입문만
// "한 단계 더 세련된" 느낌을 주고 전시실 문틀(doorFrameMat)과는 톤을 구분한다
const lobbyBrassMat = new THREE.MeshStandardMaterial({ color:0xe0bd7a, roughness:0.22, metalness:0.75 });
// 로비 전용 화이트 재질 (Phase 9-2) — 로비만 밝은 현대 미술관 톤, 복도·전시실은 위 재질 그대로.
// 실제 조명을 늘리면 조명 수가 바뀌어 셰이더 재컴파일로 화면이 멈추므로, emissive(자체 밝기)로 기본 밝기를 올린다
function drawTerrazzo(ctx, s) {
  const rand = seededRandom(9511);
  ctx.fillStyle = "#dcd8d0"; ctx.fillRect(0, 0, s, s);
  drawSpeckles(ctx, s, rand, 30, ["#d3cfc6", "#e4e1da"], 50, 0.3);
  drawSpeckles(ctx, s, rand, 900, ["#a8a39a", "#8f8a82", "#c9b28a", "#f2efe9", "#b7b2aa"], 2.4, 0.8);
}
const lobbyFloorTex = makeThemeTexture(512, drawTerrazzo);
const lobbyFloorMat = tiledMaterial(2.5, { map:lobbyFloorTex, emissive:0xffffff, emissiveMap:lobbyFloorTex, emissiveIntensity:0.35, roughness:0.35, metalness:0.05 });
// (환경광이 푸른 기라 흰 벽이 보랏빛으로 보이지 않도록, 바탕색은 조금 낮추고 따뜻한 자체 밝기를 더 줌)
const lobbyWallMat = new THREE.MeshStandardMaterial({ color:0xe6e2da, emissive:0xfff1e0, emissiveIntensity:0.45, roughness:0.9 });
const lobbyCeilMat = new THREE.MeshStandardMaterial({ color:0xeae6df, emissive:0xfff3e6, emissiveIntensity:0.4, roughness:1 });
// 전시실마다 순서대로 돌려쓰는 포인트 컬러 (입구 스트라이프에 사용, 방마다 다른 색으로 구분감을 줌)
const ROOM_ACCENT_COLORS = [0x4a86b5, 0xd9973d, 0x6a9c5b, 0xb0608f, 0xc4562f];

/* ---------- 공간 치수 ----------
   로비 뒤에서 길이 둘로 갈라져(A동/B동) 각각 반대편 벽 쪽으로 전시실들을 이어 붙이며 나아가다가,
   가장 안쪽(맨 끝)에서 서로 마주 이어져(연결 통로) 하나의 순환 동선(ㅁ자形)을 이룬다.
   즉 로비 → A동(전시실들) → 연결 통로 → B동(전시실들) → 다시 로비로 돌아오는 구조.
   실제 방/복도 목록(SEGMENTS)은 데이터 로드가 끝난 뒤 buildRoomsAndCorridors()가 만든다. */
const LOBBY = { minX:-6, maxX:6, minZ:-1, maxZ:6, h:5 };
const CORR_MINX = -1.4, CORR_MAXX = 1.4;   // 복도/전시실 출입구 폭 (기준폭, 각 동의 중심좌표 기준 상대값)
const CORR_HALF = (CORR_MAXX - CORR_MINX) / 2, CORR_WIDTH = CORR_MAXX - CORR_MINX; // 1.4 / 2.8
const CORR_LEN = 6;                        // 방과 방 사이 복도 길이
const ROOM_H = 5;                          // 전시실 높이 (모든 전시실 공통)
const ROOM_FRONT_MARGIN = 3, ROOM_BACK_MARGIN = 2, ARTWORK_STEP = 4; // 작품 배치 간격(기존과 동일)
const WING_CENTER_A = -4, WING_CENTER_B = 4;   // A동(나가는 길)·B동(돌아오는 길) 복도 중심 x좌표
const WING_ROOM_OUT = 10;                       // 전시실이 복도 안쪽 벽에서 바깥쪽으로 뻗어나가는 폭

function buildFloorCeil(minX,maxX,minZ,maxZ,h,floorMaterial,ceilMaterial) {
  const w = maxX-minX, d = maxZ-minZ;
  const floorGeo = new THREE.PlaneGeometry(w,d);
  applyTileUV(floorGeo, w, d, floorMaterial); // 테마 무늬를 바닥 크기에 맞춰 반복 (themes.js)
  const floor = new THREE.Mesh(floorGeo, floorMaterial || floorMat);
  floor.rotation.x = -Math.PI/2;
  floor.position.set((minX+maxX)/2, 0, (minZ+maxZ)/2);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceilGeo = new THREE.PlaneGeometry(w,d);
  applyTileUV(ceilGeo, w, d, ceilMaterial);
  const ceil = new THREE.Mesh(ceilGeo, ceilMaterial || ceilMat);
  ceil.rotation.x = Math.PI/2;
  ceil.position.set((minX+maxX)/2, h, (minZ+maxZ)/2);
  scene.add(ceil);
}
buildFloorCeil(LOBBY.minX,LOBBY.maxX,LOBBY.minZ,LOBBY.maxZ,LOBBY.h, lobbyFloorMat, lobbyCeilMat);

// material: 전시실 테마의 벽 재질 (생략하면 로비·복도용 기본 wallMat)
function wallSeg(x1,z1,x2,z2,h,material) {
  const len = Math.hypot(x2-x1, z2-z1);
  const geo = new THREE.BoxGeometry(len, h, 0.25);
  applyTileUV(geo, len, h, material); // 벽 길이가 달라도 무늬 크기가 같게 (themes.js)
  const wall = new THREE.Mesh(geo, material || wallMat);
  wall.position.set((x1+x2)/2, h/2, (z1+z2)/2);
  wall.rotation.y = -Math.atan2(z2-z1, x2-x1);
  wall.receiveShadow = true; wall.castShadow = false;
  scene.add(wall);
}

// 로비 벽 (입구 쪽 z=maxZ는 개방)
wallSeg(LOBBY.minX,LOBBY.minZ, LOBBY.minX,LOBBY.maxZ, LOBBY.h, lobbyWallMat); // 좌
wallSeg(LOBBY.maxX,LOBBY.minZ, LOBBY.maxX,LOBBY.maxZ, LOBBY.h, lobbyWallMat); // 우
// 로비 뒷벽: A동으로 나가는 문 + B동에서 돌아오는 문, 두 개를 남기고 세 조각으로 세움
wallSeg(LOBBY.minX,LOBBY.minZ, WING_CENTER_A-CORR_HALF,LOBBY.minZ, LOBBY.h, lobbyWallMat);
wallSeg(WING_CENTER_A+CORR_HALF,LOBBY.minZ, WING_CENTER_B-CORR_HALF,LOBBY.minZ, LOBBY.h, lobbyWallMat);
wallSeg(WING_CENTER_B+CORR_HALF,LOBBY.minZ, LOBBY.maxX,LOBBY.minZ, LOBBY.h, lobbyWallMat);

/* ---------- 로비 전용 디자인 디테일 (Phase 5.5) ----------
   전시실은 지금의 무채색·차분한 톤을 그대로 유지하고, 로비만 "감상 전 전환 공간"으로서
   살짝 격을 높인다. 색을 새로 쓰기보다 조명·명암·재질 광택 차이로만 세련됨을 더하는 방향. */

// 천장-벽 경계를 따라 은은한 웜톤 간접조명 라인(코브 라이트).
// 실제 광원이 아니라 emissive 재질로 "빛나는 선"처럼 보이게 하는 방식이라
// 조명 개수를 늘리지 않아 성능에 영향이 없다.
const coveLightMat = new THREE.MeshStandardMaterial({
  color:0xffdca8, emissive:0xffb86b, emissiveIntensity:1.4, roughness:0.6, metalness:0
});
function addLobbyCoveLight(x1,z1,x2,z2,nx,nz) {
  const len = Math.hypot(x2-x1, z2-z1);
  if (len < 0.3) return; // 문 폭보다 좁은 자투리 벽은 생략
  const strip = new THREE.Mesh(new THREE.BoxGeometry(len - 0.1, 0.07, 0.1), coveLightMat);
  strip.position.set((x1+x2)/2 + nx*0.2, LOBBY.h - 0.14, (z1+z2)/2 + nz*0.2);
  strip.rotation.y = -Math.atan2(z2-z1, x2-x1);
  scene.add(strip);
}
addLobbyCoveLight(LOBBY.minX,LOBBY.minZ, LOBBY.minX,LOBBY.maxZ, 1, 0);   // 좌측 벽 (안쪽은 +x)
addLobbyCoveLight(LOBBY.maxX,LOBBY.minZ, LOBBY.maxX,LOBBY.maxZ, -1, 0);  // 우측 벽 (안쪽은 -x)
addLobbyCoveLight(LOBBY.minX,LOBBY.minZ, WING_CENTER_A-CORR_HALF,LOBBY.minZ, 0, 1);            // 뒷벽 조각1
addLobbyCoveLight(WING_CENTER_A+CORR_HALF,LOBBY.minZ, WING_CENTER_B-CORR_HALF,LOBBY.minZ, 0, 1); // 뒷벽 조각2(두 문 사이)
addLobbyCoveLight(WING_CENTER_B+CORR_HALF,LOBBY.minZ, LOBBY.maxX,LOBBY.minZ, 0, 1);            // 뒷벽 조각3

// 바닥 중앙 메달리온(인레이 패턴) — 테라초 바닥 팔레트 안에서 명암 대비만 주는 원형 패턴.
// 브라스 톤 얇은 링으로 문틀 라인과 톤을 통일했다.
function makeLobbyMedallionTexture() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const ctx = c.getContext("2d");
  const cx = 256, cy = 256;
  [
    { r:256, color:"#c9c4ba" }, // 바깥쪽: 바닥보다 한 톤 짙은 돌
    { r:222, color:"#e4e0d8" },
    { r:196, color:"#caa15a" }, // 브라스 톤 얇은 링(문틀 라인과 통일감)
    { r:184, color:"#d2cdc4" }, // 중앙 원판
  ].forEach(ring => {
    ctx.beginPath(); ctx.arc(cx, cy, ring.r, 0, Math.PI*2);
    ctx.fillStyle = ring.color; ctx.fill();
  });
  ctx.strokeStyle = "rgba(202,161,90,0.35)"; ctx.lineWidth = 2;
  for (let i=0;i<8;i++) {
    const a = (Math.PI*2/8)*i;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.lineTo(cx+Math.cos(a)*182, cy+Math.sin(a)*182);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}
const lobbyMedallionTex = makeLobbyMedallionTexture();
const lobbyMedallionMat = new THREE.MeshStandardMaterial({ map:lobbyMedallionTex, emissive:0xffffff, emissiveMap:lobbyMedallionTex, emissiveIntensity:0.35, roughness:0.35, metalness:0.15 });
const lobbyMedallion = new THREE.Mesh(new THREE.CircleGeometry(1.9, 48), lobbyMedallionMat);
lobbyMedallion.rotation.x = -Math.PI/2;
lobbyMedallion.position.set(0, 0.01, (LOBBY.minZ + LOBBY.maxZ) / 2); // 바닥보다 살짝 띄워 z-fighting 방지
lobbyMedallion.receiveShadow = true;
scene.add(lobbyMedallion);

// 전시실 개수에 맞춰 작품이 걸리는 벽 위치(왼쪽/오른쪽, z좌표)를 미리 계산해두는 헬퍼.
// list.length에 맞춰 좌우 분할 후 등간격으로 배치 (기존 단일 전시실 로직과 동일한 간격 유지)
function computeRoomDepth(count) {
  const perSide = Math.max(1, Math.ceil(count / 2));
  const usable = perSide > 1 ? (perSide - 1) * ARTWORK_STEP : 0;
  return { depth: ROOM_FRONT_MARGIN + usable + ROOM_BACK_MARGIN, perSide };
}

// 전시실 벽: 앞벽/뒷벽 모두 그 동의 복도 중심(centerX) 기준 폭만큼 열어둔다.
// 순환 동선이라 막다른 방이 없으므로 뒷벽도 항상 열려 있다(다음 복도로 이어짐).
function buildRoomWalls(room, centerX, material) {
  wallSeg(room.minX,room.maxZ, centerX-CORR_HALF,room.maxZ, room.h, material);
  wallSeg(centerX+CORR_HALF,room.maxZ, room.maxX,room.maxZ, room.h, material);
  wallSeg(room.minX,room.minZ, room.minX,room.maxZ, room.h, material); // 좌
  wallSeg(room.maxX,room.minZ, room.maxX,room.maxZ, room.h, material); // 우
  wallSeg(room.minX,room.minZ, centerX-CORR_HALF,room.minZ, room.h, material);
  wallSeg(centerX+CORR_HALF,room.minZ, room.maxX,room.minZ, room.h, material);
}

// 복도 벽 (양 끝은 로비/전시실이 이미 자기 쪽 출입구를 뚫어두므로 옆면만 세우면 됨)
function buildCorridorWalls(corr) {
  wallSeg(corr.minX,corr.minZ, corr.minX,corr.maxZ, corr.h);
  wallSeg(corr.maxX,corr.minZ, corr.maxX,corr.maxZ, corr.h);
}

// 출입구(문/아치) 프레임 — 벽이 뚫려서 생긴 통로마다 기둥 2개 + 상인방(윗틀)을 세워
// "여기가 방과 방을 잇는 문이다"라는 걸 어두운 공간에서도 눈에 띄게 표시한다.
// accent=true(로비 출입문 전용): 기존 문틀 위에 더 광택 있는 얇은 브라스 라인을 덧대
// 로비만 살짝 격을 높인 느낌을 준다 (전시실 문틀은 그대로 유지해 방들의 차분한 톤을 지킴)
const DOOR_H = 4.0;
function buildDoorFrame(centerX, z, doorWidth, accent) {
  const postW = 0.18, postD = 0.4, lintelH = 0.22; // 벽 두께(0.25)보다 확실히 두껍게 만들어 벽면과 겹치는 부분에서 깜빡임(z-fighting)이 생기지 않도록 함
  const postGeo = new THREE.BoxGeometry(postW, DOOR_H, postD);
  [-(doorWidth/2 + postW/2), (doorWidth/2 + postW/2)].forEach(dx => {
    const post = new THREE.Mesh(postGeo, doorFrameMat);
    post.position.set(centerX + dx, DOOR_H/2, z);
    scene.add(post);
  });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + postW*2, lintelH, postD), doorFrameMat);
  lintel.position.set(centerX, DOOR_H - lintelH/2, z);
  scene.add(lintel);

  if (accent) {
    // 기둥 안쪽 면을 따라 얇은 세로 브라스 라인 두 줄
    const lineGeo = new THREE.BoxGeometry(0.04, DOOR_H - 0.3, postD + 0.02);
    [-(doorWidth/2 + 0.03), (doorWidth/2 + 0.03)].forEach(dx => {
      const line = new THREE.Mesh(lineGeo, lobbyBrassMat);
      line.position.set(centerX + dx, (DOOR_H - 0.3)/2 + 0.15, z);
      scene.add(line);
    });
    // 상인방 바로 아래를 가로지르는 얇은 브라스 라인
    const topLine = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + postW*2 + 0.1, 0.035, postD + 0.02), lobbyBrassMat);
    topLine.position.set(centerX, DOOR_H - lintelH - 0.06, z);
    scene.add(topLine);
  }
}

// 복도 한가운데 은은한 쿨톤 보조등 — 전시실의 따뜻한 스포트라이트와 대비되어
// "지금은 이동 중"이라는 느낌을 주고, 복도가 완전히 캄캄해지지 않도록 함
function addCorridorLight(corr) {
  const light = new THREE.PointLight(0xdfe7ff, 0.7, 9, 2);
  light.position.set((corr.minX + corr.maxX) / 2, 3.6, (corr.minZ + corr.maxZ) / 2);
  scene.add(light);
}

// 전시실 입구 안쪽 벽에 세로 포인트 컬러 스트라이프를 세워, 방마다 다른 색으로
// "여기부터 다른 전시실"이라는 걸 걸어가면서도 한눈에 구분할 수 있게 함
// outward: 그 방이 복도 중심에서 바깥쪽으로 뻗은 방향(-1: -X쪽/A동, +1: +X쪽/B동)
function addRoomAccent(room, colorHex, outward) {
  const mat = new THREE.MeshStandardMaterial({ color:colorHex, roughness:0.55, emissive:colorHex, emissiveIntensity:0.15 });
  const stripeH = room.h - 0.6;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, stripeH, 0.05), mat);
  const stripeX = outward < 0 ? room.minX + 0.9 : room.maxX - 0.9;
  stripe.position.set(stripeX, stripeH/2 + 0.15, room.maxZ - WALL_HALF - 0.03);
  scene.add(stripe);
}

// roomsData: loadArtworksData()가 반환한 [{id, room_number, name, artworks}, ...] (전시실 1개 이상)
// 절반은 A동(로비에서 나가는 길)에, 나머지 절반은 B동(로비로 돌아오는 길)에 배정하고,
// 맨 끝에서 두 동을 연결 통로로 이어붙여 로비로 다시 돌아오는 순환 동선을 만든다.
let SEGMENTS = []; // 클램프/라벨 표시에 사용

// 전시실 하나 + 그 앞의 복도 하나를 지어 wing을 한 칸 늘리는 헬퍼
// centerX: 이 동의 복도 중심 x좌표 / outward: 방이 뻗어나가는 방향(-1 또는 +1)
function buildWingStep(roomData, centerX, outward, cursorZ, roomIndex) {
  const corr = { minX:centerX-CORR_HALF, maxX:centerX+CORR_HALF, minZ:cursorZ-CORR_LEN, maxZ:cursorZ, h:LOBBY.h };
  buildFloorCeil(corr.minX,corr.maxX,corr.minZ,corr.maxZ,corr.h, corridorFloorMat);
  buildCorridorWalls(corr);
  addCorridorLight(corr);
  SEGMENTS.push({ type:"corridor", label:"이동 중 …", minX:corr.minX, maxX:corr.maxX, minZ:corr.minZ, maxZ:corr.maxZ });

  const { depth } = computeRoomDepth(roomData.artworks.length);
  const room = outward < 0
    ? { minX:centerX-WING_ROOM_OUT, maxX:centerX+CORR_HALF, minZ:corr.minZ-depth, maxZ:corr.minZ, h:ROOM_H }
    : { minX:centerX-CORR_HALF, maxX:centerX+WING_ROOM_OUT, minZ:corr.minZ-depth, maxZ:corr.minZ, h:ROOM_H };
  const theme = getRoomTheme(roomData.theme); // 전시실 테마 (themes.js)
  buildFloorCeil(room.minX,room.maxX,room.minZ,room.maxZ,room.h, theme.mats.floor, theme.mats.ceil);
  buildRoomWalls(room, centerX, theme.mats.wall); // 순환 동선이라 막다른 방이 없이 뒷문도 항상 열려 있음
  buildDoorFrame(centerX, room.maxZ, CORR_WIDTH); // 복도 → 이 전시실 진입부
  buildDoorFrame(centerX, room.minZ, CORR_WIDTH); // 이 전시실 → 다음 복도로 나가는 뒷문
  addRoomAccent(room, theme.accent ?? ROOM_ACCENT_COLORS[roomIndex % ROOM_ACCENT_COLORS.length], outward);
  // 테마 소품 (props.js) — 전시실마다 켜고 끌 수 있음(show_props, 기본은 켬)
  if (roomData.show_props !== false) buildRoomProps(theme, room, centerX, outward);

  const roomLabel = roomData.name || `제 ${roomData.room_number} 전시실`;
  addRoomSign(room, roomLabel, roomData.artworks.length, centerX);
  SEGMENTS.push({ type:"room", label:roomLabel, minX:room.minX, maxX:room.maxX, minZ:room.minZ, maxZ:room.maxZ, roomIndex });

  return { bounds:room, endZ:room.minZ, theme };
}

// wingRooms: 이 동에 배정된 방 데이터 배열(비어있을 수도 있음 — 방이 1개뿐이면 한쪽 동은 통로만 남음)
function buildWing(wingRooms, centerX, outward, roomIndexStart) {
  let cursorZ = LOBBY.minZ;
  const built = [];
  let idx = roomIndexStart;

  if (!wingRooms.length) {
    // 이 동에 배정된 방이 없으면, 순환 통로 역할만 하는 곧은 복도 한 칸만 만들어둔다
    const corr = { minX:centerX-CORR_HALF, maxX:centerX+CORR_HALF, minZ:cursorZ-CORR_LEN, maxZ:cursorZ, h:LOBBY.h };
    buildFloorCeil(corr.minX,corr.maxX,corr.minZ,corr.maxZ,corr.h, corridorFloorMat);
    buildCorridorWalls(corr);
    addCorridorLight(corr);
    SEGMENTS.push({ type:"corridor", label:"이동 중 …", minX:corr.minX, maxX:corr.maxX, minZ:corr.minZ, maxZ:corr.maxZ });
    return { built, endZ:corr.minZ, nextIndex:idx };
  }

  wingRooms.forEach((roomData) => {
    const step = buildWingStep(roomData, centerX, outward, cursorZ, idx);
    built.push({ ...roomData, bounds:step.bounds, roomIndex:idx, theme:step.theme });
    cursorZ = step.endZ;
    idx++;
  });

  return { built, endZ:cursorZ, nextIndex:idx };
}

// 더 얕게 끝난 동을 farZ까지 곧게 이어붙여 두 동의 깊이를 맞추는 헬퍼(연결 통로를 짓기 위해 필요)
function extendStraightCorridor(centerX, fromZ, toZ) {
  if (fromZ <= toZ) return fromZ;
  const corr = { minX:centerX-CORR_HALF, maxX:centerX+CORR_HALF, minZ:toZ, maxZ:fromZ, h:LOBBY.h };
  buildFloorCeil(corr.minX,corr.maxX,corr.minZ,corr.maxZ,corr.h, corridorFloorMat);
  buildCorridorWalls(corr);
  SEGMENTS.push({ type:"corridor", label:"이동 중 …", minX:corr.minX, maxX:corr.maxX, minZ:corr.minZ, maxZ:corr.maxZ });
  return toZ;
}

// 가장 안쪽(farZ)에서 A동과 B동을 가로로 이어붙이는 연결 통로 — 이 통로 덕분에 동선이 ㅁ자로 순환된다
function buildConnector(farZ) {
  const connector = { minX:WING_CENTER_A-CORR_HALF, maxX:WING_CENTER_B+CORR_HALF, minZ:farZ-CORR_WIDTH, maxZ:farZ, h:LOBBY.h };
  buildFloorCeil(connector.minX, connector.maxX, connector.minZ, connector.maxZ, connector.h, corridorFloorMat);
  // 가장 안쪽(막다른) 벽 — 순환 동선 전체의 바깥쪽 경계
  wallSeg(connector.minX, connector.minZ, connector.maxX, connector.minZ, connector.h);
  // 좌우 벽 — 각 동의 바깥쪽 벽을 그대로 이어받음
  wallSeg(connector.minX, connector.minZ, connector.minX, connector.maxZ, connector.h);
  wallSeg(connector.maxX, connector.minZ, connector.maxX, connector.maxZ, connector.h);
  // 안쪽(두 동 사이) 벽 — 가운데만 막고 양쪽은 각 동의 통로 폭만큼 열어둠
  wallSeg(WING_CENTER_A+CORR_HALF, connector.maxZ, WING_CENTER_B-CORR_HALF, connector.maxZ, connector.h);
  addCorridorLight(connector);
  SEGMENTS.push({ type:"corridor", axis:"x", label:"이동 중 …", minX:connector.minX, maxX:connector.maxX, minZ:connector.minZ, maxZ:connector.maxZ });
}

// 로비의 두 출입문 위에 "여기서 시작" / "여기로 나감" 안내판을 달아, 처음 들어온 관람객이
// 어느 문으로 들어가야 제1전시실부터 순서대로 볼 수 있는지 한눈에 알 수 있게 한다.
function addLobbyDoorSign(centerX, label, sub) {
  const tex = makeTextSign(label, sub);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.3,0.58), new THREE.MeshStandardMaterial({ map:tex, roughness:0.6 }));
  mesh.position.set(centerX, 3.15, LOBBY.minZ + 0.13);
  scene.add(mesh);
  const light = new THREE.SpotLight(0xfff0d0, 0.8, 7, Math.PI/7, 0.8, 1.2); // 흰 벽에 맞춰 약하게 (9-2, 예전 1.4)
  light.position.set(centerX, 4.3, LOBBY.minZ + 1.6);
  light.target = mesh;
  scene.add(light); scene.add(light.target);
}

function buildRoomsAndCorridors(roomsData) {
  SEGMENTS = [{ type:"lobby", label:"로비", minX:LOBBY.minX, maxX:LOBBY.maxX, minZ:LOBBY.minZ, maxZ:LOBBY.maxZ }];
  buildDoorFrame(WING_CENTER_A, LOBBY.minZ, CORR_WIDTH, true); // 로비 → A동(나가는 길)
  buildDoorFrame(WING_CENTER_B, LOBBY.minZ, CORR_WIDTH, true); // B동(돌아오는 길) → 로비

  // 절반은 A동, 나머지 절반은 B동. B동은 순서를 뒤집어 지어서, 연결 통로를 지나 로비 쪽으로
  // 걸어올 때 원래 전시실 번호 순서(…, N-1, N) 그대로 마주치도록 한다.
  const half = Math.ceil(roomsData.length / 2);
  const wingAData = roomsData.slice(0, half);
  const wingBData = roomsData.slice(half).slice().reverse();

  // 처음 들어온 관람객이 어느 문으로 가야 제1전시실부터 순서대로 보는지 알 수 있도록 안내판을 세움
  const firstRoomLabel = wingAData[0] ? (wingAData[0].name || `제 ${wingAData[0].room_number} 전시실`) : "전시실";
  addLobbyDoorSign(WING_CENTER_A, `${firstRoomLabel} ↑`, "관람하실 분들은 이곳으로 입장하세요.");
  addLobbyDoorSign(WING_CENTER_B, "출구 ↓", "여기는 관람을 마친 후 나가는 출구입니다.");

  const resA = buildWing(wingAData, WING_CENTER_A, -1, 0);
  const resB = buildWing(wingBData, WING_CENTER_B, +1, resA.nextIndex);

  // 두 동의 깊이가 다르면 얕은 쪽을 곧은 복도로 이어 붙여 맞춘 뒤, 그 끝에서 연결 통로로 잇는다
  const farZ = Math.min(resA.endZ, resB.endZ);
  extendStraightCorridor(WING_CENTER_A, resA.endZ, farZ);
  extendStraightCorridor(WING_CENTER_B, resB.endZ, farZ);
  buildConnector(farZ);

  return resA.built.concat(resB.built);
}

// 전시실 입구 안내판(방 번호/이름) — 로비 안내판(makeTextSign)과 같은 방식으로 생성해 통일감 유지
function addRoomSign(room, label, artCount, centerX) {
  const tex = makeTextSign(label, `${artCount}점 전시 중`);
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6,0.65), new THREE.MeshStandardMaterial({ map:tex, roughness:0.6 }));
  signMesh.position.set(centerX, 3.5, room.maxZ - 0.14);
  scene.add(signMesh);
  const light = new THREE.SpotLight(0xfff0d0, 1.3, 8, Math.PI/7, 0.4, 1.2);
  light.position.set(centerX, 4.7, room.maxZ - 1.4);
  light.target = signMesh;
  scene.add(light); scene.add(light.target);
}

/* ---------- 작품 이름표(제목/학생 이름) 전용 텍스처 ----------
   로비 안내판(makeTextSign)과 별도로, 걸어가면서도 잘 읽히도록
   더 큰 글자 크기와 높은 대비, 긴 제목/이름에 대비한 자동 축소를 적용 */
function fitFontSize(ctx, text, maxWidth, baseSize, weight) {
  let size = baseSize;
  ctx.font = `${weight} ${size}px 'Noto Sans KR', sans-serif`;
  while (ctx.measureText(text).width > maxWidth && size > 28) {
    size -= 4;
    ctx.font = `${weight} ${size}px 'Noto Sans KR', sans-serif`;
  }
  return size;
}
function makeArtworkLabelSign(title, artist) {
  const W = 1024, H = 300;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  // 배경: 기존 이름표보다 진하고 또렷하게, 포인트 컬러 테두리로 시선을 붙잡음
  ctx.fillStyle = "#15100b";
  ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = "#d9a35e"; ctx.lineWidth = 7;
  ctx.strokeRect(9,9,W-18,H-18);

  ctx.textAlign = "center";

  // 작품 제목 — 큼직하고 밝게, 살짝 그림자를 줘서 원거리에서도 또렷하게
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 6;
  ctx.fillStyle = "#fff8ec";
  fitFontSize(ctx, title, W - 90, 108, "bold");
  ctx.fillText(title, W/2, 158);

  // 이름 — 제목보다는 작지만 이전 대비 크게, 포인트 컬러로 구분 (이름만 표시)
  ctx.shadowBlur = 3;
  ctx.fillStyle = "#f0c98a";
  fitFontSize(ctx, artist, W - 120, 62, "700");
  ctx.fillText(artist, W/2, 240);
  ctx.shadowBlur = 0;

  return new THREE.CanvasTexture(c);
}

/* ---------- 로비 안내판 ---------- */
function makeTextSign(text, sub) {
  const c = document.createElement("canvas"); c.width=1024; c.height=256;
  const ctx = c.getContext("2d");
  ctx.fillStyle="#171310"; ctx.fillRect(0,0,1024,256);
  ctx.strokeStyle="#c98a4b"; ctx.lineWidth=4; ctx.strokeRect(10,10,1004,236);
  ctx.fillStyle="#f2ead9"; ctx.font="bold 62px 'Noto Sans KR', sans-serif"; ctx.textAlign="center";
  ctx.fillText(text, 512, 130);
  ctx.fillStyle="#c9bca3"; ctx.font="28px 'Noto Sans KR', sans-serif";
  ctx.fillText(sub, 512, 185);
  return new THREE.CanvasTexture(c);
}
// 로비 환영 안내판 — 실제 전시의 학년/반을 반영해 만든다 (데이터가 없으면 기본 문구로 대체)
function buildLobbySign(exhibitionInfo) {
  const info = exhibitionInfo || {};
  const sub = (info.grade && info.class)
    ? `Class Virtual Gallery · ${info.grade}학년 ${info.class}반`
    : "Class Virtual Gallery";
  const signTex = makeTextSign("우리 반 가상 미술관", sub);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4,1), new THREE.MeshStandardMaterial({map:signTex, roughness:0.6}));
  sign.position.set(0, 3.1, LOBBY.minZ + 0.13);
  scene.add(sign);
  // 흰 벽(9-2)에서는 밝은 원이 하얗게 번져 보여서 예전(1.6)보다 약하고 가장자리를 부드럽게
  const signLight = new THREE.SpotLight(0xfff0d0, 0.6, 10, Math.PI/7, 0.8, 1.2);
  signLight.position.set(0, 4.6, LOBBY.minZ + 2);
  signLight.target = sign;
  scene.add(signLight); scene.add(signLight.target);
}

/* ---------- 작품 배치 (전시실, 좌우 벽에 균등 분할) ---------- */
const raycastTargets = [];
const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = "anonymous"; // Supabase Storage 이미지를 텍스처로 불러오기 위함

// 벽면(두께 0.25)의 실제 표면 위치를 기준으로, 액자·그림·이름표를 순서대로 살짝씩 띄워 배치
// (겹치는 면이 없어야 카메라가 움직여도 z-파이팅으로 인한 깜박임이 생기지 않음)
const WALL_HALF = 0.125;          // 벽 두께의 절반
const FRAME_DEPTH = 0.06;
const FRAME_PROTRUDE = 0.05;      // 액자가 벽 표면에서 튀어나온 정도
const PIC_GAP = 0.03;             // 액자 앞면 ~ 그림 사이 간격
const LABEL_GAP = 0.03;           // 그림 앞면 ~ 이름표 사이 간격

// list: 전시실 하나에 걸릴 작품 배열 (Phase 4: 전시실별로 placeArtworksInScene을 각각 호출)

// 원본 이미지 비율을 유지한 채, 가로/세로 모두 최대 1.7 world unit 안에 들어오도록 맞춰서
// (contain 방식) 그림·액자·이름표·조명을 배치. 가로가 긴 그림은 가로로, 세로가 긴 그림은
// 세로로 자연스럽게 전시됨.
const ARTWORK_MAX_SIZE = 1.7;
const FRAME_MARGIN = 0.2;   // 액자가 그림보다 사방으로 더 큰 정도
const LABEL_W = 1.3, LABEL_H = 0.38;
const LABEL_MARGIN_BELOW_FRAME = 0.05; // 액자 하단 ~ 이름표 사이 간격

function mountArtwork(art, index, ctx) {
  const { x, labelX, frameCenter, z, rotY, side } = ctx;

  function build(naturalW, naturalH, tex) {
    let w = ARTWORK_MAX_SIZE, h = ARTWORK_MAX_SIZE * (naturalH / naturalW);
    if (h > ARTWORK_MAX_SIZE) { h = ARTWORK_MAX_SIZE; w = ARTWORK_MAX_SIZE * (naturalW / naturalH); }

    const picMat = new THREE.MeshStandardMaterial({ map: tex, roughness:0.6 });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), picMat);
    pic.position.set(x, 2.0, z);
    pic.rotation.y = rotY;
    pic.userData.artworkIndex = index;
    pic.castShadow = false;
    scene.add(pic);
    raycastTargets.push(pic);

    // 액자 (그림 비율에 맞춰 함께 커지거나 작아짐, 벽면에서 살짝 튀어나오도록 배치)
    const frameW = w + FRAME_MARGIN, frameH = h + FRAME_MARGIN;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(frameW, frameH, FRAME_DEPTH), ctx.frameMat || frameMat);
    frame.position.set(frameCenter, 2.0, z);
    frame.rotation.y = rotY;
    scene.add(frame);

    // 이름표: 그림 세로 길이와 무관하게 액자 하단에서 항상 일정 간격 아래에 오도록 위치를 계산
    const frameBottom = 2.0 - frameH / 2;
    const labelY = frameBottom - LABEL_MARGIN_BELOW_FRAME - LABEL_H / 2;
    const labelTex = makeArtworkLabelSign(art.title, art.artist);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(LABEL_W, LABEL_H),
      new THREE.MeshBasicMaterial({ map:labelTex })
    );
    label.position.set(labelX, labelY, z);
    label.rotation.y = rotY;
    scene.add(label);

    // 작품 전용 스포트라이트 (공간은 어둡고 작품만 밝게)
    // 조명을 작품마다 만들지 않고 "조명 자리"만 방 단위로 기록해 두면,
    // updateRoomLighting이 지금 있는 방(및 바로 옆방) 자리에 조명 풀의 조명을 옮겨 단다
    if (ctx.lightsBucket) {
      ctx.lightsBucket.push({ kind:"spot", position: new THREE.Vector3(x + (side==="left"?1.1:-1.1), 4.5, z + 0.3), target: pic.position });
      if (LIGHT_POOL) LIGHT_POOL.dirty = true; // 이미지가 늦게 로드되어 자리가 새로 생긴 경우 다시 배정
    }
  }

  if (art.imageUrl) {
    // 실제 업로드 이미지는 로드가 끝나야 원본 가로/세로 픽셀 크기를 알 수 있으므로,
    // 텍스처 로드가 완료된 뒤(onLoad) 비율을 계산해서 배치함
    textureLoader.load(
      art.imageUrl,
      (tex) => {
        tex.encoding = THREE.sRGBEncoding;
        const img = tex.image;
        build(img.naturalWidth || img.width || 4, img.naturalHeight || img.height || 3, tex);
      },
      undefined,
      (err) => {
        console.warn("[가상미술관] 작품 이미지 로드 실패:", art.imageUrl, err);
        build(4, 3, null); // 로드 실패 시에도 자리는 비지 않도록 기본 4:3 비율로 배치
      }
    );
  } else {
    // 데모 모드: canvas로 그린 더미 이미지는 크기를 바로 알 수 있음
    const tex = new THREE.CanvasTexture(art.canvas);
    tex.encoding = THREE.sRGBEncoding;
    build(art.canvas.width, art.canvas.height, tex);
  }
}

// 전시실 인덱스별 그 방 조명 자리 목록 ({kind:"spot"|"fill", ...}, updateRoomLighting에서 사용)
const ROOM_LIGHT_GROUPS = {};
// 전시실 인덱스별 조명 자리 개수 (작품 이미지는 비동기로 로드되므로 조명 풀 크기를 정하려고 미리 세어 둠)
const ROOM_LIGHT_COUNTS = {};
// 조명 풀: 씬 안의 조명 개수가 바뀌면 three.js가 모든 재질의 셰이더를 다시 컴파일해
// 방을 옮길 때마다 화면이 1~3초 멈췄다. 그래서 필요한 최대 개수만큼 조명을 처음에 한 번 만들어 두고,
// 방을 옮길 때는 조명의 위치만 바꾸고 쓰지 않는 조명은 밝기 0으로 멀리 치워 둔다.
let LIGHT_POOL = null;
const LIGHT_PARK_Y = -50; // 쓰지 않는 조명을 치워 두는 높이 (바닥 아래라 아무것도 비추지 않음)

// bounds: 이 작품들이 걸릴 전시실의 {minX,maxX,minZ,maxZ} / indexOffset: 전체 artworks 배열에서의 시작 인덱스
// roomIndex: 이 전시실이 SEGMENTS/ROOM_LIGHT_GROUPS에서 쓰는 방 번호(0부터 시작) / theme: 이 전시실 테마(액자 재질)
function placeArtworksInScene(list, bounds, indexOffset, roomIndex, theme) {
  const roomZStart = bounds.minZ + ROOM_FRONT_MARGIN, roomZEnd = bounds.maxZ - ROOM_BACK_MARGIN;
  const perSide = Math.max(1, Math.ceil(list.length / 2));
  const step = perSide > 1 ? (roomZEnd - roomZStart) / (perSide - 1) : 0;
  const lightsBucket = ROOM_LIGHT_GROUPS[roomIndex] = ROOM_LIGHT_GROUPS[roomIndex] || [];
  ROOM_LIGHT_COUNTS[roomIndex] = { spot: list.length, fill: theme && theme.fill ? 1 : 0 };

  // 밝은 테마의 보조광: 방 가운데 천장 아래 하나 (그림자 없음). 작품 조명과 같이 "가까운 방만 켜기" 대상
  if (theme && theme.fill) {
    lightsBucket.push({ kind:"fill", color: theme.fill.color, intensity: theme.fill.intensity, distance: theme.fill.distance,
      position: new THREE.Vector3((bounds.minX + bounds.maxX) / 2, bounds.h - 0.7, (bounds.minZ + bounds.maxZ) / 2) });
  }

  list.forEach((art, i) => {
    const side = i < perSide ? "left" : "right";
    const idx = i % perSide;
    const z = roomZStart + idx*step;
    const dirSign = side === "left" ? 1 : -1; // 방(실내)을 향하는 방향
    const wallFace = side === "left" ? bounds.minX + WALL_HALF : bounds.maxX - WALL_HALF;
    const frameFront = wallFace + dirSign * FRAME_PROTRUDE;
    const frameCenter = frameFront - dirSign * (FRAME_DEPTH/2);
    const x = frameFront + dirSign * PIC_GAP;              // 그림 위치
    const labelX = x + dirSign * LABEL_GAP;                 // 이름표 위치
    const rotY = side === "left" ? Math.PI/2 : -Math.PI/2;

    mountArtwork(art, indexOffset + i, { x, labelX, frameCenter, z, rotY, side, lightsBucket, frameMat: theme && theme.mats.frame });
  });
}

// 현재 위치한 세그먼트를 기준으로, 그 방(및 SEGMENTS 상 두 칸 이내로 가까운 방)의
// 작품 스포트라이트만 켜고 그림자는 지금 있는 방 것만 드리우게 한다.
// → 전시실이 아무리 많아져도 동시에 켜지는 조명·그림자 수가 항상 일정하게 유지되어
//   Phase 4 이전(전시실 1개)과 똑같이 작품이 밝고 또렷하게 보인다.
// 방 사이 거리는 SEGMENTS 상 칸 수로 잰다 (두 칸 이내 = 가까운 방)
function isNearSegment(roomSegIdx, curSegIdx) {
  return roomSegIdx !== undefined && curSegIdx >= 0 && Math.abs(roomSegIdx - curSegIdx) <= 2;
}

// 모든 전시실 배치가 끝난 뒤 한 번 호출: 어느 위치에서든 필요한 최대 조명 수만큼 조명 풀을 만든다
function buildLightPool() {
  const roomSegIdx = {};
  SEGMENTS.forEach((s, i) => { if (s.type === "room") roomSegIdx[s.roomIndex] = i; });
  let spotN = 0, fillN = 0, shadowN = 0;
  SEGMENTS.forEach((_, c) => {
    let spots = 0, fills = 0;
    Object.keys(ROOM_LIGHT_COUNTS).forEach((key) => {
      if (!isNearSegment(roomSegIdx[key], c)) return;
      spots += ROOM_LIGHT_COUNTS[key].spot; fills += ROOM_LIGHT_COUNTS[key].fill;
    });
    spotN = Math.max(spotN, spots); fillN = Math.max(fillN, fills);
  });
  Object.values(ROOM_LIGHT_COUNTS).forEach((c) => { shadowN = Math.max(shadowN, c.spot); });

  // 앞쪽 shadowN개는 그림자를 드리우는 자리 (지금 있는 방의 작품 몫)
  const spots = [];
  for (let i = 0; i < spotN; i++) {
    const spot = new THREE.SpotLight(0xffdca8, 0, 8, Math.PI/8, 0.5, 1.4);
    if (i < shadowN) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(768,768);
      spot.shadow.bias = -0.001;
    }
    scene.add(spot);
    scene.add(spot.target);
    spots.push(spot);
  }
  const fills = [];
  for (let i = 0; i < fillN; i++) {
    const fill = new THREE.PointLight(0xffffff, 0, 1, 2);
    scene.add(fill);
    fills.push(fill);
  }
  LIGHT_POOL = { spots, fills, shadowN, roomSegIdx, segIdx: null, dirty: true };
}

function placeSpot(spot, spec) {
  if (!spec) {
    spot.intensity = 0;
    spot.position.set(0, LIGHT_PARK_Y, 0);
    spot.target.position.set(0, LIGHT_PARK_Y - 1, 0);
    return;
  }
  spot.intensity = 3.2;
  spot.position.copy(spec.position);
  spot.target.position.copy(spec.target);
}

function placeFill(fill, spec) {
  if (!spec) {
    fill.intensity = 0;
    fill.position.set(0, LIGHT_PARK_Y, 0);
    return;
  }
  fill.color.setHex(spec.color);
  fill.intensity = spec.intensity;
  fill.distance = spec.distance;
  fill.position.copy(spec.position);
}

// 지금 있는 방의 작품 조명은 그림자 자리에, 옆방 조명은 남은 자리에 배정한다.
// 조명 개수와 그림자 개수가 항상 같으므로 방을 옮겨도 셰이더를 다시 컴파일하지 않는다.
function updateRoomLighting(seg) {
  const curSegIdx = seg ? SEGMENTS.indexOf(seg) : -1;
  if (!LIGHT_POOL || (curSegIdx === LIGHT_POOL.segIdx && !LIGHT_POOL.dirty)) return;
  LIGHT_POOL.segIdx = curSegIdx;
  LIGHT_POOL.dirty = false;

  const current = [], others = [], fillSpecs = [];
  Object.keys(ROOM_LIGHT_GROUPS).forEach((key) => {
    const roomSegIdx = LIGHT_POOL.roomSegIdx[key];
    if (!isNearSegment(roomSegIdx, curSegIdx)) return;
    ROOM_LIGHT_GROUPS[key].forEach((spec) => {
      if (spec.kind === "fill") fillSpecs.push(spec);
      else (roomSegIdx === curSegIdx ? current : others).push(spec);
    });
  });

  const { spots, fills, shadowN } = LIGHT_POOL;
  // 남는 자리는 그림자 없는 조명부터 쓰고, 그래도 모자라면 비어 있는 그림자 자리를 쓴다
  const freeSlots = spots.slice(shadowN).concat(spots.slice(current.length, shadowN));
  spots.slice(0, current.length).forEach((spot, i) => placeSpot(spot, current[i]));
  freeSlots.forEach((spot, i) => placeSpot(spot, others[i]));
  fills.forEach((fill, i) => placeFill(fill, fillSpecs[i]));
}

// Supabase에서 방 단위 작품 데이터를 비동기로 불러온 뒤, 전시실 개수만큼 복도·전시실을 이어 붙이고
// 각 방 벽에 그 방의 작품들을 배치한다 (실패 시 자동으로 데모 데이터 사용, Phase 4: 다중 전시실)
// (로그인 흐름에서 "어느 계정 기준으로 불러왔는지" 확인할 수 있도록 Promise를 전역에 보관)
window.artworksLoadPromise = loadArtworksData().then((roomsData) => {
  buildLobbySign(roomsData.exhibitionInfo);
  const builtRooms = buildRoomsAndCorridors(roomsData);
  artworks = [];
  builtRooms.forEach((room) => {
    const offset = artworks.length;
    artworks = artworks.concat(room.artworks);
    placeArtworksInScene(room.artworks, room.bounds, offset, room.roomIndex, room.theme);
  });
  buildLightPool();
  // 멀리 있는 방의 재질도 미리 컴파일해 두어 처음 들어설 때 멈추지 않게 한다
  renderer.compile(scene, camera);
});
