/* =========================================================================
   Phase 6 — 감상 결과 리포트 (좋아요·댓글을 교사가 다운로드 받는 단일 HTML 파일로)
   - 인터넷 연결 없이도 열리도록 작품 이미지를 리사이즈 후 데이터 URL로 파일 안에 함께 담는다
     (원본 fetch가 실패하는 극히 드문 경우에만 원격 URL로 대체 표시됨)
   - 받은 파일 자체에 검색/정렬/인쇄 기능을 내장해, 감상 평가 자료로 바로 활용할 수 있게 한다
   ========================================================================= */

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// 원본 이미지를 내려받아 폭 480px 내외로 축소 + JPEG 재압축한 데이터 URL로 변환.
// (리포트 파일 하나의 용량이 너무 커지지 않도록 하기 위함) 실패 시 null을 돌려줘
// 호출부에서 원격 이미지 주소로 대체 표시하게 한다.
async function fetchImageAsDataURL(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 480;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cvs = document.createElement("canvas");
        cvs.width = w; cvs.height = h;
        cvs.getContext("2d").drawImage(img, 0, 0, w, h);
        try { resolve(cvs.toDataURL("image/jpeg", 0.82)); }
        catch (e) { blobToDataURL(blob).then(resolve).catch(reject); }
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  } catch (err) {
    return null;
  }
}

function buildAppreciationReportHtml(data) {
  const genDate = new Date(data.generatedAt);
  const genDateStr = `${genDate.getFullYear()}.${String(genDate.getMonth()+1).padStart(2,"0")}.${String(genDate.getDate()).padStart(2,"0")}`;
  const metaLine = [data.grade ? `${data.grade}학년` : null, data.class || null].filter(Boolean).join(" ");

  const totalArtworks = data.artworks.length;
  const totalLikes = data.artworks.reduce((s,a) => s + a.likeCount, 0);
  const totalComments = data.artworks.reduce((s,a) => s + a.comments.length, 0);

  const cardsHtml = data.artworks.map((a, idx) => {
    const imgSrc = a.imageData || a.imageUrl || "";
    const imgTag = imgSrc
      ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(a.title)}" loading="lazy" />`
      : `<div class="no-img">이미지 없음</div>`;
    const commentsHtml = a.comments.length
      ? a.comments.map(c => `
        <div class="cmt">
          <span class="cmt-name">${escapeHtml(c.nickname)}</span>
          <span class="cmt-text">${escapeHtml(c.content)}</span>
        </div>`).join("")
      : `<div class="cmt-empty">아직 댓글이 없어요</div>`;

    return `
    <div class="art-card" data-order="${idx}" data-student="${escapeHtml(a.studentName)}" data-title="${escapeHtml(a.title)}" data-likes="${a.likeCount}" data-comments="${a.comments.length}">
      <div class="art-thumb">${imgTag}</div>
      <div class="art-body">
        <div class="art-room">${escapeHtml(a.roomName)}</div>
        <div class="art-title">${escapeHtml(a.title || "(제목 없음)")}</div>
        <div class="art-student">${escapeHtml(a.studentName || "이름 없음")}</div>
        <div class="art-badges">
          <span class="badge like">❤️ ${a.likeCount}</span>
          <span class="badge cmt-count">💬 ${a.comments.length}</span>
        </div>
        <div class="art-comments">${commentsHtml}</div>
      </div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(data.title)} — 감상 결과 리포트</title>
<style>
  :root {
    --ink:#2b2620; --sub:#6b6355; --line:#e7e0d3; --bg:#fbf9f4; --card:#ffffff;
    --accent-soft:#f2b768; --table-head:#f5efe1;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family:"Noto Sans KR","Malgun Gothic",-apple-system,BlinkMacSystemFont,sans-serif; line-height:1.6; }
  header.doc-head { background:linear-gradient(135deg,#2b1a0d 0%,#4a2f18 60%,#6b4423 100%);
    color:#fff8ec; padding:34px 24px 26px; text-align:center; }
  header.doc-head h1 { font-size:22px; font-weight:800; margin:0 0 6px; }
  header.doc-head .sub { font-size:13px; color:#e9c793; }
  main { max-width:1080px; margin:-18px auto 60px; padding:0 18px; }
  .summary-bar { display:flex; flex-wrap:wrap; gap:12px; background:var(--card); border:1px solid var(--line);
    border-radius:14px; padding:18px 20px; margin-bottom:18px; box-shadow:0 10px 30px rgba(43,26,13,0.06); }
  .stat { flex:1; min-width:110px; text-align:center; }
  .stat b { display:block; font-size:22px; color:#8a5a24; }
  .stat span { font-size:12.5px; color:var(--sub); }
  .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:16px; }
  .controls input, .controls select { padding:9px 12px; border:1px solid var(--line); border-radius:8px; font-size:13.5px; }
  .controls input { flex:1; min-width:180px; }
  .controls button { padding:9px 16px; border:none; border-radius:8px; background:#8a5a24; color:#fff8ec;
    font-weight:700; font-size:13.5px; cursor:pointer; }
  #visibleCount { font-size:12.5px; color:var(--sub); margin-left:auto; }
  #cardGrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px,1fr)); gap:16px; }
  .art-card { background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden;
    box-shadow:0 6px 16px rgba(43,26,13,0.05); display:flex; flex-direction:column; }
  .art-thumb { aspect-ratio:4/3; background:#efe9db; display:flex; align-items:center; justify-content:center; }
  .art-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
  .no-img { color:var(--sub); font-size:12.5px; }
  .art-body { padding:12px 14px 14px; }
  .art-room { font-size:11px; color:#a3651c; font-weight:800; }
  .art-title { font-size:15px; font-weight:800; margin:2px 0 1px; }
  .art-student { font-size:12.5px; color:var(--sub); margin-bottom:8px; }
  .art-badges { display:flex; gap:8px; margin-bottom:8px; }
  .badge { font-size:12px; font-weight:800; padding:3px 9px; border-radius:12px; }
  .badge.like { background:#fde6e0; color:#c05a3f; }
  .badge.cmt-count { background:#e7f0fd; color:#3f6ec0; }
  .art-comments { border-top:1px dashed var(--line); padding-top:8px; max-height:150px; overflow-y:auto; }
  .cmt { font-size:12.5px; margin-bottom:6px; }
  .cmt-name { font-weight:800; color:#6b4a1f; margin-right:6px; }
  .cmt-empty { font-size:12px; color:#a89a80; }
  footer { text-align:center; color:var(--sub); font-size:12px; margin:30px 0 10px; }
  @media print {
    .controls { display:none; }
    header.doc-head { background:#fff !important; color:#2b1a0d !important; }
    header.doc-head .sub { color:#6b6355; }
    .art-card { break-inside:avoid; box-shadow:none; }
    #cardGrid { grid-template-columns:repeat(3, 1fr); }
  }
</style>
</head>
<body>
<header class="doc-head">
  <h1>🖼 ${escapeHtml(data.title)} — 감상 결과 리포트</h1>
  <div class="sub">${metaLine ? escapeHtml(metaLine) + " · " : ""}생성일 ${genDateStr}</div>
</header>
<main>
  <div class="summary-bar">
    <div class="stat"><b>${totalArtworks}</b><span>전시 작품 수</span></div>
    <div class="stat"><b>${totalLikes}</b><span>총 좋아요</span></div>
    <div class="stat"><b>${totalComments}</b><span>총 댓글</span></div>
    <div class="stat"><b>${data.uniqueLikers ?? "-"}</b><span>좋아요 남긴 방문자 수</span></div>
    <div class="stat"><b>${data.uniqueCommenters ?? "-"}</b><span>댓글 작성자 수(닉네임 기준)</span></div>
  </div>

  <div class="controls">
    <input id="searchInput" type="text" placeholder="학생 이름 또는 작품 제목으로 검색" />
    <select id="sortSelect">
      <option value="order">전시 순서대로</option>
      <option value="likes">좋아요 많은순</option>
      <option value="comments">댓글 많은순</option>
      <option value="name">학생 이름순</option>
    </select>
    <button type="button" id="printBtn">🖨 인쇄 / PDF 저장</button>
    <span id="visibleCount"></span>
  </div>

  <div id="cardGrid">${cardsHtml}</div>

  <footer>우리 반 가상 미술관 · 감상 결과 리포트 · ${genDateStr} 생성</footer>
<\/main>
<script>
  var cards = Array.prototype.slice.call(document.querySelectorAll(".art-card"));
  var searchInput = document.getElementById("searchInput");
  var sortSelect = document.getElementById("sortSelect");
  var grid = document.getElementById("cardGrid");
  var countEl = document.getElementById("visibleCount");

  function applyFilterSort() {
    var q = searchInput.value.trim().toLowerCase();
    var visible = cards.filter(function(c) {
      if (!q) return true;
      return c.dataset.student.toLowerCase().indexOf(q) !== -1 || c.dataset.title.toLowerCase().indexOf(q) !== -1;
    });
    var sortBy = sortSelect.value;
    visible.sort(function(a, b) {
      if (sortBy === "likes") return (+b.dataset.likes) - (+a.dataset.likes);
      if (sortBy === "comments") return (+b.dataset.comments) - (+a.dataset.comments);
      if (sortBy === "name") return a.dataset.student.localeCompare(b.dataset.student, "ko");
      return (+a.dataset.order) - (+b.dataset.order);
    });
    cards.forEach(function(c) { c.style.display = "none"; });
    visible.forEach(function(c) { c.style.display = ""; grid.appendChild(c); });
    countEl.textContent = visible.length + " / " + cards.length + "개 표시 중";
  }
  searchInput.addEventListener("input", applyFilterSort);
  sortSelect.addEventListener("change", applyFilterSort);
  document.getElementById("printBtn").addEventListener("click", function(){ window.print(); });
  applyFilterSort();
<\/script>
</body>
</html>`;
}

async function generateAppreciationReport() {
  if (!currentMgExhibitionId || !mgRooms.length) {
    alert("리포트를 만들 전시를 먼저 선택해주세요.");
    return;
  }
  const artRows = mgArtRowsForRender;
  if (!artRows || !artRows.length) {
    alert("이 전시에는 아직 작품이 없어요.");
    return;
  }

  const btn = document.getElementById("adminMgReportBtn");
  const progWrap = document.getElementById("adminMgReportProgressWrap");
  const progFill = document.getElementById("adminMgReportProgressFill");
  const progText = document.getElementById("adminMgReportProgressText");
  const msgEl = document.getElementById("adminMgReportMsg");
  msgEl.textContent = ""; msgEl.style.color = "";
  btn.disabled = true;
  progWrap.style.display = "block";
  progFill.style.width = "0%";
  progText.textContent = "좋아요·댓글 데이터를 불러오는 중...";

  try {
    const artworkIds = artRows.map(a => a.id);

    const [likeRes, commentRes] = await Promise.all([
      supabaseClient.from("likes").select("artwork_id, visitor_key").in("artwork_id", artworkIds),
      supabaseClient.from("comments").select("id, artwork_id, nickname, content, is_hidden, created_at")
        .in("artwork_id", artworkIds).order("created_at", { ascending:true })
    ]);
    if (likeRes.error) throw likeRes.error;
    if (commentRes.error) throw commentRes.error;

    const likeRows = likeRes.data || [];
    const commentRows = (commentRes.data || []).filter(c => !c.is_hidden); // 교사가 숨긴 댓글은 리포트에서도 제외

    const likesByArt = {};
    likeRows.forEach(r => {
      (likesByArt[r.artwork_id] ||= new Set()).add(r.visitor_key || `anon-${r.artwork_id}-${Math.random()}`);
    });
    const commentsByArt = {};
    commentRows.forEach(c => { (commentsByArt[c.artwork_id] ||= []).push(c); });

    const total = artRows.length;
    const enrichedArtworks = [];
    for (let i = 0; i < artRows.length; i++) {
      const a = artRows[i];
      progText.textContent = `작품 이미지 처리 중... (${i+1}/${total})`;
      progFill.style.width = Math.round(((i+1)/total)*100) + "%";
      const dataUrl = await fetchImageAsDataURL(a.image_url);
      const room = mgRooms.find(r => r.id === a.room_id);
      enrichedArtworks.push({
        roomName: room ? (room.name || `제 ${room.room_number} 전시실`) : "",
        studentName: a.student_name || "",
        title: a.title || "",
        imageData: dataUrl,
        imageUrl: a.image_url,
        likeCount: likesByArt[a.id] ? likesByArt[a.id].size : 0,
        comments: (commentsByArt[a.id] || []).map(c => ({ nickname:c.nickname || "익명", content:c.content || "" }))
      });
    }

    progText.textContent = "리포트 파일을 만드는 중...";

    const exTitle = document.getElementById("adminMgTitle").value || "우리 반 가상 미술관";
    const exGrade = document.getElementById("adminMgGrade").value;
    const exClass = document.getElementById("adminMgClass").value;
    const uniqueLikers = new Set(likeRows.map(r => r.visitor_key).filter(Boolean)).size;
    const uniqueCommenters = new Set(commentRows.map(c => (c.nickname || "").trim()).filter(Boolean)).size;

    const html = buildAppreciationReportHtml({
      title: exTitle, grade: exGrade, class: exClass,
      generatedAt: new Date().toISOString(),
      artworks: enrichedArtworks, uniqueLikers, uniqueCommenters
    });

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0,10);
    const safeTitle = exTitle.replace(/[\\/:*?"<>|]/g, "").trim() || "전시";
    const link = document.createElement("a");
    link.href = url;
    link.download = `감상결과_${safeTitle}_${dateStr}.html`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    const totalLikes = enrichedArtworks.reduce((s,a) => s+a.likeCount, 0);
    const totalComments = enrichedArtworks.reduce((s,a) => s+a.comments.length, 0);
    msgEl.textContent = `✅ 다운로드 완료 — 작품 ${enrichedArtworks.length}개, 좋아요 ${totalLikes}개, 댓글 ${totalComments}개가 담긴 리포트가 저장됐어요.`;
    msgEl.style.color = "#3c7a37";
  } catch (err) {
    console.warn("[가상미술관] 리포트 생성 실패:", err.message || err);
    msgEl.textContent = "리포트 생성에 실패했어요: " + (err.message || err);
    msgEl.style.color = "#c0503f";
  } finally {
    btn.disabled = false;
    progWrap.style.display = "none";
  }
}
document.getElementById("adminMgReportBtn").addEventListener("click", generateAppreciationReport);
