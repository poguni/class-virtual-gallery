/* =========================================================================
   더미 작품 데이터 생성
   ========================================================================= */
const ARTWORK_META = [
  { title: "가을 풍경",     artist: "김민준", palette: ["#e8b04b","#c9622e","#8a3b23","#fff3d6"], type:"landscape" },
  { title: "우리 가족",     artist: "이서연", palette: ["#f6e2c4","#e28b6d","#5b7b9a","#2e2a26"], type:"family" },
  { title: "무지개 마을",   artist: "박도윤", palette: ["#e56b6f","#f2a65a","#f7e07f","#7fb685","#5b8ac9","#8b6fb0"], type:"rainbow" },
  { title: "바다 이야기",   artist: "최지우", palette: ["#1d4e6b","#2f7d9e","#7fc7d9","#eef4ea"], type:"ocean" },
  { title: "봄날의 꽃밭",   artist: "정하은", palette: ["#f4a6c1","#f7d6e0","#8fbf6b","#fdf6e3"], type:"flowers" },
  { title: "달빛 아래",     artist: "강시우", palette: ["#12213b","#2b3f6b","#e8d99a","#7d8fb3"], type:"night" },
  { title: "숲속 친구들",   artist: "윤서아", palette: ["#3f6b3a","#6d9c5f","#a9c98a","#7a4a2b"], type:"forest" },
  { title: "나의 꿈",       artist: "임하준", palette: ["#6b4e9a","#a586c9","#f0c98a","#fdf6e3"], type:"dream" },
];

function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function paintArtworkCanvas(meta, seed) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 384;
  const ctx = canvas.getContext("2d");
  const rnd = seededRandom(seed);
  const pal = meta.palette;

  // 배경
  const grad = ctx.createLinearGradient(0,0,0,canvas.height);
  grad.addColorStop(0, pal[pal.length-1]);
  grad.addColorStop(1, pal[0]);
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  function circ(x,y,r,color){ ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
  function tri(x,y,w,h,color){ ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-w/2,y+h); ctx.lineTo(x+w/2,y+h); ctx.closePath(); ctx.fill(); }
  function wave(y,amp,color,h){
    ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(0,canvas.height);
    ctx.lineTo(0,y);
    for(let x=0;x<=canvas.width;x+=16){ ctx.lineTo(x, y+Math.sin(x*0.03+seed)*amp); }
    ctx.lineTo(canvas.width,canvas.height); ctx.closePath(); ctx.fill();
  }

  if (meta.type === "landscape") {
    circ(400,90,42,pal[3]);
    tri(150,220,220,150,pal[2]);
    tri(320,240,260,140,pal[1]);
    ctx.fillStyle=pal[0]; ctx.fillRect(0,320,canvas.width,64);
  } else if (meta.type === "family") {
    ctx.fillStyle="#fdf6e3"; ctx.fillRect(0,260,canvas.width,124);
    const xs=[130,220,310,400];
    xs.forEach((x,i)=>{
      const h = 70 + (i%2)*40;
      circ(x,260-h,24,"#f0c9a0");
      ctx.fillStyle=pal[i%pal.length]; ctx.fillRect(x-24,260-h+22,48,h);
    });
  } else if (meta.type === "rainbow") {
    for (let i=0;i<pal.length;i++){
      ctx.strokeStyle = pal[i]; ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(256, 420, 260 - i*16, Math.PI, Math.PI*2);
      ctx.stroke();
    }
    tri(140,300,90,80,"#8a5a3a"); tri(340,310,110,90,"#8a5a3a");
  } else if (meta.type === "ocean") {
    wave(230,14,pal[1],154);
    wave(280,20,pal[2],104);
    circ(90,80,30,pal[3]);
  } else if (meta.type === "flowers") {
    ctx.fillStyle=pal[3]; ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<9;i++){
      const x = 40+rnd()*430, y=140+rnd()*220;
      for(let k=0;k<6;k++){
        const ang = k/6*Math.PI*2;
        circ(x+Math.cos(ang)*16, y+Math.sin(ang)*16, 12, pal[i%2]);
      }
      circ(x,y,9,"#f7e07f");
      ctx.strokeStyle=pal[2]; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(x,y+10); ctx.lineTo(x,y+70); ctx.stroke();
    }
  } else if (meta.type === "night") {
    ctx.fillStyle=pal[0]; ctx.fillRect(0,0,canvas.width,canvas.height);
    circ(390,90,46,pal[2]);
    for(let i=0;i<40;i++){ circ(rnd()*canvas.width, rnd()*canvas.height*0.6, 1.6, "#ffffff"); }
    tri(130,260,180,120,pal[1]); tri(300,270,220,110,pal[1]);
  } else if (meta.type === "forest") {
    ctx.fillStyle=pal[3]; ctx.fillRect(0,290,canvas.width,94);
    for(let i=0;i<6;i++){
      const x = 40+i*80;
      ctx.fillStyle=pal[3]; ctx.fillRect(x-6,240,12,60);
      circ(x,210,42,pal[i%2===0?1:2]);
    }
  } else if (meta.type === "dream") {
    ctx.fillStyle=pal[3]; ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<5;i++){
      const x=70+i*90, y=120+((i%2)*70);
      circ(x,y,34,pal[0]); circ(x+30,y+6,26,pal[1]); circ(x-28,y+10,22,pal[1]);
    }
    circ(430,80,26,pal[2]);
  }

  return canvas;
}

// 데모(더미) 작품 데이터 생성 — Supabase에 아직 작품이 없을 때(교사가 업로드 전이거나 연결 실패 시) 대체용으로 사용
function buildDemoArtworks() {
  let nextDemoCommentId = 1;
  const flat = ARTWORK_META.map((meta, i) => {
    const canvas = paintArtworkCanvas(meta, i * 17 + 3);
    return {
      id: null, // 데모 데이터는 실제 DB row가 없음 (좋아요/댓글은 이 세션 메모리에만 저장됨)
      title: meta.title,
      artist: meta.artist,
      canvas,
      imageUrl: null,
      dataUrl: canvas.toDataURL("image/png"),
      likes: Math.floor(seededRandom(i*91+5)()*12) + 2,
      liked: false,
      comments: i % 3 === 0
        ? [{ id: nextDemoCommentId++, nickname:"선생님", content:"색감이 정말 예뻐요!", is_hidden:false }]
        : []
    };
  });
  // 데모 데이터도 실제 배정 로직(방 1개당 최대 8편)과 동일한 방식으로 방 단위로 묶어서 반환
  // (전시실이 1개뿐이어도 Phase 4의 다중 전시실 배치 코드 경로를 그대로 통과하도록)
  const counts = assignRoomCounts(flat.length);
  const rooms = [];
  let cursor = 0;
  counts.forEach((cnt, i) => {
    rooms.push({ id: null, room_number: i + 1, name: null, artworks: flat.slice(cursor, cursor + cnt) });
    cursor += cnt;
  });
  return rooms;
}
