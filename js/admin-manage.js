/* =========================================================================
   Phase 3-보완 — 기존 전시 관리 (수정/삭제)
   - 이미 만들어진 전시를 목록에서 골라 정보 수정, 작품 이름/제목 수정, 개별 삭제,
     전시 통째 삭제까지 지원
   ========================================================================= */
let currentMgExhibitionId = null;
let currentLiveExhibitionId = null; // 내 전시 중 지금 방문자(관람객)에게 보여지는 전시(is_active)의 id
let mgArtworksById = {}; // { artworkId: {id, room_id, room_number, student_name, title, image_url} }
let mgRooms = []; // [{id, room_number, name}] — 현재 선택된 전시의 전시실 목록
let mgArtRowsForRender = []; // renderMgRooms()에 마지막으로 넘긴 작품 배열 (순서 변경 후 재렌더링에 사용)

// 업로드된 이미지의 공개 URL에서 Storage 내부 경로만 추출 (삭제 시 사용)
function extractStoragePath(url) {
  if (!url) return null;
  const marker = `/${STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  try { return decodeURIComponent(url.slice(idx + marker.length)); }
  catch (e) { return url.slice(idx + marker.length); }
}

async function loadExhibitionsList() {
  const select = document.getElementById("adminExhibitionSelect");
  const prevValue = select.value;
  select.innerHTML = `<option value="">전시를 선택하세요…</option>`;
  document.getElementById("adminManageDetail").style.display = "none";
  currentMgExhibitionId = null;

  try {
    // RLS상 다른 교사의 "현재 전시"도 조회되므로(방문자 공개용), 관리 화면에서는 내 전시만 걸러냄
    const { data, error } = await supabaseClient
      .from("exhibitions").select("id, title, grade, class, created_at, is_active")
      .eq("owner_id", currentTeacher.user_id)
      .order("created_at", { ascending:false });
    if (error) throw error;

    (data || []).forEach(ex => {
      const opt = document.createElement("option");
      opt.value = ex.id;
      const meta = [ex.grade ? `${ex.grade}학년` : null, ex.class || null].filter(Boolean).join(" ");
      const label = meta ? `${ex.title} (${meta})` : ex.title;
      opt.textContent = ex.is_active ? `⭐ ${label} (현재 전시 중)` : label;
      select.appendChild(opt);
    });
    const live = (data || []).find(ex => ex.is_active);
    currentLiveExhibitionId = live ? live.id : null;

    if (prevValue && [...select.options].some(o => o.value === prevValue)) {
      select.value = prevValue;
    }
  } catch (err) {
    console.warn("[가상미술관] 전시 목록 로드 실패:", err.message || err);
    alert("전시 목록을 불러오지 못했어요: " + (err.message || err));
  }
}
document.getElementById("adminExhibitionRefreshBtn").addEventListener("click", loadExhibitionsList);

document.getElementById("adminExhibitionSelect").addEventListener("change", (e) => {
  const id = e.target.value;
  if (!id) {
    document.getElementById("adminManageDetail").style.display = "none";
    currentMgExhibitionId = null;
    return;
  }
  loadExhibitionDetail(id);
});

// 선택된 전시가 지금 방문자에게 보이는 전시(currentLiveExhibitionId)와 같은지에 따라
// "현재 전시장으로 설정" 버튼을 켜고 끄고, 안내 문구를 갱신한다.
function updateMgActiveButtonState() {
  const btn = document.getElementById("adminMgSetActiveBtn");
  const statusEl = document.getElementById("adminMgActiveStatus");
  if (!btn || !statusEl) return;
  const isLive = !!currentMgExhibitionId && currentMgExhibitionId === currentLiveExhibitionId;
  btn.disabled = isLive;
  btn.style.opacity = isLive ? "0.55" : "1";
  btn.style.cursor = isLive ? "default" : "pointer";
  statusEl.textContent = isLive ? "✅ 지금 방문자들이 보고 있는 전시예요." : "";
  statusEl.style.color = "#3c7a37";
}

document.getElementById("adminMgSetActiveBtn").addEventListener("click", async () => {
  if (!currentMgExhibitionId || currentMgExhibitionId === currentLiveExhibitionId) return;
  const title = document.getElementById("adminMgTitle").value || "이 전시";
  const ok = confirm(`"${title}"(을)를 지금 방문자들이 보는 전시장으로 설정할까요?\n(지금 전시 중이던 다른 전시는 더 이상 보이지 않게 돼요.)`);
  if (!ok) return;

  const btn = document.getElementById("adminMgSetActiveBtn");
  const statusEl = document.getElementById("adminMgActiveStatus");
  btn.disabled = true;
  statusEl.textContent = "설정하는 중...";
  statusEl.style.color = "";

  try {
    // 내 전시 중 이 전시만 is_active=true로 (나머지 내 전시는 자동으로 false, DB 함수에서 처리)
    const { error } = await supabaseClient.rpc("set_active_exhibition", { p_ex: currentMgExhibitionId });
    if (error) throw error;

    const savedId = currentMgExhibitionId;
    await loadExhibitionsList();          // 목록의 정렬·⭐표시를 최신 상태로 갱신
    await loadExhibitionDetail(savedId, true); // 상세 패널을 다시 채우면서 버튼 상태도 함께 갱신됨
  } catch (err) {
    console.warn("[가상미술관] 현재 전시장 설정 실패:", err.message || err);
    statusEl.textContent = "설정에 실패했어요: " + (err.message || err);
    statusEl.style.color = "#c0503f";
    btn.disabled = false;
  }
});

async function loadExhibitionDetail(exhibitionId, keepAddStatus) {
  const detailSection = document.getElementById("adminManageDetail");
  const roomsWrap = document.getElementById("adminMgRoomsWrap");
  roomsWrap.innerHTML = `<div class="admin-empty-msg">불러오는 중...</div>`;
  detailSection.style.display = "block";
  document.getElementById("adminMgInfoMsg").textContent = "";
  resetMgAddForm(keepAddStatus); // 전시를 바꾸면 "작품 추가" 폼도 함께 초기화 (업로드 직후에는 결과 메시지를 유지)

  try {
    const { data: exRow, error: exErr } = await supabaseClient
      .from("exhibitions").select("id, title, grade, class").eq("id", exhibitionId).single();
    if (exErr) throw exErr;

    currentMgExhibitionId = exhibitionId;
    document.getElementById("adminMgTitle").value = exRow.title || "";
    document.getElementById("adminMgGrade").value = exRow.grade ?? "";
    document.getElementById("adminMgClass").value = exRow.class || "";
    updateMgActiveButtonState();

    const { data: rooms, error: roomErr } = await supabaseClient
      .from("rooms").select("id, room_number, name").eq("exhibition_id", exhibitionId)
      .order("room_number", { ascending:true });
    if (roomErr) throw roomErr;

    mgRooms = rooms || [];

    if (!rooms || !rooms.length) {
      roomsWrap.innerHTML = `<div class="admin-empty-msg">이 전시에는 아직 전시실이 없어요.</div>`;
      mgArtworksById = {};
      mgArtRowsForRender = [];
      return;
    }

    const roomIds = rooms.map(r => r.id);
    const { data: artRows, error: artErr } = await supabaseClient
      .from("artworks").select("id, room_id, student_name, title, image_url")
      .in("room_id", roomIds).order("created_at", { ascending:true });
    if (artErr) throw artErr;

    mgArtworksById = {};
    (artRows || []).forEach(a => { mgArtworksById[a.id] = a; });

    mgArtRowsForRender = artRows || [];
    renderMgRooms(rooms, mgArtRowsForRender);
  } catch (err) {
    console.warn("[가상미술관] 전시 상세 로드 실패:", err.message || err);
    roomsWrap.innerHTML = `<div class="admin-empty-msg">불러오기에 실패했어요: ${escapeHtml(err.message || String(err))}</div>`;
  }
}

function renderMgRooms(rooms, artRows) {
  const roomsWrap = document.getElementById("adminMgRoomsWrap");
  roomsWrap.innerHTML = "";

  rooms.forEach(room => {
    const items = artRows.filter(a => a.room_id === room.id);
    const block = document.createElement("div");
    block.className = "admin-room-block";
    block.innerHTML = `<h3>${escapeHtml(room.name || `제 ${room.room_number} 전시실`)} · ${items.length}편</h3>`;

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "admin-empty-msg";
      empty.textContent = "이 전시실에는 작품이 없어요.";
      block.appendChild(empty);
      roomsWrap.appendChild(block);
      return;
    }

    // 전시 순서(진열 순서) 컨트롤: 학생 이름순 / 랜덤 / 표의 ▲▼ 버튼으로 직접 조정
    const orderControls = document.createElement("div");
    orderControls.className = "admin-order-controls";
    orderControls.innerHTML = `
      <span class="admin-order-label">진열 순서</span>
      <button type="button" class="admin-order-btn" data-order-action="name">학생 이름순 정렬</button>
      <button type="button" class="admin-order-btn" data-order-action="random">랜덤 섞기</button>
      <span class="admin-order-hint">표의 ▲▼ 버튼으로도 순서를 조정할 수 있어요</span>
      <span class="admin-row-status admin-order-status"></span>
    `;
    block.appendChild(orderControls);
    const orderStatusEl = orderControls.querySelector(".admin-order-status");

    const tableWrap = document.createElement("div");
    tableWrap.className = "admin-table-wrap-flat"; // 전시실별로 별도 스크롤바가 생기지 않도록 함
    const table = document.createElement("table");
    table.className = "admin-preview-table";
    table.innerHTML = `
      <thead><tr><th>미리보기</th><th>학생 이름</th><th>작품 제목</th><th>순서</th><th></th></tr></thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    items.forEach((art, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><img class="admin-thumb" src="${art.image_url}" alt="" /></td>
        <td><input type="text" value="${escapeHtml(art.student_name)}" data-mg-field="student" /></td>
        <td><input type="text" value="${escapeHtml(art.title)}" data-mg-field="title" /></td>
        <td class="admin-order-cell">
          <button type="button" class="admin-order-move" data-dir="up" ${i===0 ? "disabled" : ""}>▲</button>
          <button type="button" class="admin-order-move" data-dir="down" ${i===items.length-1 ? "disabled" : ""}>▼</button>
        </td>
        <td>
          <button type="button" class="admin-save">저장</button>
          <button type="button" class="admin-remove">삭제</button>
          <span class="admin-row-status"></span>
        </td>
      `;
      const studentInput = tr.querySelector('[data-mg-field="student"]');
      const titleInput = tr.querySelector('[data-mg-field="title"]');
      const statusEl = tr.querySelector(".admin-row-status");

      tr.querySelector(".admin-save").addEventListener("click", () =>
        saveMgArtwork(art, studentInput.value, titleInput.value, statusEl));
      tr.querySelector(".admin-remove").addEventListener("click", () =>
        deleteMgArtwork(art, tr, block, room));

      const [upBtn, downBtn] = tr.querySelectorAll(".admin-order-move");
      upBtn.addEventListener("click", () => reorderRoomItems(room, items, i, "up", orderStatusEl));
      downBtn.addEventListener("click", () => reorderRoomItems(room, items, i, "down", orderStatusEl));

      tbody.appendChild(tr);
    });

    tableWrap.appendChild(table);
    block.appendChild(tableWrap);
    roomsWrap.appendChild(block);

    orderControls.querySelector('[data-order-action="name"]').addEventListener("click", () => {
      const sorted = [...items].sort((a, b) =>
        (a.student_name || "").localeCompare(b.student_name || "", "ko", { numeric:true, sensitivity:"base" })
      );
      applyRoomOrder(room, sorted, orderStatusEl);
    });
    orderControls.querySelector('[data-order-action="random"]').addEventListener("click", () => {
      const shuffled = [...items];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      applyRoomOrder(room, shuffled, orderStatusEl);
    });
  });
}

// 표의 ▲▼ 버튼 클릭 시 해당 전시실 내에서 한 칸 이동시킨 새 순서를 만들어 저장
function reorderRoomItems(room, items, idx, dir, statusEl) {
  const target = dir === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= items.length) return;
  const reordered = [...items];
  [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
  applyRoomOrder(room, reordered, statusEl);
}

// 전시실 하나의 작품 진열 순서를 실제로 저장(created_at 재기록)하고 화면을 다시 그림
async function applyRoomOrder(room, orderedItems, statusEl) {
  if (statusEl) { statusEl.textContent = "순서 저장 중..."; statusEl.style.color = "#c9bca3"; }
  try {
    // artworks 테이블에는 별도의 "진열 순서" 컬럼이 없어서, 정렬 기준으로 쓰이는 created_at을
    // 원하는 순서대로 촘촘히 다시 채워 넣는 방식으로 순서를 반영함 (같은 방 안에서만 영향을 줌)
    const baseTime = Date.now();
    for (let i = 0; i < orderedItems.length; i++) {
      const newTs = new Date(baseTime + i * 1000).toISOString();
      const { error } = await supabaseClient.from("artworks")
        .update({ created_at: newTs }).eq("id", orderedItems[i].id);
      if (error) throw error;
    }
    // 전역 상태(mgArtRowsForRender)에서도 이 방의 항목들을 새 순서로 교체한 뒤 다시 렌더링
    mgArtRowsForRender = mgArtRowsForRender.filter(a => a.room_id !== room.id).concat(orderedItems);
    renderMgRooms(mgRooms, mgArtRowsForRender);
  } catch (err) {
    console.warn("[가상미술관] 진열 순서 저장 실패:", err.message || err);
    if (statusEl) { statusEl.textContent = "순서 저장 실패"; statusEl.style.color = "#ff9d8a"; }
  }
}

async function saveMgArtwork(art, studentValue, titleValue, statusEl) {
  const student = studentValue.trim();
  const title = titleValue.trim();
  if (!student || !title) {
    statusEl.textContent = "이름·제목을 모두 입력해주세요";
    statusEl.style.color = "#ff9d8a";
    return;
  }
  statusEl.textContent = "저장 중...";
  statusEl.style.color = "#c9bca3";
  try {
    const { error } = await supabaseClient
      .from("artworks").update({ student_name: student, title }).eq("id", art.id);
    if (error) throw error;
    art.student_name = student;
    art.title = title;
    statusEl.textContent = "✅ 저장됨";
    statusEl.style.color = "#a7e3b0";
    setTimeout(() => { statusEl.textContent = ""; }, 1800);
  } catch (err) {
    console.warn("[가상미술관] 작품 정보 저장 실패:", err.message || err);
    statusEl.textContent = "저장 실패";
    statusEl.style.color = "#ff9d8a";
  }
}

async function deleteMgArtwork(art, rowEl, blockEl, room) {
  if (!confirm(`"${art.title}" 작품을 삭제할까요?\n좋아요·댓글도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
  try {
    const { error } = await supabaseClient.from("artworks").delete().eq("id", art.id);
    if (error) throw error;

    const path = extractStoragePath(art.image_url);
    if (path) {
      supabaseClient.storage.from(STORAGE_BUCKET).remove([path]).catch(() => {});
    }

    delete mgArtworksById[art.id];
    mgArtRowsForRender = mgArtRowsForRender.filter(a => a.id !== art.id);
    renderMgRooms(mgRooms, mgArtRowsForRender); // 전체를 다시 그려서 순서·번호가 항상 정확하게 유지되도록 함
  } catch (err) {
    console.warn("[가상미술관] 작품 삭제 실패:", err.message || err);
    alert("삭제에 실패했어요: " + (err.message || err));
  }
}

document.getElementById("adminMgSaveInfoBtn").addEventListener("click", async () => {
  if (!currentMgExhibitionId) return;
  const msgEl = document.getElementById("adminMgInfoMsg");
  const title = document.getElementById("adminMgTitle").value.trim();
  const gradeInput = document.getElementById("adminMgGrade").value;
  const grade = gradeInput ? Number(gradeInput) : null;
  const klass = document.getElementById("adminMgClass").value.trim() || null;

  if (!title) {
    msgEl.textContent = "전시 제목은 비워둘 수 없어요.";
    msgEl.style.color = "#ff9d8a";
    return;
  }

  msgEl.textContent = "저장 중...";
  msgEl.style.color = "#c9bca3";
  try {
    const { error } = await supabaseClient
      .from("exhibitions").update({ title, grade, class: klass }).eq("id", currentMgExhibitionId);
    if (error) throw error;
    msgEl.textContent = "✅ 전시 정보가 저장되었습니다.";
    msgEl.style.color = "#a7e3b0";
    loadExhibitionsList(); // 드롭다운에 표시되는 제목도 함께 갱신
  } catch (err) {
    console.warn("[가상미술관] 전시 정보 저장 실패:", err.message || err);
    msgEl.textContent = "저장 실패: " + (err.message || err);
    msgEl.style.color = "#ff9d8a";
  }
});

document.getElementById("adminMgDeleteExBtn").addEventListener("click", async () => {
  if (!currentMgExhibitionId) return;
  const title = document.getElementById("adminMgTitle").value || "이 전시";
  if (!confirm(`"${title}" 전시를 전체 삭제할까요?\n포함된 모든 전시실·작품·좋아요·댓글이 함께 삭제되며 되돌릴 수 없습니다.`)) return;

  try {
    // Storage에 올라간 이미지 파일들도 함께 정리 (테이블 삭제는 cascade로 자동 처리됨)
    const paths = Object.values(mgArtworksById).map(a => extractStoragePath(a.image_url)).filter(Boolean);
    if (paths.length) {
      supabaseClient.storage.from(STORAGE_BUCKET).remove(paths).catch(() => {});
    }

    const { error } = await supabaseClient.from("exhibitions").delete().eq("id", currentMgExhibitionId);
    if (error) throw error;

    alert("전시가 삭제되었습니다.");
    currentMgExhibitionId = null;
    mgArtworksById = {};
    mgRooms = [];
    document.getElementById("adminManageDetail").style.display = "none";
    loadExhibitionsList();
  } catch (err) {
    console.warn("[가상미술관] 전시 삭제 실패:", err.message || err);
    alert("삭제에 실패했어요: " + (err.message || err));
  }
});

/* =========================================================================
   Phase 3-보완 2 — 기존 전시에 새 작품 추가
   - 기존 전시실의 남은 자리(전시실당 최대 8편)부터 채우고,
     자리가 모자라면 새 전시실을 만들어 나머지를 배정
   ========================================================================= */
let mgAddFiles = []; // { file, student, title, previewUrl }

function resetMgAddForm(keepStatus) {
  mgAddFiles.forEach(item => URL.revokeObjectURL(item.previewUrl));
  mgAddFiles = [];
  const fileInput = document.getElementById("adminMgFileInput");
  if (fileInput) fileInput.value = "";
  const summary = document.getElementById("adminMgFileSummary");
  if (summary) summary.textContent = "";
  const tableSection = document.getElementById("adminMgAddTableSection");
  if (tableSection) tableSection.style.display = "none";
  if (!keepStatus) {
    const resultMsg = document.getElementById("adminMgAddResultMsg");
    if (resultMsg) { resultMsg.textContent = ""; resultMsg.className = ""; }
    const progressWrap = document.getElementById("adminMgAddProgressWrap");
    if (progressWrap) progressWrap.style.display = "none";
  }
  const uploadBtn = document.getElementById("adminMgAddUploadBtn");
  if (uploadBtn) uploadBtn.disabled = true;
}

document.getElementById("adminMgFileInput").addEventListener("change", (e) => {
  mgAddFiles.forEach(item => URL.revokeObjectURL(item.previewUrl));
  mgAddFiles = buildFileItemsFromFileList(e.target.files);
  renderMgAddTable();
});

// 드래그앤드롭으로 끌어다 놓은 사진들은 기존 목록 뒤에 이어 붙임
setupDropzone(document.getElementById("adminMgDropzone"), (fileList) => {
  mgAddFiles.push(...buildFileItemsFromFileList(fileList));
  renderMgAddTable();
});

// 현재 전시실들의 빈 자리(전시실당 최대 8편)부터 채우고, 모자라면 새 전시실을 계산해서 배정 계획을 만듦
function planAddDistribution(fileCount) {
  const plan = []; // { roomId, roomNumber, isNew, count }
  let remaining = fileCount;

  mgRooms.forEach(room => {
    if (remaining <= 0) return;
    const currentCount = Object.values(mgArtworksById).filter(a => a.room_id === room.id).length;
    const slot = Math.max(0, 8 - currentCount);
    if (slot > 0) {
      const take = Math.min(slot, remaining);
      plan.push({ roomId: room.id, roomNumber: room.room_number, name: room.name, isNew:false, count: take });
      remaining -= take;
    }
  });

  if (remaining > 0) {
    const counts = assignRoomCounts(remaining);
    let nextRoomNumber = mgRooms.length
      ? Math.max(...mgRooms.map(r => r.room_number)) + 1
      : 1;
    counts.forEach(c => {
      plan.push({ roomId:null, roomNumber: nextRoomNumber, name:`제 ${nextRoomNumber} 전시실`, isNew:true, count:c });
      nextRoomNumber++;
    });
  }

  return plan;
}

function describeAddPlan(plan) {
  return plan.map(p => p.isNew
    ? `새 전시실(${p.name}) ${p.count}편 생성`
    : `${p.name || `제 ${p.roomNumber} 전시실`}에 ${p.count}편 추가`
  ).join(" · ");
}

function renderMgAddTable() {
  const section = document.getElementById("adminMgAddTableSection");
  const summary = document.getElementById("adminMgFileSummary");
  const tbody = document.getElementById("adminMgAddTableBody");
  const roomPreview = document.getElementById("adminMgAddRoomPreview");

  if (mgAddFiles.length === 0) {
    section.style.display = "none";
    summary.textContent = "";
    updateMgAddUploadEnabled();
    return;
  }

  summary.textContent = `이미지 파일 ${mgAddFiles.length}장을 찾았어요. 아래 표에서 이름·제목을 확인하고 필요하면 수정해주세요.`;
  section.style.display = "block";

  const plan = planAddDistribution(mgAddFiles.length);
  roomPreview.textContent = `총 ${mgAddFiles.length}장 → ${describeAddPlan(plan)}`;

  tbody.innerHTML = "";
  mgAddFiles.forEach((item, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="admin-idx">${i+1}</td>
      <td><img class="admin-thumb" src="${item.previewUrl}" alt="" /></td>
      <td><input type="text" data-mg-add-field="student" data-idx="${i}" value="${escapeHtml(item.student)}" placeholder="학생 이름" /></td>
      <td><input type="text" data-mg-add-field="title" data-idx="${i}" value="${escapeHtml(item.title)}" placeholder="작품 제목" /></td>
      <td class="admin-order-cell">
        <button type="button" class="admin-order-move" data-dir="up" data-idx="${i}" ${i===0 ? "disabled" : ""}>▲</button>
        <button type="button" class="admin-order-move" data-dir="down" data-idx="${i}" ${i===mgAddFiles.length-1 ? "disabled" : ""}>▼</button>
      </td>
      <td><button type="button" class="admin-remove" data-idx="${i}">삭제</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("input[data-mg-add-field]").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.mgAddField;
      mgAddFiles[idx][field] = e.target.value;
      updateMgAddUploadEnabled();
    });
  });
  tbody.querySelectorAll(".admin-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.target.dataset.idx);
      URL.revokeObjectURL(mgAddFiles[idx].previewUrl);
      mgAddFiles.splice(idx, 1);
      renderMgAddTable();
    });
  });
  tbody.querySelectorAll(".admin-order-move").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.target.dataset.idx);
      moveFileItem(mgAddFiles, idx, e.target.dataset.dir);
      renderMgAddTable();
    });
  });

  updateMgAddUploadEnabled();
}
document.getElementById("adminMgSortNameBtn").addEventListener("click", () => {
  sortFilesByStudentName(mgAddFiles);
  renderMgAddTable();
});
document.getElementById("adminMgSortRandomBtn").addEventListener("click", () => {
  shuffleFilesRandom(mgAddFiles);
  renderMgAddTable();
});

function updateMgAddUploadEnabled() {
  const btn = document.getElementById("adminMgAddUploadBtn");
  const allFilled = mgAddFiles.length > 0 && mgAddFiles.every(f => f.student.trim() && f.title.trim());
  btn.disabled = !(currentMgExhibitionId && allFilled);
}

document.getElementById("adminMgAddUploadBtn").addEventListener("click", uploadAddArtworks);

async function uploadAddArtworks() {
  if (!currentMgExhibitionId) return;

  const uploadBtn = document.getElementById("adminMgAddUploadBtn");
  const progressWrap = document.getElementById("adminMgAddProgressWrap");
  const progressFill = document.getElementById("adminMgAddProgressFill");
  const progressText = document.getElementById("adminMgAddProgressText");
  const resultMsg = document.getElementById("adminMgAddResultMsg");

  uploadBtn.disabled = true;
  progressWrap.style.display = "block";
  progressFill.style.width = "0%";
  resultMsg.textContent = "";
  resultMsg.className = "";

  try {
    const plan = planAddDistribution(mgAddFiles.length);

    // 새로 필요한 전시실부터 생성해서 room id 확보
    progressText.textContent = "필요한 전시실을 확인하는 중...";
    for (const p of plan) {
      if (!p.isNew) continue;
      const { data: roomRow, error: roomErr } = await supabaseClient
        .from("rooms")
        .insert({ exhibition_id: currentMgExhibitionId, room_number: p.roomNumber, name: p.name })
        .select().single();
      if (roomErr) throw new Error(`전시실(${p.name}) 생성 실패: ` + roomErr.message);
      p.roomId = roomRow.id;
    }

    // 배정 계획(plan)대로 각 파일이 들어갈 room id 배열을 순서대로 구성
    const roomIdForIndex = [];
    plan.forEach(p => { for (let k = 0; k < p.count; k++) roomIdForIndex.push(p.roomId); });

    let successCount = 0, failCount = 0;
    for (let i = 0; i < mgAddFiles.length; i++) {
      const item = mgAddFiles[i];
      progressText.textContent = `업로드 중... (${i+1}/${mgAddFiles.length}) ${item.file.name}`;
      try {
        const ext = (item.file.name.match(/\.[^/.]+$/) || [".jpg"])[0].toLowerCase();
        const path = `${currentMgExhibitionId}/${roomIdForIndex[i]}/${Date.now()}_${i}${ext}`;

        const { error: upErr } = await supabaseClient.storage
          .from(STORAGE_BUCKET)
          .upload(path, item.file, { upsert:false, contentType: item.file.type || "image/jpeg" });
        if (upErr) throw upErr;

        const { data: pub } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);

        const { error: artErr } = await supabaseClient.from("artworks").insert({
          room_id: roomIdForIndex[i],
          student_name: item.student,
          title: item.title,
          image_url: pub.publicUrl
        });
        if (artErr) throw artErr;

        successCount++;
      } catch (err) {
        console.warn("[가상미술관] 작품 추가 업로드 실패:", item.file.name, err.message || err);
        failCount++;
      }
      progressFill.style.width = `${Math.round(((i+1)/mgAddFiles.length)*100)}%`;
    }

    if (failCount === 0) {
      resultMsg.className = "admin-success";
      resultMsg.textContent = `✅ 추가 완료! 총 ${successCount}장을 등록했습니다 (${describeAddPlan(plan)}).`;
    } else {
      resultMsg.className = "admin-warning";
      resultMsg.textContent = `⚠️ 추가 완료 (성공 ${successCount} / 실패 ${failCount}). 실패한 작품은 표에서 이름·제목을 확인한 뒤 다시 시도해주세요.`;
    }
    progressText.textContent = "완료";

    // 방금 추가한 내용이 위쪽 "작품 목록" 표에도 바로 반영되도록 상세 정보를 다시 불러옴
    // (keepAddStatus=true로 호출해서 방금 표시한 결과 메시지가 곧바로 지워지지 않게 함)
    await loadExhibitionDetail(currentMgExhibitionId, true);
    loadExhibitionsList();
  } catch (err) {
    resultMsg.className = "admin-error";
    resultMsg.textContent = "❌ 작품 추가에 실패했어요: " + (err.message || err);
    progressText.textContent = "";
  } finally {
    uploadBtn.disabled = false;
  }
}
