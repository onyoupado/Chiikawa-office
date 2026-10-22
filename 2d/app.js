// 치이카와 오피스 2D: 업무를 지시하면 팀이 회의실에 모이고, 자료실·탕비실·자리를 오가며 일을 끝내요.
import { esc, md } from "../shared/markdown.js";
import { KEYS, readJSON, writeJSON, remove, purgeSecrets, clearAllLocal, isObj, num, str } from "../shared/storage.js";
import { parseTaskAnswer as parse, finalizeAnswer, buildTaskPrompt, demoAnswer, normalizeScore } from "../shared/parse.js";
import { initAI, setAccessCode, aiStatus, isConnected, askAI, ERRMSG, copyText } from "../shared/ai-client.js";
import { ACTION_TEXT, objectActionLabel } from "../shared/actions.js";
import { createRegistry } from "../3d/interactions.js";

purgeSecrets();   // 예전 버전이 남긴 API 키·모델 값을 지워요
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = a => a[Math.floor(Math.random() * a.length)];
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- characters (pure SVG, drawn in code) ---------- */
const L = "#33364a";
const eyes = (y=56) => `<ellipse cx="38" cy="${y}" rx="3.6" ry="4.6" fill="${L}"/><ellipse cx="62" cy="${y}" rx="3.6" ry="4.6" fill="${L}"/><circle cx="39.2" cy="${y-1.8}" r="1.3" fill="#fff"/><circle cx="63.2" cy="${y-1.8}" r="1.3" fill="#fff"/>`;
const blush = (y=66) => `<ellipse cx="27" cy="${y}" rx="7" ry="3.8" fill="#ff9fb8" opacity=".75"/><ellipse cx="73" cy="${y}" rx="7" ry="3.8" fill="#ff9fb8" opacity=".75"/>`;
const SVG = {
  chiikawa: `<svg viewBox="0 0 100 100"><circle cx="29" cy="27" r="9" fill="#fff" stroke="${L}" stroke-width="2.5"/><circle cx="71" cy="27" r="9" fill="#fff" stroke="${L}" stroke-width="2.5"/><ellipse cx="50" cy="60" rx="38" ry="33" fill="#fff" stroke="${L}" stroke-width="2.5"/>${eyes()}${blush()}<path d="M46 65 q4 3.5 8 0" fill="none" stroke="${L}" stroke-width="2" stroke-linecap="round"/></svg>`,
  hachiware: `<svg viewBox="0 0 100 100"><defs><clipPath id="hwclip"><ellipse cx="50" cy="60" rx="38" ry="33"/></clipPath></defs><path d="M17 44 L22 12 L42 30 Z" fill="#9dbde2" stroke="${L}" stroke-width="2.5" stroke-linejoin="round"/><path d="M83 44 L78 12 L58 30 Z" fill="#9dbde2" stroke="${L}" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="50" cy="60" rx="38" ry="33" fill="#fff"/><path clip-path="url(#hwclip)" d="M0 52 L0 0 L100 0 L100 52 L66 50 L50 33 L34 50 Z" fill="#9dbde2"/><ellipse cx="50" cy="60" rx="38" ry="33" fill="none" stroke="${L}" stroke-width="2.5"/>${eyes(57)}${blush(67)}<path d="M44 65 q3 3 6 0 q3 3 6 0" fill="none" stroke="${L}" stroke-width="2" stroke-linecap="round"/></svg>`,
  usagi: `<svg viewBox="0 0 100 100"><ellipse cx="38" cy="18" rx="7.5" ry="21" fill="#fbe7a1" stroke="${L}" stroke-width="2.5" transform="rotate(-8 38 18)"/><ellipse cx="62" cy="16" rx="7.5" ry="21" fill="#fbe7a1" stroke="${L}" stroke-width="2.5" transform="rotate(10 62 16)"/><ellipse cx="38" cy="20" rx="3" ry="13" fill="#ffc3cf" transform="rotate(-8 38 20)"/><ellipse cx="62" cy="18" rx="3" ry="13" fill="#ffc3cf" transform="rotate(10 62 18)"/><ellipse cx="50" cy="61" rx="37" ry="32" fill="#fbe7a1" stroke="${L}" stroke-width="2.5"/><circle cx="38" cy="56" r="3.2" fill="${L}"/><circle cx="62" cy="56" r="3.2" fill="${L}"/>${blush(65)}<path d="M41 63 q9 16 18 0 Z" fill="#c9455c" stroke="${L}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  rakko: `<svg viewBox="0 0 100 100"><circle cx="24" cy="34" r="7" fill="#b98d68" stroke="${L}" stroke-width="2.5"/><circle cx="76" cy="34" r="7" fill="#b98d68" stroke="${L}" stroke-width="2.5"/><ellipse cx="50" cy="60" rx="38" ry="33" fill="#b98d68" stroke="${L}" stroke-width="2.5"/><ellipse cx="50" cy="66" rx="26" ry="20" fill="#f1dfc9"/>${eyes(55)}<ellipse cx="50" cy="64" rx="5" ry="3.5" fill="${L}"/><path d="M45 70 q5 4 10 0" fill="none" stroke="${L}" stroke-width="2" stroke-linecap="round"/></svg>`,
};

// 원작 이미지로 교체 (img 폴더). 이미지를 못 불러오면 위 SVG를 그대로 써요.
const EXTRA = {
  momonga:{name:"모몽가", home:{x:560,y:520}, lines:["나 귀엽지?","칭찬해줘!","나도 할래!","헤헤"]},
  kurimanju:{name:"쿠리만쥬", home:{x:840,y:200}, lines:["하아…","캬~","한 잔 더…"]},
  shisa:{name:"시사", home:{x:800,y:525}, lines:["열심히 할게요~!","배우는 중이에요!","와아~"]},
  kani:{name:"카니", home:{x:915,y:575}, lines:["(독서 중)","…?","이 책 재밌다"]},
};
for (const k of Object.keys(EXTRA)) SVG[k] = "";
for (const k of Object.keys(SVG)){ const svg = SVG[k]; SVG[k] = `<img src="img/${k}.png" alt="" draggable="false" onerror="this.outerHTML=this.dataset.f" data-f='${svg.replace(/'/g,"&#39;")}'>`; }

/* ---------- floor plans (1F 사무실, 2F 기숙사) ---------- */
const CY = 320; // corridor centre line
const FLOORS = {
  1:{ rooms:{
    meeting:{name:"회의실",x:20,y:20,w:280,h:270,door:160},
    work:{name:"업무 공간",x:300,y:20,w:400,h:270,door:500},
    pantry:{name:"탕비실",x:700,y:20,w:280,h:270,door:840},
    elevator:{name:"엘리베이터",x:20,y:350,w:150,h:270,door:132},
    restroom:{name:"화장실",x:170,y:350,w:160,h:270,door:250},
    lounge:{name:"휴게실",x:330,y:350,w:370,h:270,door:515},
    archive:{name:"자료실",x:700,y:350,w:280,h:270,door:840},
  }},
  2:{ rooms:{
    bed1:{name:"치이카와·하치와레 방",x:20,y:20,w:250,h:270,door:145},
    bed2:{name:"우사기 방",x:270,y:20,w:210,h:270,door:375},
    bed3:{name:"랏코 방",x:480,y:20,w:220,h:270,door:590},
    bed4:{name:"쿠리만쥬·시사 방",x:700,y:20,w:280,h:270,door:840},
    elevator:{name:"엘리베이터",x:20,y:350,w:150,h:270,door:132},
    bath:{name:"샤워실",x:170,y:350,w:160,h:270,door:250},
    living:{name:"공용 거실",x:330,y:350,w:370,h:270,door:515},
    bed5:{name:"모몽가·카니 방",x:700,y:350,w:280,h:270,door:840},
  }},
  3:{ rooms:{
    hobby:{name:"취미방",x:20,y:20,w:460,h:270,door:250},
    cinema:{name:"영화관",x:480,y:20,w:500,h:270,door:730},
    elevator:{name:"엘리베이터",x:20,y:350,w:150,h:270,door:132},
    terrace:{name:"외부 테라스",x:170,y:350,w:810,h:270,door:540, outdoor:true},
  }},
};
const isTop = r => r.y < CY;
const inner = r => isTop(r) ? r.y + r.h - 22 : r.y + 22;
const SPOT = {
  desk:{rakko:{x:420,y:100},chiikawa:{x:580,y:100},hachiware:{x:420,y:205},usagi:{x:580,y:205}},
  meet:[{x:90,y:130},{x:230,y:130},{x:90,y:235},{x:230,y:235}],
  coffee:{x:765,y:150}, fridge:{x:915,y:170}, snack:[{x:800,y:240},{x:880,y:240}],
  wc:[{x:212,y:500},{x:290,y:500}],
  sofa:[{x:420,y:545},{x:480,y:545}], tv:{x:630,y:470}, bean:{x:385,y:455},
  shelf:[{x:770,y:480},{x:905,y:480}], printer:{x:840,y:550},
  elevFront:{x:122,y:578}, elevIn:{x:61,y:505},
  water:{x:690,y:322},
  meetX:[{x:45,y:180},{x:275,y:180},{x:120,y:275},{x:200,y:275}],
  loungeX:[{x:560,y:470},{x:600,y:575},{x:450,y:480},{x:650,y:540}],
};
// 2층: 각자 침대, 샤워실, 거실
const BED = {chiikawa:{x:80,y:200}, hachiware:{x:210,y:200}, usagi:{x:375,y:200}, rakko:{x:590,y:200},
  kurimanju:{x:770,y:200}, shisa:{x:910,y:200}, momonga:{x:770,y:560}, kani:{x:910,y:560}};
const DORM = {
  shower:[{x:212,y:520},{x:290,y:520}], sofa:[{x:430,y:540},{x:500,y:540}], tv:{x:620,y:470},
  kitchen:[{x:380,y:440},{x:440,y:440}], window:{x:600,y:575},
};
const LOUNGE = [SPOT.sofa[0], SPOT.sofa[1], SPOT.bean, SPOT.tv];

const MAPS = {1:$("map1"), 2:$("map2"), 3:$("map3")};
const cq = v => v/10 + "cqw";  // logical units -> cqw (map width = 1000 units = 100cqw)
const U = (x,y,w,h) => `left:${cq(x)};top:${cq(y)};` + (w!=null ? `width:${cq(w)};height:${cq(h)};` : "");
function add(fl, cls, x,y,w,h, html=""){
  const d = document.createElement("div"); d.className = cls; d.style.cssText = U(x,y,w,h);
  d.innerHTML = html; MAPS[fl].appendChild(d); return d;
}
// 높이가 있는 가구 블록: 윗면 + 앞면 + 옆면
function block(fl, x,y,w,h, H, c, e="var(--wall)", cls="", html=""){
  const d = add(fl, "blk " + cls, x,y,w,h, `<i class="sl"></i><i class="sd"></i><i class="fr"></i><i class="tp"></i>${html}`);
  d.style.setProperty("--h", cq(H)); d.style.setProperty("--c", c); d.style.setProperty("--e", e); return d;
}
// 세워진 판(화이트보드, TV, 엘리베이터 문): 바닥의 (x,y) 선에서 위로 h만큼
const stand = (fl, cls, x,y,w,h, html="", lift=0) => { const d = add(fl, "panel3d " + cls, x, y-h, w, h, html); if (lift) d.style.translate = `0 0 ${cq(lift)}`; return d; };

const WH = 70, WF = 16; // back/side wall height, front (cut-away) wall height
function walls(fl, r, label){
  const out = r.outdoor;   // 테라스는 벽 대신 낮은 유리 난간
  const segH = (y, front, door) => {
    const hh = out ? 22 : front ? WF : WH, cls = "wall h" + (out ? " rail" : front ? " front" : "");
    const parts = door ? [[r.x, door-34], [door+34, r.x+r.w]] : [[r.x, r.x+r.w]];
    return parts.map(([a,b]) => add(fl, cls, a, y-hh, b-a, hh));
  };
  const top = segH(r.y, false, isTop(r) ? 0 : r.door);
  segH(r.y+r.h, true, isTop(r) ? r.door : 0);
  const vh = out ? 22 : WH;
  if (!out) add(fl, "wall v", r.x-vh, r.y, vh, r.h);
  const right = add(fl, "wall v" + (out ? " rail" : ""), r.x+r.w-vh, r.y, vh, r.h); if (!out) right.style.background = "var(--wall-face)";
  if (isTop(r)) top[0].innerHTML = `<span class="rl">${label}</span>`;
  else add(fl, "flab", r.x+14, r.y+16, null, null, label);   // 앞쪽 방은 문이 뒷벽에 있어서 바닥에 이름을 써요
}
for (const fl of [1,2,3]){
  for (const [k,r] of Object.entries(FLOORS[fl].rooms)){ add(fl, `room r-${k}`, r.x,r.y,r.w,r.h); walls(fl, r, r.name); }
  add(fl, "corr-label", 360, 308, null, null, ["", "복 도", "기 숙 사 복 도", "3 층 · 취 미 층"][fl]);
}

/* ---------- furniture helpers ---------- */
// 블록 윗면 위에 올리는 소품 (x,y,w,h는 블록 대비 %, z는 윗면에서 더 올리는 높이)
function deco(d, cls, x,y,w,h, z=0, html=""){
  const e = document.createElement("div"); e.className = "dc " + cls;
  e.style.cssText = `left:${x}%;top:${y}%;width:${w}%;height:${h}%;transform:translateZ(calc(var(--h) + ${cq(z)}))`;
  e.innerHTML = html; d.appendChild(e); return e;
}
const face = (d, cls, html="") => { const f = d.querySelector(".fr"); f.classList.add(cls); f.innerHTML = html; return f; };
const lift = (d, z) => { d.style.translate = `0 0 ${cq(z)}`; return d; };
function plant(fl, x,y, big=false){            // 화분 + 잎
  block(fl, x-12,y-12,24,24, 22, "#c98b5e", "#8a5a3a");
  stand(fl, "leaf" + (big ? " big" : ""), x-(big?34:22), y+2, big?68:44, big?90:56, "", 18);
}
function sofa(fl, x,y,w, col="var(--sofa)"){   // 등받이·팔걸이·쿠션
  block(fl, x,y,w,42, 22, col);
  block(fl, x,y+30,w,12, 50, col);
  block(fl, x,y,14,42, 34, col); block(fl, x+w-14,y,14,42, 34, col);
  const n = Math.max(2, Math.round(w/60));
  for (let i=0;i<n;i++) lift(block(fl, x+18+i*(w-36)/n+4, y+18, (w-36)/n-8, 12, 18, "#fff3f6"), 22);
}
function shelf(fl, x,y,w,h,H){                 // 책장: 앞면에 책등
  const d = block(fl, x,y,w,h,H, "var(--wood)", "var(--wood-dk)"); face(d, "books"); return d;
}

/* 1F 사무실 */
{ // 회의실: 테이블 + 노트북·서류·물병, 의자, 화이트보드
  const t = block(1, 70,150,180,50, 26, "var(--wood)", "var(--desk-edge)");
  deco(t, "laptop", 8,18,18,55); deco(t, "paper", 34,25,12,45); deco(t, "paper", 50,20,12,45);
  deco(t, "bottle", 70,30,4,28, 0); deco(t, "bottle", 78,30,4,28, 0); deco(t, "mug", 88,35,6,30);
  for (const x of [84,134,184,234]) block(1, x-10,128,20,16, 16, "var(--steel)");
  stand(1, "wb", 40,92,240,90, `<b id="wbT">오늘의 업무</b><ul id="wbL"><li>업무를 기다리는 중</li></ul>`);
  plant(1, 40,272);
}
const NAMES = {rakko:"랏코 팀장", chiikawa:"치이카와", hachiware:"하치와레", usagi:"우사기"};
const MUG = {rakko:"#a87a52", chiikawa:"#ff8fb1", hachiware:"#6f9fd8", usagi:"#f2cf4a"};
for (const [id,s] of Object.entries(SPOT.desk)){ // 책상: 모니터·키보드·머그·서류
  const d = block(1, s.x-58, s.y-68, 116, 44, 28, "var(--desk)", "var(--desk-edge)", "desk", `<div class="np" id="np-${id}">${NAMES[id]} · 휴식</div>`);
  d.id = "desk-"+id;
  const m = document.createElement("div"); m.className = "panel3d mon"; m.id = "mon-"+id;
  m.style.cssText = `left:14%;width:72%;bottom:55%;height:${cq(50)};transform:translateZ(${cq(30)}) rotateX(-68deg)`;
  d.appendChild(m);
  deco(d, "kb", 26,50,46,18); deco(d, "mug", 80,46,8,22).style.background = MUG[id]; deco(d, "paper", 6,46,13,30);
}
{ // 탕비실: 커피머신, 냉장고, 조리대(전기포트·컵), 간식 테이블
  face(block(1, 738,40,54,50, 60, "var(--steel)"), "coffee", "<em></em><u></u>");
  face(block(1, 885,30,62,70, 110, "var(--metal)"), "fridge", "<em></em><u></u><s></s>");
  const c = block(1, 800,40,70,40, 34, "var(--wood)", "var(--desk-edge)");
  deco(c, "kettle", 10,20,22,55, 0); deco(c, "mug", 45,35,12,30); deco(c, "mug", 62,35,12,30).style.background = "#6f9fd8";
  const t = block(1, 780,262,120,26, 26, "var(--wood)", "var(--desk-edge)");
  deco(t, "plate", 30,10,26,80, 0, "<i></i><i></i><i></i>"); deco(t, "mug", 70,20,8,50);
  plant(1, 720,268);
}
const elevEl = {}, indEl = {};
for (const fl of [1,2,3]){ // 엘리베이터: 문이 앞면에 달린 상자
  const fr = block(fl, 30,452,62,80, 78, "var(--steel)").querySelector(".fr");
  fr.classList.add("elevdoor"); fr.innerHTML = `<s>${fl}F</s><b class="l"></b><b class="r"></b>`;
  elevEl[fl] = fr; indEl[fl] = fr.querySelector("s");
  stand(fl, "floorsign", 104,452,40,30, `${fl}F`, 30);
}
{ // 화장실: 칸막이 문(손잡이·사용 표시), 세면대
  for (const x of [182,260]) face(block(1, x,530,62,80, 70, "var(--panel)"), "stall", "<em></em><u></u>");
  const sk = block(1, 185,395,120,30, 30, "var(--panel)"); deco(sk, "sink", 10,15,30,70); deco(sk, "sink", 58,15,30,70);
  stand(1, "mirror", 190,372,110,30, "", 40);
  stand(1, "sign", 230,352,40,24, "WC", 76);
}
{ // 휴게실: 소파, 빈백, TV(받침대), 러그, 잡지 테이블
  add(1, "rug", 380,470,260,110);
  sofa(1, 380,560,150);
  block(1, 360,465,52,40, 18, "var(--yellow)");
  block(1, 590,380,84,20, 22, "var(--wood)", "var(--wood-dk)");
  stand(1, "tv", 595,380,74,46, "♪ ON AIR", 22);
  const t = block(1, 430,500,70,30, 14, "var(--wood)", "var(--wood-dk)"); deco(t, "paper", 15,20,30,60); deco(t, "paper", 55,15,30,60).style.background = "#ffe0ea";
  plant(1, 675,585, true);
}
{ // 자료실: 책장, 복합기(용지), 파일 캐비닛
  shelf(1, 728,365,92,40, 100); shelf(1, 862,365,92,40, 100);
  const p = block(1, 806,575,70,32, 30, "var(--metal)"); deco(p, "paper", 20,15,40,55); face(p, "printer", "<em></em>");
  face(block(1, 720,560,46,40, 56, "var(--steel)"), "drawers", "<em></em><em></em><em></em>");
}
{ // 복도: 정수기, 화분
  block(1, 676,298,22,18, 30, "var(--panel)"); stand(1, "bottle3d", 680,306,14,22, "", 30);
  plant(1, 962,312);
}

/* 2F 기숙사 */
const BLANKET = {chiikawa:"#ffd3df", hachiware:"#cfe0f5", usagi:"#fde9a8", rakko:"#e3cdb3", kurimanju:"#f2d7a8", shisa:"#ffc9a8", momonga:"#d8ecf7", kani:"#ffc4cf"};
for (const [id,b] of Object.entries(BED)){ // 침대: 헤드보드·베개·이불·인형
  const d = block(2, b.x-38, b.y-80, 76, 120, 22, "#fffaf2", "var(--wall)", "", `<div class="pillow"></div><div class="blanket" style="background:${BLANKET[id]}"></div>`);
  d.title = NAMES[id] || EXTRA[id].name;
  block(2, b.x-38, b.y-86, 76, 8, 54, "var(--wood)", "var(--wood-dk)");
}
for (const [x,y] of [[120,40],[420,40],[830,40],[930,372]]){ // 협탁 + 스탠드
  block(2, x,y,44,30, 40, "var(--wood)", "var(--wood-dk)"); stand(2, "lamp", x+10,y+18,24,36, "", 40);
}
block(2, 640,40,44,30, 90, "var(--wood)", "var(--wood-dk)");                 // 랏코 방 옷장
stand(2, "sword", 664,90,8,60, "", 0);                                       // 랏코의 검
shelf(2, 290,40,44,24, 60);                                                 // 우사기 방 책장
add(2, "rug", 40,215,200,60); add(2, "rug", 300,215,150,60); add(2, "rug", 520,215,150,60); add(2, "rug", 730,220,220,50);
{ // 샤워실: 유리 부스, 샤워기, 바닥 타일, 수건걸이
  for (const x of [180,258]){
    block(2, x+6,535,52,60, 4, "var(--blue-soft)"); stand(2, "glass", x,600,64,90);
    stand(2, "showerhead", x+22,540,20,16, "", 80);
  }
  stand(2, "towel", 200,372,90,24, "<i></i><i></i><i></i>", 40);
  stand(2, "sign", 230,352,60,24, "SHOWER", 76);
}
{ // 거실: 소파, 낮은 테이블, TV, 주방(싱크대·가스레인지·냉장고), 러그
  add(2, "rug", 400,470,240,100);
  sofa(2, 400,560,160);
  const t = block(2, 470,490,90,40, 16, "var(--wood)", "var(--desk-edge)"); deco(t, "plate", 30,15,30,70, 0, "<i></i><i></i>"); deco(t, "mug", 70,30,8,35);
  block(2, 580,380,100,20, 22, "var(--wood)", "var(--wood-dk)"); stand(2, "tv", 585,380,90,52, "♪ 오늘의 노래", 22);
  const k = block(2, 345,365,120,36, 34, "var(--wood)", "var(--desk-edge)"); deco(k, "sink", 6,15,32,70); deco(k, "stove", 50,12,40,76, 0, "<i></i><i></i>");
  face(block(2, 470,362,40,40, 90, "var(--metal)"), "fridge", "<em></em><u></u><s></s>");
  plant(2, 675,585, true);
}

/* 3F 취미방 · 영화관 · 외부 테라스 */
{ // 취미방: 게임 코너, 이젤, 피아노, 보드게임 테이블, 장난감 선반
  block(3, 150,40,130,22, 24, "var(--wood)", "var(--wood-dk)"); stand(3, "tv game", 160,40,110,62, "▶ PLAYER 1", 24);
  block(3, 192,46,30,12, 8, "#3a3f55"); block(3, 165,190,46,36, 16, "var(--yellow)"); block(3, 225,190,46,36, 16, "#9fd3c7");
  stand(3, "easel", 50,150,60,78, "<i></i>", 10); block(3, 70,160,30,20, 26, "var(--wood)", "var(--wood-dk)");
  const pi = block(3, 330,50,120,46, 40, "#2b2d3a", "#14151d"); deco(pi, "keys", 6,10,88,40); stand(3, "pianoback", 330,52,120,40, "", 40);
  block(3, 380,100,40,16, 22, "#2b2d3a", "#14151d");
  const bg = block(3, 270,215,110,40, 22, "var(--wood)", "var(--wood-dk)"); deco(bg, "board", 20,10,60,80, 0, "<i></i><i></i><i></i>");
  shelf(3, 400,200,60,30, 70);
  plant(3, 455,60);
}
const SEATS = [];
{ // 영화관: 대형 스크린, 커튼, 계단식 좌석, 팝콘 기계
  stand(3, "curtain", 500,30,40,150, "", 0); stand(3, "curtain", 920,30,40,150, "", 0);
  stand(3, "screen", 545,32,370,110, "<b>▶ 치이카와 극장판</b><span>상영 중</span>", 18);
  [[160,0],[210,10],[255,20]].forEach(([y,up], r) => {
    block(3, 560,y+4,360,40, 4+up, "#3b2a3a");                         // 계단
    for (let i=0;i<(r===1?4:5);i++){
      const x = 600 + i*80 + (r===1?40:0);
      lift(block(3, x-22,y,44,26, 16, "#c0392b", "#7a1f1a"), up);
      lift(block(3, x-22,y+22,44,8, 40, "#c0392b", "#7a1f1a"), up);
      SEATS.push({x, y:y-2});
    }
  });
  const pc = block(3, 500,215,50,40, 50, "#d63a3a", "#8a1f1f"); stand(3, "popcorn", 504,240,42,40, "", 50);
}
{ // 외부 테라스: 나무 데크, 파라솔 테이블, 선베드, 바비큐 그릴, 화단, 나무
  for (const x of [270,410]){
    const t = block(3, x,430,90,50, 30, "#fff", "var(--wall)"); deco(t, "mug", 20,30,10,30); deco(t, "plate", 50,20,30,60, 0, "<i></i>");
    stand(3, "pole", x+42,458,6,110, "", 0);
    const u = add(3, "parasol", x-5,415,100,80); lift(u, 112);
    for (const dx of [-16,96]) block(3, x+dx,445,22,22, 18, "var(--steel)");
  }
  for (const x of [520,620]){ block(3, x,540,70,50, 14, "#f4f1ea", "var(--wall)"); lift(block(3, x,580,70,14, 30, "#ffb2c4", "var(--wall)"), 0); }
  const g = block(3, 720,395,70,40, 44, "#3a3f55", "#1d2030"); deco(g, "grill", 8,12,84,76, 0, "<i></i><i></i>");
  stand(3, "smoke", 735,400,40,50, "", 60);
  for (let x=190; x<900; x+=118){ const f = block(3, x,600,100,16, 16, "#7cc29a", "#4c8a65"); deco(f, "flowers", 0,0,100,100, 0, "<i></i><i></i><i></i><i></i>"); }
  plant(3, 860,420, true); plant(3, 950,520, true); plant(3, 205,545, true);
  stand(3, "telescope", 900,600,24,60, "", 16);
}

const roomAt = (fl, p) => { for (const [k,r] of Object.entries(FLOORS[fl].rooms)) if (p.x>=r.x && p.x<=r.x+r.w && p.y>=r.y && p.y<=r.y+r.h) return k; return null; };
function route(fl, from, to){
  const R = FLOORS[fl].rooms, a = roomAt(fl, from), b = roomAt(fl, to), pts = [];
  if (a && a === b) return [to];
  if (a){ const r = R[a]; pts.push({x:r.door,y:inner(r)}, {x:r.door,y:CY}); } else pts.push({x:from.x,y:CY});
  if (b){ const r = R[b]; pts.push({x:r.door,y:CY}, {x:r.door,y:inner(r)}); }
  pts.push(to); return pts;
}

/* floor tabs */
let viewFloor = 1;
function showFloor(fl){
  viewFloor = fl;
  for (const f of [1,2,3]){ MAPS[f].classList.toggle("off", f !== fl); MAPS[f].classList.toggle("up", f > fl); MAPS[f].classList.toggle("down", f < fl); }
  document.querySelectorAll(".floors button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.f === fl)));
  document.querySelectorAll(".hot").forEach(b => { b.tabIndex = b.closest(".map") === MAPS[fl] ? 0 : -1; });   // 지금 보는 층의 사물만 Tab으로
}
document.querySelector(".floors").addEventListener("click", e => { const b = e.target.closest("button"); if (b) showFloor(+b.dataset.f); });

/* ---------- crew & movement ---------- */
Object.entries(EXTRA).forEach(([k,v]) => NAMES[k] = v.name);
const ALL = ["rakko","chiikawa","hachiware","usagi",...Object.keys(EXTRA)].map(id => {
  const s = SPOT.desk[id] || EXTRA[id].home;
  const c = {id, name:NAMES[id].replace(" 팀장",""), x:s.x, y:s.y, home:s, floor:1, path:[], resolve:null, job:null, away:false, bubT:0};
  c.el = document.createElement("div"); c.el.className = "mate";
  c.el.innerHTML = `<div class="body">${SVG[id]}</div><span class="nm">${c.name}</span>`;
  c.bub = document.createElement("div"); c.bub.className = "bub";
  MAPS[1].append(c.el, c.bub); return c;
});
const CREW = ALL.slice(0,4), EXTRAS = ALL.slice(4);
const M = Object.fromEntries(ALL.map(c => [c.id, c]));
function counts(){
  for (const f of [1,2,3]) $("cnt"+f).textContent = `· ${ALL.filter(c => c.floor === f).length}명`;
}
function setFloor(c, fl, at){
  c.floor = fl; MAPS[fl].append(c.el, c.bub);
  if (at){ c.x = at.x; c.y = at.y; place(c); }
  counts();
}
function place(c){
  c.el.style.left = c.bub.style.left = cq(c.x);
  c.el.style.top = c.bub.style.top = cq(c.y);
}
ALL.forEach(place); counts();
const SPEED = REDUCED ? 5000 : 170;
let lastT = performance.now();
function frame(t){
  const dt = Math.min(.05, (t - lastT) / 1000); lastT = t;
  for (const c of ALL){
    if (!c.path.length) continue;
    const g = c.path[0], dx = g.x - c.x, dy = g.y - c.y, d = Math.hypot(dx, dy), step = SPEED * dt;
    if (Math.abs(dx) > 1) c.el.classList.toggle("left", dx < 0);
    if (d <= step){ c.x = g.x; c.y = g.y; c.path.shift(); }
    else { c.x += dx/d*step; c.y += dy/d*step; }
    if (!c.path.length){ c.el.classList.remove("walk"); const r = c.resolve; c.resolve = null; r && r(true); }
    place(c);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function walk(c, to){
  if (c.resolve){ const r = c.resolve; c.resolve = null; r(false); }
  c.path = route(c.floor, {x:c.x, y:c.y}, to);
  c.el.classList.add("walk"); c.el.classList.remove("work", "sleep"); c.el.style.removeProperty("--z"); c.bub.style.removeProperty("--z");
  return new Promise(res => { c.resolve = res; });
}
function say(c, text, ms=2600){
  c.bub.textContent = text; c.bub.classList.toggle("show", !!text);
  clearTimeout(c.bubT); if (text && ms) c.bubT = setTimeout(() => c.bub.classList.remove("show"), ms);
}
function setWork(c, on, label){
  c.el.classList.toggle("work", !!on);
  $("desk-"+c.id).classList.toggle("on", !!on);
  $("np-"+c.id).textContent = `${NAMES[c.id]} · ${label || "휴식"}`;
}
function screen(id, text){ const lines = text.split("\n").filter(Boolean); $("mon-"+id).textContent = lines.slice(-5).join("\n").slice(-200); }
const claim = c => { const tag = {}; c.job = tag; return () => c.job === tag; };

/* elevator: 1F 사무실 <-> 2F 기숙사 */
const openElev = fl => elevEl[fl].classList.add("open");
const closeElev = fl => elevEl[fl].classList.remove("open");
const setInd = t => { for (const f of [1,2,3]) indEl[f].textContent = t; };
function summon(c){
  c.el.classList.remove("sleep");
  if (!c.away && c.floor === 1) return;
  c.away = false; c.el.classList.remove("gone");
  setFloor(c, 1, SPOT.elevIn); setInd("1F"); openElev(1); setTimeout(() => closeElev(1), 1800);
}
async function ride(c, ok, to){
  const from = c.floor;
  if (!await walk(c, SPOT.elevFront) || !ok()) return false;
  openElev(from); await sleep(700); if (!ok()) return false;
  if (!await walk(c, SPOT.elevIn) || !ok()) return false;
  c.away = true; c.el.classList.add("gone"); await sleep(500); closeElev(from);
  await sleep(900 * Math.abs(to - from) + 300); if (!ok() || !c.away) return false;
  setFloor(c, to, SPOT.elevIn); setInd(to + "F");
  openElev(to); c.away = false; c.el.classList.remove("gone"); await sleep(500);
  if (!ok()) return false;
  const r = await walk(c, SPOT.elevFront); closeElev(to); return r && ok();
}
// 위층 다녀오기: 2F 기숙사(낮잠·샤워·거실), 3F 취미방·영화관·테라스
const HOBBY = {game:{x:215,y:250}, easel:{x:80,y:235}, piano:{x:400,y:150}, board:[{x:290,y:278},{x:360,y:278}]};
const TERRACE = {table:[{x:300,y:500},{x:440,y:500}], lounger:[{x:555,y:565},{x:655,y:565}], bbq:{x:755,y:470}, flowers:{x:520,y:592}, view:{x:880,y:560}};
const ACTS = {
  2:[
    {w:5, at:c => BED[c.id], sleep:true},
    {w:2, at:() => rand(DORM.shower), lines:["샤워 중~♪","뽀득뽀득","따끈따끈…"]},
    {w:3, at:() => rand([...DORM.sofa, DORM.tv, ...DORM.kitchen, DORM.window]), lines:["거실 최고…","간식 먹을까","이 노래 좋다~","라면 끓일까?"]},
  ],
  3:[
    {w:2, at:() => HOBBY.game, lines:["게임 한 판!","이겼다!","으앗, 졌다…"]},
    {w:1, at:() => HOBBY.easel, lines:["그림 그리는 중~","완성!","무슨 색 칠하지?"]},
    {w:1, at:() => HOBBY.piano, lines:["♪ 도레미~","♬ 띵동띵동","연습 중…"]},
    {w:1, at:() => rand(HOBBY.board), lines:["내 차례!","주사위 굴린다~","한 판 더!"]},
    {w:3, at:() => rand(SEATS), lines:["팝콘 냠냠","(영화 감상 중)","감동…","두근두근"], dur:12000},
    {w:1, at:() => rand(TERRACE.table), lines:["바람 시원해~","차 한 잔~","날씨 좋다!"]},
    {w:1, at:() => rand(TERRACE.lounger), lines:["햇볕 좋다…","일광욕 중","(꾸벅)"]},
    {w:1, at:() => TERRACE.bbq, lines:["고기 굽는 중!","지글지글~","다 익었다!"]},
    {w:1, at:() => rand([TERRACE.flowers, TERRACE.view]), lines:["꽃이 예쁘다","경치 최고!","저기 구름 봐"]},
  ],
};
const pickW = list => { let r = Math.random() * list.reduce((s,a) => s + a.w, 0); for (const a of list){ r -= a.w; if (r <= 0) return a; } return list[0]; };
async function trip(c, ok, fl){
  say(c, fl === 2 ? rand(["잠깐 올라갈게~","기숙사 다녀올게","졸려…"]) : rand(["3층 놀러 갈래!","영화 보러 가자~","테라스 바람 쐬러~"]), 1800);
  if (!await ride(c, ok, fl)) return;
  const act = pickW(ACTS[fl]);
  if (!await walk(c, act.at(c)) || !ok()) return;
  if (act.sleep){
    c.el.classList.add("sleep"); c.el.style.setProperty("--z", cq(24)); c.bub.style.setProperty("--z", cq(24));
    say(c, "Zzz…", 0); await sleep(9000 + Math.random()*7000); if (!ok()) return;
    c.el.classList.remove("sleep"); say(c, rand(["잘 잤다~","으음…","개운해!"]), 2000);
  } else {
    say(c, rand(act.lines), 3000); await sleep((act.dur || 6000) + Math.random()*4000); if (!ok()) return;
    say(c, rand(act.lines), 2400); await sleep(2600); if (!ok()) return;
  }
  say(c, "", 0);
  if (!await ride(c, ok, 1)) return;
  say(c, rand(["다녀왔어~","다시 힘내자","재밌었다!"]), 2000);
}

/* idle wandering (no tokens: all local) */
const PLACES = [
  {w:3, at:()=>SPOT.coffee, lines:["커피 한 잔~","따끈따끈…","카페인 충전!"]},
  {w:2, at:()=>SPOT.fridge, lines:["간식 있나…?","푸딩 발견!","냉장고 털기~"]},
  {w:2, at:()=>rand(SPOT.snack), lines:["냠냠","과자 맛있다…"]},
  {w:2, at:()=>rand(SPOT.wc), lines:["잠깐 화장실…","손 씻기 중"]},
  {w:3, at:()=>rand(SPOT.sofa), lines:["소파 최고…","잠깐 쉬자~","(꾸벅꾸벅)"]},
  {w:2, at:()=>SPOT.tv, lines:["이 노래 좋다~","♪~"]},
  {w:1, at:()=>SPOT.bean, lines:["푹신…","으아 녹는다"]},
  {w:2, at:()=>rand(SPOT.shelf), lines:["자료 찾는 중…","이 책 재밌겠다"]},
  {w:1, at:()=>SPOT.printer, lines:["출력 중…","종이 걸렸다…!"]},
  {w:1, at:()=>SPOT.water, lines:["물 한 잔~","꿀꺽꿀꺽"]},
  {w:2, floor:2}, {w:2, floor:3},
];
const DESK_LINES = {rakko:["오늘도 평화롭군","서류 정리 끝","보고서 확인 중"], chiikawa:["…!","와아…","할 수 있어…!"], hachiware:["오늘 날씨 좋다~","뭐든 해보는 거야!","노래 부를까~?"], usagi:["푸루루루루","하아?","야하!","우라!"]};
const USAGI_LINES = ["우라!","야하!","푸루루…","하아?"];
function pickPlace(){ const tot = PLACES.reduce((s,p)=>s+p.w,0); let r = Math.random()*tot; for (const p of PLACES){ r -= p.w; if (r <= 0) return p; } return PLACES[0]; }
async function wander(c){
  const ok = claim(c), p = pickPlace();
  if (p.floor) await trip(c, ok, p.floor);
  else {
    if (!await walk(c, p.at()) || !ok()) return;
    say(c, c.id === "usagi" && Math.random() < .5 ? rand(USAGI_LINES) : EXTRA[c.id] && Math.random() < .5 ? rand(EXTRA[c.id].lines) : rand(p.lines), 2600);
    await sleep(3000 + Math.random()*3500); if (!ok()) return;
  }
  if (!ok()) return;
  await walk(c, c.home); if (ok()) c.job = null;
}
setInterval(() => {
  if (busy || document.hidden) return;
  const idle = CREW.filter(c => !c.job);
  if (!idle.length) return;
  if (CREW.length - idle.length < 2 && Math.random() < .7) wander(rand(idle));
  else { const c = rand(idle); say(c, rand(DESK_LINES[c.id]), 2200); }
}, 3200);
// 친구들(모몽가·쿠리만쥬·시사·카니)은 업무와 상관없이 사무실을 돌아다녀요
setInterval(() => {
  if (document.hidden) return;
  const idle = EXTRAS.filter(c => !c.job);
  if (!idle.length) return;
  const c = rand(idle);
  if (Math.random() < .45 && !c.away) wander(c); else say(c, rand(EXTRA[c.id].lines), 2200);
}, 4100);

/* clock */
const tick = () => { $("clock").textContent = new Date().toTimeString().slice(0,5); };
tick(); setInterval(tick, 15000);

/* ---------- log ---------- */
function log(who, msg){
  const d = document.createElement("div"), tm = document.createElement("time"), b = document.createElement("b"), sp = document.createElement("span");
  tm.textContent = new Date().toTimeString().slice(0,5); b.className = `who-${who}`; b.textContent = M[who] ? M[who].name : "시스템"; sp.textContent = msg;
  d.append(tm, b, sp); $("log").prepend(d);
  while ($("log").children.length > 60) $("log").lastChild.remove();
}

/* ---------- state ---------- */
const KEY = KEYS.tasks2d;
const EXAMPLE = {id:"ex1", task:"이번 주 팀 회의록을 세 줄로 요약하고 할 일 목록 만들어줘", title:"주간 회의록 요약", example:true, status:"done",
  body:"## 주간 회의 요약\n\n1. 신규 기능 출시일을 11월 3일로 확정했어요.\n2. 고객 문의 응답 시간을 하루 안으로 줄이기로 했어요.\n3. 다음 분기 예산안은 금요일까지 초안을 공유해요.\n\n### 할 일\n- **치이카와**: 출시 공지 초안 작성 (수)\n- **하치와레**: 문의 응답 템플릿 정리 (목)\n- **우사기**: 예산안 숫자 검토 (금)\n\n### 다음 회의 안건\n- 출시 전 최종 점검 목록",
  score:4, comment:"할 일에 마감일까지 있어서 좋아! 야하!", at:Date.now()};
// 저장된 업무 기록은 형식을 검사해서 불러와요 (깨진 값이면 예시만 보여 줘요)
const STATUSES = ["queued", "working", "done", "failed"];
function sanitizeTasks(raw){
  if (!Array.isArray(raw)) return [];
  return raw.slice(-30).filter(t => isObj(t) && typeof t.task === "string" && t.task.trim()).map((t, i) => ({
    id: typeof t.id === "string" && /^[\w-]{1,40}$/.test(t.id) ? t.id : "t" + i + Date.now().toString(36),
    task: str(t.task, 4000, ""), status: STATUSES.includes(t.status) ? t.status : "failed",
    title: str(t.title, 60, ""), body: str(t.body, 20000, ""), outline: Array.isArray(t.outline) ? t.outline.filter(x => typeof x === "string").slice(0, 6) : [],
    score: t.score ? normalizeScore(t.score) : 0, comment: str(t.comment, 120, ""), error: str(t.error, 120, ""),
    example: t.example === true, at: num(t.at, 0, 4e12, Date.now()),
  }));
}
let tasks = sanitizeTasks(readJSON(KEY, []));
if (!tasks.length) tasks = [EXAMPLE];
const save = () => writeJSON(KEY, tasks.slice(-30));
let interrupted = false;
tasks.forEach(t => { if (t.status === "working"){ t.status = "failed"; t.error = "새로고침으로 중단됐어요"; interrupted = true; } });
if (interrupted) save();                      // 바뀐 상태를 바로 저장해서 다음에도 '처리 중'으로 남지 않게
let selected = tasks.slice().reverse().find(t => t.status === "done")?.id || null;

/* ---------- Claude connection ---------- */
// 브라우저에 API 키를 두지 않아요: claude.ai 안이면 샘플 기능, config.js에 프록시가 있으면 접속 코드, 아니면 데모 모드.
let busy = false, ctl = null, curJob = null;
function setMode(){
  const st = aiStatus(), el = $("mode");
  el.className = "mode" + (st.connected ? " live" : "");
  const b = document.createElement("b"); b.textContent = st.connected ? "실제 처리 모드" : "데모 모드";
  el.replaceChildren(b, document.createTextNode(` · ${st.connected ? (st.mode === "claude-ai" ? "claude.ai에서 연결됨" : "서버 프록시로 연결됨") : (st.mode === "proxy-needs-code" ? "접속 코드를 넣으면 연결돼요" : "Claude 연결 없이 흉내만 내요")}`));
  $("aiState").textContent = st.label;
  $("codeRow").hidden = !(st.mode === "proxy" || st.mode === "proxy-needs-code");
}
$("mode").textContent = "연결 확인 중…";
initAI().then(setMode);
$("codeSet").onclick = () => { setAccessCode($("accessCode").value); $("accessCode").value = ""; setMode(); if (isConnected()) log("rakko", "서버 프록시에 연결했어요 (접속 코드는 저장하지 않아요)"); };
$("codeClear").onclick = () => { setAccessCode(""); setMode(); };
$("promptCopy").onclick = async () => {
  const v = $("task").value.trim() || tasks.find(x => x.id === selected)?.task; if (!v) return log("rakko", "업무 내용을 먼저 써 주세요");
  log("rakko", await copyText(buildTaskPrompt(v)) ? "프롬프트를 복사했어요. Claude에 붙여 넣고 받은 답을 '답 붙여 넣기'에 넣어 주세요." : "복사하지 못했어요 (브라우저가 막았어요)");
};
$("pasteToggle").onclick = () => { $("pasteBox").hidden = !$("pasteBox").hidden; if (!$("pasteBox").hidden) $("pasteIn").focus(); };
$("pasteGo").onclick = () => {
  const text = $("pasteIn").value.trim(); if (!text) return;
  const v = $("task").value.trim() || "붙여 넣은 업무";
  try {
    const a = finalizeAnswer(text, v);
    const t = {id:"t" + Date.now().toString(36), task:v, status:"done", title:a.title, body:a.body, outline:a.outline, score:a.score, comment:a.comment, at:Date.now()};
    tasks.push(t); selected = t.id; save(); renderBoard(); renderResult(t); $("pasteIn").value = ""; $("pasteBox").hidden = true;
    log("usagi", `붙여 넣은 답 정리 · ★${a.score}`);
  } catch (e) { log("rakko", `${ERRMSG[e?.code] || "정리하지 못했어요"}. @결과물 아래에 본문이 있는지 확인해 주세요.`); }
};
$("clearTasks").onclick = () => {
  if (busy) return log("rakko", "업무 처리 중에는 지울 수 없어요");
  if (!confirm("2D 사무실의 업무 기록을 모두 지울까요?")) return;
  tasks = [EXAMPLE]; selected = EXAMPLE.id; remove(KEY); renderBoard(); renderResult(EXAMPLE); log("rakko", "업무 기록을 지웠어요");
};
$("clearAll").onclick = () => {
  if (!confirm("이 브라우저에 저장된 치이카와 오피스 기록(2D 업무 기록, 3D 진행 상황·대화, 화질 설정, 예전 API 키)을 모두 지울까요? 되돌릴 수 없어요.")) return;
  clearAllLocal(); location.reload();
};

/* ---------- rendering ---------- */
function renderBoard(){
  const q = tasks.filter(t => t.status === "queued"), w = tasks.filter(t => t.status === "working"), d = tasks.filter(t => t.status === "done" || t.status === "failed").slice().reverse();
  const card = t => `<button class="card ${t.id===selected?"sel":""} ${t.status==="failed"?"fail":""}" data-id="${t.id}"><span class="t">${esc(t.title||t.task)}${t.example?'<span class="ex">예시</span>':""}</span><span class="s">${t.status==="failed"?"중단: "+esc(t.error||""):t.status==="done"?"★".repeat(t.score||0):t.status==="working"?"처리 중…":"순서 기다리는 중"}</span></button>`;
  $("colQ").innerHTML = q.map(card).join(""); $("colW").innerHTML = w.map(card).join(""); $("colD").innerHTML = d.map(card).join("");
  $("nQ").textContent = q.length; $("nW").textContent = w.length; $("nD").textContent = d.length;
}
function renderResult(t, streaming){
  if (!t) return;
  $("rTitle").textContent = t.title || "작성 중…";
  $("rDoc").innerHTML = t.body ? md(t.body) : `<p class="empty">${t.status==="failed" ? esc(t.error||"중단됐어요") : "하치와레가 쓰기 시작하면 여기에 나와요."}</p>`;
  if (streaming) $("rDoc").scrollTop = $("rDoc").scrollHeight;
  const rv = $("rReview");
  if (t.score && t.status === "done"){ rv.hidden = false; rv.innerHTML = `<div class="mini">${SVG.usagi}</div><div><span class="stars">${"★".repeat(t.score)}${"☆".repeat(5-t.score)}</span><p></p></div>`; rv.querySelector("p").textContent = "우사기: " + (t.comment || "야하!"); }
  else rv.hidden = true;
  $("stamp").classList.toggle("on", t.status === "done");
}
function wb(title, items){
  $("wbT").textContent = title;
  $("wbL").innerHTML = (items.length ? items.slice(0,5) : ["구성 짜는 중…"]).map(s => `<li>${esc(s)}</li>`).join("");
}
const progress = (p, label) => { $("bar").style.width = p + "%"; $("barBox").setAttribute("aria-valuenow", String(Math.round(p))); if (label != null) $("now").textContent = label; };

document.addEventListener("click", e => {
  const c = e.target.closest(".card"); if (!c) return;
  const t = tasks.find(x => x.id === c.dataset.id); if (!t) return;
  selected = t.id; renderBoard(); renderResult(t);
});
$("copy").onclick = async () => {
  const t = tasks.find(x => x.id === selected); if (!t?.body) return;
  try { await navigator.clipboard.writeText(t.body); $("copy").textContent = "복사됨"; }
  catch(e){ const r = document.createRange(); r.selectNodeContents($("rDoc")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("copy").textContent = "선택됨"; }
  setTimeout(() => $("copy").textContent = "복사", 1500);
};

/* ---------- the work pipeline ---------- */
// 단계 신호(p1 구성 · p2 결과물 · p3 검토 · done 끝). 성공해도 실패해도 모든 신호를 반드시 풀어서 캐릭터 대본이 멈춰 있지 않게 해요.
function gate(){ let r; const p = new Promise(x => r = x); return {p, r}; }
function newJob(){ return {p1:gate(), p2:gate(), p3:gate(), done:gate(), failed:false, skipped:false, streamDone:false, last:null, text:""}; }
function failJob(j){ j.failed = true; [j.p1,j.p2,j.p3,j.done].forEach(g => g.r(false)); }
function passJob(j){ [j.p1,j.p2,j.p3,j.done].forEach(g => g.r(true)); }

function onUpdate(t, r, job){
  if (r.title && t.title !== r.title){ t.title = r.title; progress(20, r.title); $("rTitle").textContent = r.title; }
  if (r.phase >= 1){ job.p1.r(true); wb(t.title || "새 업무", r.outline); }
  if (r.phase >= 2){ job.p2.r(true); t.outline = r.outline; t.body = r.body; screen("hachiware", r.body); renderResult(t, true); if (r.phase === 2) progress(Math.min(88, 40 + r.body.length/30)); }
  if (r.phase >= 3){ job.p3.r(true); screen("usagi", `점수 ${r.score || "?"}\n${r.comment}`); progress(92); }
}
async function streamWork(t, job, signal){
  const apply = text => { job.text = text; const r = parse(text); job.last = r; onUpdate(t, r, job); };
  if (isConnected()){
    // askAI: 90초가 지나면 timeout, 멈추기 버튼이면 cancelled 오류를 던지고 타이머는 finally에서 정리돼요
    apply(await askAI({messages:[{role:"user", content:buildTaskPrompt(t.task)}], maxTokens:8000, signal, onText:apply}));
  } else {
    const full = demoAnswer(t.task); let pB = false, pR = false;
    await sleep(2500); if (signal.aborted) throw {code:"cancelled"};
    for (let i = 0; i <= full.length + 4; i += 4){
      if (signal.aborted) throw {code:"cancelled"};
      const s = full.slice(0, i); apply(s); await sleep(45);
      if (!pB && s.includes("@결과물")){ pB = true; await sleep(3500); }
      if (!pR && s.includes("@검토")){ pR = true; await sleep(2500); }
    }
    apply(full);
  }
  return job.text;
}

async function run(t){
  busy = true; t.status = "working"; selected = t.id; save(); renderBoard(); renderResult(t);
  $("stop").hidden = false; $("result").setAttribute("aria-busy", "true");
  const job = newJob(); curJob = job; ctl = new AbortController();
  const {rakko:R, chiikawa:C, hachiware:H, usagi:S} = M;
  try {
  CREW.forEach(c => { summon(c); claim(c); setWork(c, false, "회의"); screen(c.id, ""); });
  EXTRAS.forEach(c => { summon(c); claim(c); });
  progress(6, t.task.slice(0,40)); wb(t.task.slice(0,24), ["킥오프 회의 준비 중"]);
  screen("rakko", "[업무지시서]\n" + t.task);
  log("rakko", `업무 접수: ${t.task.slice(0,40)}`);
  say(R, "업무 들어왔어! 회의실로 모여~", 3000);

  // 스트림이 끝나면 결과를 최종 정리: 결과물이 없으면 format 오류, 검토가 없으면 기본 점수·한줄평
  const streamP = streamWork(t, job, ctl.signal).then(text => {
    job.streamDone = true;
    const fin = finalizeAnswer(text, t.task);
    passJob(job);
    return fin;
  }).catch(e => { job.streamDone = true; failJob(job); throw e; });
  streamP.catch(() => {});

  const scripts = (async () => {
    await Promise.all([...CREW.map((c,i) => walk(c, SPOT.meet[i])), ...EXTRAS.map((c,i) => walk(c, SPOT.meetX[i]))]);
    if (job.failed) return;
    log("rakko", "회의실에서 킥오프 회의");
    say(R, "이번 업무는 이거야.", 2400); await sleep(1300);
    say(C, "…!!", 1500); say(S, "우라!", 1500); await sleep(700); say(H, "좋아, 해보자~", 1800); say(M.momonga, "나도 끼워줘!", 1800); await sleep(1300);
    say(M.kurimanju, "난 탕비실에 있을게", 1800); say(M.shisa, "응원할게요~!", 1800);
    EXTRAS.forEach(c => { const tag = c.job; walk(c, c.home).then(() => { if (c.job === tag) c.job = null; }); });
    if (job.failed) return;
    await Promise.all([
      (async () => { say(R, "난 자리에서 지켜볼게.", 2000); await walk(R, SPOT.desk.rakko); if (!job.failed) setWork(R, true, "지켜보는 중"); })(),
      (async () => {
        say(C, "자료 찾아올게…!", 2000); await walk(C, SPOT.shelf[0]); if (job.failed) return;
        setWork(C, true, "자료 조사 중"); log("chiikawa", "자료실에서 구성 짜는 중");
        if (!await job.p2.p || job.failed) return;
        await sleep(600); say(C, "구성 완성…!", 1800); log("chiikawa", `구성 ${(job.last?.outline||[]).length}개 완성`);
        await walk(C, {x:SPOT.desk.hachiware.x+64, y:SPOT.desk.hachiware.y+6}); if (job.failed) return;
        say(C, "여기… 구성이야…!", 2000); await sleep(1000); say(H, "고마워 치이카와~!", 2000); await sleep(900);
        screen("chiikawa", (job.last?.outline||[]).map(s => "• " + s).join("\n"));
        await walk(C, SPOT.desk.chiikawa); if (!job.failed) setWork(C, false, "완료!");
      })(),
      (async () => {
        await walk(H, SPOT.desk.hachiware); if (job.failed) return;
        say(H, "자리 도착~ 구성 기다리는 중", 2200); setWork(H, false, "대기");
        if (!await job.p2.p || job.failed) return;
        await sleep(2200); if (job.failed) return;
        setWork(H, true, "작성 중"); say(H, "타닥타닥…!", 2000); log("hachiware", "결과물 작성 시작");
        if (!await job.p3.p || job.failed) return;
        setWork(H, false, "완료!"); say(H, "다 썼다! 우사기 봐줘~", 2200); log("hachiware", `작성 완료 (${(t.body||"").length}자)`);
      })(),
      (async () => {
        say(S, "푸루루…", 1500); await walk(S, SPOT.coffee); if (job.failed) return;
        say(S, "커피 충전!", 2000); setWork(S, false, "대기");
        if (!await job.p3.p || job.failed) return;
        await walk(S, SPOT.desk.usagi); if (job.failed) return;
        setWork(S, true, "검토 중"); say(S, "우라!", 1500); log("usagi", "검토 중");
        if (!await job.done.p) return; await sleep(1400);
      })(),
    ]);
  })();

  try {
    const r = await streamP; await scripts;
    t.body = r.body; t.outline = r.outline; t.title = t.title || r.title || t.task.slice(0,14);
    t.score = r.score; t.comment = r.comment; t.status = "done";
    setWork(S, false, "승인!"); say(S, "야하!", 2400); log("usagi", `승인 · ★${t.score} · ${t.comment}`);
    progress(100, t.title); save(); renderBoard(); renderResult(t);
    if (job.skipped){ await Promise.all(ALL.map(c => walk(c, c.home))); }
    else {
      await sleep(900); setWork(R, false, "전달 완료"); say(R, "결과물 나왔어. 확인해 봐!", 2600); log("rakko", "결과물 전달 완료");
      await sleep(1800);
      if (!tasks.some(x => x.status === "queued") && !job.skipped){
        say(R, "다들 수고했어! 휴게실에서 쉬자~", 2400);
        EXTRAS.forEach(c => claim(c));
        await Promise.all([...CREW.map((c,i) => walk(c, LOUNGE[i])), ...EXTRAS.map((c,i) => walk(c, SPOT.loungeX[i]))]);
        ALL.forEach(c => c.el.classList.add("cheer"));
        say(M.momonga, "나도 수고했어!", 2000); say(M.kani, "…!", 2000);
        say(C, "와아…!", 2000); say(H, "수고했어~", 2000); await sleep(600); say(S, "야하!", 2000);
        await sleep(2600); ALL.forEach(c => c.el.classList.remove("cheer"));
      }
    }
  } catch(e) {
    failJob(job);
    const code = e?.code; t.status = "failed";
    if (["not_granted","sampling_disabled","not_declared","capability_disabled"].includes(code)){ t.error = ERRMSG.not_granted; }
    else if (code === "refused"){ t.error = ERRMSG.refused; t.body = ""; }
    else t.error = ERRMSG[code] || "연결이 끊겼어요. 다시 지시해 주세요";
    const partial = e?.text || job.text;
    if (partial && !t.body) t.body = parse(partial).body || "";
    say(C, code === "cancelled" ? "…멈췄다" : "…으앙", 2200); say(R, "자리로 돌아가자.", 2200);
    log("rakko", `중단: ${t.error}`); progress(0, "대기 중이에요");
    save(); renderBoard(); renderResult(t);
    await Promise.all(ALL.map(c => walk(c, c.home)));
  }
  } finally {
    // 성공·실패·멈춤 어느 경우든 화면과 캐릭터 상태를 원래대로
    CREW.forEach(c => setWork(c, false, "")); ALL.forEach(c => { c.job = null; c.el.classList.remove("cheer"); });
    ctl = null; curJob = null; busy = false; $("stop").hidden = true; $("result").setAttribute("aria-busy", "false"); save(); renderBoard(); renderObjects();
  }
  pump();
}
function pump(){ if (busy) return; const next = tasks.find(t => t.status === "queued"); if (next) run(next); }

$("form").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("task").value.trim(); if (!v) return;
  tasks.push({id:"t"+Date.now().toString(36), task:v, status:"queued", at:Date.now()});
  $("task").value = ""; save(); renderBoard();
  if (busy){ log("rakko", `대기열에 추가: ${v.slice(0,30)}`); say(M.rakko, "순서대로 할게.", 1800); }
  pump();
});
$("task").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("form").requestSubmit(); });
// 멈추기: 답을 받는 중이면 요청을 취소하고, 이미 답을 다 받았으면 남은 연출만 건너뛰어요 (결과는 그대로 저장)
$("stop").onclick = () => {
  const j = curJob; if (!j) return;
  if (!j.streamDone) ctl?.abort();
  else if (!j.skipped){ j.skipped = true; j.failed = true; passJob(j); ALL.forEach(c => walk(c, c.home)); log("rakko", "남은 연출을 건너뛰었어요"); }
};

/* ---------- objects you can use (3D와 같은 이름·행동) ---------- */
// 지도 위 가구에 투명한 버튼(.hot, data-interactive-id)을 얹어요. 마우스·Enter·Space 모두 같은 useObject()로 가요.
const registry = createRegistry();
let picked = null;
function hot(id, name, fl, rect, actions, spot, opt = {}){
  const [x, y, w, h, H = 30] = rect;
  const b = document.createElement("button"); b.type = "button"; b.className = "hot"; b.dataset.interactiveId = id;
  b.style.cssText = U(x, y, w, h); b.style.translate = `0 0 ${cq(H + 1)}`;
  b.setAttribute("aria-label", `${name}: ${actions.map(k => ACTION_TEXT[k].name).join(", ")}`);
  MAPS[fl].appendChild(b);
  registry.register({id, name, floor:fl, actions, spot, object:b, ...opt});
}
hot("coffee", "커피머신", 1, [738,40,54,50,60], ["coffee"], SPOT.coffee);
hot("fridge1", "냉장고", 1, [885,30,62,70,110], ["snack"], SPOT.fridge);
hot("table1", "탕비실 식탁", 1, [780,262,120,26,26], ["meal", "snack"], () => rand(SPOT.snack));
hot("water", "정수기", 1, [676,298,22,18,30], ["water"], SPOT.water);
hot("stall1", "화장실 1번 칸", 1, [182,530,62,80,70], ["toilet"], SPOT.wc[0]);
hot("stall2", "화장실 2번 칸", 1, [260,530,62,80,70], ["toilet"], SPOT.wc[1]);
hot("sink", "세면대", 1, [185,395,120,30,30], ["wash"], {x:245, y:445});
hot("sofa1", "휴게실 소파", 1, [380,520,150,42,30], ["sofa"], () => rand(SPOT.sofa));
hot("bean", "빈백", 1, [360,465,52,40,18], ["sofa"], SPOT.bean);
hot("tv1", "휴게실 TV", 1, [590,380,84,20,22], ["tv"], SPOT.tv);
hot("shelf1", "왼쪽 책장", 1, [728,365,92,40,60], ["read"], SPOT.shelf[0]);
hot("shelf2", "오른쪽 책장", 1, [862,365,92,40,60], ["read"], SPOT.shelf[1]);
hot("printer", "프린터", 1, [806,575,70,32,30], ["print"], SPOT.printer);
hot("meet", "회의 테이블", 1, [70,150,180,50,26], ["meeting"], () => rand(SPOT.meet));
for (const [id, s] of Object.entries(SPOT.desk)) hot("desk-" + id, `${NAMES[id].replace(" 팀장", "")}의 책상`, 1, [s.x-58, s.y-68, 116, 44, 28], ["work"], s);
for (const [id, b] of Object.entries(BED)) hot("bed-" + id, `${(NAMES[id] || EXTRA[id].name).replace(" 팀장", "")}의 침대`, 2, [b.x-38, b.y-80, 76, 120, 22], ["nap", "sleep"], b);
hot("shower1", "샤워실 1번", 2, [180,535,64,60,4], ["shower"], DORM.shower[0]);
hot("shower2", "샤워실 2번", 2, [258,535,64,60,4], ["shower"], DORM.shower[1]);
hot("sofa2", "거실 소파", 2, [400,520,160,42,30], ["sofa"], () => rand(DORM.sofa));
hot("tv2", "거실 TV", 2, [580,380,100,20,22], ["tv"], DORM.tv);
hot("kitchen", "주방", 2, [345,365,120,36,34], ["meal"], () => rand(DORM.kitchen));
hot("dining", "식탁", 2, [470,490,90,40,16], ["meal", "snack"], {x:515, y:470});
hot("fridge2", "기숙사 냉장고", 2, [470,362,40,40,90], ["snack"], {x:490, y:420});
hot("console", "게임기", 3, [150,40,130,22,24], ["game"], HOBBY.game);
hot("easel", "이젤", 3, [50,150,60,30,26], ["draw"], HOBBY.easel);
hot("piano", "피아노", 3, [330,50,120,46,40], ["piano"], HOBBY.piano);
hot("boardtable", "보드게임 테이블", 3, [270,215,110,40,22], ["boardgame"], () => rand(HOBBY.board));
hot("seats", "영화관 좌석", 3, [560,150,360,140,20], ["movie"], () => rand(SEATS));
hot("lounger1", "선베드 1", 3, [520,540,70,50,14], ["sunbath"], TERRACE.lounger[0]);
hot("lounger2", "선베드 2", 3, [620,540,70,50,14], ["sunbath"], TERRACE.lounger[1]);
hot("bbq", "바비큐 그릴", 3, [720,395,70,40,44], ["bbq"], TERRACE.bbq);
hot("terrace", "테라스 테이블", 3, [270,430,280,50,30], ["bbq"], () => rand(TERRACE.table));
hot("view", "전망대", 3, [860,540,70,60,16], ["sightsee"], TERRACE.view);
hot("flowers", "꽃밭", 3, [190,600,710,16,16], ["sightsee"], TERRACE.flowers);
const spotOf = it => typeof it.spot === "function" ? it.spot() : it.spot;
// 할 수 없으면 이유
function whyNot(c, it){
  if (!c) return "먼저 캐릭터를 선택해 주세요";
  if (busy && CREW.includes(c)) return "지금은 업무 처리 중이에요. 끝난 뒤에 다시 해 주세요";
  return registry.disabledReason(it);
}
async function useObject(c, it, k){
  const why = whyNot(c, it); if (why){ notice(why); return false; }
  hideNotice();
  const A = ACTION_TEXT[k], ok = claim(c);
  log(c.id, objectActionLabel(it.name, k));
  say(c, `${A.emo} ${A.name}`, 1800);
  if (c.floor !== it.floor && !await ride(c, ok, it.floor)) return false;
  if (!await walk(c, spotOf(it)) || !ok()) return false;
  if (k === "nap" || k === "sleep"){ c.el.classList.add("sleep"); c.el.style.setProperty("--z", cq(24)); c.bub.style.setProperty("--z", cq(24)); say(c, "Zzz…", 0); }
  else say(c, rand(A.lines), 2600);
  await sleep(k === "sleep" ? 14000 : k === "movie" ? 10000 : 6000); if (!ok()) return false;
  c.el.classList.remove("sleep"); c.el.style.removeProperty("--z"); c.bub.style.removeProperty("--z");
  say(c, rand(A.lines), 2000); await sleep(2200); if (!ok()) return false;
  if (c.floor !== 1 && !await ride(c, ok, 1)) return false;
  await walk(c, c.home); if (ok()) c.job = null;
  return true;
}
// 캐릭터 고르기 (지도에서 눌러도, 아래 버튼으로도)
function pick(c){
  picked = picked === c ? null : c;
  ALL.forEach(o => o.el.classList.toggle("picked", o === picked));
  renderObjects();
  if (picked) say(picked, rand(["응?", "…!", "부르셨어요?", "왜~?"]), 1400);
}
ALL.forEach(c => { c.el.addEventListener("click", e => { e.stopPropagation(); pick(c); }); });
// 안내 상자: 선택이 없을 때 캐릭터 버튼, 여러 행동이면 행동 버튼
function notice(text, buttons = []){
  const n = $("notice"); n.replaceChildren(); n.hidden = false;
  const p = document.createElement("p"); p.style.margin = "0"; p.textContent = text; n.append(p);
  if (buttons.length){ const row = document.createElement("div"); row.className = "row"; for (const [label, fn] of buttons){ const b = document.createElement("button"); b.type = "button"; b.className = "pickbtn"; b.textContent = label; b.onclick = fn; row.append(b); } n.append(row); }
  const close = document.createElement("button"); close.type = "button"; close.className = "pickbtn"; close.textContent = "닫기"; close.onclick = hideNotice; n.append(close);
  n.querySelector("button")?.focus({preventScroll:true});
  clearTimeout(notice.t); if (!buttons.length) notice.t = setTimeout(hideNotice, 4000);
}
function hideNotice(){ $("notice").hidden = true; }
function tapObject(it){
  if (!picked){
    notice(`${it.name}: 먼저 캐릭터를 선택해 주세요`, ALL.map(c => [c.name, () => { pick(c); tapObject(it); }]));
    return;
  }
  const why = whyNot(picked, it); if (why) return notice(why);
  if (it.actions.length === 1) return useObject(picked, it, it.actions[0]);
  notice(`${picked.name}에게 시킬 행동 (${it.name})`, it.actions.map(k => [objectActionLabel(it.name, k), () => useObject(picked, it, k)]));
}
document.querySelector(".stage").addEventListener("click", e => {
  const b = e.target.closest(".hot"); if (!b) return;
  const it = registry.get(b.dataset.interactiveId); if (it) tapObject(it);
});
// 키보드용 목록: 지금 보는 층의 사물 버튼
function renderObjects(){
  const box = $("objList"); if (!box || box.contains(document.activeElement)) { renderObjects.dirty = true; return; }
  renderObjects.dirty = false;
  $("pickRow").querySelectorAll(".pickbtn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === picked?.id)));
  $("objFloor").textContent = `${viewFloor}층`;
  box.replaceChildren(...registry.list(it => it.floor === viewFloor).flatMap(it => it.actions.map(k => {
    const b = document.createElement("button"); b.type = "button"; b.className = "objbtn"; b.dataset.obj = it.id; b.dataset.a = k;
    b.textContent = objectActionLabel(it.name, k);
    const why = whyNot(picked, it); if (why){ b.setAttribute("aria-disabled", "true"); const sm = document.createElement("small"); sm.textContent = why; b.append(sm); }
    return b;
  })));
}
$("pickRow").replaceChildren(...ALL.map(c => { const b = document.createElement("button"); b.type = "button"; b.className = "pickbtn"; b.dataset.id = c.id; b.textContent = c.name; b.setAttribute("aria-pressed", "false"); b.onclick = () => pick(c); return b; }));
$("objList").addEventListener("click", e => {
  const b = e.target.closest(".objbtn"); if (!b) return;
  const it = registry.get(b.dataset.obj); if (!it) return;
  if (b.getAttribute("aria-disabled") === "true") return notice(whyNot(picked, it) || "지금은 할 수 없어요");
  useObject(picked, it, b.dataset.a);
});
$("objList").addEventListener("focusout", () => setTimeout(() => { if (renderObjects.dirty) renderObjects(); }, 0));
document.querySelector(".floors").addEventListener("click", () => setTimeout(renderObjects, 0));
addEventListener("keydown", e => { if (e.key === "Escape") hideNotice(); });
// 지도 크기: 화면에 맞춤 ↔ 확대 보기(옆으로 밀기)
$("fitBtn").onclick = () => {
  const fit = !$("mapwrap").classList.contains("fit");
  $("mapwrap").classList.toggle("fit", fit); $("fitBtn").setAttribute("aria-pressed", String(fit));
  $("fitBtn").textContent = fit ? "확대 보기" : "화면에 맞춤";
  $("maphint").textContent = fit ? "지도를 화면 너비에 맞췄어요." : "지도는 옆으로 밀어서 볼 수 있어요.";
};
showFloor(viewFloor); renderObjects();

const SUG = ["다음 주 제주도 2박 3일 여행 일정 짜줘","신입사원 환영 메일 써줘","카페 창업 체크리스트 만들어줘","블로그 글 제목 5개 추천해줘"];
$("chips").replaceChildren(...SUG.map(s => { const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = s; return b; }));
$("chips").addEventListener("click", e => { const c = e.target.closest(".chip"); if (c){ $("task").value = c.textContent; $("task").focus(); } });

renderBoard();
const sel = tasks.find(t => t.id === selected); if (sel) renderResult(sel);
window.__office2d = {tasks, M, ALL, registry, useObject, pick, get busy(){ return busy; }, get picked(){ return picked; }};   // 시험용
log("rakko", "출근 완료. 업무를 기다리는 중");
setTimeout(() => say(M.hachiware, "오늘도 힘내자~!", 2600), 600);
setTimeout(() => { if (!busy && !M.usagi.job) wander(M.usagi); }, 1800);
pump();
