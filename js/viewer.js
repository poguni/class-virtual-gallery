/* =========================================================================
   애니메이션 루프
   ========================================================================= */
const clock = new THREE.Clock();
const ROT_SPEED = 1.8; // 방향키 시선 회전 속도 (rad/sec)
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (modalOpen) {
    renderer.render(scene, camera);
    return;
  }

  // 방향키로 시선 회전
  if (look.left) yaw += ROT_SPEED * dt;
  if (look.right) yaw -= ROT_SPEED * dt;
  if (look.up) pitch = Math.min(pitch + ROT_SPEED * dt, 1.2);
  if (look.down) pitch = Math.max(pitch - ROT_SPEED * dt, -1.2);

  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  const speed = 3.2;
  // 이동 벡터 계산 (yaw 기준) — 키보드와 터치 조이스틱 입력을 항상 함께 반영
  const dir = new THREE.Vector3();
  let mForward = 0, mStrafe = 0;

  if (move.forward) mForward += 1;
  if (move.back) mForward -= 1;
  if (move.right) mStrafe += 1;
  if (move.left) mStrafe -= 1;

  mForward += joystickVec.y;
  mStrafe += joystickVec.x;
  mForward = THREE.MathUtils.clamp(mForward, -1, 1);
  mStrafe = THREE.MathUtils.clamp(mStrafe, -1, 1);

  if (mForward !== 0 || mStrafe !== 0) {
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    dir.x = (-sinY * mForward) + (cosY * mStrafe);
    dir.z = (-cosY * mForward) - (sinY * mStrafe);
    dir.normalize();
    const newPos = camera.position.clone();
    newPos.x += dir.x * speed * dt;
    newPos.z += dir.z * speed * dt;
    clampPlayerPosition(newPos, camera.position);
    camera.position.x = newPos.x;
    camera.position.z = newPos.z;

    // 헤드보빙
    bobTime += dt * 8;
    camera.position.y = 1.65 + Math.sin(bobTime) * 0.035;
  } else {
    bobTime = 0;
    camera.position.y += (1.65 - camera.position.y) * 0.2;
  }

  // 전시실 라벨 표시 (현재 위치한 세그먼트의 이름을 그대로 표시) + 방 단위 조명 밝기/그림자 갱신
  const label = document.getElementById("roomLabel");
  const curSeg = findSegment(camera.position.x, camera.position.z) || lastKnownSegment;
  updateRoomLighting(curSeg);
  if (curSeg) {
    label.style.display = "block"; label.textContent = curSeg.label;
  } else {
    label.style.display = "none";
  }

  // 마우스가 작품 위에 있으면 커서를 포인터로 변경 (PC)
  if (!isTouch) {
    raycaster.setFromCamera(mouseNDC, camera);
    const hoverHits = raycaster.intersectObjects(raycastTargets);
    canvasEl.style.cursor = hoverHits.length ? "pointer" : "default";
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* =========================================================================
   시작 화면 / 모달 UI 로직
   ========================================================================= */
document.getElementById("enterBtn").addEventListener("click", () => {
  document.getElementById("startScreen").style.display = "none";
  canvasEl.focus();
  document.getElementById("hint").style.display = "block";
  document.getElementById("roomLabel").style.display = "block";
  // 게스트(학생·학부모)는 애초에 로그인하지 않았으므로 처음 화면·로그아웃 버튼이 필요 없음 — 교사 계정일 때만 노출
  if (isTeacher) document.getElementById("teacherBar").style.display = "flex";
});

// 교사: 전시장을 둘러본 뒤 다시 설정하러 입장 화면으로 — 로그인 세션은 그대로 남아 있으므로
// 새로고침하면 입장 화면(관리자·QR 코드)으로 돌아오고, 관리 화면에서 바꾼 테마·작품도 새로 불러온다
document.getElementById("backToStartBtn").addEventListener("click", () => location.reload());

// 교사 로그아웃 — 전시장 안(logoutBtn)과 시작 화면(startLogoutBtn) 두 버튼이 함께 사용
async function logoutTeacher(btn) {
  btn.disabled = true;
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.warn("[가상미술관] 로그아웃 처리 중 오류:", err.message || err);
  }
  // 지금 화면의 전시는 교사 기준(숨김 댓글 포함)으로 불러온 것이므로, 새로고침해서
  // 방문자 기준으로 다시 불러온 로그인 화면으로 복귀 (게스트로 재입장하거나 다시 로그인 가능)
  location.reload();
}
document.getElementById("logoutBtn").addEventListener("click", (e) => logoutTeacher(e.currentTarget));
document.getElementById("startLogoutBtn").addEventListener("click", (e) => logoutTeacher(e.currentTarget));

let currentArtworkIndex = null;
const modalOverlay = document.getElementById("modalOverlay");
const imageZoomOverlay = document.getElementById("imageZoomOverlay");
const imageZoomImg = document.getElementById("imageZoomImg");

/* ---- 스마트폰 '뒤로 가기' 버튼 대응 ----
   전시실(기본 화면) → 그림(모달) → 큰 그림(전체화면) 순으로 들어간 만큼, 뒤로 가기를 눌렀을 때도
   한 단계씩만 닫히고 앱 자체를 벗어나지 않도록 브라우저 히스토리에 가상의 "단계"를 쌓아둔다.
   - 그림을 열 때 history.pushState로 'modal' 단계를 하나 쌓는다.
   - 큰 그림을 열 때 그 위에 'zoom' 단계를 하나 더 쌓는다.
   - 뒤로 가기(popstate)가 발생하면, 지금 남아있는 단계에 맞춰 큰 그림/그림을 닫기만 하고
     history는 건드리지 않는다 (이미 브라우저가 알아서 한 단계 되돌린 상태이기 때문).
   - X 버튼이나 바깥 클릭으로 직접 닫을 때는 반대로, 화면은 우리가 먼저 닫고
     history.back()을 호출해 쌓아뒀던 단계를 정리한다. 그러면 다음에 뒤로 가기를 눌러도
     이미 닫힌 화면이 아니라 그 다음 단계(예: 전시실)로 정확히 이어진다. */
function closeModal(opts) {
  const fromPopstate = !!(opts && opts.fromPopstate);
  modalOverlay.style.display = "none";
  imageZoomOverlay.style.display = "none"; // 혹시 전체화면 뷰어가 열려 있었다면 함께 닫음
  modalOpen = false;
  currentArtworkIndex = null;
  canvasEl.focus();
  if (!fromPopstate && history.state && history.state.galleryView) {
    history.back(); // 쌓아둔 히스토리 단계를 정리 (되돌아오면서 popstate가 다시 호출되지만 이미 닫혀있어 안전)
  }
}

function openModal(index) {
  currentArtworkIndex = index;
  const art = artworks[index];
  document.getElementById("modalImg").src = art.imageUrl || art.dataUrl;
  document.getElementById("modalTitle").textContent = art.title;
  document.getElementById("modalArtist").textContent = art.artist + " 作";
  renderLikes();
  renderComments();
  modalOverlay.style.display = "flex";
  modalOpen = true;
  // 모달이 열려 있는 동안 캐릭터가 계속 움직이지 않도록 입력 상태 초기화
  move.forward = move.back = move.left = move.right = false;
  look.up = look.down = look.left = look.right = false;
  history.pushState({ galleryView: "modal" }, "");
}
document.getElementById("closeModal").addEventListener("click", () => closeModal());
modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });

/* ---- 작품 이미지 전체화면 보기: 모달 안의 이미지를 한 번 더 누르면 화면 꽉 차게 확대 ---- */
function openImageZoom() {
  const src = document.getElementById("modalImg").src;
  if (!src) return;
  imageZoomImg.src = src;
  imageZoomOverlay.style.display = "flex";
  history.pushState({ galleryView: "zoom" }, "");
}
function closeImageZoom(opts) {
  const fromPopstate = !!(opts && opts.fromPopstate);
  imageZoomOverlay.style.display = "none";
  if (!fromPopstate && history.state && history.state.galleryView === "zoom") {
    history.back();
  }
}
document.getElementById("modalImg").addEventListener("click", (e) => {
  e.stopPropagation(); // 모달 바깥 클릭으로 오인되어 모달 자체가 닫히지 않도록 함
  openImageZoom();
});
imageZoomOverlay.addEventListener("click", () => closeImageZoom()); // 이미지든 배경이든 어디를 눌러도 닫힘 (모바일에서 직관적)
document.getElementById("imageZoomClose").addEventListener("click", (e) => { e.stopPropagation(); closeImageZoom(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && imageZoomOverlay.style.display === "flex") closeImageZoom();
});

// 스마트폰/브라우저의 '뒤로 가기'를 눌렀을 때 실행됨. 지금 남아있는 히스토리 단계를 보고
// 큰 그림만 닫을지, 그림(모달)까지 닫을지를 판단한다.
window.addEventListener("popstate", (e) => {
  const view = e.state && e.state.galleryView;
  if (view === "modal") {
    // 큰 그림(zoom)에서 한 단계 뒤로 와 그림(modal) 단계에 도착한 경우: 큰 그림만 닫는다
    closeImageZoom({ fromPopstate:true });
  } else {
    // 그림(modal)에서 한 단계 뒤로 와 전시실(기본) 단계로 돌아온 경우: 그림까지 닫는다
    closeImageZoom({ fromPopstate:true });
    if (modalOpen) closeModal({ fromPopstate:true });
  }
});

function renderLikes() {
  const art = artworks[currentArtworkIndex];
  const btn = document.getElementById("likeBtn");
  btn.classList.toggle("liked", art.liked);
  document.getElementById("likeCount").textContent = `${art.likes}명이 좋아합니다`;
}
document.getElementById("likeBtn").addEventListener("click", async () => {
  const art = artworks[currentArtworkIndex];
  const btn = document.getElementById("likeBtn");

  // 데모 모드(Supabase 미연동)에서는 기존처럼 로컬 메모리에만 반영
  if (DEMO_MODE || !art.id) {
    art.liked = !art.liked;
    art.likes += art.liked ? 1 : -1;
    renderLikes();
    return;
  }

  btn.disabled = true;
  const wasLiked = art.liked;
  try {
    if (!wasLiked) {
      const { error } = await supabaseClient.from("likes")
        .insert({ artwork_id: art.id, visitor_key: VISITOR_KEY });
      // unique(artwork_id, visitor_key) 위반(이미 좋아요 누른 상태)은 무시하고 liked 상태만 맞춤
      if (error && error.code !== "23505") throw error;
      art.liked = true;
      art.likes += 1;
    } else {
      const { error } = await supabaseClient.from("likes")
        .delete().eq("artwork_id", art.id).eq("visitor_key", VISITOR_KEY);
      if (error) throw error;
      art.liked = false;
      art.likes = Math.max(0, art.likes - 1);
    }
  } catch (err) {
    console.warn("[가상미술관] 좋아요 처리 실패:", err.message || err);
  } finally {
    btn.disabled = false;
    renderLikes();
  }
});

function renderComments() {
  const art = artworks[currentArtworkIndex];
  const list = document.getElementById("commentList");
  list.innerHTML = "";
  if (art.comments.length === 0) {
    list.innerHTML = `<div class="commentItem" style="color:#8a7d64;">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</div>`;
  }
  art.comments.forEach(c => {
    const div = document.createElement("div");
    div.className = "commentItem";
    if (c.is_hidden) div.style.opacity = "0.5";
    const hiddenBadge = c.is_hidden ? `<span style="color:#ff9d8a;font-size:11px;margin-left:6px;">(숨김됨)</span>` : "";
    div.innerHTML = `<span class="cName">${escapeHtml(c.nickname)}</span><span class="cText">${escapeHtml(c.content)}</span>${hiddenBadge}`;

    // 교사 본인의 전시를 보고 있고, 실제 DB 댓글(id 보유)일 때만 숨김/복원 버튼 노출
    if (isTeacher && OWNS_LOADED_EXHIBITION && !DEMO_MODE && c.id) {
      const modBtn = document.createElement("button");
      modBtn.textContent = c.is_hidden ? "복원" : "숨김";
      modBtn.style.cssText = "margin-left:8px;font-size:11px;background:transparent;border:1px solid #5a4f3c;color:#c9bca3;border-radius:5px;padding:2px 8px;cursor:pointer;";
      modBtn.addEventListener("click", () => toggleCommentHidden(c));
      div.appendChild(modBtn);
    }
    list.appendChild(div);
  });
  list.scrollTop = list.scrollHeight;
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

async function toggleCommentHidden(comment) {
  const nextHidden = !comment.is_hidden;
  try {
    const { error } = await supabaseClient.from("comments")
      .update({ is_hidden: nextHidden }).eq("id", comment.id);
    if (error) throw error;
    comment.is_hidden = nextHidden;
    renderComments();
  } catch (err) {
    console.warn("[가상미술관] 댓글 숨김 처리 실패:", err.message || err);
    alert("댓글 처리 중 오류가 발생했어요. 다시 시도해주세요.");
  }
}

document.getElementById("commentSend").addEventListener("click", submitComment);
document.getElementById("commentText").addEventListener("keydown", (e) => { if (e.key === "Enter") submitComment(); });

async function submitComment() {
  const nameInput = document.getElementById("commentName");
  const textInput = document.getElementById("commentText");
  const sendBtn = document.getElementById("commentSend");
  const name = nameInput.value.trim() || "익명";
  const text = textInput.value.trim();
  if (!text) return;

  const art = artworks[currentArtworkIndex];

  // 데모 모드(Supabase 미연동)에서는 기존처럼 로컬 메모리에만 반영
  if (DEMO_MODE || !art.id) {
    art.comments.push({ id: `local-${Date.now()}`, nickname: name, content: text, is_hidden:false });
    textInput.value = "";
    renderComments();
    return;
  }

  sendBtn.disabled = true;
  try {
    const { data, error } = await supabaseClient.from("comments")
      .insert({ artwork_id: art.id, nickname: name, content: text, is_hidden:false })
      .select().single();
    if (error) throw error;
    art.comments.push(data);
    textInput.value = "";
    renderComments();
  } catch (err) {
    console.warn("[가상미술관] 댓글 등록 실패:", err.message || err);
    alert("댓글 등록에 실패했어요. 잠시 후 다시 시도해주세요.");
  } finally {
    sendBtn.disabled = false;
  }
}
