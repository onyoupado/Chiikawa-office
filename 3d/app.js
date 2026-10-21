// 치이카와 오피스 3D: 3층 건물, 엘리베이터·에스컬레이터, 욕구·감정·관계·하루 흐름, 과업·레벨·코인·상점, 이벤트, 대화, 업무 지시
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { ROLES, SESSIONS } from "./worklog.js";

const $ = id => document.getElementById(id);
const rand = a => a[Math.floor(Math.random() * a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const esc = s => String(s).replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const view = $("view");
// 받침에 따라 조사 고르기: josa("왕관", "을를") → "왕관을"
function josa(w, pair){
  const ch = String(w).trim().slice(-1).charCodeAt(0) - 0xAC00, has = ch >= 0 && ch <= 11171 ? ch % 28 : -1;
  if (pair === "으로") return w + (has === 0 || has === 8 || has < 0 ? "로" : "으로");
  const [a, b] = [...pair]; return w + (has > 0 ? a : b);
}

/* ================= renderer, camera, lights ================= */
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
catch (e) { view.insertAdjacentHTML("beforeend", `<div class="err">이 브라우저에서는 3D 화면(WebGL)을 켤 수 없어요.<br><a href="./">2D 사무실로 가기</a></div>`); throw e; }
const MOBILE = matchMedia("(pointer: coarse)").matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.75 : 2));
renderer.shadowMap.enabled = !MOBILE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.prepend(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none";
view.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#dfeaff");
const camera = new THREE.PerspectiveCamera(40, 1, 5, 9000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = 1.5; controls.minDistance = 160; controls.maxDistance = 3600;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
function resize(){
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
const hemi = new THREE.HemisphereLight("#ffffff", "#c9c2d8", 1.6); scene.add(hemi);
const sun = new THREE.DirectionalLight("#fff6e8", 1.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -720, right: 720, top: 480, bottom: -480, near: 50, far: 2600 });
sun.shadow.bias = -0.0008; scene.add(sun); scene.add(sun.target);

/* ================= world helpers ================= */
const BX0 = -12, BX1 = 1192, BY0 = -12, BY1 = 652;            // 건물 외곽
const CX = 590, CY = 320, FH = 150;               // 논리 좌표 x 0~1180, y 0~640, 층 높이 150
const fy = f => (f - 1) * FH;
const W = (x, y, f = 1) => new THREE.Vector3(x - CX, fy(f), y - CY);
const G = {1: new THREE.Group(), 2: new THREE.Group(), 3: new THREE.Group()};
Object.values(G).forEach(g => scene.add(g));
const LABELS = {1: [], 2: [], 3: []};
const MATS = {};
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); return MATS[k] || (MATS[k] = new THREE.MeshStandardMaterial({ color: c, roughness: .85, ...o })); };
const GLASS = new THREE.MeshStandardMaterial({ color: "#bfe3ff", transparent: true, opacity: .32, roughness: .1, depthWrite: false });
function addTo(f, m){ (f === "scene" ? scene : G[f]).add(m); return m; }
function box(f, x, y, w, h, H, color, lift = 0, material){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, h), material || mat(color));
  m.position.copy(W(x + w / 2, y + h / 2, f)); m.position.y += lift + H / 2;
  m.castShadow = m.receiveShadow = true; return addTo(f, m);
}
function cyl(f, x, y, r, H, color, lift = 0, r2 = r, seg = 20){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, H, seg), mat(color));
  m.position.copy(W(x, y, f)); m.position.y += lift + H / 2; m.castShadow = m.receiveShadow = true; return addTo(f, m);
}
function ball(f, x, y, r, color, lift = 0, sy = 1, o){
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat(color, o)); m.scale.y = sy;
  m.position.copy(W(x, y, f)); m.position.y += lift; m.castShadow = true; return addTo(f, m);
}
function plane(f, x, y, w, h, color, lift = .5){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(color));
  m.rotation.x = -Math.PI / 2; m.position.copy(W(x + w / 2, y + h / 2, f)); m.position.y += lift; m.receiveShadow = true; return addTo(f, m);
}
function canvasPanel(f, w, h, draw, px = 4){
  const cv = document.createElement("canvas"); cv.width = w * px; cv.height = h * px;
  const ctx = cv.getContext("2d"); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.redraw = (...a) => { ctx.setTransform(px, 0, 0, px, 0, 0); draw(ctx, w, h, ...a); tex.needsUpdate = true; };
  m.redraw(); return addTo(f, m);
}
const placeAt = (m, x, y, f, h) => { m.position.copy(W(x, y, f)); m.position.y += h; return m; };
function label(f, text, x, y, H, cls = "rlab"){
  const d = document.createElement("div"); d.className = cls; d.textContent = text;
  const o = new CSS2DObject(d); o.position.copy(W(x, y, f)); o.position.y += H; scene.add(o); LABELS[f].push(o); return o;
}
function plant(f, x, y, big = false){
  cyl(f, x, y, big ? 14 : 10, big ? 22 : 16, "#c98b5e", 0, big ? 11 : 8);
  const g = new THREE.Mesh(new THREE.IcosahedronGeometry(big ? 24 : 16, 1), mat("#7cc29a"));
  placeAt(g, x, y, f, (big ? 22 : 16) + (big ? 20 : 13)); g.castShadow = true; addTo(f, g); return g;
}
function sofa(f, x, y, w, col = "#ff9fb8"){
  box(f, x, y, w, 42, 22, col); box(f, x, y + 30, w, 12, 50, col); box(f, x, y, 14, 42, 34, col); box(f, x + w - 14, y, 14, 42, 34, col);
  for (let i = 0; i < Math.round(w / 50); i++) box(f, x + 18 + i * 42, y + 15, 34, 12, 12, "#fff3f6", 22);
}

/* ================= floor plans ================= */
const FLOORS = {
  1:{name:"1F 사무실", rooms:{
    meeting:{name:"회의실",x:20,y:20,w:280,h:270,door:160,c:"#ece6fb"},
    work:{name:"업무 공간",x:300,y:20,w:400,h:270,door:500,c:"#e2eefa"},
    pantry:{name:"탕비실",x:700,y:20,w:280,h:270,door:840,c:"#fdf3d2"},
    elevator:{name:"엘리베이터",x:20,y:350,w:150,h:270,door:132,c:"#e3e7ee"},
    restroom:{name:"화장실",x:170,y:350,w:160,h:270,door:250,c:"#dff3ec"},
    lounge:{name:"휴게실",x:330,y:350,w:370,h:270,door:515,c:"#fde4ec"},
    archive:{name:"자료실",x:700,y:350,w:280,h:270,door:840,c:"#f3eadf"},
  }},
  2:{name:"2F 기숙사", rooms:{
    bed1:{name:"치이카와·하치와레 방",x:20,y:20,w:250,h:270,door:145,c:"#fdeef3"},
    bed2:{name:"우사기 방",x:270,y:20,w:210,h:270,door:375,c:"#fdf6dc"},
    bed3:{name:"랏코 방",x:480,y:20,w:220,h:270,door:590,c:"#f1e8de"},
    bed4:{name:"쿠리만쥬·시사 방",x:700,y:20,w:280,h:270,door:840,c:"#fbeede"},
    elevator:{name:"엘리베이터",x:20,y:350,w:150,h:270,door:132,c:"#e3e7ee"},
    bath:{name:"샤워실",x:170,y:350,w:160,h:270,door:250,c:"#dff3ec"},
    living:{name:"공용 거실",x:330,y:350,w:370,h:270,door:515,c:"#fde4ec"},
    bed5:{name:"모몽가·카니 방",x:700,y:350,w:280,h:270,door:840,c:"#e9f0fb"},
  }},
  3:{name:"3F 취미층", rooms:{
    hobby:{name:"취미방",x:20,y:20,w:460,h:270,door:250,c:"#eef6e6"},
    cinema:{name:"영화관",x:480,y:20,w:500,h:270,door:730,c:"#3a2f52"},
    elevator:{name:"엘리베이터",x:20,y:350,w:150,h:270,door:132,c:"#e3e7ee"},
    terrace:{name:"외부 테라스",x:170,y:350,w:810,h:270,door:540,c:"#d9b48a",outdoor:true},
  }},
};
const isTop = r => r.y < CY;
const inner = r => isTop(r) ? r.y + r.h - 22 : r.y + 22;
const HOLE = {2:{x0:1015,x1:1125,y0:40,y1:292}, 3:{x0:1015,x1:1125,y0:338,y1:586}};
const WALL = "#d6dcea", WH = 60, WT = 6;
function slab(f){
  const T = 8, c = "#e9edf4";
  if (f === 1){ plane(1, BX0, BY0, BX1 - BX0, BY1 - BY0, "#dfe5ee", 0); return; }
  const h = HOLE[f];
  const parts = [[0,0,990,640],[990,0,h.x0-990,640],[h.x1,0,1180-h.x1,640],[h.x0,0,h.x1-h.x0,h.y0],[h.x0,h.y1,h.x1-h.x0,640-h.y1]];
  for (const [x, y, w, hh] of parts) box(f, x, y, w, hh, T, c, -T);
  // 구멍 둘레 유리 난간 (에스컬레이터가 도착하는 쪽은 비워 둬요)
  box(f, h.x0 - 3, h.y0, 3, h.y1 - h.y0, 26, null, 0, GLASS); box(f, h.x1, h.y0, 3, h.y1 - h.y0, 26, null, 0, GLASS);
  box(f, h.x0, h.y0 - 3, h.x1 - h.x0, 3, 26, null, 0, GLASS);
}
for (const f of [1, 2, 3]){
  slab(f);
  plane(f, 990, 20, 190, 600, "#eef1f6", .3);
  label(f, "에스컬레이터", 1085, 618, 4);
  for (const [k, r] of Object.entries(FLOORS[f].rooms)){
    plane(f, r.x, r.y, r.w, r.h, r.c, .5);
    const gap = door => door ? [[r.x, door - 34], [door + 34, r.x + r.w]] : [[r.x, r.x + r.w]];
    if (r.outdoor){       // 테라스: 벽 대신 유리 난간
      for (const [a, b] of gap(r.door)) box(f, a, r.y - 2, b - a, 3, 24, null, 0, GLASS);
      box(f, r.x, r.y + r.h - 2, r.w, 3, 24, null, 0, GLASS); box(f, r.x + r.w - 2, r.y, 3, r.h, 24, null, 0, GLASS);
    } else {
      for (const [a, b] of gap(isTop(r) ? 0 : r.door)) box(f, a, r.y - WT / 2, b - a, WT, WH, WALL);
      for (const [a, b] of gap(isTop(r) ? r.door : 0)) box(f, a, r.y + r.h - WT / 2, b - a, WT, WH * .35, WALL);
      box(f, r.x + r.w - WT / 2, r.y, WT, r.h, WH, WALL);
    }
    box(f, r.x - WT / 2, r.y, WT, r.h, WH, WALL);
    label(f, r.name, r.x + 14 + r.name.length * 7, r.y + 24, 4);
  }
}

/* ================= furniture & spots ================= */
const S1 = {}, S2 = {}, S3 = {};
const P = (f, x, y) => ({f, x, y});
/* 1F */
box(1, 70, 150, 180, 50, 26, "#e8d2b4");
box(1, 82, 162, 34, 22, 2, "#3a3f55", 26); box(1, 130, 165, 22, 16, 1, "#ffffff", 26); box(1, 160, 165, 22, 16, 1, "#ffffff", 26);
cyl(1, 200, 172, 3, 12, "#9fd3f5", 26); cyl(1, 212, 172, 3, 12, "#9fd3f5", 26);
for (const x of [84, 134, 184, 234]) box(1, x - 10, 128, 20, 16, 16, "#aeb7c8");
const history = [];
const board = canvasPanel(1, 240, 90, (g, w, h, items = ["업무를 기다리는 중"]) => {
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.strokeStyle = "#aeb7c8"; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = "#2d3149"; g.font = "bold 14px Gaegu, sans-serif"; g.fillText("명령 기록", 10, 20);
  g.font = "11px 'Gowun Dodum', sans-serif"; items.slice(-5).forEach((t, i) => g.fillText("• " + t.slice(0, 30), 12, 38 + i * 12));
});
placeAt(board, 160, 26, 1, 62);
plant(1, 40, 272);
const NAMES = {rakko:"랏코", chiikawa:"치이카와", hachiware:"하치와레", usagi:"우사기", momonga:"모몽가", kurimanju:"쿠리만쥬", shisa:"시사", kani:"카니"};
const DESK = {rakko:P(1,420,100), chiikawa:P(1,580,100), hachiware:P(1,420,205), usagi:P(1,580,205)};
const MUG = {rakko:"#a87a52", chiikawa:"#ff8fb1", hachiware:"#6f9fd8", usagi:"#f2cf4a"};
const monitors = {};
for (const [id, s] of Object.entries(DESK)){
  box(1, s.x - 58, s.y - 68, 116, 44, 28, "#ffffff");
  box(1, s.x - 30, s.y - 40, 60, 14, 1.5, "#e3e7ee", 28); cyl(1, s.x + 42, s.y - 36, 4, 9, MUG[id], 28); box(1, s.x - 4, s.y - 62, 8, 6, 14, "#aeb7c8", 28);
  const m = canvasPanel(1, 78, 46, (g, w, h, text = NAMES[id] + "\n휴식 중") => {
    g.fillStyle = "#2b3d6b"; g.fillRect(0, 0, w, h); g.fillStyle = "#eaf3ff"; g.fillRect(3, 3, w - 6, h - 6);
    g.fillStyle = "#43608f"; g.font = "bold 10px 'Gowun Dodum', sans-serif"; String(text).split("\n").slice(0, 3).forEach((t, i) => g.fillText(t.slice(0, 12), 7, 16 + i * 12));
  });
  placeAt(m, s.x, s.y - 58, 1, 65); m.rotation.x = -0.12; monitors[id] = m;
}
box(1, 738, 40, 54, 50, 60, "#5d6578"); box(1, 752, 90, 26, 2, 22, "#2b2d3a", 6); cyl(1, 765, 80, 5, 9, "#ffffff", 8);
const coffeeLight = ball(1, 765, 91, 3, "#ff6b6b", 48, 1, { emissive: "#ff3b3b", emissiveIntensity: 1 });
box(1, 885, 30, 62, 70, 110, "#c9d0dc"); box(1, 935, 100, 3, 6, 30, "#9aa6c4", 50); box(1, 935, 100, 3, 6, 18, "#9aa6c4", 20);
box(1, 800, 40, 70, 40, 34, "#e8d2b4"); cyl(1, 815, 60, 8, 16, "#e9edf3", 34); cyl(1, 845, 60, 5, 9, "#ffffff", 34); cyl(1, 858, 60, 5, 9, "#6f9fd8", 34);
box(1, 780, 262, 120, 26, 26, "#e8d2b4"); cyl(1, 830, 275, 12, 2, "#ffffff", 26);
plant(1, 720, 268);
for (const x of [182, 260]){ box(1, x, 530, 62, 80, 70, "#f3f5fa"); box(1, x + 48, 610, 5, 2, 8, "#9aa6c4", 30); box(1, x + 25, 610, 12, 2, 5, "#3f9d6b", 60); }
box(1, 185, 395, 120, 30, 30, "#ffffff"); cyl(1, 212, 410, 12, 2, "#cfe3f3", 30); cyl(1, 275, 410, 12, 2, "#cfe3f3", 30); box(1, 190, 352, 110, 3, 30, "#cfe6fa", 40);
plane(1, 380, 470, 260, 110, "#ffd7e3", .8);
sofa(1, 380, 560, 150);
ball(1, 386, 485, 26, "#f2cf4a", 12, .55);
box(1, 590, 380, 84, 20, 22, "#e8d2b4");
placeAt(canvasPanel(1, 74, 46, (g, w, h) => { g.fillStyle = "#1f2337"; g.fillRect(0, 0, w, h); g.fillStyle = "#9fe3c0"; g.font = "bold 10px monospace"; g.fillText("♪ ON AIR", 14, 27); }), 632, 388, 1, 48);
box(1, 430, 500, 70, 30, 14, "#e8d2b4"); box(1, 442, 506, 20, 16, 1, "#ffffff", 14); box(1, 470, 506, 20, 16, 1, "#ffe0ea", 14);
plant(1, 675, 585, true);
const BOOKS = ["#e57373", "#64b5f6", "#ffd54f", "#81c784", "#ba68c8", "#ff8a65"];
for (const sx of [728, 862]){ box(1, sx, 365, 92, 40, 100, "#c9a77e"); for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) box(1, sx + 5 + i * 9.4, 402, 7, 4, 24, BOOKS[(i + r) % 6], 6 + r * 32); }
box(1, 806, 575, 70, 32, 30, "#c9d0dc"); box(1, 820, 580, 30, 18, 2, "#ffffff", 30); box(1, 720, 560, 46, 40, 56, "#aeb7c8");
box(1, 676, 298, 22, 18, 30, "#ffffff"); cyl(1, 687, 307, 7, 18, "#8ec5ee", 30); plant(1, 962, 312);
box(1, 130, 380, 30, 6, 40, "#5d6578", 30);                          // 배전반 (정전 이벤트)
Object.assign(S1, {
  coffee:[P(1,765,115),P(1,745,120)], fridge:[P(1,915,125),P(1,890,130)], table:[P(1,800,240),P(1,860,240),P(1,830,302)], counter:[P(1,835,100)],
  water:[P(1,690,330)], stall:[P(1,212,505),P(1,290,505)], sink:[P(1,212,445),P(1,275,445)], sofa:[P(1,420,545),P(1,480,545)], bean:[P(1,385,470)],
  tv:[P(1,610,455),P(1,650,455),P(1,560,470)], shelf:[P(1,770,450),P(1,905,450)], printer:[P(1,840,550)],
  meet:[[90,130],[230,130],[90,235],[230,235],[45,180],[275,180],[120,275],[200,275]].map(([x, y]) => P(1, x, y)),
  corridor:[P(1,300,CY),P(1,560,CY),P(1,880,CY)], panel:[P(1,145,415)],
});
/* 2F */
const BED = {chiikawa:P(2,80,200), hachiware:P(2,210,200), usagi:P(2,375,200), rakko:P(2,590,200), kurimanju:P(2,770,200), shisa:P(2,910,200), momonga:P(2,770,560), kani:P(2,910,560)};
const BLANKET = {chiikawa:"#ffd3df", hachiware:"#cfe0f5", usagi:"#fde9a8", rakko:"#e3cdb3", kurimanju:"#f2d7a8", shisa:"#ffc9a8", momonga:"#d8ecf7", kani:"#ffc4cf"};
const lamps = [];
for (const [id, b] of Object.entries(BED)){
  const top = b.y < CY;
  const by = top ? b.y - 80 : b.y - 40;              // 아래층 방은 침대 머리가 아래쪽
  box(2, b.x - 38, by, 76, 120, 18, "#fffaf2"); box(2, b.x - 34, by + (top ? 40 : 4), 68, 76, 5, BLANKET[id], 18);
  box(2, b.x - 24, by + (top ? 6 : 92), 48, 22, 7, "#ffffff", 18); box(2, b.x - 38, top ? by - 8 : by + 120, 76, 8, 46, "#c9a77e");
}
for (const [x, y] of [[120,40],[420,40],[830,40],[930,372],[650,40]]){
  box(2, x, y, 40, 30, 40, "#c9a77e"); cyl(2, x + 20, y + 15, 3, 16, "#9aa6c4", 40);
  lamps.push(ball(2, x + 20, y + 15, 9, "#ffe8a3", 62, .8, { emissive: "#ffd36b", emissiveIntensity: .2 }));
}
box(2, 520, 40, 44, 30, 90, "#c9a77e"); box(2, 300, 40, 44, 24, 60, "#c9a77e");
for (const [x, y, w] of [[40,215,200],[300,215,150],[520,215,150],[730,220,220],[730,420,220]]) plane(2, x, y, w, 60, "#ffd7e3", .8);
for (const x of [180, 258]){
  box(2, x + 4, 534, 56, 62, 4, "#cfe6fa");
  box(2, x, 530, 64, 3, 90, null, 0, GLASS); box(2, x, 598, 64, 3, 90, null, 0, GLASS); box(2, x + 61, 530, 3, 70, 90, null, 0, GLASS);
  cyl(2, x + 32, 536, 5, 4, "#aeb7c8", 84);
}
box(2, 200, 360, 90, 4, 20, "#ffd3df", 46);
plane(2, 400, 470, 240, 100, "#ffd7e3", .8);
sofa(2, 400, 560, 160);
box(2, 470, 490, 90, 40, 16, "#e8d2b4"); cyl(2, 500, 510, 10, 2, "#ffffff", 16);
box(2, 580, 380, 100, 20, 22, "#e8d2b4");
placeAt(canvasPanel(2, 90, 52, (g, w, h) => { g.fillStyle = "#1f2337"; g.fillRect(0, 0, w, h); g.fillStyle = "#ffd36b"; g.font = "bold 10px 'Gowun Dodum', sans-serif"; g.fillText("♪ 오늘의 노래", 12, 30); }), 630, 388, 2, 50);
box(2, 345, 365, 120, 36, 34, "#e8d2b4"); cyl(2, 370, 383, 12, 2, "#cfe3f3", 34); cyl(2, 420, 383, 9, 2, "#2b2d3a", 34); cyl(2, 445, 383, 9, 2, "#2b2d3a", 34);
box(2, 470, 362, 40, 40, 90, "#c9d0dc");
plant(2, 675, 585, true);
Object.assign(S2, {
  shower:[P(2,212,560),P(2,290,560)], sofa:[P(2,430,540),P(2,500,540)], tv:[P(2,620,470)], kitchen:[P(2,380,430),P(2,440,430)],
  fridge:[P(2,490,420)], table:[P(2,515,470)], window:[P(2,600,575)],
});
/* 3F */
box(3, 150, 40, 130, 22, 24, "#c9a77e");
placeAt(canvasPanel(3, 110, 62, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#2b3d6b"); gr.addColorStop(1, "#1b2a4a"); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "#ffe066"; g.font = "bold 12px Gaegu, sans-serif"; g.fillText("▶ PLAYER 1", 22, 36); }), 215, 46, 3, 56);
ball(3, 188, 208, 24, "#f2cf4a", 10, .55); ball(3, 248, 208, 24, "#9fd3c7", 10, .55);
box(3, 66, 160, 4, 4, 70, "#8a5a3a"); box(3, 92, 160, 4, 4, 70, "#8a5a3a");
placeAt(canvasPanel(3, 44, 40, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); [["#ff8fb1", 14, 14, 8], ["#6f9fd8", 28, 22, 10], ["#7cc29a", 20, 32, 6]].forEach(([c, x, y, r]) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }); }), 81, 166, 3, 55).rotation.x = -.25;
box(3, 330, 50, 120, 46, 40, "#2b2d3a"); box(3, 336, 52, 108, 16, 3, "#ffffff", 40); box(3, 330, 50, 120, 6, 50, "#2b2d3a", 40); box(3, 380, 100, 40, 16, 22, "#2b2d3a");
box(3, 270, 215, 110, 40, 22, "#c9a77e"); box(3, 292, 219, 66, 32, 1, "#ff8fb1", 22); box(3, 325, 219, 33, 16, 1.5, "#6f9fd8", 22); box(3, 292, 235, 33, 16, 1.5, "#f2cf4a", 22);
box(3, 400, 200, 60, 30, 70, "#c9a77e"); plant(3, 455, 60);
const screenTex = canvasPanel(3, 370, 110, (g, w, h, t = 0) => {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${220 + Math.sin(t) * 30},45%,22%)`); gr.addColorStop(1, `hsl(${280 + Math.cos(t) * 30},40%,26%)`);
  g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.textAlign = "center"; g.font = "bold 30px Gaegu, sans-serif"; g.fillText("▶ 치이카와 극장판", w / 2, 55); g.font = "14px 'Gowun Dodum', sans-serif"; g.fillText("상영 중", w / 2, 82); g.textAlign = "left";
}, 2);
placeAt(screenTex, 730, 30, 3, 80);
box(3, 500, 26, 40, 8, 150, "#b02a3a"); box(3, 920, 26, 40, 8, 150, "#b02a3a");
const SEATS = [];
[[160, 0], [210, 10], [255, 20]].forEach(([y, up], r) => {
  box(3, 560, y + 4, 360, 40, 4 + up, "#3b2a3a");
  for (let i = 0; i < (r === 1 ? 4 : 5); i++){ const x = 600 + i * 80 + (r === 1 ? 40 : 0); box(3, x - 22, y, 44, 26, 16, "#c0392b", up); box(3, x - 22, y + 22, 44, 8, 40, "#c0392b", up); SEATS.push(P(3, x, y - 2)); }
});
box(3, 500, 215, 50, 40, 50, "#d63a3a"); box(3, 504, 219, 42, 32, 36, null, 50, GLASS); ball(3, 525, 235, 12, "#fff6c9", 62, .7);
for (const x of [270, 410]){
  cyl(3, x + 45, 455, 30, 30, "#ffffff"); cyl(3, x + 45, 455, 2, 110, "#eeeeee");
  const can = new THREE.Mesh(new THREE.ConeGeometry(58, 20, 16), new THREE.MeshStandardMaterial({ color: "#ff8fb1", transparent: true, opacity: .85 }));
  placeAt(can, x + 45, 455, 3, 118); can.castShadow = true; addTo(3, can);
  for (const dx of [-12, 102]) box(3, x + dx - 11, 444, 22, 22, 18, "#aeb7c8");
}
for (const x of [520, 620]){ box(3, x, 540, 70, 50, 14, "#f4f1ea"); box(3, x, 580, 70, 14, 30, "#ffb2c4"); }
box(3, 720, 395, 70, 40, 44, "#3a3f55"); box(3, 726, 400, 58, 30, 2, "#ff8a5b", 44);
for (let x = 190; x < 900; x += 118){ box(3, x, 600, 100, 16, 16, "#7cc29a"); for (let i = 0; i < 4; i++) ball(3, x + 14 + i * 24, 608, 5, i % 2 ? "#b39ddb" : "#ff8fb1", 20); }
plant(3, 860, 420, true); plant(3, 950, 520, true); plant(3, 205, 545, true);
Object.assign(S3, {
  game:[P(3,215,250),P(3,190,255)], easel:[P(3,80,235)], piano:[P(3,400,150)], board:[P(3,290,278),P(3,360,278)], seats:SEATS,
  table:[P(3,300,500),P(3,440,500)], lounger:[P(3,555,565),P(3,655,565)], bbq:[P(3,755,470)], flowers:[P(3,520,592)], view:[P(3,900,560)], sword:[P(3,880,480),P(3,820,520)],
});

/* night lights: 층마다 따뜻한 조명 두 개 */
const NIGHT = [];
for (const f of [1, 2, 3]) for (const x of [300, 820]){
  const l = new THREE.PointLight("#ffd9a0", 0, 900, 1); l.position.copy(W(x, CY, f)); l.position.y += 120; addTo(f, l); NIGHT.push(l);
}

/* ================= elevators & escalators ================= */
const ELEV = {};
for (const f of [1, 2, 3]){
  box(f, 30, 452, 62, 80, 78, "#aeb7c8");
  const l = box(f, 36, 532, 25, 2, 62, "#c9d0dc"), r = box(f, 61, 532, 25, 2, 62, "#c9d0dc");
  const ind = canvasPanel(f, 26, 10, (g, w, h, t = `${f}F`) => { g.fillStyle = "#1f2337"; g.fillRect(0, 0, w, h); g.fillStyle = "#ffcf66"; g.font = "bold 8px monospace"; g.fillText(t, 7, 8); });
  placeAt(ind, 61, 533.5, f, 70);
  ELEV[f] = {l, r, ind, lx: l.position.x, rx: r.position.x, open: 0, want: 0};
}
const ELEV_FRONT = {x:122, y:578}, ELEV_IN = {x:61, y:505};
const ESC = [
  {id:"12u", lane:1040, f0:1, y0:45, f1:2, y1:300, before:[{x:1010,y:45}], after:[{x:1010,y:310}]},
  {id:"12d", lane:1100, f0:2, y0:300, f1:1, y1:45, before:[{x:1155,y:310}], after:[{x:1155,y:45}]},
  {id:"23u", lane:1040, f0:2, y0:340, f1:3, y1:590, before:[{x:1010,y:335}], after:[{x:1010,y:600}]},
  {id:"23d", lane:1100, f0:3, y0:590, f1:2, y1:340, before:[{x:1155,y:600}], after:[{x:1155,y:335}]},
];
const stepCanvas = document.createElement("canvas"); stepCanvas.width = 32; stepCanvas.height = 32;
{ const g = stepCanvas.getContext("2d"); g.fillStyle = "#8a93a8"; g.fillRect(0, 0, 32, 32); g.fillStyle = "#5d6578"; g.fillRect(0, 0, 32, 5); g.fillStyle = "#ffd36b"; g.fillRect(0, 0, 2, 32); g.fillRect(30, 0, 2, 32); }
for (const e of ESC){
  const up = e.f1 > e.f0, low = up ? [e.y0, e.f0] : [e.y1, e.f1], high = up ? [e.y1, e.f1] : [e.y0, e.f0];
  const dy = high[0] - low[0], L = Math.hypot(dy, FH), a = Math.atan2(FH, dy);
  const g = new THREE.Group(); g.position.copy(W(e.lane, (low[0] + high[0]) / 2, 1)); g.position.y = (fy(low[1]) + fy(high[1])) / 2; g.rotation.x = -a;
  const body = new THREE.Mesh(new THREE.BoxGeometry(40, 10, L), mat("#c9d0dc")); body.position.y = -2; body.castShadow = body.receiveShadow = true; g.add(body);
  const tex = new THREE.CanvasTexture(stepCanvas); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, L / 14); tex.colorSpace = THREE.SRGBColorSpace;
  const steps = new THREE.Mesh(new THREE.PlaneGeometry(34, L), new THREE.MeshStandardMaterial({ map: tex })); steps.rotation.x = -Math.PI / 2; steps.position.y = 3.2; g.add(steps);
  for (const sx of [-19, 19]){
    const gl = new THREE.Mesh(new THREE.BoxGeometry(2, 22, L), GLASS); gl.position.set(sx, 14, 0); g.add(gl);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(4, 3, L + 6), mat("#2b2d3a")); rail.position.set(sx, 26, 0); g.add(rail);
  }
  scene.add(g); e.group = g; e.tex = tex; e.dir = up ? 1 : -1; e.start = {x:e.lane, y:e.y0, f:e.f0}; e.end = {x:e.lane, y:e.y1, f:e.f1};
  label(e.f0, `${up ? "▲" : "▼"} ${e.f1}층`, e.lane, e.y0 + (e.y0 < e.y1 ? -14 : 14), 6);
}

/* ================= glass building exterior & street ================= */
const FRONT = [], STREETLIGHTS = [];
const ROOF = new THREE.Group(); scene.add(ROOF);
const CITY = new THREE.Group(); scene.add(CITY);
const GLASS2 = new THREE.MeshStandardMaterial({ color:"#a9d4ff", transparent:true, opacity:.16, roughness:.05, metalness:.3, depthWrite:false, side:THREE.DoubleSide });
const FRAME = mat("#5d6578", { metalness:.4, roughness:.4 });
function facade(f){
  const y0 = fy(f), H = FH - 8, add = (m, front) => { addTo(f, m); if (front) FRONT.push(m); return m; };
  const sides = [[BX0, BY1, BX1, BY1, true], [BX0, BY0, BX1, BY0, false], [BX0, BY0, BX0, BY1, false], [BX1, BY0, BX1, BY1, false]];
  for (const [x0, z0, x1, z1, front] of sides){
    const horiz = z0 === z1, len = horiz ? x1 - x0 : z1 - z0;
    const g = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 2, H, horiz ? 2 : len), GLASS2);
    g.position.copy(W(horiz ? (x0 + x1) / 2 : x0, horiz ? z0 : (z0 + z1) / 2, f)); g.position.y = y0 + H / 2; g.renderOrder = 2; add(g, front);
    for (let s = 0; s <= len; s += 60){                         // 세로 창틀
      const m = new THREE.Mesh(new THREE.BoxGeometry(3, H, 3), FRAME);
      m.position.copy(W(horiz ? x0 + s : x0, horiz ? z0 : z0 + s, f)); m.position.y = y0 + H / 2; add(m, front);
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len + 6 : 6, 8, horiz ? 6 : len + 6), mat("#e4e8f0"));   // 층 띠
    band.position.copy(W(horiz ? (x0 + x1) / 2 : x0, horiz ? z0 : (z0 + z1) / 2, f)); band.position.y = y0 - 4; band.castShadow = true; add(band, front);
  }
}
[1, 2, 3].forEach(facade);
{ // 지붕과 옥상 간판 (건물 전체를 볼 때만)
  const r = new THREE.Mesh(new THREE.BoxGeometry(BX1 - BX0 + 10, 10, BY1 - BY0 + 10), mat("#e4e8f0")); r.position.set((BX0 + BX1) / 2 - CX, fy(4) - 3, (BY0 + BY1) / 2 - CY); r.castShadow = true; ROOF.add(r);
  const sign = canvasPanel("scene", 320, 60, (g, w, h) => { g.fillStyle = "#2d3149"; g.fillRect(0, 0, w, h); g.fillStyle = "#ffd36b"; g.font = "bold 34px Gaegu, sans-serif"; g.textAlign = "center"; g.fillText("CHIIKAWA OFFICE", w / 2, 42); });
  scene.remove(sign); sign.position.set(0, fy(4) + 34, BY1 - CY - 40); ROOF.add(sign);
  for (const x of [-140, 140]){ const p = new THREE.Mesh(new THREE.BoxGeometry(6, 30, 6), FRAME); p.position.set(x, fy(4) + 15, BY1 - CY - 40); ROOF.add(p); }
}
// 도시: 논리 좌표 y 652 아래(앞쪽)로 인도·도로를 깔아요
const cityBox = (x, y, w, h, H, c, lift = 0, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, H, h), m || mat(c)); b.position.set(x + w / 2 - CX, lift + H / 2, y + h / 2 - CY); b.castShadow = b.receiveShadow = true; CITY.add(b); return b; };
const cityPlane = (x, y, w, h, c, lift = .2) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(c)); p.rotation.x = -Math.PI / 2; p.position.set(x + w / 2 - CX, lift, y + h / 2 - CY); p.receiveShadow = true; CITY.add(p); return p; };
const cityPanel = (w, h, draw) => { const m = canvasPanel("scene", w, h, draw); scene.remove(m); CITY.add(m); return m; };
cityPlane(-1600, -1200, 4400, 3000, "#cdd5c3", -.6);                 // 땅
cityPlane(-260, 652, 1700, 18, "#e8e2d6", .1);                      // 건물 앞 마당
cityPlane(-1600, 670, 4400, 110, "#d7d9de", .3);                    // 인도
cityBox(-1600, 778, 4400, 4, 4, "#b8bcc6");                         // 연석
cityPlane(-1600, 782, 4400, 170, "#4a4f5c", .25);                   // 도로
for (let x = -1600; x < 2800; x += 90) cityBox(x, 864, 50, 4, .6, "#f2f2f2");      // 중앙 점선
cityBox(-1600, 790, 4400, 3, .6, "#f2cf4a"); cityBox(-1600, 941, 4400, 3, .6, "#f2f2f2");
for (let i = 0; i < 8; i++) cityBox(1240, 790 + i * 20, 90, 10, .6, "#f4f4f4");    // 횡단보도
cityPlane(-1600, 952, 4400, 80, "#d7d9de", .3);
for (const x of [-600, -200, 1500, 1900]) cityBox(x, 1060, 260, 160, 140 + (x % 3) * 40, ["#c9d6e8", "#e8d6c9", "#d6e8d1"][Math.abs(x) % 3]);   // 건너편 건물
// 정문
cityBox(1040, 652, 110, 4, 70, null, 0, GLASS2); cityBox(1030, 646, 130, 40, 4, "#5d6578", 82);
{ const s = cityPanel(110, 18, (g, w, h) => { g.fillStyle = "#2d3149"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = "bold 12px Gaegu, sans-serif"; g.textAlign = "center"; g.fillText("치이카와 오피스", w / 2, 13); }); s.position.set(1095 - CX, 96, 666 - CY); }
// 가로수
function streetTree(x, y){
  cityBox(x - 14, y - 14, 28, 28, .8, "#8a7a66");
  const t = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 50, 8), mat("#8a5a3a")); t.position.set(x - CX, 25, y - CY); t.castShadow = true; CITY.add(t);
  const l = new THREE.Mesh(new THREE.IcosahedronGeometry(30, 1), mat("#6fbf8a")); l.position.set(x - CX, 70, y - CY); l.castShadow = true; CITY.add(l);
}
for (let x = -500; x <= 1700; x += 160) if (Math.abs(x - 180) > 120 && Math.abs(x - 780) > 110) streetTree(x, 760);
for (let x = -400; x <= 1700; x += 200) streetTree(x, 990);
// 가로등
for (let x = -420; x <= 1700; x += 320){
  cityBox(x - 3, 772, 6, 6, 90, "#5d6578");
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 8), new THREE.MeshStandardMaterial({ color:"#fff3c4", emissive:"#ffd36b", emissiveIntensity:.1 }));
  bulb.position.set(x - CX, 92, 790 - CY); CITY.add(bulb); STREETLIGHTS.push(bulb);
}
// 버스 정류장
cityBox(700, 700, 160, 34, 4, "#5d6578", 70); cityBox(700, 700, 160, 3, 66, null, 0, GLASS2);
for (const x of [702, 852]) cityBox(x, 728, 6, 6, 70, "#5d6578");
cityBox(720, 712, 110, 16, 16, "#c9a77e");
{ const s = cityPanel(64, 40, (g, w, h) => { g.fillStyle = "#2b7de9"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = "bold 9px 'Gowun Dodum', sans-serif"; g.fillText("🚌 버스 정류장", 5, 13); g.fillText("치이카와 오피스 앞", 5, 25); g.font = "8px monospace"; g.fillText("101  202  303", 5, 36); });
  s.position.set(880 - CX, 70, 760 - CY); cityBox(878, 756, 4, 4, 50, "#5d6578"); }
// 지하철 입구
cityBox(120, 690, 130, 70, 1, "#2b2d3a", .2);
for (let i = 0; i < 6; i++) cityBox(130, 700 + i * 9, 110, 9, 1, "#8a93a8", -i * 4 + .4);
cityBox(118, 688, 4, 74, 28, "#7cc29a"); cityBox(248, 688, 4, 74, 28, "#7cc29a"); cityBox(118, 688, 134, 4, 28, "#7cc29a");
cityBox(112, 684, 146, 82, 3, null, 62, GLASS2);
for (const x of [114, 250]) for (const y of [686, 760]) cityBox(x, y, 4, 4, 62, "#5d6578");
{ const s = cityPanel(84, 30, (g, w, h) => { g.fillStyle = "#3f9d6b"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = "bold 11px 'Gowun Dodum', sans-serif"; g.fillText("🚇 치이카와역", 6, 14); g.font = "9px 'Gowun Dodum', sans-serif"; g.fillText("1번 출구", 6, 26); });
  s.position.set(185 - CX, 82, 767 - CY); }
// 움직이는 차와 버스
const CARS = [];
function car(col, lane, speed, x, bus = false){
  const g = new THREE.Group(), L = bus ? 150 : 70, Hh = bus ? 50 : 22;
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, Hh, bus ? 40 : 34), mat(col)); body.position.y = Hh / 2 + 8; body.castShadow = true; g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(bus ? L - 10 : 40, bus ? 14 : 16, bus ? 38 : 30), new THREE.MeshStandardMaterial({ color:"#bfe3ff", transparent:true, opacity:.75 }));
  top.position.y = bus ? Hh - 2 : Hh + 14; g.add(top);
  for (const dx of [-L / 3, L / 3]) for (const dz of [-18, 18]){ const w = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 6, 12), mat("#222")); w.rotation.x = Math.PI / 2; w.position.set(dx, 7, dz); g.add(w); }
  g.position.set(x - CX, 0, lane - CY); if (speed < 0) g.rotation.y = Math.PI; CITY.add(g);
  CARS.push({g, speed, bus, wait:0, stopped:false}); return g;
}
car("#ff8fb1", 905, 130, -400); car("#6f9fd8", 905, 160, 900); car("#f2cf4a", 825, -140, 1500); car("#7cc29a", 825, -110, 300);
car("#2b7de9", 905, 90, -900, true);
function cityTick(dt){
  for (const c of CARS){
    if (c.wait > 0){ c.wait -= dt; continue; }
    c.g.position.x += c.speed * dt;
    const x = c.g.position.x + CX;
    if (c.bus && !c.stopped && x > 760 && x < 800){ c.wait = 4; c.stopped = true; }
    if (x > 2600){ c.g.position.x = -1500 - CX; c.stopped = false; }
    if (x < -1500) c.g.position.x = 2600 - CX;
  }
}

/* ================= routing ================= */
const roomAt = (f, p) => { for (const [k, r] of Object.entries(FLOORS[f].rooms)) if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return k; return null; };
function route(f, from, to){
  const R = FLOORS[f].rooms, a = roomAt(f, from), b = roomAt(f, to), pts = [];
  if (a && a === b) return [to];
  if (!a && !b && from.x >= 990 && to.x >= 990) return [{x:to.x, y:to.y}];   // 에스컬레이터 홀 안에서는 바로
  if (a){ const r = R[a]; pts.push({x:r.door, y:inner(r)}, {x:r.door, y:CY}); } else pts.push({x:from.x, y:CY});
  if (b){ const r = R[b]; pts.push({x:r.door, y:CY}, {x:r.door, y:inner(r)}); }
  else pts.push({x:to.x, y:CY});                       // 복도·홀은 복도를 따라간 다음 꺾어요
  pts.push({x:to.x, y:to.y}); return pts;
}
function clampWalk(p, f){
  const q = {x: clamp(p.x, 30, 1168), y: clamp(p.y, 30, 612)};
  const k = roomAt(f, q);
  if (k){ const r = FLOORS[f].rooms[k]; q.x = clamp(q.x, r.x + 18, r.x + r.w - 18); q.y = clamp(q.y, r.y + 18, r.y + r.h - 12); }
  else if (q.x < 990) q.y = clamp(q.y, CY - 22, CY + 22);
  else { const h = HOLE[f]; if (h && q.x > h.x0 - 8 && q.x < h.x1 + 8 && q.y > h.y0 - 8 && q.y < h.y1 + 8) q.x = q.x < (h.x0 + h.x1) / 2 ? 1000 : 1158; }
  return q;
}

/* ================= characters ================= */
const TRAITS = {
  chiikawa:{title:"작고 소심하지만 열심히 하는 아이", likes:"공부·일·영화", speech:"짧게 말하고 자주 '…!', '와아…', '할 수 있어…!' 같은 소리를 내. 수줍음이 많아.", special:"study"},
  hachiware:{title:"밝고 긍정적인 노래쟁이", likes:"수다·노래·피아노", speech:"밝고 다정한 말투로 또박또박 말해. '뭐든 해보는 거야!' 같은 긍정적인 말을 좋아해.", special:"sing"},
  usagi:{title:"엉뚱하고 에너지 넘치는 아이", likes:"춤·운동·간식", speech:"말은 거의 하지 않고 '우라!', '야하!', '하아?', '푸루루루' 같은 소리로만 표현해. 가끔 괄호로 행동을 묘사해.", special:"ura"},
  rakko:{title:"믿음직한 실력자 선배", likes:"검술·일·회의", speech:"차분하고 자신감 있는 선배 말투. 짧고 듬직하게 말해.", special:"sword"},
  momonga:{title:"관심받고 싶은 귀염둥이", likes:"애교·TV·게임", speech:"새침하고 응석 부리는 말투. '칭찬해줘!', '나 귀엽지?' 같은 말을 자주 해.", special:"aegyo"},
  kurimanju:{title:"여유로운 미식가", likes:"한 잔·밥·소파", speech:"느긋한 말투. '하아…', '캬~' 같은 감탄을 자주 하고 맛있는 것 얘기를 좋아해.", special:"drink"},
  shisa:{title:"성실한 견습생", likes:"연습·일·수다", speech:"공손하고 씩씩한 존댓말. '열심히 할게요!'처럼 의욕이 넘쳐.", special:"practice"},
  kani:{title:"조용하고 손재주 좋은 책벌레", likes:"정리·독서·그림", speech:"조용하고 말수가 적어. '…' 를 자주 쓰고 짧게 대답해.", special:"tidy"},
};
const HOME = {rakko:DESK.rakko, chiikawa:DESK.chiikawa, hachiware:DESK.hachiware, usagi:DESK.usagi, momonga:P(1,560,520), kurimanju:P(1,840,200), shisa:P(1,800,525), kani:P(1,915,575)};
const LINES = {rakko:["오늘도 평화롭군","보고서 확인 중"], chiikawa:["…!","와아…","할 수 있어…!"], hachiware:["오늘 날씨 좋다~","뭐든 해보는 거야!"],
  usagi:["우라!","야하!","푸루루…","하아?"], momonga:["나 귀엽지?","칭찬해줘!"], kurimanju:["하아…","캬~"], shisa:["열심히 할게요~!","와아~"], kani:["…","(사락사락)"]};
const ALIAS = {rakko:["랏코","라코","팀장"], chiikawa:["치이카와","치이","치카와"], hachiware:["하치와레","하치"], usagi:["우사기","토끼"], momonga:["모몽가","모몽"], kurimanju:["쿠리만쥬","쿠리만주","쿠리"], shisa:["시사"], kani:["카니"]};
const VOICE = {chiikawa:880, hachiware:660, usagi:990, rakko:440, momonga:1046, kurimanju:392, shisa:740, kani:587};
const loader = new THREE.TextureLoader();
const CH = [];
const ring = new THREE.Mesh(new THREE.RingGeometry(22, 28, 32), new THREE.MeshBasicMaterial({ color: "#ff8fb1", transparent: true, opacity: .9 }));
ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
for (const id of Object.keys(HOME)){
  const h = HOME[id];
  const c = {id, name:NAMES[id], x:h.x, y:h.y, floor:1, home:h, path:[], resolve:null, t:Math.random() * 10, act:null, manual:0, face:1, cur:null, H:60};
  const tex = loader.load(`img/${id}.png`, t => { const a = t.image.width / t.image.height, H = 62 * (t.image.height / 175); c.sprite.scale.set(H * a, H, 1); c.H = H; c.bubO.position.y = H + 44; });
  tex.colorSpace = THREE.SRGBColorSpace;
  c.mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: .1 });
  c.sprite = new THREE.Sprite(c.mat); c.sprite.center.set(.5, 0); c.sprite.scale.set(60, 60, 1); c.sprite.userData.c = c;
  c.obj = new THREE.Group(); c.obj.add(c.sprite); scene.add(c.obj);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(18, 20), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: .14, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = .9; c.obj.add(sh);
  const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = c.name; c.nmEl = nm; c.nmO = new CSS2DObject(nm); c.obj.add(c.nmO);
  const bub = document.createElement("div"); bub.className = "bub"; c.bubEl = bub; c.bubO = new CSS2DObject(bub); c.bubO.position.y = 104; c.obj.add(c.bubO);
  c.gem = new THREE.Mesh(new THREE.OctahedronGeometry(7, 0), new THREE.MeshStandardMaterial({ color: "#4cd07d", emissive: "#2a8f52", emissiveIntensity: .5, roughness: .3 }));
  c.gem.scale.y = 1.6; c.obj.add(c.gem);
  c.hatG = new THREE.Group(); c.obj.add(c.hatG);
  CH.push(c);
}
const BY = Object.fromEntries(CH.map(c => [c.id, c]));
const CREW = CH.slice(0, 4);

/* ================= sound (WebAudio, no files) ================= */
let ac = null, soundOn = false, bgmT = null, lastBlip = 0;
function tone(freq, dur = .12, type = "sine", vol = .07, when = 0){
  if (!soundOn || !ac) return;
  const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + .02);
}
const SFX = {
  level:() => [523, 659, 784, 1046].forEach((f, i) => tone(f, .18, "triangle", .08, i * .09)),
  coin:() => { tone(988, .08, "square", .04); tone(1319, .16, "square", .04, .08); },
  event:() => [440, 330, 440].forEach((f, i) => tone(f, .15, "sawtooth", .04, i * .16)),
  quest:() => [659, 784, 988, 1319].forEach((f, i) => tone(f, .2, "triangle", .07, i * .1)),
};
const PENTA = [262, 294, 330, 392, 440, 523, 587, 659];
function bgm(){
  clearInterval(bgmT); if (!soundOn) return;
  let i = 0; bgmT = setInterval(() => {
    const night = isNight(), base = night ? 0.5 : 1;
    tone(PENTA[[0, 2, 4, 2, 5, 4, 2, 1][i % 8]] * base, .5, "triangle", .018); if (i % 4 === 0) tone(PENTA[[0, 3, 4, 1][(i / 4) % 4 | 0]] / 2 * base, 1.2, "sine", .02);
    i++;
  }, 520);
}
$("soundBtn").onclick = () => {
  soundOn = !soundOn; if (soundOn && !ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  $("soundBtn").textContent = soundOn ? "🔊 소리" : "🔇 소리"; bgm(); if (soundOn) SFX.coin();
};

/* ================= basic movement ================= */
function say(c, text, ms = 2600){
  c.bubEl.textContent = text; c.bubEl.classList.toggle("show", !!text);
  clearTimeout(c.bubT); if (text && ms) c.bubT = setTimeout(() => c.bubEl.classList.remove("show"), ms);
  if (text && soundOn && visibleChar(c) && performance.now() - lastBlip > 120){ lastBlip = performance.now(); tone(VOICE[c.id] * (0.9 + Math.random() * .2), .07, "sine", .03); }
}
function finishRide(c){ if (!c.ride) return; const e = c.ride.e; c.floor = e.end.f; c.x = e.end.x; c.y = e.end.y; const r = c.ride.resolve; c.ride = null; r && r(false); }
function walk(c, to){
  if (c.resolve){ const r = c.resolve; c.resolve = null; r(false); }
  finishRide(c); c.hidden = false;
  c.act = null; c.mat.rotation = 0;
  c.path = route(c.floor, {x:c.x, y:c.y}, to);
  return new Promise(res => { c.resolve = res; });
}
function stop(c){ if (c.resolve){ const r = c.resolve; c.resolve = null; r(false); } finishRide(c); c.path = []; c.act = null; c.mat.rotation = 0; c.hidden = false; }
async function walkPts(c, pts){ for (const p of pts) if (!await walk(c, p)) return false; return true; }
async function escalate(c, e){
  if (!await walkPts(c, [...e.before, e.start])) return false;
  c.path = []; const ok = await new Promise(res => { c.ride = {e, t:0, resolve:res}; });
  if (!ok) return false;
  S.stats.esc = (S.stats.esc || 0) + 1; emit("escalator", c);
  return walkPts(c, e.after);
}
async function elevator(c, to){
  const from = c.floor;
  if (!await walk(c, ELEV_FRONT)) return false;
  ELEV[from].want = 1; await sleep(500);
  if (!await walk(c, ELEV_IN)) return false;
  c.hidden = true; ELEV[from].want = 0; await sleep(400);
  for (let f = from; f !== to; f += to > from ? 1 : -1){ await sleep(800); for (const k of [1, 2, 3]) ELEV[k].ind.redraw(`${f + (to > from ? 1 : -1)}F`); }
  if (c.ride || c.path.length) return false;
  c.floor = to; c.x = ELEV_IN.x; c.y = ELEV_IN.y; ELEV[to].want = 1; await sleep(400); c.hidden = false;
  const ok = await walk(c, ELEV_FRONT); ELEV[to].want = 0; return ok;
}
async function travel(c, to){
  let guard = 0;
  while (c.floor !== to && guard++ < 4){
    const up = to > c.floor, next = up ? c.floor + 1 : c.floor - 1;
    const useEsc = Math.abs(to - c.floor) === 1 ? Math.random() < .7 : Math.random() < .4;
    const ok = useEsc ? await escalate(c, ESC.find(e => e.f0 === c.floor && e.f1 === next)) : await elevator(c, to);
    if (!ok) return false;
  }
  return c.floor === to;
}
async function walkTo(c, p){
  finishRide(c);
  if (p.f && p.f !== c.floor && !await travel(c, p.f)) return false;
  return walk(c, p);
}

/* ================= view / floors / camera ================= */
let viewFloor = 1;
const visibleChar = c => viewFloor === 0 || c.floor === viewFloor || (c.ride && (c.ride.e.f0 === viewFloor || c.ride.e.f1 === viewFloor));
function applyView(){
  for (const f of [1, 2, 3]){ G[f].visible = viewFloor === 0 || viewFloor === f; LABELS[f].forEach(o => o.visible = viewFloor === f); }
  for (const e of ESC) e.group.visible = viewFloor === 0 || viewFloor === e.f0 || viewFloor === e.f1;
  // 한 층만 볼 때는 앞쪽 유리와 지붕을 숨겨서 안이 잘 보이게 해요
  FRONT.forEach(m => m.visible = viewFloor === 0); ROOF.visible = viewFloor === 0;
  document.querySelectorAll("#floors button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.f === viewFloor)));
}
const baseTarget = () => new THREE.Vector3(0, fy(viewFloor === 0 ? 2 : viewFloor), -10);
function showFloor(f){
  const before = viewFloor === 0 ? 2 : viewFloor; viewFloor = f; applyView();
  const dy = fy(f === 0 ? 2 : f) - fy(before);
  controls.target.y += dy; camera.position.y += dy;
  if (camTween){ camTween.toT.y += dy; camTween.toP.y += dy; }
  if (f === 0 && camMode !== "street"){ const d = camera.position.clone().sub(controls.target); camera.position.copy(controls.target).add(d.multiplyScalar(1.4)); }
}
$("floors").addEventListener("click", e => { const b = e.target.closest("button"); if (b) showFloor(+b.dataset.f); });
// 시점: [카메라 위치(목표점 기준), 목표점 이동]
const VIEWS = {
  default:{name:"기본", off:k => [0, 700 * k, 800 * k]},
  left:{name:"왼쪽에서", off:k => [-950 * k, 560 * k, 420 * k]},
  right:{name:"오른쪽에서", off:k => [950 * k, 560 * k, 420 * k]},
  back:{name:"뒤쪽에서", off:k => [0, 620 * k, -900 * k]},
  low:{name:"눈높이", off:k => [0, 130, 620 * k], t:[0, 40, 0]},
  top:{name:"위에서", off:k => [0, 1350 * k, 260]},
  street:{name:"거리에서 보기", off:() => [900, 140, 1350], t:[0, 160, 380], floor:0},
  follow:{name:"캐릭터 따라가기"},
  orbit:{name:"자동 회전"},
};
let camMode = "default", camTween = null, floorBeforeStreet = null;
function setView(name){
  const V = VIEWS[name]; if (!V) return;
  controls.autoRotate = false; camMode = name;
  if (name === "orbit"){ controls.autoRotate = true; controls.autoRotateSpeed = 1.2; return; }
  if (name === "follow"){ if (!selected){ log("따라갈 캐릭터를 먼저 눌러 주세요", true); $("camSel").value = "default"; camMode = "default"; return; } return; }
  if (V.floor === 0 && viewFloor !== 0){ floorBeforeStreet = viewFloor; showFloor(0); }
  else if (V.floor !== 0 && floorBeforeStreet){ showFloor(floorBeforeStreet); floorBeforeStreet = null; }
  const k = Math.min(2.1, Math.max(1, 1.15 / (camera.aspect || 1.6)));
  const t = baseTarget().add(new THREE.Vector3(...(V.t || [0, 0, 0])));
  const p = t.clone().add(new THREE.Vector3(...V.off(k)));
  camTween = {t:0, fromP:camera.position.clone(), fromT:controls.target.clone(), toP:p, toT:t};
}
function camHome(){ $("camSel").value = "default"; setView("default"); }
$("camSel").innerHTML = Object.entries(VIEWS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
$("camSel").onchange = e => setView(e.target.value);
$("camReset").onclick = camHome;
controls.addEventListener("start", () => { camTween = null; if (camMode === "orbit"){ controls.autoRotate = false; camMode = "default"; $("camSel").value = "default"; } });
function camTick(dt){
  if (camTween){
    camTween.t = Math.min(1, camTween.t + dt / .9); const e = 1 - Math.pow(1 - camTween.t, 3);
    camera.position.lerpVectors(camTween.fromP, camTween.toP, e); controls.target.lerpVectors(camTween.fromT, camTween.toT, e);
    if (camTween.t >= 1) camTween = null;
  }
  if (camMode === "follow" && selected){
    if (selected.floor !== viewFloor && viewFloor !== 0) showFloor(selected.floor);
    const want = selected.obj.position.clone(); want.y += 30;
    const d = want.sub(controls.target).multiplyScalar(Math.min(1, dt * 3));
    controls.target.add(d); camera.position.add(d);
  }
}
$("shadowBtn").textContent = renderer.shadowMap.enabled ? "그림자 켬" : "그림자 끔";
$("shadowBtn").onclick = () => { renderer.shadowMap.enabled = !renderer.shadowMap.enabled; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); $("shadowBtn").textContent = renderer.shadowMap.enabled ? "그림자 켬" : "그림자 끔"; };

/* ================= time of day ================= */
const SAVE_KEY = "chiikawa3d-world-v2";
let saved = null; try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) {}
const S = {coins:saved?.coins ?? 50, time:saved?.time ?? 8 * 60 + 30, office:saved?.office || {lv:1, xp:0, done:0}, stats:saved?.stats || {}, decor:saved?.decor || [], up:saved?.up || {}, rel:saved?.rel || {}};
let speed = 1;
$("speed").onclick = () => { speed = speed === 1 ? 4 : speed === 4 ? 12 : 1; $("speed").textContent = `시간 ×${speed}`; };
const hour = () => S.time / 60;
const isNight = () => hour() >= 22 || hour() < 6.5;
function phase(){
  const h = hour();
  if (h >= 22 || h < 7) return {k:"night", name:"잘 시간", icon:"🌙"};
  if (h < 9) return {k:"morning", name:"아침", icon:"🌅"};
  if (h < 12) return {k:"work", name:"업무 시간", icon:"💼"};
  if (h < 13) return {k:"lunch", name:"점심 시간", icon:"🍚"};
  if (h < 18) return {k:"work", name:"업무 시간", icon:"💼"};
  return {k:"evening", name:"퇴근 후 자유 시간", icon:"🌆"};
}
const SKY = [[0,"#141a33",.45,.12],[5,"#1d2346",.5,.15],[6.5,"#ffc9a8",1.0,.8],[8,"#dfeaff",1.6,1.6],[17,"#dfeaff",1.6,1.6],[18.5,"#ffb88c",1.1,.9],[20,"#2a2f55",.6,.2],[24,"#141a33",.45,.12]];
let blackout = false;
function applyTime(){
  const h = hour(); let i = 0; while (h > SKY[i + 1][0]) i++;
  const [h0, c0, a0, s0] = SKY[i], [h1, c1, a1, s1] = SKY[i + 1], t = (h - h0) / (h1 - h0);
  const sky = new THREE.Color(c0).lerp(new THREE.Color(c1), t);
  const dark = blackout ? .35 : 1;
  scene.background.copy(sky); view.style.background = sky.getStyle();
  hemi.intensity = lerp(a0, a1, t) * dark; sun.intensity = lerp(s0, s1, t) * dark;
  const ang = (h - 6) / 13 * Math.PI;
  sun.position.set(Math.cos(ang) * -700, Math.max(120, Math.sin(ang) * 800) + fy(viewFloor || 2), 450);
  sun.target.position.set(0, fy(viewFloor || 2), 0);
  sun.color.set(h > 6 && h < 19 ? "#fff6e8" : "#b9c6ff");
  const night = clamp(1 - (hemi.intensity / dark - .45) / 1.0, 0, 1);
  NIGHT.forEach(l => l.intensity = blackout ? 0 : night * 260);
  lamps.forEach(m => m.material.emissiveIntensity = .2 + night * 1.6);
  STREETLIGHTS.forEach(m => m.material.emissiveIntensity = .1 + night * 2);
  const p = phase(), hh = String(Math.floor(h)).padStart(2, "0"), mm = String(Math.floor(S.time % 60)).padStart(2, "0");
  $("clock").textContent = `${p.icon} ${hh}:${mm} · ${p.name}`;
}

/* ================= needs, actions ================= */
const NEEDS = [
  {k:"hunger", name:"배부름", icon:"🍙", low:"배고파…", decay:.11},
  {k:"energy", name:"에너지", icon:"⚡", low:"졸려…", decay:.07},
  {k:"fun", name:"재미", icon:"🎈", low:"심심해…", decay:.13},
  {k:"social", name:"친구", icon:"💞", low:"외로워…", decay:.09},
  {k:"hygiene", name:"청결", icon:"🫧", low:"찝찝해…", decay:.05},
  {k:"bladder", name:"화장실", icon:"🚻", low:"급해!", decay:.12},
];
const DECAY = {usagi:{fun:1.5, hunger:1.2}, chiikawa:{social:1.3, energy:1.2}, hachiware:{social:1.2, fun:1.1}, rakko:{fun:.8, hygiene:.8},
  momonga:{social:1.6, fun:1.3}, kurimanju:{hunger:1.4, energy:.8}, shisa:{energy:1.1}, kani:{fun:.8, social:.8}};
const SKILLS = {work:{name:"업무", icon:"💼"}, knowledge:{name:"지식", icon:"📖"}, fitness:{name:"체력", icon:"💪"}, social:{name:"사교", icon:"🗣️"}, art:{name:"예술", icon:"🎨"}};
const pick = (...lists) => (i, c) => { const a = lists.flat(); return a[(i ?? Math.floor(Math.random() * a.length)) % a.length]; };
const decorSpots = act => S.decor.filter(d => DECOR[d.id]?.act === act).map(d => P(d.f, d.x, d.y + 30));
const ACTIONS = {
  coffee:{name:"커피 마시기", emo:"☕", at:pick(S1.coffee), dur:5, eff:{energy:6, bladder:-1.5}, lines:["커피 최고…","카페인 충전!"], need:() => !broken.coffee},
  snack:{name:"간식 먹기", emo:"🍙", at:(i, c) => rand([...(c.floor === 2 ? S2.fridge : S1.fridge), ...decorSpots("snack")]), dur:5, eff:{hunger:8, bladder:-1}, lines:["냠냠","푸딩 발견!"]},
  meal:{name:"밥 먹기", emo:"🍚", at:(i, c) => rand(c.floor === 2 ? S2.table : S1.table), dur:8, eff:{hunger:10, social:1, bladder:-1}, lines:["잘 먹겠습니다!","든든해~"]},
  water:{name:"물 마시기", emo:"💧", at:pick(S1.water), dur:3, eff:{hunger:2, bladder:-3}, lines:["꿀꺽꿀꺽","시원해~"]},
  toilet:{name:"화장실 가기", emo:"🚻", at:pick(S1.stall), dur:4, eff:{bladder:28, hygiene:-2}, lines:["휴~ 살았다","잠깐만…!"]},
  wash:{name:"손 씻기", emo:"🫧", at:pick(S1.sink), dur:4, eff:{hygiene:14}, lines:["뽀득뽀득","깨끗해!"]},
  shower:{name:"샤워하기", emo:"🚿", at:pick(S2.shower), dur:7, eff:{hygiene:14, energy:1}, lines:["샤워 중~♪","따끈따끈…"]},
  sofa:{name:"소파에서 쉬기", emo:"🛋️", at:(i, c) => rand(c.floor === 2 ? S2.sofa : S1.sofa), dur:8, eff:{energy:3, fun:2}, lines:["푹신…","좋다~"]},
  nap:{name:"낮잠 자기", emo:"💤", at:(i, c) => BED[c.id], dur:12, eff:{energy:7, fun:-.3}, anim:"sleep", lines:["Zzz…","쿨쿨…"]},
  sleep:{name:"잠자기", emo:"🌙", at:(i, c) => BED[c.id], dur:40, eff:{energy:5, hunger:.05, bladder:.06}, anim:"sleep", lines:["Zzz…","쿨쿨… (잠꼬대)"]},
  tv:{name:"TV 보기", emo:"📺", at:(i, c) => rand(c.floor === 2 ? S2.tv : S1.tv), dur:9, eff:{fun:6, energy:-.3}, lines:["재밌다!","ㅋㅋㅋ"]},
  read:{name:"책 읽기", emo:"📚", at:pick(S1.shelf), dur:8, eff:{fun:3}, skill:"knowledge", lines:["흠흠…","하나 배웠다!"]},
  work:{name:"일하기", emo:"💻", at:(i, c) => DESK[c.id] || rand(Object.values(DESK)), dur:10, eff:{energy:-1, fun:-.8, hunger:-.3}, skill:"work", coin:6, lines:["타닥타닥…","집중!","거의 다 했다"]},
  meeting:{name:"회의하기", emo:"🗣️", at:pick(S1.meet), dur:8, eff:{social:4, energy:-.6}, skill:"work", coin:3, lines:["좋은 생각이에요!","음음"]},
  exercise:{name:"운동하기", emo:"💪", at:pick(S1.corridor, S3.view), dur:7, eff:{energy:-2, hygiene:-1.6, fun:2}, skill:"fitness", anim:"jump", lines:["하나, 둘!","으쌰!"]},
  dance:{name:"춤추기", emo:"🎵", at:null, dur:6, eff:{fun:5, energy:-1.2}, skill:"art", anim:"dance", lines:["♪ 둠칫둠칫","♬ 랄랄라~"]},
  draw:{name:"그림 그리기", emo:"🎨", at:pick(S3.easel), dur:8, eff:{fun:4}, skill:"art", lines:["슥슥…","무슨 색 칠하지?"]},
  game:{name:"게임하기", emo:"🎮", at:(i, c) => rand([...S3.game, ...decorSpots("game")]), dur:9, eff:{fun:7, energy:-.5}, lines:["이겼다!","한 판 더!"]},
  piano:{name:"피아노 치기", emo:"🎹", at:pick(S3.piano), dur:8, eff:{fun:4}, skill:"art", lines:["♪ 도레미~","♬ 띵동띵동"]},
  boardgame:{name:"보드게임", emo:"🎲", at:null, partner:true, place:S3.board, dur:9, eff:{social:5, fun:4}, skill:"social", lines:["내 차례!","주사위 굴린다~"]},
  movie:{name:"영화 보기", emo:"🎬", at:pick(S3.seats), dur:14, eff:{fun:6, energy:.5}, lines:["(두근두근)","감동…","팝콘 냠냠"]},
  sunbath:{name:"일광욕", emo:"🌞", at:pick(S3.lounger), dur:9, eff:{energy:4, fun:2}, lines:["햇볕 좋다…","(꾸벅)"]},
  bbq:{name:"바비큐", emo:"🍖", at:pick(S3.bbq, S3.table), dur:8, eff:{hunger:8, fun:3, social:1}, lines:["지글지글~","다 익었다!"]},
  chat:{name:"수다 떨기", emo:"💬", at:null, partner:true, dur:8, eff:{social:7, fun:2}, skill:"social", lines:["ㅋㅋㅋ","그치그치~","진짜?!"]},
  massage:{name:"안마받기", emo:"💺", at:() => rand(decorSpots("massage")), dur:8, eff:{energy:5, fun:3}, lines:["시원하다~","으으…"], need:() => decorSpots("massage").length > 0},
  // 캐릭터 전용 행동
  study:{name:"풀뽑기 자격증 공부", emo:"📝", only:"chiikawa", at:pick(DESK.chiikawa, S3.board[0]), dur:9, eff:{fun:1, energy:-.6}, skill:"knowledge", lines:["이번엔 꼭 합격…!","외워야 해…","…!"]},
  sing:{name:"노래 부르기", emo:"🎤", only:"hachiware", at:null, dur:7, eff:{fun:6}, skill:"art", aura:{fun:1.2}, lines:["♪ 랄라라~","♬ 오늘도 힘내자~"]},
  ura:{name:"우라! 외치기", emo:"📣", only:"usagi", at:null, dur:5, eff:{fun:8, energy:-1}, anim:"jump", aura:{fun:.6}, lines:["우라!!","야하!","푸루루루루!"]},
  sword:{name:"검술 수련", emo:"⚔️", only:"rakko", at:pick(S3.sword), dur:9, eff:{energy:-1.5, fun:2}, skill:"fitness", anim:"jump", lines:["하앗!","집중…","한 번 더"]},
  aegyo:{name:"애교 부리기", emo:"🥺", only:"momonga", at:null, partner:true, dur:6, eff:{social:8, fun:3}, skill:"social", lines:["칭찬해줘!","나 귀엽지?","헤헤"]},
  drink:{name:"한 잔 하기", emo:"🍶", only:"kurimanju", at:pick(S1.counter, S3.table), dur:8, eff:{fun:5, hunger:3, energy:-.3}, lines:["캬~","하아… 행복해","안주가 최고야"]},
  practice:{name:"주방 일 연습", emo:"🧑‍🍳", only:"shisa", at:pick(S1.counter, S2.kitchen), dur:9, eff:{fun:1, energy:-.8}, skill:"work", coin:3, lines:["열심히 할게요!","이렇게… 맞나요?","됐다!"]},
  devwork:{name:"개발 작업", emo:"🧑‍💻", hidden:true, at:null, dur:1, eff:{}, lines:["…"]},
  tidy:{name:"책 정리하기", emo:"🗂️", only:"kani", at:pick(S1.shelf), dur:8, eff:{fun:2}, skill:"knowledge", lines:["…","(차곡차곡)","깔끔."]},
};
const FIX = {hunger:["snack","meal","bbq"], energy:["coffee","nap","sofa","sunbath"], fun:["tv","game","movie","dance","draw","piano"], social:["chat","boardgame","meeting"], hygiene:["wash","shower"], bladder:["toilet"]};
const PREF = {
  chiikawa:{study:4, work:2, read:2, chat:2, movie:2, draw:1}, hachiware:{sing:4, chat:3, piano:2, game:1, work:1},
  usagi:{ura:4, dance:3, exercise:2, snack:2, game:1, bbq:2}, rakko:{sword:4, work:3, meeting:2, exercise:2, read:1},
  momonga:{aegyo:4, tv:2, game:2, chat:2, snack:1}, kurimanju:{drink:4, meal:2, sofa:2, bbq:2, sunbath:2},
  shisa:{practice:4, work:2, wash:1, chat:2, boardgame:1}, kani:{tidy:4, read:3, draw:2, piano:1, movie:1},
};
const allowed = (c, k) => ACTIONS[k] && !ACTIONS[k].hidden && (!ACTIONS[k].only || ACTIONS[k].only === c.id) && (!ACTIONS[k].need || ACTIONS[k].need());
const xpNeed = lv => 60 + lv * 40;
const skLv = xp => Math.min(10, Math.floor(Math.sqrt(xp / 15)) + 1);
for (const c of CH){
  const s = saved?.chars?.[c.id];
  c.needs = s?.needs || Object.fromEntries(NEEDS.map(n => [n.k, 55 + Math.random() * 40]));
  c.lv = s?.lv || 1; c.xp = s?.xp || 0; c.skills = s?.skills || Object.fromEntries(Object.keys(SKILLS).map(k => [k, 0]));
  c.stats = s?.stats || {}; c.prel = s?.prel ?? 20; c.hat = s?.hat || null; c.chatLog = s?.chatLog || [];
}
const mood = c => { const v = NEEDS.map(n => c.needs[n.k]), mn = Math.min(...v), avg = v.reduce((a, b) => a + b, 0) / v.length; return clamp(avg * .7 + mn * .3, 0, 100); };
function emotion(c){
  if (c.act?.kind === "sleep") return {emo:"😴", name:"쿨쿨"};
  const low = NEEDS.filter(n => c.needs[n.k] < 22).sort((a, b) => c.needs[a.k] - c.needs[b.k])[0];
  if (low) return {emo:{hunger:"😣", energy:"😪", fun:"😑", social:"🥺", hygiene:"😫", bladder:"😖"}[low.k], name:low.low, need:low};
  const m = mood(c);
  if (m > 78) return {emo:"😆", name:"신남"};
  if (m > 58) return {emo:"😊", name:"행복"};
  if (m > 38) return {emo:"🙂", name:"보통"};
  return {emo:"😢", name:"우울"};
}
const moodColor = m => new THREE.Color().setHSL(clamp((m - 15) / 70 * .36, 0, .36), .75, .5);
function addXP(c, n, skill){
  c.xp += n;
  if (skill){ const b = skLv(c.skills[skill]); c.skills[skill] += n; const a = skLv(c.skills[skill]); if (a > b){ log(`${c.name}의 ${SKILLS[skill].name} 기술이 올랐어요! (Lv.${a})`); emit("skill", c); } }
  while (c.xp >= xpNeed(c.lv)){ c.xp -= xpNeed(c.lv); c.lv++; say(c, `레벨 업! Lv.${c.lv} ✨`, 3000); c.act = {kind:"jump", t0:performance.now()}; log(`🎉 ${c.name} 레벨 업! 이제 Lv.${c.lv}`); SFX.level(); emit("level", c); }
}
function addCoins(n, why){ S.coins += n; $("coins").textContent = `🪙 ${S.coins}`; if (why) log(`🪙 +${n} ${why}`); SFX.coin(); renderShop(); }

/* ================= relationships ================= */
const relKey = (a, b) => [a.id || a, b.id || b].sort().join("|");
const REL0 = {"chiikawa|hachiware":80, "chiikawa|usagi":72, "hachiware|usagi":72, "chiikawa|rakko":50, "rakko|usagi":45, "kurimanju|usagi":50, "hachiware|shisa":55, "chiikawa|kani":40};
const rel = (a, b) => S.rel[relKey(a, b)] ?? REL0[relKey(a, b)] ?? (a.id === "momonga" || b.id === "momonga" ? 25 : 30);
function addRel(a, b, n){
  const k = relKey(a, b), before = relTier(rel(a, b)).name; S.rel[k] = clamp(rel(a, b) + n, 0, 100);
  const after = relTier(S.rel[k]).name; if (after !== before && n > 0){ log(`💞 ${josa(a.name, "과와")} ${b.name}: 이제 '${after}'`); emit("relation", a); }
}
function relTier(v){ return v >= 90 ? {name:"단짝", h:"💖💖💖"} : v >= 70 ? {name:"절친", h:"💖💖"} : v >= 45 ? {name:"친구", h:"💖"} : v >= 20 ? {name:"아는 사이", h:"🤍"} : {name:"처음 보는 사이", h:"·"}; }
function partnerFor(c){
  const now = performance.now();
  const free = CH.filter(o => o !== c && o.floor === c.floor && o.manual < now && o.act?.kind !== "sleep" && !o.ride && !o.hidden);
  const idle = free.filter(o => !o.cur && !o.path.length), pool = idle.length ? idle : free;
  if (!pool.length) return null;
  const w = pool.map(o => rel(c, o) + 10 - Math.hypot(o.x - c.x, o.y - c.y) / 40);
  let r = Math.random() * w.reduce((a, b) => a + Math.max(1, b), 0);
  for (let i = 0; i < pool.length; i++){ r -= Math.max(1, w[i]); if (r <= 0) return pool[i]; }
  return pool[0];
}

/* ================= doing actions ================= */
async function doAction(c, key, opts = {}){
  const A = ACTIONS[key], tag = c.seq, alive = () => c.seq === tag;
  if (!allowed(c, key)){ say(c, A?.only ? "그건 내 특기가 아니야…" : "지금은 못 해…", 1800); return false; }
  c.cur = key; say(c, `${A.emo} ${A.name}`, 1800);
  let partner = null, ptag = null;
  if (A.partner){
    partner = opts.partner || partnerFor(c);
    if (!partner || partner === c){ c.cur = null; say(c, "같이 할 친구가 없네…", 1600); return false; }
    partner.seq = {}; stop(partner); partner.cur = key; ptag = partner.seq;
    const place = A.place ? rand(A.place) : null, tf = place ? place.f : c.floor;
    const [ta, tb] = await Promise.all([travel(c, tf), travel(partner, tf)]);
    if (!ta || !alive()){ if (partner.seq === ptag) partner.cur = null; c.cur = null; return false; }
    if (!tb){ partner.cur = null; c.cur = null; return false; }
    const spot = place || clampWalk({x:(c.x + partner.x) / 2, y:(c.y + partner.y) / 2}, c.floor);
    const [a, b] = await Promise.all([walk(c, {x:spot.x - 24, y:spot.y}), walk(partner, {x:spot.x + 24, y:spot.y})]);
    if (!a || !alive()){ if (partner.seq === ptag) partner.cur = null; c.cur = null; return false; }
    if (!b || partner.seq !== ptag) partner = null;
  } else if (A.at){
    const p = A.at(opts.i, c); if (!p){ c.cur = null; return false; }
    if (!await walkTo(c, p) || !alive()){ c.cur = null; return false; }
  } else stop(c);
  const both = () => partner && partner.seq === ptag ? [c, partner] : [c];
  c.act = {kind:A.anim || "busy", t0:performance.now()};
  if (partner) partner.act = {kind:"busy", t0:performance.now()};
  const mult = key === "coffee" && S.up.coffee2 ? 1.5 : 1;
  for (let s = 0; s < A.dur; s++){
    await sleep(1000);
    if (!alive()){ c.cur = null; if (partner && partner.seq === ptag){ partner.cur = null; partner.act = null; } return false; }
    for (const who of both()){
      for (const [k, v] of Object.entries(A.eff)) who.needs[k] = clamp(who.needs[k] + v * mult + NEEDS.find(n => n.k === k).decay, 0, 100);
      addXP(who, 2, A.skill);
    }
    if (partner && partner.seq === ptag) addRel(c, partner, key === "chat" ? .8 : .5);
    if (A.aura) for (const o of CH) if (o !== c && o.floor === c.floor && Math.hypot(o.x - c.x, o.y - c.y) < 160){
      for (const [k, v] of Object.entries(A.aura)) o.needs[k] = clamp(o.needs[k] + v, 0, 100);
      if (s === 1) say(o, key === "ura" ? rand(["깜짝!","…!?","우사기다~"]) : rand(["♪","좋은 노래~","흥얼흥얼"]), 1500);
      if (s === 1) addRel(c, o, .5);
    }
    if (s % 3 === 1){ say(c, rand(A.lines), 1800); if (partner && partner.seq === ptag) setTimeout(() => say(partner, rand(A.lines), 1600), 900); }
    if (A.anim && !c.act) c.act = {kind:A.anim, t0:performance.now()};
    if (key === "work" && DESK[c.id]) monitors[c.id].redraw(`${c.name}\n${rand(["보고서 작성","메일 정리","자료 조사","기획안"])}\n${"▮".repeat(s + 1)}`);
  }
  if (key === "work" && DESK[c.id]) monitors[c.id].redraw(`${c.name}\n휴식 중`);
  c.act = null; c.cur = null; c.stats[key] = (c.stats[key] || 0) + 1;
  if (A.coin) addCoins(A.coin);
  if (partner && partner.seq === ptag){ partner.act = null; partner.cur = null; partner.stats[key] = (partner.stats[key] || 0) + 1; partner.manual = performance.now() + 4000; }
  emit("act", c, key);
  return true;
}
const ACT_MS = {jump:2700, dance:3500, spin:2400, say:1800};
async function runSeq(c, steps, auto = false){
  const tag = {}; c.seq = tag;
  if (!auto) c.cur = null;
  for (const st of steps){
    if (c.seq !== tag) return;
    if (!auto) c.manual = Infinity;
    const r = st();
    if (r && r.then) await r; else if (c.act && ACT_MS[c.act.kind]) await sleep(ACT_MS[c.act.kind]);
  }
  if (c.seq === tag && !auto) c.manual = performance.now() + 30000;
}
function doAnim(c, kind, text){
  stop(c); c.act = {kind, t0:performance.now()};
  if (kind === "dance") say(c, rand(["♪ 둠칫둠칫","♬ 랄랄라~","야하!"]), 2400);
  else if (kind === "jump") say(c, rand(["얍!","우라!","폴짝!"]), 1400);
  else if (kind === "spin") say(c, "빙글빙글~", 1600);
  else if (kind === "say") say(c, text, 4000);
}
// 스스로 고르기: 시간대 + 욕구 + 성격(좋아하는 행동)
function weighted(c, list){
  const opts = list.filter(k => allowed(c, k)); if (!opts.length) return null;
  const w = opts.map(k => 1 + (PREF[c.id][k] || 0));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < opts.length; i++){ r -= w[i]; if (r <= 0) return opts[i]; } return opts[0];
}
function chooseAction(c){
  const low = NEEDS.map(n => ({n, v:c.needs[n.k]})).sort((a, b) => a.v - b.v)[0], p = phase().k;
  if (low.v < 25) return weighted(c, FIX[low.n.k]);
  if (p === "night") return c.needs.energy < 97 || Math.random() < .7 ? "sleep" : weighted(c, ["read", "tv", "chat"]);
  if (p === "morning"){ if (low.v < 60) return weighted(c, FIX[low.n.k]); return weighted(c, ["coffee", "meal", "wash", "shower", "water", DESK[c.id] ? "work" : "read"]); }
  if (p === "lunch") return Math.random() < .7 ? weighted(c, ["meal", "snack"]) : weighted(c, ["chat", "sofa", "coffee"]);
  if (p === "work"){
    if (low.v < 45) return weighted(c, FIX[low.n.k]);
    if (DESK[c.id] && Math.random() < .6) return Math.random() < .8 ? "work" : "meeting";
    return weighted(c, [TRAITS[c.id].special, ...Object.keys(PREF[c.id]), "read", "water", "coffee"]);
  }
  if (low.v < 55) return weighted(c, FIX[low.n.k]);
  return weighted(c, ["movie", "game", "piano", "boardgame", "bbq", "sunbath", "draw", "tv", "chat", "dance", "massage", TRAITS[c.id].special, ...Object.keys(PREF[c.id])]);
}
setInterval(() => {
  if (document.hidden) return;
  const now = performance.now();
  for (const c of CH){
    if (c.cur || c.path.length || c.ride || (c.act && c.act.kind !== "sleep") || c.manual > now || c.hidden) continue;
    if (c.act?.kind === "sleep" && phase().k === "night") continue;
    if (Math.random() < .45){ const k = chooseAction(c); if (k) runSeq(c, [() => doAction(c, k)], true); }
  }
}, 1500);
setInterval(() => {
  if (document.hidden) return;
  const calm = 1 - Math.min(.3, S.decor.length * .02);
  for (const c of CH){
    for (const n of NEEDS) c.needs[n.k] = clamp(c.needs[n.k] - n.decay * (DECAY[c.id]?.[n.k] || 1) * (n.k === "fun" || n.k === "social" ? calm : 1), 0, 100);
    const e = emotion(c);
    if (e.need && Math.random() < .05 && !c.cur) say(c, `${e.emo} ${e.name}`, 2000);
  }
}, 1000);

/* ================= quests, levels, save ================= */
const officeNeed = lv => 120 + lv * 80;
const QUESTS = [
  {t:n => `커피 ${n}잔 마시기`, ev:["coffee"], n:[3,5]}, {t:n => `간식이나 밥 ${n}번 먹기`, ev:["snack","meal","bbq"], n:[3,5]},
  {t:n => `수다 ${n}번 떨기`, ev:["chat"], n:[2,4]}, {t:n => `일 ${n}번 끝내기`, ev:["work"], n:[4,6]},
  {t:n => `책 ${n}권 읽기`, ev:["read"], n:[2,3]}, {t:n => `춤 ${n}번 추기`, ev:["dance"], n:[2,3]},
  {t:n => `영화 ${n}편 보기`, ev:["movie"], n:[1,2]}, {t:n => `바비큐 ${n}번 하기`, ev:["bbq"], n:[1,2]},
  {t:n => `에스컬레이터 ${n}번 타기`, ev:["escalator"], n:[3,5]}, {t:n => `캐릭터와 ${n}번 대화하기`, ev:["talk"], n:[3,5]},
  {t:n => `전용 행동 ${n}번 보기`, ev:["study","sing","ura","sword","aegyo","drink","practice","tidy"], n:[3,5]},
  {t:n => `명령 ${n}번 내리기`, ev:["cmd"], n:[3,5]}, {t:() => "이벤트 하나 해결하기", ev:["event"], n:[1,1]},
  {t:(n, w) => `${w.name}에게 춤추게 하기`, ev:["dance"], who:true, n:[1,1]}, {t:(n, w) => `${w.name} 레벨 올리기`, ev:["level"], who:true, n:[1,1]},
  {t:() => "누군가 사이가 한 단계 가까워지기", ev:["relation"], n:[1,1]},
  {t:() => "모두 회의실에 모이기", check:() => CH.every(c => c.floor === 1 && roomAt(1, c) === "meeting"), n:[1,1]},
  {t:() => "모두 기분 '행복' 이상 만들기", check:() => CH.every(c => mood(c) > 58), n:[1,1]},
  {t:() => "3층에 4명 이상 모이기", check:() => CH.filter(c => c.floor === 3).length >= 4, n:[1,1]},
];
function newQuest(){
  const used = new Set(quests.map(q => q.i)), choices = QUESTS.map((q, i) => i).filter(i => !used.has(i));
  const i = rand(choices), Q = QUESTS[i], n = Q.n[0] + Math.floor(Math.random() * (Q.n[1] - Q.n[0] + 1));
  return {i, n, w:Q.who ? rand(CH).id : null, p:0, reward:30 + n * 10};
}
let quests = saved?.quests?.filter(q => QUESTS[q.i]) || [];
while (quests.length < 3) quests.push(newQuest());
const qText = q => QUESTS[q.i].t(q.n, q.w ? BY[q.w] : null);
function completeQuest(q, c){
  log(`🏆 과업 완료: ${qText(q)} (+${q.reward} 오피스 경험치, 🪙 +${Math.round(q.reward / 2)})`); SFX.quest();
  S.office.xp += q.reward; S.office.done++; CH.forEach(o => addXP(o, 6)); if (c) addXP(c, 20); addCoins(Math.round(q.reward / 2));
  while (S.office.xp >= officeNeed(S.office.lv)){ S.office.xp -= officeNeed(S.office.lv); S.office.lv++; log(`🏢 오피스 레벨 업! 이제 Lv.${S.office.lv}`); CH.forEach(o => say(o, rand(["야하!","와아…!","축하해~"]), 2400)); }
  q.doneAt = performance.now();
  setTimeout(() => { quests[quests.indexOf(q)] = newQuest(); renderQuests(); }, 2500);
}
function emit(type, c, key){
  const name = type === "act" ? key : type;
  for (const q of quests){
    const Q = QUESTS[q.i]; if (q.doneAt || !Q.ev || !Q.ev.includes(name)) continue;
    if (Q.who && (!c || c.id !== q.w)) continue;
    if (++q.p >= q.n) completeQuest(q, c);
  }
  renderQuests();
}
setInterval(() => { for (const q of quests){ const Q = QUESTS[q.i]; if (Q.check && !q.doneAt && Q.check()){ q.p = 1; completeQuest(q); } } }, 1000);
let resetting = false;
function save(){
  if (resetting) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...S, quests:quests.map(({i, n, w, p, reward}) => ({i, n, w, p, reward})),
    chars:Object.fromEntries(CH.map(c => [c.id, {needs:c.needs, lv:c.lv, xp:c.xp, skills:c.skills, stats:c.stats, prel:c.prel, hat:c.hat, chatLog:c.chatLog.slice(-20)}])) })); } catch (e) {}
}
setInterval(save, 5000); addEventListener("pagehide", save);

/* ================= shop, decor, hats ================= */
const DECOR = {
  plant:{name:"화분", emo:"🪴", price:30}, flower:{name:"꽃병", emo:"💐", price:40}, lamp:{name:"무드등", emo:"💡", price:60},
  tree:{name:"큰 나무", emo:"🌳", price:90}, arcade:{name:"오락기", emo:"🕹️", price:150, act:"game"}, massage:{name:"안마의자", emo:"💺", price:180, act:"massage"},
  pudding:{name:"푸딩 자판기", emo:"🍮", price:200, act:"snack"}, fountain:{name:"미니 분수", emo:"⛲", price:220},
};
const UPGRADES = {coffee2:{name:"고급 커피머신", emo:"☕", price:250, desc:"커피 효과 1.5배"}};
const HATS = {ribbon:{name:"리본", emo:"🎀", price:50}, party:{name:"고깔모자", emo:"🥳", price:60}, flowerpin:{name:"꽃핀", emo:"🌸", price:70}, chef:{name:"요리사 모자", emo:"👨‍🍳", price:120}, crown:{name:"왕관", emo:"👑", price:300}};
const decorMeshes = [];
function buildDecor(d){
  const g = new THREE.Group(), f = d.f;
  const add = m => { m.castShadow = true; g.add(m); return m; };
  const m3 = (geo, c, y, o) => { const m = add(new THREE.Mesh(geo, mat(c, o))); m.position.y = y; return m; };
  if (d.id === "plant"){ m3(new THREE.CylinderGeometry(10, 8, 16, 16), "#c98b5e", 8); m3(new THREE.IcosahedronGeometry(16, 1), "#7cc29a", 30); }
  if (d.id === "flower"){ m3(new THREE.CylinderGeometry(6, 8, 18, 16), "#9fd3f5", 9); for (let i = 0; i < 5; i++){ const b = m3(new THREE.SphereGeometry(5, 10, 8), i % 2 ? "#ff8fb1" : "#ffe066", 24); b.position.x = Math.cos(i * 1.3) * 6; b.position.z = Math.sin(i * 1.3) * 6; } }
  if (d.id === "lamp"){ m3(new THREE.CylinderGeometry(2, 6, 40, 12), "#9aa6c4", 20); m3(new THREE.SphereGeometry(12, 16, 12), "#ffe8a3", 46, { emissive: "#ffd36b", emissiveIntensity: 1.2 }); }
  if (d.id === "tree"){ m3(new THREE.CylinderGeometry(5, 7, 50, 10), "#8a5a3a", 25); m3(new THREE.IcosahedronGeometry(32, 1), "#5fae7f", 70); }
  if (d.id === "arcade"){ m3(new THREE.BoxGeometry(40, 70, 34), "#6f5cc4", 35); const s = m3(new THREE.BoxGeometry(32, 24, 2), "#9fe3c0", 52, { emissive: "#4fb38a", emissiveIntensity: .8 }); s.position.z = 17.5; }
  if (d.id === "massage"){ m3(new THREE.BoxGeometry(44, 22, 44), "#7a4a3a", 11); const b = m3(new THREE.BoxGeometry(44, 50, 12), "#7a4a3a", 40); b.position.z = -16; }
  if (d.id === "pudding"){ m3(new THREE.BoxGeometry(44, 90, 34), "#ffd36b", 45); const s = m3(new THREE.BoxGeometry(34, 40, 2), "#fff6c9", 55, { emissive: "#ffe8a3", emissiveIntensity: .4 }); s.position.z = 17.5; }
  if (d.id === "fountain"){ m3(new THREE.CylinderGeometry(30, 34, 12, 24), "#c9d0dc", 6); m3(new THREE.CylinderGeometry(26, 26, 2, 24), "#8ec5ee", 12.5); m3(new THREE.CylinderGeometry(4, 6, 30, 12), "#c9d0dc", 20); m3(new THREE.SphereGeometry(8, 12, 10), "#bfe3ff", 38, { transparent: true, opacity: .7 }); }
  g.position.copy(W(d.x, d.y, f)); G[f].add(g); decorMeshes.push(g); return g;
}
S.decor.forEach(buildDecor);
function buildHat(c){
  c.hatG.clear(); if (!c.hat) return;
  const m3 = (geo, col, y, o) => { const m = new THREE.Mesh(geo, mat(col, o)); m.position.y = y; c.hatG.add(m); return m; };
  if (c.hat === "ribbon"){ const a = m3(new THREE.ConeGeometry(6, 12, 8), "#ff6b9a", 2); a.rotation.z = Math.PI / 2; a.position.x = -7; const b = m3(new THREE.ConeGeometry(6, 12, 8), "#ff6b9a", 2); b.rotation.z = -Math.PI / 2; b.position.x = 7; m3(new THREE.SphereGeometry(3.5, 8, 6), "#ff6b9a", 2); }
  if (c.hat === "party"){ m3(new THREE.ConeGeometry(10, 26, 16), "#ffd36b", 13); m3(new THREE.SphereGeometry(3, 8, 6), "#ff8fb1", 27); }
  if (c.hat === "flowerpin"){ for (let i = 0; i < 5; i++){ const p = m3(new THREE.SphereGeometry(3.6, 8, 6), "#ffb3c8", 2); p.position.x = 12 + Math.cos(i * 1.26) * 4; p.position.z = Math.sin(i * 1.26) * 4; } m3(new THREE.SphereGeometry(2.5, 8, 6), "#ffe066", 2).position.x = 12; }
  if (c.hat === "chef"){ m3(new THREE.CylinderGeometry(11, 11, 12, 16), "#ffffff", 6); m3(new THREE.SphereGeometry(14, 16, 10), "#ffffff", 16).scale.y = .6; }
  if (c.hat === "crown"){ m3(new THREE.CylinderGeometry(12, 12, 8, 16, 1, true), "#f2c94c", 4, { side: THREE.DoubleSide, metalness: .5, roughness: .3 }); for (let i = 0; i < 5; i++){ const s = m3(new THREE.ConeGeometry(3, 8, 6), "#f2c94c", 12, { metalness: .5, roughness: .3 }); s.position.x = Math.cos(i * 1.26) * 11; s.position.z = Math.sin(i * 1.26) * 11; } }
}
CH.forEach(buildHat);
let placing = null;
function renderShop(){
  const sel = selected;
  const card = (kind, id, it, extra = "") => `<button type="button" class="item" data-kind="${kind}" data-id="${id}" ${S.coins < it.price || (kind === "up" && S.up[id]) || (kind === "hat" && !sel) ? "disabled" : ""}><b>${it.emo} ${it.name}</b><small>🪙 ${it.price}${extra}</small></button>`;
  $("shop").innerHTML =
    Object.entries(DECOR).map(([id, it]) => card("decor", id, it, it.act ? ` · ${ACTIONS[it.act].name} 가능` : " · 분위기 UP")).join("") +
    Object.entries(UPGRADES).map(([id, it]) => card("up", id, it, S.up[id] ? " · 설치 완료" : ` · ${it.desc}`)).join("") +
    Object.entries(HATS).map(([id, it]) => card("hat", id, it, sel ? ` · ${sel.name}에게` : " · 캐릭터를 먼저 고르세요")).join("");
}
$("shop").addEventListener("click", e => {
  const b = e.target.closest(".item"); if (!b || b.disabled) return;
  const {kind, id} = b.dataset;
  if (kind === "decor"){ placing = id; $("sel").hidden = false; $("sel").textContent = `${DECOR[id].emo} ${DECOR[id].name}: 놓을 바닥을 눌러 주세요 (${viewFloor || 1}층)`; if (viewFloor === 0) showFloor(1); view.scrollIntoView({behavior:"smooth", block:"center"}); }
  if (kind === "up"){ S.coins -= UPGRADES[id].price; S.up[id] = true; addCoins(0); log(`🛠️ ${UPGRADES[id].name} 설치! ${UPGRADES[id].desc}`); }
  if (kind === "hat" && selected){ S.coins -= HATS[id].price; selected.hat = id; buildHat(selected); addCoins(0); say(selected, rand(["어때? 어울려?","와아…!","헤헤"]), 2000); log(`${HATS[id].emo} ${selected.name}에게 ${josa(HATS[id].name, "을를")} 씌웠어요`); }
  $("coins").textContent = `🪙 ${S.coins}`;
});

/* ================= random events ================= */
const broken = {};
let eventObjs = [], bobObj = null, eventActive = null;
function toast(html, btn, fn){
  const t = $("toast"); t.hidden = false; t.innerHTML = `<span>${html}</span>` + (btn ? `<button type="button">${btn}</button>` : "");
  if (btn) t.querySelector("button").onclick = () => { fn(); };
}
const hideToast = () => { $("toast").hidden = true; };
function endEvent(msg, coins){
  eventObjs.forEach(o => o.parent?.remove(o)); eventObjs = []; bobObj = null;
  eventActive = null; hideToast(); if (msg) log(msg); if (coins) addCoins(coins); emit("event");
}
async function sendHelpers(ids, spot, actLine, secs){
  const helpers = ids.map(id => BY[id]).filter(Boolean);
  await Promise.all(helpers.map((c, i) => runSeq(c, [async () => {
    if (!await walkTo(c, {...spot, x:spot.x + (i - 1) * 34})) return;
    c.act = {kind:"jump", t0:performance.now()}; say(c, actLine, 2000);
    for (let s = 0; s < secs; s++){ await sleep(1000); addXP(c, 3, "fitness"); }
    c.act = null;
  }])));
}
const EVENTS = {
  parcel(){
    eventObjs = [box(1, 480, CY - 14, 30, 28, 24, "#c9a07a"), box(1, 480, CY - 1, 30, 2, 24.5, "#e8d2b4")];
    toast("📦 택배가 왔어요! (1층 복도)", "열어 보기", () => { const c = rand(CH.filter(o => o.floor === 1)) || rand(CH); say(c, "와아… 선물이다!", 2000); endEvent("📦 택배를 열었어요!", 30 + Math.floor(Math.random() * 50)); });
    return 50;
  },
  cake(){
    eventObjs = [cyl(1, 830, 275, 14, 16, "#fff3f6", 26), cyl(1, 830, 275, 2, 8, "#ffd36b", 42)];
    toast("🎂 누가 케이크를 사 왔어요! 다들 탕비실로~");
    CH.filter(c => c.manual < performance.now()).forEach((c, i) => runSeq(c, [async () => {   // 명령받은 친구는 빼고
      if (!await walkTo(c, {f:1, ...[{x:800,y:240},{x:860,y:240},{x:830,y:302},{x:770,y:270},{x:890,y:270},{x:800,y:300},{x:860,y:300},{x:830,y:230}][i]})) return;
      say(c, rand(["맛있다…!","케이크다~","야하!"]), 2000); c.act = {kind:"busy", t0:performance.now()};
      for (let s = 0; s < 5; s++){ await sleep(1000); c.needs.hunger = clamp(c.needs.hunger + 6, 0, 100); c.needs.fun = clamp(c.needs.fun + 4, 0, 100); }
      c.act = null; CH.forEach(o => { if (o !== c && o.floor === 1 && Math.hypot(o.x - c.x, o.y - c.y) < 120) addRel(c, o, 1); });
    }], true));
    setTimeout(() => endEvent("🎂 다 같이 케이크를 먹었어요!", 20), 26000);
    return 30;
  },
  blackout(){
    blackout = true; toast("⚡ 정전이에요!", "해결하기", fix);
    CH.forEach(c => say(c, c.id === "chiikawa" ? "…으앙!" : rand(["꺅!","깜깜해…","!?"]), 2200));
    async function fix(){ hideToast(); const h = CH.slice().sort((a, b) => skLv(b.skills.work) - skLv(a.skills.work))[0]; log(`${josa(h.name, "이가")} 배전반을 고치러 가요`);
      await sendHelpers([h.id], S1.panel[0], "끙차…!", 4); blackout = false; endEvent("💡 전기가 돌아왔어요!", 40); }
    setTimeout(() => { if (eventActive === "blackout"){ blackout = false; endEvent("💡 전기가 저절로 돌아왔어요"); } }, 60000);
    return 0;
  },
  coffee(){
    broken.coffee = true; coffeeLight.material.color.set("#555"); coffeeLight.material.emissiveIntensity = 0;
    toast("☕ 커피머신이 고장 났어요!", "고치기", fix);
    async function fix(){ hideToast(); const ids = ["shisa", "rakko"]; log("시사와 랏코가 커피머신을 고치러 가요"); await sendHelpers(ids, S1.coffee[0], "뚝딱뚝딱!", 5);
      broken.coffee = false; coffeeLight.material.color.set("#ff6b6b"); coffeeLight.material.emissiveIntensity = 1; endEvent("☕ 커피머신을 고쳤어요!", 30); }
    return 0;
  },
  intruder(){
    const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(22, 18, 12), mat("#3a2f52")); body.position.y = 22; g.add(body);
    for (const sx of [-8, 8]){ const e = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), new THREE.MeshBasicMaterial({ color: "#ff5c7a" })); e.position.set(sx, 28, 19); g.add(e); }
    g.position.copy(W(700, 520, 3)); G[3].add(g); eventObjs = [g]; bobObj = g;
    toast("👾 3층 테라스에 수상한 녀석이 나타났어요!", "토벌하러 가기", fight);
    async function fight(){ hideToast(); showFloor(3); log("우사기·랏코·치이카와가 토벌하러 출동!"); await sendHelpers(["usagi", "rakko", "chiikawa"], P(3, 700, 470), "우라!!", 6);
      CH.forEach(c => { if (["usagi","rakko","chiikawa"].includes(c.id)) addXP(c, 20, "fitness"); }); endEvent("⚔️ 토벌 성공! 수상한 녀석이 도망갔어요", 100); }
    setTimeout(() => { if (eventActive === "intruder") endEvent("👾 수상한 녀석이 사라졌어요"); }, 120000);
    return 0;
  },
};
function startEvent(){
  if (eventActive || document.hidden || isNight()) return;
  const k = rand(Object.keys(EVENTS)); eventActive = k; SFX.event(); log(`🔔 이벤트!`);
  const ttl = EVENTS[k](); if (ttl) setTimeout(() => { if (eventActive === k) endEvent(k === "parcel" ? "📦 누군가 택배를 정리했어요" : null, k === "parcel" ? 20 : 0); }, ttl * 1000);
}
setInterval(() => { if (Math.random() < .5) startEvent(); }, 150000);
setTimeout(startEvent, 40000);

/* ================= Claude: chat & task ================= */
const KEY_API = "chiikawa-office-apikey", KEY_MODEL = "chiikawa-office-model";
const lsGet = k => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
const lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };
let apiKey = lsGet(KEY_API), apiModel = lsGet(KEY_MODEL) || "claude-opus-5-5", sdk = null, sample = null;
$("apiKey").value = apiKey; $("apiModel").value = apiModel;
$("keySave").onclick = () => { apiKey = $("apiKey").value.trim(); apiModel = $("apiModel").value; lsSet(KEY_API, apiKey); lsSet(KEY_MODEL, apiModel); connUI(); log(apiKey ? "🔑 Claude 연결 완료" : "키가 비어 있어요", !apiKey); };
$("keyDel").onclick = () => { apiKey = ""; $("apiKey").value = ""; lsSet(KEY_API, ""); connUI(); };
const connected = () => !!(sample || apiKey);
function connUI(){
  const m = sample ? "claude.ai에서 Claude와 연결돼 있어요." : apiKey ? `내 API 키로 Claude와 연결돼 있어요 (${$("apiModel").selectedOptions[0]?.textContent || apiModel}).` : "Claude가 연결되지 않아서 미리 정해 둔 대사로 대답해요(토큰 0). 아래 'Claude 연결'에서 키를 넣으면 진짜 대화를 해요.";
  $("chatMode").textContent = m; $("taskMode").textContent = connected() ? m + " 업무 하나에 Claude를 한 번 불러요." : "Claude가 연결되지 않아서 예시 결과물로 보여 줘요. 아래 'Claude 연결'에서 키를 넣으면 실제로 일해요.";
}
(async () => { try { sample = window.claude?.use ? await window.claude.use("sample") : null; } catch (e) { sample = null; } connUI(); })();
const loadSdk = async () => sdk || (sdk = (await import("https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm")).default);
async function askClaude(system, messages, maxTokens){
  if (sample){
    const text = `${system}\n\n${messages.map(m => (m.role === "user" ? "플레이어: " : "나: ") + m.content).join("\n")}\n나:`;
    return (await sample(text, { cache: false })).text;
  }
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  const params = { model: apiModel, max_tokens: maxTokens, output_config: { effort: "low" }, ...(system ? { system } : {}), messages };
  try {
    const msg = apiModel !== "claude-haiku-5-5"
      ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : await client.messages.create(params);
    if (msg.stop_reason === "refusal") throw { code: "refused" };
    return msg.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  } catch (e) {
    if (e?.code) throw e;
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw { code: "bad_key" };
    if (e instanceof Anthropic.RateLimitError) throw { code: "rate_limited" };
    throw { code: "network" };
  }
}
const ERRMSG = {bad_key:"API 키가 올바르지 않아요", rate_limited:"사용량이 많아요. 잠시 뒤에 다시 해 주세요", refused:"이 말에는 대답할 수 없대요", network:"연결이 끊겼어요"};

/* chat with a character */
let chatWith = null;
const doingText = c => c.cur ? ACTIONS[c.cur].name : c.ride ? "에스컬레이터 타는" : c.path.length ? "걸어가는" : c.act?.kind === "sleep" ? "자는" : "쉬는";
function openChat(c){
  chatWith = c; $("chat").hidden = false; $("chatImg").src = `img/${c.id}.png`; $("chatName").textContent = `${josa(c.name, "과와")} 대화`;
  renderChat(); $("chat").scrollIntoView({behavior:"smooth", block:"nearest"}); setTimeout(() => $("chatIn").focus(), 300);
  if (!c.chatLog.length) addMsg(c, "them", LOCAL[c.id].greet[0]);
}
function renderChat(){
  const c = chatWith; if (!c) return;
  $("chatSub").textContent = `${TRAITS[c.id].title} · 나와의 사이: ${relTier(c.prel).name} ${relTier(c.prel).h} (${Math.round(c.prel)})`;
  $("msgs").innerHTML = c.chatLog.map(m => `<div class="msg ${m.r}">${esc(m.t)}</div>`).join("");
  $("msgs").scrollTop = $("msgs").scrollHeight;
}
function addMsg(c, r, t){ c.chatLog.push({r, t}); if (c.chatLog.length > 40) c.chatLog.shift(); if (chatWith === c) renderChat(); if (r === "them") say(c, t.length > 22 ? t.slice(0, 21) + "…" : t, 3500); }
$("chatClose").onclick = () => { $("chat").hidden = true; chatWith = null; };
const LOCAL = {
  chiikawa:{greet:["…!! 아, 안녕…!"], good:["와아… 오늘 좋은 날이야…!","헤헤… 기분 좋아…!"], bad:["…으앙… 조금 힘들어…","…괜찮아… 아마…"], love:["…!! (얼굴이 빨개짐)","나, 나도…!"], thanks:["…! 고마워…!"], cheer:["할 수 있어…! 힘낼게…!"], agree:["…응! 갈게…!","할 수 있어…!"], idle:["…?","와아…","…!"], hungry:["배고파… 뭐 먹고 싶어…"]},
  hachiware:{greet:["안녕~! 오늘도 반가워!"], good:["완전 좋아! 뭐든 해보는 거야!","기분 최고야~ 노래 부르고 싶어!"], bad:["음… 조금 지쳤나 봐. 그래도 괜찮아!","오늘은 좀 쉬고 싶네~"], love:["헤헤, 나도 너 좋아!","그렇게 말해 주니까 너무 기뻐~"], thanks:["별말씀을~ 언제든지!"], cheer:["고마워! 같이 힘내자~!"], agree:["좋아, 가자~!","그거 좋은 생각이다!"], idle:["오늘 날씨 좋다~","♪ 랄라라~","뭐 재밌는 거 없을까?"], hungry:["배고프다~ 같이 뭐 먹을래?"]},
  usagi:{greet:["야하!"], good:["우라!! (신나서 폴짝)","야하~!"], bad:["하아…? (시무룩)","푸루…"], love:["(볼을 긁적긁적) …야하!"], thanks:["우라!"], cheer:["우라아아!!"], agree:["우라! (벌써 달려감)","야하!"], idle:["하아?","푸루루루루…","(빤히 쳐다봄)"], hungry:["(배를 문지르며) 푸루…"]},
  rakko:{greet:["왔구나. 오늘도 잘 부탁해."], good:["컨디션 좋다. 오늘은 뭐든 맡겨."], bad:["조금 피곤하군. 잠깐 쉬어야겠어."], love:["…고맙다. 나도 너를 믿고 있어."], thanks:["당연한 일을 했을 뿐이야."], cheer:["좋아, 힘내 보지."], agree:["알았다. 다녀오지.","좋아."], idle:["오늘도 평화롭군.","수련을 게을리하면 안 되지."], hungry:["배가 고프군. 뭐라도 먹자."]},
  momonga:{greet:["흥, 이제 왔어? …반가운 건 아니거든!"], good:["나 오늘 완전 귀엽지? 칭찬해줘!","기분 좋아~ 더 놀아줘!"], bad:["흥! 아무도 안 놀아 주잖아…","나 좀 봐 줘…!"], love:["당연하지! 난 귀여우니까~","헤헤, 더 말해 줘!"], thanks:["흥, 고마운 줄은 아네?"], cheer:["나한테 칭찬해 주면 힘낼게!"], agree:["좋아! 대신 칭찬해 줘야 해!","갈게 갈게~"], idle:["칭찬해줘!","나 귀엽지?","심심해~ 놀아줘!"], hungry:["배고파! 간식 줘!"]},
  kurimanju:{greet:["하아… 어서 와~"], good:["캬~ 오늘 하루 최고다~","하아… 행복해~"], bad:["하아… 좀 지치네…","배가 고프면 힘이 안 나~"], love:["캬~ 그런 말 들으니 좋네~"], thanks:["뭘~ 고맙긴~"], cheer:["하아… 그래, 힘내 볼까~"], agree:["좋지~ 가자~","캬~ 그거 좋다~"], idle:["안주가 최고야~","하아…","오늘 저녁 뭐 먹지~"], hungry:["캬~ 맛있는 거 먹으러 가자~"]},
  shisa:{greet:["안녕하세요! 오늘도 열심히 할게요!"], good:["저 오늘 컨디션 최고예요!","배울 게 많아서 즐거워요!"], bad:["조금 힘들지만… 괜찮아요!","잠깐만 쉬어도 될까요…?"], love:["와아, 감사해요! 더 열심히 할게요!"], thanks:["아니에요! 제가 더 감사해요!"], cheer:["네! 열심히 할게요!"], agree:["네! 다녀올게요!","맡겨 주세요!"], idle:["열심히 할게요~!","이것도 연습이에요!"], hungry:["배가 고파요… 밥 먹고 올게요!"]},
  kani:{greet:["…안녕."], good:["…좋아.","…오늘은, 괜찮은 날."], bad:["…조금, 피곤해.","…쉬고 싶어."], love:["……(수줍게 고개를 끄덕임)"], thanks:["…응. 천만에."], cheer:["…응. 힘낼게."], agree:["…응. 갈게.","…알았어."], idle:["…","(사락사락)","…이 책, 재밌어."], hungry:["…배고파."]},
};
const ACT_WORDS = [["coffee",/커피/],["snack",/간식|과자|푸딩/],["meal",/밥|식사|점심|저녁 먹/],["water",/물 마|물마/],["toilet",/화장실 가|쉬야/],["wash",/손 씻|씻어|씻자/],["shower",/샤워/],
  ["nap",/낮잠/],["sleep",/자자$|자$|자줘|잠자|자러|누워|주무/],["sofa",/소파|쉬어|휴식/],["tv",/티비|TV|tv|텔레비전/],["read",/책 읽|독서/],["work",/일해|일하|업무해/],["meeting",/회의해|회의하/],
  ["exercise",/운동|달리기|스트레칭/],["dance",/춤|댄스|춰/],["draw",/그림|그려/],["boardgame",/보드게임/],["game",/게임/],["piano",/피아노|연주/],["movie",/영화 봐|영화 보|영화봐|영화 볼|영화보/],
  ["bbq",/바비큐|고기 구/],["sunbath",/일광욕|선베드/],["chat",/수다|얘기하|이야기하|놀아|대화하/],["massage",/안마/],
  ["study",/공부/],["sing",/노래/],["ura",/우라|소리 질러/],["sword",/검술|수련/],["aegyo",/애교/],["drink",/한 잔|한잔/],["practice",/연습/],["tidy",/정리|청소/]];
function findAct(text){ const a = ACT_WORDS.find(([k, re]) => re.test(text) && !(k === "sleep" && /자리|자료|가자|하자|먹자|보자|놀자/.test(text))); return a?.[0]; }
function localReply(c, text){
  const L = LOCAL[c.id], e = emotion(c), act = findAct(text);
  if (act){ if (!allowed(c, act)) return {t: c.id === "usagi" ? "하아? (고개를 갸웃)" : "그건… 내가 하기엔 어려워.", act:null}; return {t:rand(L.agree), act}; }
  if (/안녕|하이|ㅎㅇ|반가/.test(text)) return {t:rand(L.greet)};
  if (/좋아해|사랑|귀여|최고|멋져|예뻐/.test(text)){ c.prel = clamp(c.prel + 4, 0, 100); return {t:rand(L.love)}; }
  if (/고마|감사/.test(text)) return {t:rand(L.thanks)};
  if (/힘내|응원|화이팅|파이팅/.test(text)) return {t:rand(L.cheer)};
  if (/배고|먹/.test(text) || e.need?.k === "hunger") return {t:rand(L.hungry)};
  if (/기분|어때|괜찮|컨디션/.test(text)) return {t:rand(mood(c) > 55 ? L.good : L.bad)};
  if (/뭐해|뭐 해|뭐하/.test(text)) return {t: c.id === "usagi" ? `(${doingText(c)} 중) 우라!` : c.id === "kani" ? `…${doingText(c)} 중.` : `지금 ${doingText(c)} 중이야!`};
  if (/친구|누구랑|단짝/.test(text)){ const best = CH.filter(o => o !== c).sort((a, b) => rel(c, b) - rel(c, a))[0]; return {t: c.id === "usagi" ? `(${best.name} 쪽을 가리킴) 야하!` : `${best.name}! 제일 친해.`}; }
  return {t:rand(L.idle)};
}
let chatBusy = false;
$("chatForm").addEventListener("submit", async e => {
  e.preventDefault(); const c = chatWith, text = $("chatIn").value.trim(); if (!c || !text || chatBusy) return;
  $("chatIn").value = ""; addMsg(c, "me", text);
  c.needs.social = clamp(c.needs.social + 4, 0, 100); c.prel = clamp(c.prel + 1, 0, 100); emit("talk", c);
  let reply, act = null;
  if (connected()){
    chatBusy = true; addMsg(c, "sys", "…");
    const e2 = emotion(c), p = phase();
    const sys = `너는 팬이 만든 비공식 게임 "치이카와 오피스" 속 캐릭터 ${c.name}이야. 성격: ${TRAITS[c.id].title}, 좋아하는 것: ${TRAITS[c.id].likes}. 말투: ${TRAITS[c.id].speech}
지금 상황: 게임 시간 ${$("clock").textContent}, ${c.floor}층에서 ${doingText(c)} 중. 기분: ${e2.name} (${NEEDS.map(n => `${n.name} ${Math.round(c.needs[n.k])}`).join(", ")}). 플레이어와의 사이: ${relTier(c.prel).name}.
규칙: 한국어로 1~2문장, 50자 안쪽으로 짧게 캐릭터답게 대답해. 원작의 줄거리나 설정을 지어내지 마. 위험하거나 부적절한 요청은 캐릭터답게 부드럽게 거절해.
플레이어가 무언가를 하자고 하거나 시키고 너도 할 마음이 있으면 마지막 줄에 "@행동: 키" 한 줄을 붙여. 키 목록: ${Object.keys(ACTIONS).filter(k => allowed(c, k)).join(", ")}. 할 생각이 없으면 붙이지 마.`;
    const msgs = c.chatLog.filter(m => m.r !== "sys").slice(-10).map(m => ({role: m.r === "me" ? "user" : "assistant", content: m.t}));
    if (msgs[0]?.role === "assistant") msgs.shift();
    try {
      const out = await askClaude(sys, msgs, 1200);
      const m = out.match(/@행동\s*[:：]\s*([a-z0-9]+)/i); act = m && ACTIONS[m[1]] && allowed(c, m[1]) ? m[1] : null;
      reply = out.replace(/@행동.*$/m, "").trim() || rand(LOCAL[c.id].idle);
    } catch (err) { reply = rand(LOCAL[c.id].idle); addMsg(c, "sys", `(${ERRMSG[err?.code] || "오류"} · 미리 정한 대사로 대답해요)`); }
    c.chatLog = c.chatLog.filter(m => m.t !== "…" || m.r !== "sys"); chatBusy = false;
  } else { const r = localReply(c, text); reply = r.t; act = r.act; }
  addMsg(c, "them", reply);
  if (act){ addMsg(c, "sys", `${c.name}: ${ACTIONS[act].emo} ${ACTIONS[act].name}`); runSeq(c, [() => doAction(c, act)]); }
  save();
});

/* task (same answer format as the 2D office) */
const taskPrompt = task => `너는 작은 사무실 팀이야. 아래 업무를 실제로 끝까지 해내고, 정확히 이 형식으로만 답해.

업무: """${task.slice(0, 4000)}"""

@제목: (업무를 14자 이내로 줄인 이름)
@결과물
(업무를 완수한 실제 결과물. 한국어. 인사말이나 서론 없이 바로 본문. 마크다운은 ##, ###, -, 1., **굵게** 만 사용. 보통 600~1500자.)
@검토
점수: (1~5 정수)
한줄평: (40자 이내)`;
const demoTask = t => `@제목: ${t.slice(0, 14)}\n@결과물\n## ${t.slice(0, 30)}\n\n> 예시 결과물이에요. 'Claude 연결'에서 키를 넣으면 실제 결과물을 써요.\n\n### 진행 순서\n1. 원하는 결과물의 모양과 분량을 정해요.\n2. 필요한 자료를 자료실에서 모아요.\n3. 초안을 쓰고 우사기가 검토해요.\n4. 랏코가 최종본을 전달해요.\n@검토\n점수: 3\n한줄평: 키를 연결하면 진짜로 일할 수 있어! 야하!`;
const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
function md(src){
  let out = "", list = null; const close = () => { if (list){ out += `</${list}>`; list = null; } };
  for (const l of src.split("\n")){
    let m; if (!l.trim()){ close(); continue; }
    if ((m = l.match(/^#{1,2}\s+(.*)/))){ close(); out += `<h3>${inl(m[1])}</h3>`; continue; }
    if ((m = l.match(/^#{3,6}\s+(.*)/))){ close(); out += `<h4>${inl(m[1])}</h4>`; continue; }
    if ((m = l.match(/^>\s?(.*)/))){ close(); out += `<p class="note2">${inl(m[1])}</p>`; continue; }
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))){ if (list !== "ul"){ close(); out += "<ul>"; list = "ul"; } out += `<li>${inl(m[1])}</li>`; continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))){ if (list !== "ol"){ close(); out += "<ol>"; list = "ol"; } out += `<li>${inl(m[1])}</li>`; continue; }
    close(); out += `<p>${inl(l)}</p>`;
  }
  close(); return out;
}
let taskBusy = false;
$("taskGo").onclick = async () => {
  const t = $("taskIn").value.trim(); if (!t || taskBusy) return; taskBusy = true; $("taskGo").disabled = true;
  $("taskOut").hidden = false; $("taskOut").innerHTML = `<p class="note">랏코 팀장이 회의를 소집했어요… 결과물을 쓰는 중이에요.</p>`;
  log(`📋 업무 접수: ${t.slice(0, 30)}`); showFloor(1);
  CREW.forEach((c, i) => runSeq(c, [() => walkTo(c, S1.meet[i]), () => { say(c, rand(["회의 시작!","…!","우라!","좋아, 해보자~"]), 1800); return sleep(2500); }, () => walkTo(c, DESK[c.id]),
    () => { c.act = {kind:"busy", t0:performance.now()}; c.cur = "work"; return new Promise(r => { const iv = setInterval(() => { if (!taskBusy || c.cur !== "work"){ clearInterval(iv); r(); } }, 500); }); }]));
  let text;
  try { text = connected() ? await askClaude("", [{role:"user", content:taskPrompt(t)}], 8000) : (await sleep(6000), demoTask(t)); }
  catch (err) { text = null; $("taskOut").innerHTML = `<p class="note" style="color:var(--bad)">${ERRMSG[err?.code] || "오류가 났어요"}. 다시 지시해 주세요.</p>`; }
  taskBusy = false; $("taskGo").disabled = false;
  CREW.forEach(c => { if (c.cur === "work"){ c.cur = null; c.act = null; c.manual = performance.now() + 5000; } });
  if (!text) return;
  const title = (text.match(/@제목:\s*(.+)/) || [])[1] || t.slice(0, 14);
  const body = text.includes("@결과물") ? text.split("@결과물")[1].split("@검토")[0].trim() : text;
  const score = +((text.match(/점수\s*[:：]\s*(\d)/) || [])[1] || 4), comment = (text.match(/한줄평\s*[:：]\s*(.+)/) || [])[1] || "야하!";
  $("taskOut").innerHTML = `<h3>${esc(title)}</h3>${md(body)}<p class="note">우사기 검토: ${"★".repeat(score)}${"☆".repeat(5 - score)} · ${esc(comment)}</p>`;
  CREW.forEach(c => addXP(c, 15, "work")); addCoins(50, "업무 완료"); emit("task");
  say(BY.usagi, "야하! 승인!", 2400); say(BY.rakko, "결과물 나왔어. 확인해 봐!", 2600);
};

/* ================= photo ================= */
$("photoBtn").onclick = () => {
  renderer.render(scene, camera);
  const src = renderer.domElement, cv = document.createElement("canvas"); cv.width = src.width; cv.height = src.height;
  const g = cv.getContext("2d"); g.drawImage(src, 0, 0);
  const s = cv.width / 900; g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(12 * s, cv.height - 52 * s, 330 * s, 40 * s);
  g.fillStyle = "#2d3149"; g.font = `bold ${20 * s}px Gaegu, sans-serif`; g.fillText(`치이카와 오피스 · ${$("clock").textContent}`, 22 * s, cv.height - 25 * s);
  const a = document.createElement("a"); a.href = cv.toDataURL("image/png"); a.download = `chiikawa-office-${Date.now()}.png`; a.click();
  log("📷 사진을 저장했어요");
};

/* ================= selection, tap, commands ================= */
let selected = null;
function select(c){
  selected = c;
  CH.forEach(o => o.nmEl.classList.toggle("on", o === c));
  document.querySelectorAll("#who .chip").forEach(b => b.classList.toggle("on", b.dataset.id === c?.id));
  ring.visible = !!c; $("sel").hidden = !c && !placing;
  if (c){ $("sel").textContent = `${c.name} 선택됨 · 바닥을 누르면 그쪽으로 가요`; if (c.floor !== viewFloor && viewFloor !== 0) showFloor(c.floor); }
  renderStatus(); renderShop();
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener("pointerdown", e => { down = {x:e.clientX, y:e.clientY, t:performance.now()}; });
renderer.domElement.addEventListener("pointerup", e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
  if (moved > 8 || dt > 600) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const f = viewFloor || 1, pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -fy(f)), p = new THREE.Vector3();
  if (placing){
    if (!ray.ray.intersectPlane(pl, p)) return;
    const q = clampWalk({x:p.x + CX, y:p.z + CY}, f), d = {id:placing, f, x:q.x, y:q.y};
    S.coins -= DECOR[placing].price; S.decor.push(d); buildDecor(d); log(`${DECOR[placing].emo} ${josa(DECOR[placing].name, "을를")} ${f}층에 놓았어요`);
    placing = null; $("sel").hidden = !selected; addCoins(0); return;
  }
  const hit = ray.intersectObjects(CH.filter(visibleChar).map(c => c.sprite))[0];
  if (hit){ const c = hit.object.userData.c; select(selected === c ? null : c); if (selected) say(c, rand(["응?","…!","부르셨어요?","왜~?"]), 1500); return; }
  if (!selected || !ray.ray.intersectPlane(pl, p)) return;
  const to = {...clampWalk({x:p.x + CX, y:p.z + CY}, f), f}, c = selected, rk = roomAt(f, to);
  log(`${c.name} → ${f}층 ${rk ? FLOORS[f].rooms[rk].name : "복도"}`); emit("cmd", c);
  runSeq(c, [async () => { if (await walkTo(c, to)) say(c, rand(["도착!","여기?","왔어~"]), 1500); }]);
});
const PLACE = [
  {k:["회의실"], at:i => S1.meet[i % 8], name:"회의실"}, {k:["탕비실"], at:i => [S1.coffee[0], S1.fridge[0], ...S1.table][i % 5], name:"탕비실"},
  {k:["화장실"], at:i => S1.stall[i % 2], name:"화장실"}, {k:["휴게실"], at:i => [...S1.sofa, ...S1.tv, ...S1.bean][i % 6], name:"휴게실"},
  {k:["자료실"], at:i => [...S1.shelf, ...S1.printer][i % 3], name:"자료실"}, {k:["자리","책상"], at:(i, c) => DESK[c.id] || c.home, name:"자리"},
  {k:["기숙사","침대","내 방","방으로"], at:(i, c) => BED[c.id], name:"기숙사"}, {k:["샤워실"], at:i => S2.shower[i % 2], name:"샤워실"},
  {k:["거실"], at:i => [...S2.sofa, ...S2.tv, ...S2.kitchen][i % 5], name:"거실"}, {k:["취미방"], at:i => [...S3.game, ...S3.easel, ...S3.piano, ...S3.board][i % 6], name:"취미방"},
  {k:["영화관"], at:i => S3.seats[i % S3.seats.length], name:"영화관"}, {k:["테라스","옥상"], at:i => [...S3.table, ...S3.lounger, ...S3.bbq, ...S3.view, ...S3.flowers][i % 7], name:"테라스"},
  {k:["엘리베이터"], at:(i, c) => ({f:c.floor, x:122 - (i % 2) * 14, y:578 - Math.floor(i / 2) * 18}), name:"엘리베이터 앞"},
  {k:["에스컬레이터"], at:(i, c) => ({f:c.floor, x:1010 + (i % 3) * 70, y:CY}), name:"에스컬레이터 홀"},
  {k:["1층"], at:i => P(1, 400 + i * 50, CY), name:"1층"}, {k:["2층"], at:i => P(2, 400 + i * 50, CY), name:"2층"}, {k:["3층"], at:i => P(3, 400 + i * 50, CY), name:"3층"},
];
function parseOne(s, lastWho){
  s = s.trim(); if (!s) return null;
  const quote = s.match(/["'“”‘’「」『』](.+?)["'“”‘’「」『』]/);
  const bare = s.replace(/["'“”‘’「」『』].+?["'“”‘’「」『』]/, " ");
  let who = [];
  if (/모두|다들|전부|다 같이|다같이|모든|전원|친구들/.test(bare)) who = CH.slice();
  else for (const c of CH) if (ALIAS[c.id].some(a => bare.includes(a))) who.push(c);
  if (!who.length && lastWho) who = lastWho;
  if (!who.length && selected) who = [selected];
  if (!who.length) return {err:"누구에게 시킬지 모르겠어요. 이름을 넣거나 캐릭터를 먼저 눌러 주세요."};
  if (quote || /라고|말해/.test(bare)) return {who, run:c => doAnim(c, "say", quote ? quote[1] : rand(LINES[c.id])), desc:`말하기${quote ? ` "${quote[1]}"` : ""}`};
  if (/멈춰|정지|스톱|그만/.test(bare)) return {who, run:c => { stop(c); c.cur = null; say(c, "멈춤!", 1200); }, desc:"멈추기"};
  if (/일어나|깨어|기상/.test(bare)) return {who, run:c => { stop(c); say(c, "으음… 잘 잤다!", 1800); }, desc:"일어나기"};
  if (/점프|폴짝/.test(bare)) return {who, run:c => doAnim(c, "jump"), desc:"점프"};
  if (/돌아$|돌아줘|빙글|회전|한 바퀴|한바퀴/.test(bare)) return {who, run:c => doAnim(c, "spin"), desc:"빙글빙글"};
  if (/돌아와|제자리|원래 자리/.test(bare)) return {who, run:c => walkTo(c, c.home), desc:"제자리로"};
  const isMove = /(으로|로)\s*(가|와|이동|모여|올라|내려)|가$|가줘|와$|와줘|모여|이동|올라가|내려가/.test(bare);
  const act = !isMove && findAct(bare);
  if (act && ACTIONS[act].partner && who.length > 1 && who.length < CH.length){   // 이름 둘을 부르면 둘이 함께
    const pairs = who.filter((_, i) => i % 2 === 0); return {who:pairs, run:(c, i) => doAction(c, act, {partner:who[i * 2 + 1]}), desc:ACTIONS[act].name};
  }
  if (act) return {who, run:c => doAction(c, act), desc:ACTIONS[act].name};
  const pl = PLACE.find(p => p.k.some(k => bare.includes(k)));
  if (pl) return {who, run:(c, i) => walkTo(c, pl.at(i, c)).then(ok => { if (ok) say(c, rand(["도착!","왔어~","…!"]), 1500); return ok; }), desc:`${josa(pl.name, "으로")} 이동`};
  if (/따라|나한테|이리|여기/.test(bare) && selected && !who.includes(selected)) return {who, run:(c, i) => walkTo(c, {f:selected.floor, x:selected.x + 40 + i * 30, y:selected.y + 10}), desc:"따라가기"};
  return {err:`"${s}"는 아직 모르는 명령이에요. 장소 이름이나 행동(커피·춤·영화·노래 등)을 넣어 보세요.`};
}
function runCommand(text){
  const parts = text.split(/,|，|그리고|\n|;/).map(t => t.trim()).filter(Boolean);
  let lastWho = null; const plan = new Map();
  for (const p of parts){
    const r = parseOne(p, lastWho); if (!r) continue;
    if (r.err){ log(r.err, true); continue; }
    lastWho = r.who; emit("cmd");
    r.who.forEach((c, i) => { if (!plan.has(c)) plan.set(c, []); plan.get(c).push(() => r.run(c, i)); });
    log(`${r.who.length === CH.length ? "모두" : r.who.map(c => c.name).join(", ")}: ${r.desc}`);
  }
  for (const [c, steps] of plan) runSeq(c, steps);
}
$("cmdForm").addEventListener("submit", e => { e.preventDefault(); const v = $("cmd").value.trim(); if (!v) return; runCommand(v); $("cmd").value = ""; });
$("who").innerHTML = CH.map(c => `<button type="button" class="chip who" data-id="${c.id}">${c.name}</button>`).join("");
$("who").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; const c = BY[b.dataset.id]; select(selected === c ? null : c); });
const EXAMPLES = ["모두 회의실로 모여","우사기 테라스로 가","하치와레 노래 불러","치이카와 영화 봐","랏코 검술 수련해","모몽가 애교 부려","쿠리만쥬 한 잔 해","하치와레랑 시사 보드게임 해","모두 기숙사로 가","카니 책 정리해"];
$("ex").innerHTML = EXAMPLES.map(t => `<button type="button" class="chip">${t}</button>`).join("");
$("ex").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) runCommand(b.textContent); });
function log(msg, bad){
  const d = document.createElement("div"); d.textContent = `${$("clock").textContent.split(" · ")[0]}  ${msg}`; if (bad) d.className = "bad";
  $("log").prepend(d); while ($("log").children.length > 50) $("log").lastChild.remove();
  if (!bad){ history.push(msg); board.redraw(history); }
}

/* ================= agents: dev work log & meetings ================= */
// 캐릭터 한 명 한 명이 역할을 맡은 에이전트예요. 회의로 일을 나누고, 자리에서 일하고, 우사기가 시험해요.
const TASKS = [];
let meetingBusy = false;
const WORKSPOT = {momonga:P(1,465,548), kurimanju:P(1,830,240), shisa:P(1,835,100), kani:P(1,800,520)};
const workSpot = c => DESK[c.id] || WORKSPOT[c.id];
function minute(c, text, cls = ""){
  const d = document.createElement("div"); d.className = "mline " + cls;
  d.innerHTML = c ? `<img src="img/${c.id}.png" alt=""><b>${c.name}</b><span></span>` : `<span></span>`;
  d.lastChild.textContent = text; $("minutes").appendChild(d); $("minutes").scrollTop = $("minutes").scrollHeight;
}
async function speak(c, text){
  say(c, text.length > 26 ? text.slice(0, 25) + "…" : text, 3800); minute(c, text);
  await sleep(Math.max(2200, Math.min(4200, text.length * 85)));
}
function claim(list){ const now = performance.now(); list.forEach(c => { c.seq = {}; stop(c); c.cur = null; c.manual = Infinity; }); }
function release(list){ const now = performance.now(); list.forEach(c => { if (c.manual === Infinity) c.manual = now + 8000; if (c.cur === "devwork") c.cur = null; c.act = null; }); }
// 다 모이길 오래 기다리지 않고, 랏코가 도착하면 조금 뒤 시작해요 (늦은 친구는 오는 중에 들어요)
async function gather(list){ const all = Promise.all(list.map((c, i) => walkTo(c, S1.meet[i % 8]))); await Promise.race([all, sleep(14000)]); }
function renderBoard(){
  const col = st => TASKS.filter(t => t.status === st);
  const card = t => `<div class="task ${t.status}"><img src="img/${t.who}.png" alt=""><div><b>${esc(t.title)}</b><small>${BY[t.who].name} · ${ROLES[t.who].short}</small>${bar(t.p)}</div></div>`;
  $("board").innerHTML = ["todo", "doing", "review", "done"].map(st => `<div class="bcol"><h3>${{todo:"할 일", doing:"진행 중", review:"검토", done:"완료"}[st]} <span>${col(st).length}</span></h3>${col(st).slice(-6).map(card).join("")}</div>`).join("");
}
async function workTask(c, task, lines){
  task.status = "doing"; renderBoard();
  if (!await walkTo(c, workSpot(c))) { /* 이동이 끊겨도 그 자리에서 이어서 해요 */ }
  c.cur = "devwork"; c.act = {kind:"busy", t0:performance.now()};
  const steps = lines.length * 3;
  for (let s = 0; s < steps; s++){
    if (s % 3 === 0) say(c, lines[s / 3], 2600);
    if (DESK[c.id]) monitors[c.id].redraw(`${c.name}\n${task.title.slice(0, 11)}\n${"▮".repeat(Math.ceil((s + 1) / steps * 8))}`);
    await sleep(1300); task.p = Math.round((s + 1) / steps * 100); renderBoard();
  }
  if (DESK[c.id]) monitors[c.id].redraw(`${c.name}\n휴식 중`);
  c.act = null; c.cur = null; addXP(c, 12, ROLES[c.id].short === "QA" ? "knowledge" : ROLES[c.id].short === "디자인" ? "art" : "work");
  task.status = "review"; renderBoard();
}
async function playSession(sess){
  if (meetingBusy){ log("지금 회의 중이에요", true); return; }
  meetingBusy = true; showFloor(1); $("minutes").innerHTML = ""; TASKS.length = 0; renderBoard();
  minute(null, `📅 ${sess.date} · ${sess.title}`, "head");
  const team = CH.slice(); claim(team); await gather(team);
  const R = BY.rakko;
  await speak(R, `회의 시작하지. 요청: "${sess.request}"`);
  const items = sess.items.filter(it => it.who !== "rakko");
  const lead = sess.items.find(it => it.who === "rakko"); if (lead) await speak(R, lead.plan);
  for (const it of items){
    const c = BY[it.who]; TASKS.push({title:it.title, who:it.who, p:0, status:"todo", it}); renderBoard();
    await speak(R, `${c.name}, ${josa(it.title, "을를")} 맡아 줘.`); await speak(c, it.plan);
  }
  await speak(R, "좋아, 다들 자리로! 시작하자.");
  await Promise.all(TASKS.map(t => workTask(BY[t.who], t, t.it.work)));
  minute(null, "🔎 우사기가 시험하는 중…", "head");
  const U = BY.usagi; await walkTo(U, P(1, 500, 250));
  for (const t of TASKS){
    if (t.it.bug){ await speak(U, t.it.bug); const fx = BY[t.it.fixBy]; await speak(fx, t.it.fix); fx.act = {kind:"busy", t0:performance.now()}; await sleep(2500); fx.act = null; }
    t.status = "done"; renderBoard();
  }
  for (const t of TASKS) if (t.it.done) await speak(BY[t.who], t.it.done);
  await speak(BY.kurimanju, "하아… 배포 완료~ 캬~");
  await speak(R, "다들 수고했어. 오늘 작업 끝!");
  team.forEach(c => { if (visibleChar(c)) c.act = {kind:"jump", t0:performance.now()}; });
  addCoins(40, "개발 작업 완료"); emit("meeting");
  release(team); meetingBusy = false;
}
// 주제 회의: Claude가 연결돼 있으면 대본을 만들고, 없으면 역할별 대사로 진행해요
function localMeeting(topic){
  const t = topic.length > 26 ? topic.slice(0, 25) + "…" : topic, st = topic.length > 10 ? topic.slice(0, 10) + "…" : topic;
  return {
    lines:[
      ["rakko", `오늘 안건은 "${t}"야. 각자 의견 말해 줘.`],
      ["hachiware", `화면에서 바로 보이게 만들면 좋겠어! 버튼 하나로 되게!`],
      ["chiikawa", `…귀엽게 꾸미는 건, 내가 해 볼게…!`],
      ["shisa", `필요한 데이터랑 규칙은 제가 정리할게요!`],
      ["usagi", `우라! (시험은 맡겨 달라는 듯 손을 번쩍)`],
      ["kurimanju", `하아… 다 되면 배포는 내가 챙길게~`],
      ["momonga", `사용법은 내가 쓸게! 대신 칭찬해 줘!`],
      ["kani", `…코드 리뷰는, 내가.`],
      ["hachiware", `좋다! 작게 먼저 만들고 고쳐 나가자~`],
      ["rakko", `좋아, 정리하지. 하치와레가 화면, 치이카와가 디자인, 시사가 규칙을 맡는다.`],
    ].map(([who, text]) => ({who, text})),
    decisions:[`"${t}"는 작게 먼저 만들고 우사기가 시험한 뒤 고친다`],
    todos:[{who:"hachiware", title:`${st} 화면 만들기`}, {who:"chiikawa", title:`${st} 꾸미기`}, {who:"shisa", title:`${st} 규칙 정리`}, {who:"momonga", title:`${st} 안내문 쓰기`}],
  };
}
async function claudeMeeting(topic){
  const roster = CH.map(c => `- ${c.name} (${ROLES[c.id].role}): ${TRAITS[c.id].speech}`).join("\n");
  const sys = `너는 팬이 만든 비공식 게임 "치이카와 오피스"의 회의 대본 작가야. 캐릭터는 각자 역할을 맡은 AI 에이전트 팀이야. 원작 설정을 지어내지 말고, 아래 말투를 지켜.\n${roster}`;
  const ask = `회의 주제: """${topic.slice(0, 300)}"""
아래 형식으로만 써.
이름: 대사   ← 10~14줄. 각 대사 50자 이내. 랏코가 시작하고 마지막에 정리해. 이름은 ${CH.map(c => c.name).join(", ")} 중에서.
@결정: (결정 사항, 1~3줄)
@할일: 이름 | 할 일 (2~5줄, 할 일은 20자 이내)`;
  const out = await askClaude(sys, [{role:"user", content:ask}], 3000);
  const nameTo = Object.fromEntries(CH.map(c => [c.name, c.id]));
  const lines = [], decisions = [], todos = [];
  for (const raw of out.split("\n")){
    const l = raw.trim(); let m;
    if ((m = l.match(/^@결정\s*[:：]\s*(.+)/))) decisions.push(m[1]);
    else if ((m = l.match(/^@할일\s*[:：]\s*(\S+)\s*\|\s*(.+)/)) && nameTo[m[1]]) todos.push({who:nameTo[m[1]], title:m[2].slice(0, 24)});
    else if ((m = l.match(/^(\S+?)\s*[:：]\s*(.+)/)) && nameTo[m[1]]) lines.push({who:nameTo[m[1]], text:m[2].slice(0, 80)});
  }
  if (lines.length < 3) throw { code:"format" };
  return {lines, decisions, todos};
}
async function agentMeeting(topic){
  if (meetingBusy){ log("지금 회의 중이에요", true); return; }
  meetingBusy = true; showFloor(1); $("minutes").innerHTML = ""; minute(null, `🗣️ 회의 주제: ${topic}`, "head");
  let script = null;
  if (connected()){ minute(null, "Claude가 회의 대본을 쓰는 중…", "head"); try { script = await claudeMeeting(topic); } catch (e) { minute(null, `(${ERRMSG[e?.code] || "대본을 만들지 못했어요"} · 기본 대본으로 진행해요)`, "head"); } }
  script = script || localMeeting(topic);
  const team = CH.slice(); claim(team); await gather(team);
  for (const l of script.lines) await speak(BY[l.who], l.text);
  for (const d of script.decisions){ minute(null, `✅ 결정: ${d}`, "head"); }
  const tasks = script.todos.map(t => ({title:t.title, who:t.who, p:0, status:"todo"})); TASKS.push(...tasks); renderBoard();
  for (const t of tasks) minute(BY[t.who], `할 일: ${t.title}`, "todo");
  await speak(BY.rakko, "좋아, 각자 자리로!");
  const generic = c => ({hachiware:["화면 만드는 중!","거의 다 됐어~"], chiikawa:["…꾸미는 중…","…색 고르는 중…"], shisa:["규칙 정리 중이에요!","표로 만들었어요!"], momonga:["안내문 쓰는 중!","칭찬받을 준비 끝!"], kurimanju:["하아… 서버 보는 중~"], kani:["…읽는 중.","…괜찮아."], usagi:["(이것저것 눌러 봄)","우라!"], rakko:["진행 상황 확인 중","좋아"]}[c.id]);
  await Promise.all(tasks.map(t => workTask(BY[t.who], t, generic(BY[t.who]))));
  const U = BY.usagi; await speak(U, rand(["우라! (통과!)","야하!","하아…? …우라! (괜찮다는 듯)"]));
  tasks.forEach(t => t.status = "done"); renderBoard();
  await speak(BY.rakko, "회의에서 정한 일 끝. 수고했어!");
  addCoins(30, "회의 안건 완료"); emit("meeting");
  release(team); meetingBusy = false;
}
// 자체 회의: 업무 시간에는 가끔 알아서 짧은 아침 회의를 해요
async function standup(){
  if (meetingBusy || taskBusy || isNight() || phase().k !== "work") return;
  const team = CREW.filter(c => c.manual < performance.now() && !c.ride && !c.hidden); if (team.length < 3) return;
  meetingBusy = true; $("minutes").innerHTML = ""; minute(null, "☀️ 자체 회의 (아침 스탠드업)", "head"); claim(team); await gather(team);
  await speak(BY.rakko, "짧게 스탠드업 하지. 각자 한 줄씩.");
  for (const c of team.filter(c => c.id !== "rakko")){
    const top = Object.entries(c.stats).filter(([k]) => ACTIONS[k] && !ACTIONS[k].hidden).sort((a, b) => b[1] - a[1])[0];
    const did = top ? `${ACTIONS[top[0]].name} ${top[1]}번` : "준비";
    await speak(c, c.id === "usagi" ? `우라! (${did} 했다는 듯 손가락을 폄)` : c.id === "chiikawa" ? `…${did} 했어…! 오늘도 할 수 있어…!` : `${did} 했어! 오늘은 ${ROLES[c.id].role} 일 계속할게!`);
  }
  await speak(BY.rakko, "좋아. 오늘도 잘 부탁해.");
  release(team); meetingBusy = false; emit("meeting");
}
setInterval(() => { if (Math.random() < .35) standup(); }, 240000);
$("logSel").innerHTML = SESSIONS.map((s, i) => `<option value="${i}">${s.date} · ${s.title}</option>`).join("");
$("replayBtn").onclick = () => playSession(SESSIONS[+$("logSel").value || 0]);
$("meetForm").addEventListener("submit", e => { e.preventDefault(); const t = $("meetIn").value.trim(); if (!t) return; $("meetIn").value = ""; agentMeeting(t); });

/* ================= panels ================= */
const bar = (v, max = 100) => `<span class="bar"><i style="width:${clamp(v / max * 100, 0, 100)}%;background:${moodColor(v / max * 100).getStyle()}"></i></span>`;
function renderStatus(){
  const c = selected, el = $("status");
  if (!c){
    el.innerHTML = `<h2>팀 상태</h2><p class="note" style="margin-top:0">캐릭터를 누르면 상태창과 대화가 열려요.</p><div class="team">${CH.map(o => { const e = emotion(o);
      return `<button type="button" class="trow" data-id="${o.id}"><img src="img/${o.id}.png" alt=""><b>${o.name}</b><span>Lv.${o.lv}</span><span title="${e.name}">${e.emo}</span><small>${o.floor}층 · ${o.cur ? ACTIONS[o.cur].emo + " " + ACTIONS[o.cur].name : o.ride ? "🛗 에스컬레이터" : o.hidden ? "🛗 엘리베이터" : o.path.length ? "🚶 이동 중" : o.act?.kind === "sleep" ? "💤 자는 중" : "대기"}</small></button>`; }).join("")}</div>`;
    return;
  }
  const e = emotion(c), T = TRAITS[c.id];
  const rels = CH.filter(o => o !== c).map(o => ({o, v:rel(c, o)})).sort((a, b) => b.v - a.v);
  el.innerHTML = `
    <div class="shead"><img src="img/${c.id}.png" alt=""><div><h2>${c.name} <span class="lv">Lv.${c.lv}</span></h2>
      <div class="xp">${bar(c.xp, xpNeed(c.lv))}<small>${Math.floor(c.xp)} / ${xpNeed(c.lv)} XP</small></div>
      <div class="moodline">${e.emo} <b>${e.name}</b> · 기분 ${Math.round(mood(c))} · ${c.floor}층에서 ${doingText(c)} 중</div>
      <div class="trait">✨ ${T.title} · 좋아하는 것: ${T.likes}</div><div class="trait">🧩 에이전트 역할: ${ROLES[c.id].role}</div></div>
      <button type="button" class="x" id="closeSel" aria-label="닫기">✕</button></div>
    <div class="needs">${NEEDS.map(n => `<div class="need"><span>${n.icon} ${n.name}</span>${bar(c.needs[n.k])}</div>`).join("")}</div>
    <div class="skills">${Object.entries(SKILLS).map(([k, s]) => `<span>${s.icon} ${s.name} <b>Lv.${skLv(c.skills[k])}</b></span>`).join("")}</div>
    <div class="sub">관계</div><div class="rels">${rels.map(({o, v}) => `<span>${o.name} <b>${relTier(v).name}</b> ${relTier(v).h}</span>`).join("")}<span>나 <b>${relTier(c.prel).name}</b> ${relTier(c.prel).h}</span></div>
    <div class="sub">행동</div><div class="acts"><button type="button" class="act talk" data-a="__talk">💬 대화하기</button>
      ${Object.entries(ACTIONS).filter(([k, a]) => a.only === c.id).map(([k, a]) => `<button type="button" class="act special" data-a="${k}">${a.emo} ${a.name}</button>`).join("")}
      ${Object.entries(ACTIONS).filter(([k, a]) => !a.only && !a.hidden).map(([k, a]) => `<button type="button" class="act" data-a="${k}" ${allowed(c, k) ? "" : "disabled"}>${a.emo} ${a.name}</button>`).join("")}
      ${c.hat ? `<button type="button" class="act" data-a="__hat">🎩 모자 벗기</button>` : ""}</div>`;
}
function renderQuests(){
  $("quests").innerHTML = `<h2>과업 <span class="lv">오피스 Lv.${S.office.lv}</span></h2>
    <div class="xp">${bar(S.office.xp, officeNeed(S.office.lv))}<small>${S.office.xp} / ${officeNeed(S.office.lv)} · 완료 ${S.office.done}개</small></div>
    <ul class="qs">${quests.map(q => `<li class="${q.doneAt ? "done" : ""}"><span>${q.doneAt ? "✅" : "📌"} ${qText(q)}</span>${bar(q.p, q.n)}<small>${q.p}/${q.n} · 보상 ${q.reward}</small></li>`).join("")}</ul>
    <button type="button" class="chip" id="resetSave">처음부터 다시 하기</button>`;
}
$("status").addEventListener("click", e => {
  const t = e.target.closest(".trow"); if (t) return select(BY[t.dataset.id]);
  if (e.target.closest("#closeSel")) return select(null);
  const b = e.target.closest(".act"); if (!b || !selected || b.disabled) return;
  const c = selected, k = b.dataset.a;
  if (k === "__talk") return openChat(c);
  if (k === "__hat"){ c.hat = null; buildHat(c); renderStatus(); return; }
  log(`${c.name}: ${ACTIONS[k].name}`); emit("cmd", c);
  runSeq(c, [() => doAction(c, k)]);
});
$("quests").addEventListener("click", e => {
  if (!e.target.closest("#resetSave")) return;
  if (!confirm("레벨, 경험치, 코인, 가구, 과업, 관계를 모두 처음으로 되돌릴까요?")) return;
  resetting = true;
  try { localStorage.removeItem(SAVE_KEY); } catch (err) {}
  location.reload();
});
setInterval(() => { renderStatus(); for (const f of [1, 2, 3]) $("n" + f).textContent = ` · ${CH.filter(c => c.floor === f).length}`; }, 700);

/* ================= animation loop ================= */
const clock = new THREE.Clock();
const SPEED = 120, RIDE = 55;
function tick(){
  const dt = Math.min(.05, clock.getDelta()), now = performance.now();
  S.time = (S.time + dt * 2 * speed) % 1440;
  if ((tick.t = (tick.t || 0) + dt) > .25){ tick.t = 0; applyTime(); if (G[3].visible) screenTex.redraw(now / 2000); }
  for (const e of ESC) e.tex.offset.y -= e.dir * dt * 1.2;
  for (const f of [1, 2, 3]){ const E = ELEV[f]; E.open = lerp(E.open, E.want, Math.min(1, dt * 6)); E.l.position.x = E.lx - E.open * 22; E.r.position.x = E.rx + E.open * 22; }
  if (bobObj){ bobObj.position.y = fy(3) + Math.abs(Math.sin(now / 250)) * 10; bobObj.rotation.y += dt; }
  for (const c of CH){
    c.t += dt; let bob = 0, rot = 0, h = fy(c.floor);
    if (c.ride){
      const e = c.ride.e, len = Math.abs(e.end.y - e.start.y); c.ride.t = Math.min(1, c.ride.t + RIDE * dt / len);
      c.x = e.lane; c.y = lerp(e.start.y, e.end.y, c.ride.t); h = lerp(fy(e.start.f), fy(e.end.f), c.ride.t) + 6;
      if (c.ride.t >= 1){ c.floor = e.end.f; h = fy(c.floor); const r = c.ride.resolve; c.ride = null; r && r(true); }
    } else if (c.path.length){
      const g = c.path[0], dx = g.x - c.x, dy = g.y - c.y, d = Math.hypot(dx, dy), step = SPEED * dt;
      if (Math.abs(dx) > 1){ const fc = dx < 0 ? -1 : 1; if (fc !== c.face){ c.face = fc; c.mat.map.repeat.x = fc; c.mat.map.offset.x = fc < 0 ? 1 : 0; c.mat.map.wrapS = THREE.RepeatWrapping; c.mat.map.needsUpdate = true; } }
      if (d <= step){ c.x = g.x; c.y = g.y; c.path.shift(); } else { c.x += dx / d * step; c.y += dy / d * step; }
      bob = Math.abs(Math.sin(c.t * 12)) * 5; rot = Math.sin(c.t * 12) * .1;
      if (!c.path.length){ const r = c.resolve; c.resolve = null; r && r(true); }
    } else if (c.act){
      const e = (now - c.act.t0) / 1000, k = c.act.kind;
      if (k === "jump"){ bob = Math.max(0, Math.sin(e * 7)) * 30; if (e > 2.7 && !c.cur) c.act = null; }
      else if (k === "dance"){ bob = Math.abs(Math.sin(e * 8)) * 12; rot = Math.sin(e * 6) * .35; if (e > 6 && !c.cur) c.act = null; }
      else if (k === "spin"){ rot = e * 8; if (e > 2.4){ c.act = null; rot = 0; } }
      else if (k === "sleep"){ rot = Math.PI / 2 * .9; bob = 14; }
      else if (k === "say"){ bob = Math.abs(Math.sin(e * 5)) * 3; if (e > 3) c.act = null; }
      else if (k === "busy"){ bob = Math.abs(Math.sin(e * 4)) * 3; rot = Math.sin(e * 3) * .05; }
    }
    c.mat.rotation = rot;
    c.obj.position.copy(W(c.x, c.y, 1)); c.obj.position.y = h; c.sprite.position.y = bob;
    const vis = visibleChar(c) && !c.hidden;
    c.obj.visible = vis; c.nmO.visible = vis && viewFloor !== 0; c.bubO.visible = vis && viewFloor !== 0;
    c.gem.rotation.y += dt * 1.6; c.gem.position.y = c.H + 22 + bob + Math.sin(c.t * 2) * 2; c.gem.visible = c.act?.kind !== "sleep";
    c.hatG.position.y = c.H - 6 + bob; c.hatG.visible = c.act?.kind !== "sleep";
    if ((c.gemT = (c.gemT || 0) + dt) > .5){ c.gemT = 0; const col = moodColor(mood(c)); c.gem.material.color.copy(col); c.gem.material.emissive.copy(col).multiplyScalar(.5); }
  }
  if (selected){ ring.visible = visibleChar(selected) && !selected.hidden; ring.position.copy(selected.obj.position); ring.position.y += 1.2; ring.material.opacity = .6 + Math.sin(now / 200) * .3; }
  camTick(dt); cityTick(dt);
  controls.update();
  renderer.render(scene, camera); labels.render(scene, camera);
  requestAnimationFrame(tick);
}

/* ================= start ================= */
applyView(); resize(); camHome(); applyTime(); renderBoard(); renderQuests(); renderShop(); renderStatus(); connUI();
$("coins").textContent = `🪙 ${S.coins}`;
if (isNight()) CH.forEach(c => { c.floor = 2; c.x = BED[c.id].x; c.y = BED[c.id].y; c.act = {kind:"sleep", t0:performance.now()}; });
tick();
window.__office = {CH, S, ESC, addCoins, startEvent};   // 디버그용
log("출근 완료! 캐릭터를 누르거나 명령을 써 보세요.");
setTimeout(() => say(BY.hachiware, "오늘도 힘내자~!", 2600), 800);
