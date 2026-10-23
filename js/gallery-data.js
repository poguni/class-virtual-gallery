/* =========================================================================
   Supabase 데이터 연동 (Phase 2)
   - exhibitions → rooms → artworks 순으로 최신 전시의 첫 번째 방을 불러옴
   - 좋아요는 방문자별 고유 키(visitor_key, localStorage 저장)로 중복 방지
   - 실제 데이터가 하나도 없으면(교사가 아직 업로드 전) 데모 데이터로 자동 대체
   ========================================================================= */
let CURRENT_ROOM_IDS = [];    // 현재 표시 중인 전시의 전시실 UUID 목록 (데모 모드에서는 빈 배열)
let DEMO_MODE = false;        // true면 좋아요/댓글이 로컬 메모리에만 저장됨 (Supabase 미연동 상태)
let LOADED_AS_USER = null;    // 전시를 불러올 때 기준이 된 교사 계정 id (게스트/공유 링크로 불러왔으면 null)
let OWNS_LOADED_EXHIBITION = false; // 지금 보고 있는 전시가 로그인한 교사 본인의 전시인지 (댓글 숨김 버튼 노출 기준)

// 반환값: [{ id, room_number, name, artworks:[...] }, ...] — 전시실 순서(room_number) 그대로,
// 각 전시실의 작품은 등록 순서(created_at) 그대로 담긴 "방 단위" 배열 (Phase 4: 다중 전시실 지원)
async function loadArtworksData() {
  try {
    // 어떤 전시를 보여줄지 결정
    //  - 공유 링크(?t=코드)로 접속: 그 교사의 현재 전시
    //  - 교사 세션이 있으면: 내 현재 전시
    //  - 그 외(코드 없는 기존 QR·링크): 관리자의 현재 전시
    let exhibitions;
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const sessionUserId = sessionData.session ? sessionData.session.user.id : null;
    if (!SHARE_CODE_FROM_URL && sessionUserId) {
      LOADED_AS_USER = sessionUserId; // 내 전시가 없어 데모로 넘어가더라도 "내 기준으로 불러옴"은 기록
      const { data, error } = await supabaseClient
        .from("exhibitions").select("id, title, grade, class")
        .eq("owner_id", sessionUserId).eq("is_active", true).limit(1);
      if (error) throw error;
      exhibitions = data;
      OWNS_LOADED_EXHIBITION = true;
    } else {
      const { data, error } = await supabaseClient.rpc("get_active_exhibition", { p_code: SHARE_CODE_FROM_URL });
      if (error) throw error;
      exhibitions = data;
    }
    if (!exhibitions || !exhibitions.length) throw new Error("현재 전시 중인 전시가 없습니다");

    const { data: rooms, error: roomErr } = await supabaseClient
      .from("rooms").select("id, room_number, name")
      .eq("exhibition_id", exhibitions[0].id)
      .order("room_number", { ascending:true });
    if (roomErr) throw roomErr;
    if (!rooms || !rooms.length) throw new Error("등록된 전시실이 없습니다");

    const roomIds = rooms.map(r => r.id);

    const { data: rows, error: artErr } = await supabaseClient
      .from("artworks").select("id, room_id, student_name, title, image_url, created_at")
      .in("room_id", roomIds)
      .order("created_at", { ascending:true });
    if (artErr) throw artErr;
    if (!rows || !rows.length) throw new Error("등록된 작품이 없습니다");

    const ids = rows.map(r => r.id);

    // 좋아요 집계(like_counts RPC) + 내 좋아요 여부(RLS상 likes 행은 내 visitor_key 것만 내려옴)
    const { data: countRows } = await supabaseClient.rpc("like_counts", { p_artwork_ids: ids });
    const likeCountMap = {}, likedByMeSet = new Set();
    (countRows || []).forEach(c => { likeCountMap[c.artwork_id] = Number(c.like_count); });
    const { data: likeRows } = await supabaseClient
      .from("likes").select("artwork_id, visitor_key").in("artwork_id", ids).eq("visitor_key", VISITOR_KEY);
    (likeRows || []).forEach(l => likedByMeSet.add(l.artwork_id));

    // 댓글 (RLS: 비로그인은 숨김 아닌 댓글만, 교사는 숨김 포함 전체가 자동으로 내려옴)
    const { data: commentRows } = await supabaseClient
      .from("comments").select("id, artwork_id, nickname, content, is_hidden, created_at")
      .in("artwork_id", ids).order("created_at", { ascending:true });
    const commentMap = {};
    (commentRows || []).forEach(c => {
      (commentMap[c.artwork_id] = commentMap[c.artwork_id] || []).push(c);
    });

    const artByRoom = {};
    rows.forEach(r => {
      (artByRoom[r.room_id] = artByRoom[r.room_id] || []).push({
        id: r.id,
        title: r.title,
        artist: r.student_name,
        canvas: null,
        imageUrl: r.image_url,
        dataUrl: null,
        likes: likeCountMap[r.id] || 0,
        liked: likedByMeSet.has(r.id),
        comments: commentMap[r.id] || []
      });
    });

    // 작품이 하나도 없는 전시실은 3D 씬에서 제외 (빈 방을 만들지 않음)
    const roomList = rooms
      .map(r => ({ id: r.id, room_number: r.room_number, name: r.name, artworks: artByRoom[r.id] || [] }))
      .filter(r => r.artworks.length > 0);
    if (!roomList.length) throw new Error("등록된 작품이 없습니다");

    CURRENT_ROOM_IDS = roomList.map(r => r.id);
    DEMO_MODE = false;
    // 로비 입구 안내판에 실제 전시의 학년/반을 표시하기 위해 함께 담아 반환
    roomList.exhibitionInfo = { title: exhibitions[0].title, grade: exhibitions[0].grade, class: exhibitions[0].class };
    return roomList;
  } catch (err) {
    console.warn("[가상미술관] Supabase 데이터를 불러오지 못해 데모 데이터로 대체합니다:", err.message || err);
    DEMO_MODE = true;
    OWNS_LOADED_EXHIBITION = false;
    CURRENT_ROOM_IDS = [];
    const demoRooms = buildDemoArtworks();
    demoRooms.exhibitionInfo = { title: null, grade: null, class: null }; // 데모 모드: 특정 학년/반이 없으므로 사인은 기본 문구로 표시됨
    return demoRooms;
  }
}

let artworks = []; // 전체 전시실의 작품을 이어붙인 평탄화 배열 (Supabase 또는 데모 데이터 로드가 끝나면 채워짐)
