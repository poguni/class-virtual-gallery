/* =========================================================================
   Supabase 초기화 & 로그인 화면 로직
   ========================================================================= */
// Anon Public Key는 RLS 정책으로 보호되는 것을 전제로 공개되어도 되는 키입니다.
// (Service Role Key는 절대 이 파일에 넣지 마세요)
const SUPABASE_URL = "https://xloetjawdupadtfquxka.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsb2V0amF3ZHVwYWR0ZnF1eGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NDE1NjMsImV4cCI6MjEwMDMxNzU2M30.pFqhpRiRnpH0uxnspV5lNoti_JSfB04anTb0tlaMm9s";
// 좋아요 중복 방지용 방문자 고유 키 (localStorage 저장)
// — 모든 요청에 x-visitor-key 헤더로 실어 보내, RLS가 "내 좋아요"만 조회·취소하도록 판별함
function getOrCreateVisitorKey() {
  try {
    let key = localStorage.getItem("gallery_visitor_key");
    if (!key) {
      key = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
      localStorage.setItem("gallery_visitor_key", key);
    }
    return key;
  } catch (e) {
    // localStorage 접근 불가(프라이빗 모드 등) 시 세션 한정 키로 대체
    return `v-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  }
}
const VISITOR_KEY = getOrCreateVisitorKey();

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { "x-visitor-key": VISITOR_KEY } }
});

// 방문자가 받은 교사별 공유 링크(?t=코드). 없으면 관리자의 현재 전시를 보여줌
const SHARE_CODE_FROM_URL = new URLSearchParams(location.search).get("t");

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/; // 문자+숫자 포함, 10자 이상

const authScreenEl = document.getElementById("authScreen");
const startScreenEl = document.getElementById("startScreen");
const authForm = document.getElementById("authForm");
const authEmailInput = document.getElementById("authEmail");
const authPasswordInput = document.getElementById("authPassword");
const authErrorEl = document.getElementById("authError");
const authMsgEl = document.getElementById("authMsg");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const passwordHintEl = document.getElementById("passwordHint");
let authMode = "login"; // "login" | "signup"
let isTeacher = false; // 관리자 승인을 받은 교사 계정으로 로그인했을 때만 true, 게스트 입장 시 false
let currentTeacher = null; // { user_id, status, is_admin, share_code } — teachers 테이블의 내 행

function setAuthError(msg) {
  authMsgEl.classList.remove("show");
  if (!msg) { authErrorEl.classList.remove("show"); authErrorEl.textContent=""; return; }
  authErrorEl.textContent = msg;
  authErrorEl.classList.add("show");
}
function setAuthMsg(msg) {
  authErrorEl.classList.remove("show");
  if (!msg) { authMsgEl.classList.remove("show"); authMsgEl.textContent=""; return; }
  authMsgEl.textContent = msg;
  authMsgEl.classList.add("show");
}

document.querySelectorAll(".authTab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".authTab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    authMode = tab.dataset.mode;
    authSubmitBtn.textContent = authMode === "signup" ? "회원가입" : "로그인";
    passwordHintEl.style.display = authMode === "signup" ? "block" : "none";
    setAuthError(""); setAuthMsg("");
  });
});
passwordHintEl.style.display = "none"; // 기본은 로그인 탭

// 저장된 로그인 정보(Supabase가 localStorage에 남긴 세션)가 있으면, 확인이 끝날 때까지 입력 칸 대신 안내만 보여줌
// — 확인하는 동안 전시장을 준비하느라 화면이 잠깐 멈춰 입력이 안 되다가 갑자기 넘어가는 어색함을 없앰
const authStubEl = authScreenEl.querySelector(".ticket-stub");
function setAuthChecking(on) {
  authScreenEl.classList.toggle("checking", on);
  authStubEl.classList.toggle("hidden", on);
}
function hasStoredSession() {
  try { return Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k)); } catch (e) { return false; }
}
if (hasStoredSession()) setAuthChecking(true);

/* ---------- 시작 화면 QR코드 (학부모가 휴대폰으로 스캔해 같은 주소로 접속) ----------
   전시 URL은 배포 후 window.location으로 자동 결정되므로, 저장소/도메인이 바뀌어도
   코드 수정 없이 항상 "지금 보고 있는 이 페이지"의 주소로 QR이 만들어집니다. */
// 공유 주소: 교사 로그인 시 본인 공유 코드, 공유 링크로 들어온 방문자는 그 코드를 그대로 붙임
function getShareUrl() {
  const code = (currentTeacher && currentTeacher.share_code) || SHARE_CODE_FROM_URL;
  const base = location.origin + location.pathname; // #hash 등은 제외한 순수 접속 주소
  return code ? `${base}?t=${encodeURIComponent(code)}` : base;
}

function renderEntryQR() {
  const box = document.getElementById("qrEntryBox");
  const wrap = document.getElementById("qrCanvasWrap");
  if (!box || !wrap) return;
  wrap.innerHTML = ""; // 로그인 후 공유 코드가 정해지면 다시 그림
  try {
    if (typeof QRCode === "undefined") throw new Error("QRCode 라이브러리 로드 실패");
    const shareUrl = getShareUrl();
    new QRCode(wrap, {
      text: shareUrl,
      width: 104,
      height: 104,
      colorDark: "#2b1a0d",
      colorLight: "#fff8ec",
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch (err) {
    console.warn("[가상미술관] QR코드 생성 실패(네트워크/CDN 문제일 수 있음):", err.message || err);
    box.classList.add("hidden"); // 생성 실패 시 조용히 숨김 (핵심 기능에는 영향 없음)
  }
}
renderEntryQR();

// QR 크게 보기 — 작은 QR을 늘리면 흐려지므로 열 때마다 큰 크기로 새로 그림
const qrZoomEl = document.getElementById("qrZoom");
function openQRZoom() {
  if (typeof QRCode === "undefined") return;
  const code = document.getElementById("qrZoomCode");
  code.innerHTML = "";
  new QRCode(code, {
    text: getShareUrl(),
    width: 640,
    height: 640,
    colorDark: "#2b1a0d",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
  qrZoomEl.classList.add("open");
  document.getElementById("qrZoomCloseBtn").focus();
}
function closeQRZoom() { qrZoomEl.classList.remove("open"); }
const qrCanvasWrapEl = document.getElementById("qrCanvasWrap");
qrCanvasWrapEl.addEventListener("click", openQRZoom);
qrCanvasWrapEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openQRZoom(); }
});
qrZoomEl.addEventListener("click", closeQRZoom); // 카드·닫기 버튼을 눌러도 닫힘
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && qrZoomEl.classList.contains("open")) closeQRZoom();
});

// 공유 주소를 클립보드에 복사하고 버튼 글자로 결과를 알려줌 — 시작 화면 QR 옆, 관리자 화면 "우리 반 링크"가 함께 사용
async function copyShareUrl(btn) {
  const shareUrl = getShareUrl();
  try {
    await navigator.clipboard.writeText(shareUrl);
    const original = btn.textContent;
    btn.textContent = "✅ 복사됨!";
    setTimeout(() => { btn.textContent = original; }, 1600);
  } catch (err) {
    console.warn("[가상미술관] 클립보드 복사 실패:", err.message || err);
    window.prompt("아래 주소를 복사해서 사용하세요:", shareUrl);
  }
}
document.getElementById("qrCopyLinkBtn").addEventListener("click", (e) => copyShareUrl(e.currentTarget));

function showGalleryEntry(asTeacher) {
  isTeacher = !!asTeacher;
  authScreenEl.style.display = "none";
  startScreenEl.style.display = "flex";
  document.getElementById("adminOpenBtn").style.display = isTeacher ? "inline-block" : "none";
  document.getElementById("startLogoutBtn").style.display = isTeacher ? "inline-block" : "none";
}

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setAuthError(""); setAuthMsg("");
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (!email) { setAuthError("이메일을 입력해주세요."); return; }
  if (!PASSWORD_RULE.test(password)) {
    setAuthError("비밀번호는 문자와 숫자를 포함해 10자리 이상이어야 해요.");
    return;
  }

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = "처리 중...";

  try {
    if (authMode === "signup") {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        await enterWithSession(data.session); // 새 계정은 승인 대기 상태라 안내 문구와 함께 로그인 화면에 머묾
      } else {
        setAuthMsg("가입 확인 메일을 보냈어요. 메일을 확인하고 관리자 승인을 받으면 로그인할 수 있어요.");
        document.querySelector('.authTab[data-mode="login"]').click();
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await enterWithSession(data.session);
    }
  } catch (err) {
    setAuthError(translateAuthError(err.message));
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = authMode === "signup" ? "회원가입" : "로그인";
  }
});

function translateAuthError(msg) {
  if (!msg) return "오류가 발생했어요. 다시 시도해주세요.";
  if (msg.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않아요.";
  if (msg.includes("already registered") || msg.includes("already exists")) return "이미 가입된 이메일이에요. 로그인해주세요.";
  if (msg.includes("Password should be")) return "비밀번호 조건을 다시 확인해주세요 (문자+숫자 10자리 이상).";
  return msg;
}

document.getElementById("googleLoginBtn").addEventListener("click", async () => {
  setAuthError(""); setAuthMsg("");
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href }
  });
  if (error) setAuthError(translateAuthError(error.message));
});

document.getElementById("guestEnterBtn").addEventListener("click", () => {
  // 학생/학부모: 로그인 없이 바로 관람 화면으로 (RLS 정책상 조회·좋아요·댓글은 비로그인도 허용)
  showGalleryEntry(false);
});

// 로그인 세션 → teachers 테이블에서 승인 상태를 확인한 뒤 입장.
// 승인 전(pending)·거절(rejected) 계정은 관리 기능을 쓸 수 없으므로 로그아웃하고 안내만 보여줌
let enteringUserId = null; // onAuthStateChange·getSession·로그인 버튼이 동시에 불러도 한 번만 처리
async function enterWithSession(session) {
  if (!session) return;
  const uid = session.user.id;
  if (enteringUserId === uid) return;
  enteringUserId = uid;
  try {
    const { data, error } = await supabaseClient.from("teachers")
      .select("user_id, status, is_admin, share_code").eq("user_id", uid).maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "approved") {
      await supabaseClient.auth.signOut();
      enteringUserId = null;
      setAuthChecking(false);
      setAuthMsg(data && data.status === "rejected"
        ? "교사 계정 사용이 승인되지 않았어요. 관리자에게 문의해주세요."
        : "관리자 승인을 기다리고 있어요. 승인된 뒤 다시 로그인해주세요.");
      return;
    }
    currentTeacher = data;

    // 공유 링크 없이 들어왔는데 지금 불러온 전시가 내 전시 기준이 아니면(로그인 전에 불러온 경우)
    // 내 현재 전시로 다시 불러오기 위해 새로고침 — 새로고침 후에는 세션 기준으로 불러오므로 한 번만 일어남
    if (!SHARE_CODE_FROM_URL) {
      await waitForArtworksLoad();
      if (LOADED_AS_USER !== uid) { location.reload(); return; }
    }
    renderEntryQR();
    showGalleryEntry(true);
  } catch (err) {
    enteringUserId = null;
    setAuthChecking(false);
    console.warn("[가상미술관] 교사 계정 확인 실패:", err.message || err);
    setAuthError("계정 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
  }
}

// 전시 데이터 로딩(아래 스크립트의 artworksLoadPromise)이 끝날 때까지 대기
async function waitForArtworksLoad() {
  if (document.readyState === "loading") {
    await new Promise(r => document.addEventListener("DOMContentLoaded", r, { once:true }));
  }
  await window.artworksLoadPromise;
}

// 이미 로그인된 세션이 있으면(예: 새로고침, 구글 로그인 리다이렉트 복귀) 승인 여부 확인 후 통과
// (onAuthStateChange 콜백 안에서 바로 Supabase를 호출하면 멈출 수 있어 setTimeout으로 한 박자 미룸)
supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session) setTimeout(() => enterWithSession(session), 0);
});
supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session) enterWithSession(data.session);
  else setAuthChecking(false); // 저장된 정보가 만료됐거나 없으면 바로 입력 칸을 보여줌
}).catch(() => setAuthChecking(false));
