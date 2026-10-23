/* =========================================================================
   1인칭 이동 컨트롤 (PC: Pointer Lock / 모바일: 조이스틱+드래그)
   ========================================================================= */
// 주 입력장치가 '터치'인 기기만 모바일 모드로 판단 (터치스크린이 달린 PC는 제외)
// 터치 기기 판별: "포인터가 굵고(coarse) 마우스 호버가 없는" 기기만 터치 전용 기기로 인정한다.
// maxTouchPoints/ontouchstart만으로 판별하면 터치스크린이 없는 PC(특히 일부 노트북
// 트랙패드/브라우저)도 터치가 있다고 잘못 인식되어, 데스크톱에서도 모바일 조작 UI가
// 나타나는 문제가 있었다. hover:none까지 함께 확인해야 실제 폰/태블릿만 정확히 걸러진다.
const isTouch = window.matchMedia && window.matchMedia("(pointer: coarse) and (hover: none)").matches;

let yaw = 0, pitch = 0; // 시작 시 -z(전시실 방향)을 보도록
camera.rotation.order = "YXZ";

const move = { forward:false, back:false, left:false, right:false };
const velocity = new THREE.Vector3();
let bobTime = 0;
let modalOpen = false;

// 현재 z좌표가 속한 세그먼트(로비/복도/전시실)를 SEGMENTS에서 찾아 그 구간의 벽으로 clamp.
// SEGMENTS는 로비(가장 큰 z)부터 마지막 전시실(가장 작은 z)까지 순서대로 이어져 있으므로,
// 위에서부터 내려오며 pos.z가 그 세그먼트의 minZ 이상인 첫 번째 세그먼트를 사용한다.
// 이제 A동/B동이 같은 z 구간에서도 서로 다른 x 범위를 가지므로(양 갈래 순환 동선),
// z만으로는 구간을 특정할 수 없어 (x,z)가 실제로 그 세그먼트의 사각형 안에 있는지로 판정한다.
// 문(입구) 경계처럼 어느 세그먼트에도 딱 걸리지 않는 찰나에는 마지막으로 있던 곳을 그대로 유지한다.
let lastKnownSegment = null;
// 전시실은 폭이 넓어서, 연결 통로 바로 앞의 얕은 구간과 사각형이 서로 겹칠 수 있다.
// 이 겹치는 구간에서 "전시실"이 먼저 판정되면 전시실의 좁은 x범위에 갇혀 통로를 따라
// 옆으로(연결 통로 방향으로) 빠져나가지 못하게 되므로, 폭이 좁은 통로/연결통로를 먼저
// 확인하고 그다음에 전시실을 확인한다.
function findSegment(x, z) {
  const pad = 0.05;
  const hit = (seg) => x >= seg.minX - pad && x <= seg.maxX + pad && z >= seg.minZ - pad && z <= seg.maxZ + pad;
  for (const seg of SEGMENTS) { if (seg.type !== "room" && hit(seg)) return seg; }
  for (const seg of SEGMENTS) { if (seg.type === "room" && hit(seg)) return seg; }
  return null;
}

// 걸을 수 있는 공간 = SEGMENTS 사각형들의 합집합 (벽은 정확히 이 경계에 서 있음).
// 몸 폭(PLAYER_RADIUS)만큼 떨어진 네 모서리 점이 모두 어떤 세그먼트 안에 있어야 서 있을 수 있다.
// — 위의 x 제한만으로는 문 옆 앞뒤 벽(전시실 앞/뒷벽, 연결 통로 가운데 벽)을 막지 못해
//   벽을 뚫고 빈 공간으로 들어가던 문제를 막기 위한 검사
const PLAYER_RADIUS = 0.3;
function isWalkable(x, z) {
  const pad = 0.02;
  const inAny = (px, pz) => SEGMENTS.some(seg =>
    px >= seg.minX - pad && px <= seg.maxX + pad && pz >= seg.minZ - pad && pz <= seg.maxZ + pad);
  const r = PLAYER_RADIUS;
  return inAny(x - r, z - r) && inAny(x + r, z - r) && inAny(x - r, z + r) && inAny(x + r, z + r);
}

// prev: 이동 전 위치. 이동한 위치가 벽 너머(빈 공간)면 벽을 따라 미끄러지도록
// z만 되돌리거나 x만 되돌려 보고, 둘 다 안 되면 제자리에 머문다.
function clampPlayerPosition(pos, prev) {
  clampToSegment(pos);
  if (prev && SEGMENTS.length > 1 && !isWalkable(pos.x, pos.z) && isWalkable(prev.x, prev.z)) {
    if (isWalkable(pos.x, prev.z)) pos.z = prev.z;
    else if (isWalkable(prev.x, pos.z)) pos.x = prev.x;
    else { pos.x = prev.x; pos.z = prev.z; }
  }
  return pos;
}

function clampToSegment(pos) {
  let seg = findSegment(pos.x, pos.z);
  if (!seg) seg = lastKnownSegment;
  if (!seg) return pos; // 데이터 로드 전(방/복도가 아직 생성되지 않은 순간)에는 이동만 허용
  lastKnownSegment = seg;

  const margin = seg.type === "corridor" ? 0.35 : (seg.type === "lobby" ? 0.4 : 0.5);
  if (seg.axis === "x") {
    // 가로로 뻗은 연결 통로: 좌우(x)는 통로 양 끝(바깥쪽 벽)까지만 제한한다.
    // 앞뒤(z)는 맨 안쪽 막다른 벽 방향만 막고, 반대쪽(양옆 전시실로 이어지는 방향)은 열어둬야
    // 통로에서 다시 전시실로 돌아가거나 다음 전시실로 들어갈 수 있다.
    pos.x = THREE.MathUtils.clamp(pos.x, seg.minX + margin, seg.maxX - margin);
    pos.z = Math.max(pos.z, seg.minZ + margin);
  } else {
    // 세로로 뻗은 구간(로비/복도/전시실)은 좌우(x)만 제한하고, 진행 방향(z)은
    // 다음 방/복도로 자연스럽게 이어지도록 손대지 않는다.
    pos.x = THREE.MathUtils.clamp(pos.x, seg.minX + margin, seg.maxX - margin);
  }

  if (seg.type === "lobby") {
    pos.z = Math.min(pos.z, seg.maxZ - 0.4); // 입구 밖으로 나가지 못하게 (막다른 경계)
    // 로비 뒷벽에는 A동/B동으로 통하는 문 2개만 뚫려 있고 나머지(간판이 걸린 가운데 벽 포함)는
    // 막힌 벽이다. 문 x범위 바깥에서는 뒷벽을 통과해 나가지 못하도록 z 최소값도 함께 제한한다.
    const inDoorA = pos.x >= WING_CENTER_A - CORR_HALF && pos.x <= WING_CENTER_A + CORR_HALF;
    const inDoorB = pos.x >= WING_CENTER_B - CORR_HALF && pos.x <= WING_CENTER_B + CORR_HALF;
    if (!inDoorA && !inDoorB) {
      pos.z = Math.max(pos.z, seg.minZ + margin);
    }
  }
  return pos;
}

/* ---- 캔버스 참조 ---- */
const canvasEl = renderer.domElement;
canvasEl.tabIndex = 0;
canvasEl.style.outline = "none";

/* ---- 키보드: WASD=이동, 방향키=시선 회전 ---- */
const MOVE_KEYS = new Set(["KeyW","KeyA","KeyS","KeyD"]);
const LOOK_KEYS = new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"]);
const look = { up:false, down:false, left:false, right:false };

// 로그인 폼, 댓글 입력창 등 텍스트를 입력하는 요소에 포커스가 있을 때는
// WASD/방향키를 이동 단축키로 가로채지 않고 그대로 타이핑되도록 통과시킴
function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function handleKeyDown(e) {
  if (isTypingTarget(e.target)) return;
  if (MOVE_KEYS.has(e.code)) {
    e.preventDefault();
    if (e.code === "KeyW") move.forward = true;
    if (e.code === "KeyS") move.back = true;
    if (e.code === "KeyA") move.left = true;
    if (e.code === "KeyD") move.right = true;
  } else if (LOOK_KEYS.has(e.code)) {
    e.preventDefault();
    if (e.code === "ArrowUp") look.up = true;
    if (e.code === "ArrowDown") look.down = true;
    if (e.code === "ArrowLeft") look.left = true;
    if (e.code === "ArrowRight") look.right = true;
  }
}
function handleKeyUp(e) {
  if (isTypingTarget(e.target)) return;
  if (MOVE_KEYS.has(e.code)) {
    e.preventDefault();
    if (e.code === "KeyW") move.forward = false;
    if (e.code === "KeyS") move.back = false;
    if (e.code === "KeyA") move.left = false;
    if (e.code === "KeyD") move.right = false;
  } else if (LOOK_KEYS.has(e.code)) {
    e.preventDefault();
    if (e.code === "ArrowUp") look.up = false;
    if (e.code === "ArrowDown") look.down = false;
    if (e.code === "ArrowLeft") look.left = false;
    if (e.code === "ArrowRight") look.right = false;
  }
}
// window/document 이중 등록 시 동일 키 입력이 두 번 처리되므로 document 한 곳에만 등록
document.addEventListener("keydown", handleKeyDown);
document.addEventListener("keyup", handleKeyUp);

// 입력창에서 포커스가 벗어날 때(예: 로그인 후 다른 곳 클릭) 혹시 눌려 있던 이동 상태가
// 남아있지 않도록, 텍스트 입력 요소들이 blur될 때 이동/시선 상태를 안전하게 초기화
document.addEventListener("focusin", (e) => {
  if (isTypingTarget(e.target)) {
    move.forward = move.back = move.left = move.right = false;
    look.up = look.down = look.left = look.right = false;
  }
});

/* ---- 마우스: 작품 위에서 커서 변경 + 클릭 시 감상 ---- */
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2(2, 2); // 화면 밖 초기값

function updateMouseNDC(clientX, clientY) {
  const rect = canvasEl.getBoundingClientRect();
  mouseNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

function pickArtworkAtNDC(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(raycastTargets);
  if (hits.length) openModal(hits[0].object.userData.artworkIndex);
}

canvasEl.addEventListener("mousemove", (e) => {
  canvasEl.focus({ preventScroll: true });
  updateMouseNDC(e.clientX, e.clientY);
});

canvasEl.addEventListener("click", (e) => {
  canvasEl.focus({ preventScroll: true });
  updateMouseNDC(e.clientX, e.clientY);
  pickArtworkAtNDC(mouseNDC);
});

/* ---- 모바일: 조이스틱(이동) + 드래그(시선) + 탭(감상) ----
   기존에는 외부 라이브러리(nipplejs)에 의존했는데, 그 라이브러리가 네트워크 문제 등으로
   로드되지 않으면 이 블록에서 에러가 나면서 이 아래(특히 애니메이션 루프를 시작하는
   animate() 호출)까지 스크립트 전체가 멈춰버리는 문제가 있었다. 이동/조작을 직접 구현한
   가벼운 코드로 바꾸고, 혹시 모를 오류가 나머지 앱을 멈추지 않도록 try/catch로 감쌌다.

   추가로, "이 기기가 터치 기기인가?"를 미리 판별하는 pointer/hover 미디어쿼리는 카카오톡·
   인스타그램 등 일부 인앱 브라우저에서 실제와 다르게(마우스가 있는 것처럼) 보고되는 경우가
   있어, 그 판별에만 기대면 진짜 터치 기기인데도 조작 UI가 끝내 나타나지 않을 수 있다.
   그래서 터치 이벤트 리스너 자체는 기기 판별과 무관하게 항상 등록해두고(마우스만 쓰는
   PC에서는 어차피 터치 이벤트가 발생하지 않으므로 아무 영향이 없다), 화면을 실제로 한 번이라도
   터치하는 순간 그걸 근거로 조작 UI를 확실히 드러내는 방식을 이중으로 둔다. */
let joystickVec = {x:0,y:0};
let joyTouchId = null;
let lookTouchId = null;
let touchControlsRevealed = false;

function revealTouchControls() {
  if (touchControlsRevealed) return;
  touchControlsRevealed = true;
  const joyZone = document.getElementById("joystickZone");
  const lookHint = document.getElementById("lookZoneHint");
  if (joyZone) joyZone.style.display = "flex";
  if (lookHint) lookHint.style.display = "block";
}
if (isTouch) revealTouchControls(); // 판별이 맞으면 처음부터 바로 표시
// 판별이 틀렸더라도, 실제로 화면을 터치하는 첫 순간에 확실하게 표시(최종 안전장치)
document.addEventListener("touchstart", revealTouchControls, { passive:true, once:true });

try {
  const joyZone = document.getElementById("joystickZone");
  const joyThumb = document.getElementById("joystickThumb");
  renderer.domElement.style.touchAction = "none"; // 브라우저 기본 스크롤/줌 제스처가 시선 드래그를 방해하지 않도록 함

  const JOY_RADIUS = 46; // 엄지가 움직일 수 있는 최대 반경(px)

  function joyCenter() {
    const r = joyZone.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  }
  function updateJoy(t) {
    const c = joyCenter();
    let dx = t.clientX - c.x, dy = t.clientY - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist > JOY_RADIUS) { dx = dx/dist*JOY_RADIUS; dy = dy/dist*JOY_RADIUS; }
    joyThumb.style.transform = `translate(${dx}px, ${dy}px)`;
    joystickVec.x = dx / JOY_RADIUS;
    joystickVec.y = -dy / JOY_RADIUS; // 위로 밀면 전진(+forward)이 되도록 부호를 반전
  }
  function resetJoy() {
    joyTouchId = null; joystickVec.x = 0; joystickVec.y = 0;
    joyThumb.style.transform = "translate(0px, 0px)";
  }

  joyZone.addEventListener("touchstart", (e) => {
    revealTouchControls();
    if (joyTouchId !== null) return;
    const t = e.changedTouches[0];
    joyTouchId = t.identifier;
    updateJoy(t);
    e.preventDefault();
  }, { passive:false });
  window.addEventListener("touchmove", (e) => {
    if (joyTouchId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === joyTouchId) { updateJoy(t); e.preventDefault(); break; }
    }
  }, { passive:false });
  function endJoy(e) {
    if (joyTouchId === null) return;
    for (const t of e.changedTouches) { if (t.identifier === joyTouchId) { resetJoy(); break; } }
  }
  window.addEventListener("touchend", endJoy);
  window.addEventListener("touchcancel", endJoy);
} catch (err) {
  console.warn("[가상미술관] 모바일 조이스틱 초기화 실패(다른 기능에는 영향 없음):", err.message || err);
}

try {
  function inJoyZone(x, y) {
    const r = document.getElementById("joystickZone").getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  let lookStart = null;
  let dragMoved = false;

  renderer.domElement.addEventListener("touchstart", (e) => {
    revealTouchControls();
    if (lookTouchId !== null) return;
    const t = e.changedTouches[0];
    if (inJoyZone(t.clientX, t.clientY)) return; // 조이스틱 영역은 시선 드래그에서 제외
    lookTouchId = t.identifier;
    lookStart = { x:t.clientX, y:t.clientY };
    dragMoved = false;
  }, { passive:true });
  renderer.domElement.addEventListener("touchmove", (e) => {
    if (lookTouchId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== lookTouchId) continue;
      const dx = t.clientX - lookStart.x, dy = t.clientY - lookStart.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
      yaw -= dx * 0.0035;
      pitch -= dy * 0.0035;
      pitch = THREE.MathUtils.clamp(pitch, -1.2, 1.2);
      lookStart = { x:t.clientX, y:t.clientY };
      break;
    }
  }, { passive:true });
  function endLook(e) {
    if (lookTouchId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== lookTouchId) continue;
      if (!dragMoved) { updateMouseNDC(t.clientX, t.clientY); pickArtworkAtNDC(mouseNDC); }
      lookTouchId = null; lookStart = null;
      break;
    }
  }
  renderer.domElement.addEventListener("touchend", endLook);
  renderer.domElement.addEventListener("touchcancel", endLook);
} catch (err) {
  console.warn("[가상미술관] 모바일 시선 드래그 초기화 실패(다른 기능에는 영향 없음):", err.message || err);
}
