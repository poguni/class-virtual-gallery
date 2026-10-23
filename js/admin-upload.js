/* =========================================================================
   Phase 3 — 교사용 업로드 관리자 페이지
   - 로컬 폴더 사진 선택 → Supabase Storage 업로드(public 버킷) → artworks insert
   - 파일명 규칙(이름_제목 / 번호_이름_제목)으로 학생명·제목 자동 매칭, 수동 수정 가능
   - 방 자동 배정: 방 개수 = ceil(작품수/8), 균등 분배 (예: 22장 → 8/7/7)
   ========================================================================= */
const STORAGE_BUCKET = "artwork-images"; // Supabase 대시보드에서 미리 만들어둔 public 버킷 이름

// 어드민 화면 열기/닫기 (교사 로그인 상태에서만 startScreen에 버튼이 노출됨)
document.getElementById("adminOpenBtn").addEventListener("click", () => {
  startScreenEl.style.display = "none";
  document.getElementById("adminScreen").style.display = "block";
  document.getElementById("adminTeachersTab").style.display = currentTeacher && currentTeacher.is_admin ? "" : "none";
});
document.getElementById("adminCloseBtn").addEventListener("click", () => {
  document.getElementById("adminScreen").style.display = "none";
  startScreenEl.style.display = "flex";
});

// 탭 전환: 새 전시 만들기 ↔ 기존 전시 관리
document.querySelectorAll(".admin-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    document.getElementById("adminCreatePanel").style.display = target === "create" ? "block" : "none";
    document.getElementById("adminManagePanel").style.display = target === "manage" ? "block" : "none";
    document.getElementById("adminTeachersPanel").style.display = target === "teachers" ? "block" : "none";
    if (target === "manage") loadExhibitionsList();
    if (target === "teachers") loadTeachersList();
  });
});

/* ---------- 교사 계정 승인 (관리자 전용) ----------
   teachers 테이블: 회원가입 시 DB 트리거가 'pending'으로 자동 등록,
   RLS상 관리자만 전체 목록 조회·상태 변경 가능 */
const TEACHER_STATUS_LABEL = { pending:"승인 대기", approved:"승인됨", rejected:"거절됨" };

async function loadTeachersList() {
  const tbody = document.getElementById("adminTeachersBody");
  const msg = document.getElementById("adminTeachersMsg");
  tbody.innerHTML = "";
  msg.textContent = "불러오는 중...";
  try {
    const { data, error } = await supabaseClient
      .from("teachers").select("user_id, email, status, is_admin, created_at")
      .order("created_at", { ascending:false });
    if (error) throw error;
    msg.textContent = "";
    (data || []).forEach(t => {
      const tr = document.createElement("tr");
      const date = new Date(t.created_at).toLocaleDateString("ko-KR");
      tr.innerHTML = `<td>${escapeHtml(t.email)}${t.is_admin ? " (관리자)" : ""}</td><td>${date}</td>` +
                     `<td>${TEACHER_STATUS_LABEL[t.status] || t.status}</td><td></td>`;
      const actions = tr.lastElementChild;
      if (!t.is_admin) {
        if (t.status !== "approved") actions.appendChild(makeTeacherStatusBtn(t, "approved", "승인", "admin-save"));
        if (t.status !== "rejected") actions.appendChild(makeTeacherStatusBtn(t, "rejected", "거절", "admin-danger"));
      }
      tbody.appendChild(tr);
    });
    if (!data || !data.length) msg.textContent = "가입한 교사가 없어요.";
  } catch (err) {
    console.warn("[가상미술관] 교사 목록 로드 실패:", err.message || err);
    msg.textContent = "교사 목록을 불러오지 못했어요: " + (err.message || err);
  }
}

function makeTeacherStatusBtn(teacher, nextStatus, label, className) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener("click", async () => {
    if (!confirm(`${teacher.email} 계정을 "${TEACHER_STATUS_LABEL[nextStatus]}" 상태로 바꿀까요?`)) return;
    btn.disabled = true;
    const { error } = await supabaseClient.from("teachers")
      .update({ status: nextStatus, approved_at: nextStatus === "approved" ? new Date().toISOString() : null })
      .eq("user_id", teacher.user_id);
    if (error) {
      console.warn("[가상미술관] 교사 상태 변경 실패:", error.message);
      alert("상태를 바꾸지 못했어요: " + error.message);
      btn.disabled = false;
      return;
    }
    loadTeachersList();
  });
  return btn;
}
document.getElementById("adminTeachersRefreshBtn").addEventListener("click", loadTeachersList);

// 파일명에서 학생 이름 / 작품 제목을 추정
// "번호_이름_제목.jpg" → 이름+제목 / "이름_제목.jpg" → 이름+제목 / 그 외 → 제목만 추정, 이름은 빈칸
function parseArtworkFilename(filename) {
  const base = filename.replace(/\.[^/.]+$/, ""); // 확장자 제거
  const parts = base.split("_").map(s => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return { student: parts[1], title: parts.slice(2).join(" ") };
  } else if (parts.length === 2) {
    return { student: parts[0], title: parts[1] };
  }
  return { student: "", title: parts[0] || base };
}

// 방 자동 배정 로직: 방 1개당 목표 8편, 방 개수 = ceil(전체 작품 수 / 8), 이후 균등 분배
// 예: 22장 → ceil(22/8)=3개 방 → [8,7,7] / 30장 → 4개 방 → [8,8,7,7]
function assignRoomCounts(totalCount) {
  const roomCount = Math.max(1, Math.ceil(totalCount / 8));
  const base = Math.floor(totalCount / roomCount);
  const remainder = totalCount % roomCount;
  const counts = [];
  for (let i = 0; i < roomCount; i++) counts.push(base + (i < remainder ? 1 : 0));
  return counts;
}

/* ---------- 전시 순서(진열 순서) 조정 공용 헬퍼 ----------
   업로드 목록 배열의 순서가 곧 방 배정 순서·전시실 내 진열 순서가 되므로,
   이 배열 자체를 정렬/셔플/스왑해서 "학생 이름순 / 랜덤 / 직접 순서 정하기"를 구현함 */
function sortFilesByStudentName(filesArr) {
  filesArr.sort((a, b) =>
    (a.student || "").localeCompare(b.student || "", "ko", { numeric:true, sensitivity:"base" })
  );
}
function shuffleFilesRandom(filesArr) {
  for (let i = filesArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filesArr[i], filesArr[j]] = [filesArr[j], filesArr[i]];
  }
}
function moveFileItem(filesArr, idx, dir) {
  const target = dir === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= filesArr.length) return;
  [filesArr[idx], filesArr[target]] = [filesArr[target], filesArr[idx]];
}

// FileList(폴더 선택 또는 드래그앤드롭 모두 공용) → 이미지 파일만 걸러 파일명 자연 정렬 후,
// 파일명 자동 매칭 결과와 미리보기 URL을 붙인 상태 객체 배열로 변환
function buildFileItemsFromFileList(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith("image/"));
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric:true, sensitivity:"base" }));
  return files.map(file => {
    const { student, title } = parseArtworkFilename(file.name);
    return { file, student, title, previewUrl: URL.createObjectURL(file) };
  });
}

// 드롭존(dragover/drop) 공용 배선. onDropFiles(fileList)가 실제 처리를 담당
function setupDropzone(zoneEl, onDropFiles) {
  ["dragenter", "dragover"].forEach(evt => {
    zoneEl.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      zoneEl.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach(evt => {
    zoneEl.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      zoneEl.classList.remove("dragover");
    });
  });
  zoneEl.addEventListener("drop", (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) onDropFiles(files);
  });
}

let adminFiles = []; // { file, student, title, previewUrl }

document.getElementById("adminFileInput").addEventListener("change", (e) => {
  adminFiles.forEach(item => URL.revokeObjectURL(item.previewUrl));
  adminFiles = buildFileItemsFromFileList(e.target.files);
  renderAdminTable();
});

// 드래그앤드롭으로 끌어다 놓은 사진들은 기존 목록 뒤에 이어 붙임 (여러 번 나눠서 끌어다 놓아도 되도록)
setupDropzone(document.getElementById("adminDropzone"), (fileList) => {
  adminFiles.push(...buildFileItemsFromFileList(fileList));
  renderAdminTable();
});

function renderAdminTable() {
  const section = document.getElementById("adminTableSection");
  const summary = document.getElementById("adminFileSummary");
  const tbody = document.getElementById("adminTableBody");
  const roomPreview = document.getElementById("adminRoomPreview");

  if (adminFiles.length === 0) {
    section.style.display = "none";
    summary.textContent = "";
    updateAdminUploadEnabled();
    return;
  }

  summary.textContent = `이미지 파일 ${adminFiles.length}장을 찾았어요. 아래 표에서 이름·제목을 확인하고 필요하면 수정해주세요.`;
  section.style.display = "block";

  const counts = assignRoomCounts(adminFiles.length);
  roomPreview.textContent = `총 ${adminFiles.length}장 → ${counts.length}개 전시실 자동 생성 (${counts.join("/")}편)`;

  tbody.innerHTML = "";
  adminFiles.forEach((item, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="admin-idx">${i+1}</td>
      <td><img class="admin-thumb" src="${item.previewUrl}" alt="" /></td>
      <td><input type="text" data-field="student" data-idx="${i}" value="${escapeHtml(item.student)}" placeholder="학생 이름" /></td>
      <td><input type="text" data-field="title" data-idx="${i}" value="${escapeHtml(item.title)}" placeholder="작품 제목" /></td>
      <td class="admin-order-cell">
        <button type="button" class="admin-order-move" data-dir="up" data-idx="${i}" ${i===0 ? "disabled" : ""}>▲</button>
        <button type="button" class="admin-order-move" data-dir="down" data-idx="${i}" ${i===adminFiles.length-1 ? "disabled" : ""}>▼</button>
      </td>
      <td><button type="button" class="admin-remove" data-idx="${i}">삭제</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("input[data-field]").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      adminFiles[idx][field] = e.target.value;
      updateAdminUploadEnabled();
    });
  });
  tbody.querySelectorAll(".admin-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.target.dataset.idx);
      URL.revokeObjectURL(adminFiles[idx].previewUrl);
      adminFiles.splice(idx, 1);
      renderAdminTable();
    });
  });
  tbody.querySelectorAll(".admin-order-move").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.target.dataset.idx);
      moveFileItem(adminFiles, idx, e.target.dataset.dir);
      renderAdminTable();
    });
  });

  updateAdminUploadEnabled();
}
document.getElementById("adminSortNameBtn").addEventListener("click", () => {
  sortFilesByStudentName(adminFiles);
  renderAdminTable();
});
document.getElementById("adminSortRandomBtn").addEventListener("click", () => {
  shuffleFilesRandom(adminFiles);
  renderAdminTable();
});

function updateAdminUploadEnabled() {
  const btn = document.getElementById("adminUploadBtn");
  const title = document.getElementById("adminExTitle").value.trim();
  const allFilled = adminFiles.length > 0 && adminFiles.every(f => f.student.trim() && f.title.trim());
  btn.disabled = !(title && allFilled);
}
document.getElementById("adminExTitle").addEventListener("input", updateAdminUploadEnabled);

document.getElementById("adminUploadBtn").addEventListener("click", uploadAllArtworks);
document.getElementById("adminReloadBtn").addEventListener("click", () => location.reload());

async function uploadAllArtworks() {
  const uploadBtn = document.getElementById("adminUploadBtn");
  const closeBtn = document.getElementById("adminCloseBtn");
  const progressWrap = document.getElementById("adminProgressWrap");
  const progressFill = document.getElementById("adminProgressFill");
  const progressText = document.getElementById("adminProgressText");
  const resultMsg = document.getElementById("adminResultMsg");
  const reloadBtn = document.getElementById("adminReloadBtn");

  uploadBtn.disabled = true;
  closeBtn.disabled = true;
  reloadBtn.style.display = "none";
  progressWrap.style.display = "block";
  progressFill.style.width = "0%";
  resultMsg.textContent = "";
  resultMsg.className = "";

  const title = document.getElementById("adminExTitle").value.trim();
  const gradeInput = document.getElementById("adminExGrade").value;
  const grade = gradeInput ? Number(gradeInput) : null;
  const klass = document.getElementById("adminExClass").value.trim() || null;

  try {
    // 1) 전시 생성
    progressText.textContent = "전시 정보를 만드는 중...";
    const { data: exRow, error: exErr } = await supabaseClient
      .from("exhibitions").insert({ title, grade, class: klass }).select().single();
    if (exErr) throw new Error("전시 생성 실패: " + exErr.message);
    const exhibitionId = exRow.id;

    // 2) 방 자동 배정 및 생성 (ceil(작품수/8) 로직)
    const counts = assignRoomCounts(adminFiles.length);
    progressText.textContent = `전시실 ${counts.length}개를 만드는 중... (${counts.join("/")}편)`;
    const roomIds = [];
    for (let i = 0; i < counts.length; i++) {
      const { data: roomRow, error: roomErr } = await supabaseClient
        .from("rooms")
        .insert({ exhibition_id: exhibitionId, room_number: i + 1, name: `제 ${i + 1} 전시실` })
        .select().single();
      if (roomErr) throw new Error(`전시실 ${i+1} 생성 실패: ` + roomErr.message);
      roomIds.push(roomRow.id);
    }

    // 작품 순번 → 담당 전시실 id 매핑 (counts 배열 순서대로 앞에서부터 채움)
    const roomIdForIndex = [];
    counts.forEach((c, ri) => { for (let k = 0; k < c; k++) roomIdForIndex.push(roomIds[ri]); });

    // 3) 이미지 업로드(Storage) + 작품 정보 저장(artworks) — 한 장씩 순차 처리, 실패해도 계속 진행
    let successCount = 0, failCount = 0;
    for (let i = 0; i < adminFiles.length; i++) {
      const item = adminFiles[i];
      progressText.textContent = `업로드 중... (${i+1}/${adminFiles.length}) ${item.file.name}`;
      try {
        const ext = (item.file.name.match(/\.[^/.]+$/) || [".jpg"])[0].toLowerCase();
        const path = `${exhibitionId}/${roomIdForIndex[i]}/${Date.now()}_${i}${ext}`;

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
        console.warn("[가상미술관] 작품 업로드 실패:", item.file.name, err.message || err);
        failCount++;
      }
      progressFill.style.width = `${Math.round(((i+1)/adminFiles.length)*100)}%`;
    }

    // 3) 현재 전시가 아직 없는 교사라면 새 전시를 바로 현재 전시로 지정.
    //    이미 현재 전시가 있으면, 관람 중인 학생 화면이 갑자기 바뀌지 않도록 그대로 두고 안내만 함
    let activeNote = "";
    const { data: activeRows } = await supabaseClient
      .from("exhibitions").select("id").eq("owner_id", currentTeacher.user_id).eq("is_active", true).limit(1);
    if (!activeRows || !activeRows.length) {
      const { error: actErr } = await supabaseClient.rpc("set_active_exhibition", { p_ex: exhibitionId });
      activeNote = actErr ? " (현재 전시장 설정에 실패했어요. '기존 전시 관리'에서 다시 설정해주세요.)"
                          : " 이 전시가 현재 전시장으로 설정되었어요.";
    } else {
      activeNote = " 방문자에게 보여주려면 '기존 전시 관리'에서 \"현재 전시장으로 설정\"을 눌러주세요.";
    }

    if (failCount === 0) {
      resultMsg.className = "admin-success";
      resultMsg.textContent = `✅ 업로드 완료! 총 ${successCount}장이 전시실 ${counts.length}개에 배정되었습니다 (${counts.join("/")}편).` + activeNote;
    } else {
      resultMsg.className = "admin-warning";
      resultMsg.textContent = `⚠️ 업로드 완료 (성공 ${successCount} / 실패 ${failCount}). 실패한 작품은 표에서 이름·제목을 확인한 뒤 다시 시도해주세요.` + activeNote;
    }
    progressText.textContent = "완료";
    reloadBtn.style.display = "inline-block";
  } catch (err) {
    resultMsg.className = "admin-error";
    resultMsg.textContent = "❌ 전시 생성에 실패했어요: " + (err.message || err) +
      " (Storage 버킷/정책 설정이 되어 있는지 확인해주세요)";
    progressText.textContent = "";
  } finally {
    uploadBtn.disabled = false;
    closeBtn.disabled = false;
  }
}
