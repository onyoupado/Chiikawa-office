# 코드 검수 요청 묶음

GPT 같은 AI에게 아래 요청문을 먼저 보내고, 파트를 순서대로 붙여 넣어 주세요.

## 요청문

```
너는 시니어 프론트엔드·Three.js 코드 리뷰어야.
아래는 팬이 만든 비영리 웹 프로젝트 "치이카와 오피스"의 코드야. 바닐라 JavaScript와 Three.js r160을 쓰고, 빌드 없이 GitHub Pages에 올려서 브라우저에서 바로 실행해.
코드를 파트 1/29부터 29/29까지 나눠서 보낼게. 마지막 파트를 받기 전까지는 "파트 k/29 받음"이라고만 짧게 답해 줘.
모든 파트를 받으면, 한국어로 다음 순서대로 리뷰해 줘.
1. 버그: 실제로 일어날 수 있는 경로(어떤 조작을 하면 무엇이 잘못되는지)와 고친 코드 조각. 심각한 것부터.
2. 보안·개인정보: 특히 브라우저에서 Anthropic API 키를 localStorage에 저장하고 직접 호출하는 부분의 위험과 현실적인 대안.
3. 성능과 메모리: 특히 휴대폰에서 느려질 만한 부분, 정리되지 않는 객체.
4. 접근성과 모바일 사용성.
5. 구조 개선 제안: 파일 나누기 등, 지금 코드를 크게 바꾸지 않고 할 수 있는 것부터.
확실하지 않은 내용은 "추측"이라고 표시하고, 코드에 없는 내용을 지어내지 마.

[파일 구성]
- 3d/app.js (1801줄): 3D 버전의 주 로직 (건물·거리, 캐릭터, 이동, 욕구, 관계, 과업, 상점, 이벤트, 사물 상호작용, 대화, 업무, 에이전트 회의, 상태창)
- 3d/core.js (188줄): 3D 렌더러·카메라·화질 설정과 물체 도우미 (합치기, InstancedMesh, dispose)
- 3d/commands.js (46줄): 글 명령 해석 (순수 함수)
- 3d/interactions.js (31줄): 사물 상호작용 등록 구조 (순수 함수)
- 3d/persistence.js (45줄): 3D 저장 데이터 검증·이전
- 3d/quests.js (11줄): 과업 진행·완료 판정
- 3d/worklog.js (64줄): 에이전트 역할과 개발 일지 데이터
- shared/ai-client.js (84줄): AI 연결 (claude.ai 샘플 / 서버 프록시 / 데모, 90초 시간 초과)
- shared/parse.js (82줄): 업무 답 해석·점수 정규화·프롬프트
- shared/storage.js (45줄): localStorage 안전 읽기·쓰기·삭제
- shared/markdown.js (18줄): 모델 출력용 안전한 마크다운
- shared/activity-controller.js (19줄): 긴 활동 공통 잠금
- shared/actions.js (29줄): 2D·3D 공통 행동 문구
- 2d/app.js (873줄): 2D 버전 로직 (업무 파이프라인, 사물 상호작용)
- 3d.html (262줄): 3D 화면 구조와 CSS
- index.html (107줄): 2D 화면 구조
- 2d/styles.css (278줄): 2D 스타일
- server/proxy.mjs (84줄): 선택 서버 프록시 예시
```

## 파트 1/29

[파트 1/29] 파일: 3d/app.js (1/8)
```
// 치이카와 오피스 3D: 3층 건물, 엘리베이터·에스컬레이터, 욕구·감정·관계·하루 흐름, 과업·레벨·코인·상점, 이벤트, 대화, 업무 지시
import { THREE, CSS2DObject, $, rand, sleep, clamp, lerp, josa, view, MOBILE, REDUCED, DEV, FONT, QUALITY, Q,
  renderer, labels, scene, camera, controls, resize, hemi, sun, BX0, BX1, BY0, BY1, CX, CY, FH, fy, W, G, LABELS,
  share, mat, GLASS, HITMAT, disposeObject, mergeStatic, instanced, boxItem, addTo, box, cyl, ball, plane, hitBox,
  canvasPanel, placeAt, label, plant, sofa } from "./core.js";
import { ROLES, SESSIONS } from "./worklog.js";
import { esc, md } from "../shared/markdown.js";
import { KEYS, readStr, writeStr, readJSON, writeJSON, purgeSecrets, clearAllLocal } from "../shared/storage.js";
import { normalizeScore, finalizeAnswer, buildTaskPrompt, demoAnswer, DEFAULT_SCORE } from "../shared/parse.js";
import { ActivityController } from "../shared/activity-controller.js";
import { ACTION_TEXT, objectActionLabel } from "../shared/actions.js";
import { initAI, setAccessCode, aiStatus, isConnected, askAI, ERRMSG, copyText } from "../shared/ai-client.js";
import { WORLD_VERSION, sanitizeWorld } from "./persistence.js";
import { createRegistry } from "./interactions.js";
import { ACT_WORDS, findAct, parseCommand } from "./commands.js";
import { questMatches, advanceQuest, markQuestDone } from "./quests.js";

purgeSecrets();   // 예전 버전이 남긴 API 키·모델 값을 지워요
const registry = createRegistry();            // 상호작용하는 사물들
const unregisterObj = id => registry.unregister(id);
let decorSeq = 0, eventAction = null;

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
  g.fillStyle = "#2d3149"; g.font = `bold 14px ${FONT.ui}`; g.fillText("명령 기록", 10, 20);
  g.font = `11px ${FONT.ui}`; items.slice(-5).forEach((t, i) => g.fillText("• " + t.slice(0, 30), 12, 38 + i * 12));
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
    g.fillStyle = "#43608f"; g.font = `bold 10px ${FONT.mono}`; String(text).split("\n").slice(0, 3).forEach((t, i) => g.fillText(t.slice(0, 12), 7, 16 + i * 12));
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
placeAt(canvasPanel(1, 74, 46, (g, w, h) => { g.fillStyle = "#1f2337"; g.fillRect(0, 0, w, h); g.fillStyle = "#9fe3c0"; g.font = `bold 10px ${FONT.mono}`; g.fillText("♪ ON AIR", 14, 27); }), 632, 388, 1, 48);
box(1, 430, 500, 70, 30, 14, "#e8d2b4"); box(1, 442, 506, 20, 16, 1, "#ffffff", 14); box(1, 470, 506, 20, 16, 1, "#ffe0ea", 14);
plant(1, 675, 585, true);
const BOOKS = ["#e57373", "#64b5f6", "#ffd54f", "#81c784", "#ba68c8", "#ff8a65"];
{ const books = BOOKS.map(() => []);                                // 책 54권은 색깔별 InstancedMesh 6개로
  for (const sx of [728, 862]){ box(1, sx, 365, 92, 40, 100, "#c9a77e"); for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) books[(i + r) % 6].push(boxItem(sx + 5 + i * 9.4, 402, 7, 4, 24, 1, 6 + r * 32)); }
  books.forEach((list, k) => instanced(G[1], list, mat(BOOKS[k]))); }
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
placeAt(canvasPanel(2, 90, 52, (g, w, h) => { g.fillStyle = "#1f2337"; g.fillRect(0, 0, w, h); g.fillStyle = "#ffd36b"; g.font = `bold 10px ${FONT.ui}`; g.fillText("♪ 오늘의 노래", 12, 30); }), 630, 388, 2, 50);
box(2, 345, 365, 120, 36, 34, "#e8d2b4"); cyl(2, 370, 383, 12, 2, "#cfe3f3", 34); cyl(2, 420, 383, 9, 2, "#2b2d3a", 34); cyl(2, 445, 383, 9, 2, "#2b2d3a", 34);
box(2, 470, 362, 40, 40, 90, "#c9d0dc");
plant(2, 675, 585, true);
Object.assign(S2, {
  shower:[P(2,212,560),P(2,290,560)], sofa:[P(2,430,540),P(2,500,540)], tv:[P(2,620,470)], kitchen:[P(2,380,430),P(2,440,430)],
  fridge:[P(2,490,420)], table:[P(2,515,470)], window:[P(2,600,575)],
});
/* 3F */
box(3, 150, 40, 130, 22, 24, "#c9a77e");
placeAt(canvasPanel(3, 110, 62, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#2b3d6b"); gr.addColorStop(1, "#1b2a4a"); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "#ffe066"; g.font = `bold 12px ${FONT.ui}`; g.fillText("▶ PLAYER 1", 22, 36); }), 215, 46, 3, 56);
ball(3, 188, 208, 24, "#f2cf4a", 10, .55); ball(3, 248, 208, 24, "#9fd3c7", 10, .55);
box(3, 66, 160, 4, 4, 70, "#8a5a3a"); box(3, 92, 160, 4, 4, 70, "#8a5a3a");
placeAt(canvasPanel(3, 44, 40, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); [["#ff8fb1", 14, 14, 8], ["#6f9fd8", 28, 22, 10], ["#7cc29a", 20, 32, 6]].forEach(([c, x, y, r]) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }); }), 81, 166, 3, 55).rotation.x = -.25;
box(3, 330, 50, 120, 46, 40, "#2b2d3a"); box(3, 336, 52, 108, 16, 3, "#ffffff", 40); box(3, 330, 50, 120, 6, 50, "#2b2d3a", 40); box(3, 380, 100, 40, 16, 22, "#2b2d3a");
box(3, 270, 215, 110, 40, 22, "#c9a77e"); box(3, 292, 219, 66, 32, 1, "#ff8fb1", 22); box(3, 325, 219, 33, 16, 1.5, "#6f9fd8", 22); box(3, 292, 235, 33, 16, 1.5, "#f2cf4a", 22);
box(3, 400, 200, 60, 30, 70, "#c9a77e"); plant(3, 455, 60);
const screenTex = canvasPanel(3, 370, 110, (g, w, h, t = 0) => {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${220 + Math.sin(t) * 30},45%,22%)`); gr.addColorStop(1, `hsl(${280 + Math.cos(t) * 30},40%,26%)`);
  g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.textAlign = "center"; g.font = `bold 30px ${FONT.ui}`; g.fillText("▶ 치이카와 극장판", w / 2, 55); g.font = `14px ${FONT.ui}`; g.fillText("상영 중", w / 2, 82); g.textAlign = "left";
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
{ const fl = [[], []];                                              // 꽃송이는 InstancedMesh
  for (let x = 190; x < 900; x += 118){ box(3, x, 600, 100, 16, 16, "#7cc29a"); for (let i = 0; i < 4; i++){ const c = W(x + 14 + i * 24, 608, 3); fl[i % 2].push({x:c.x, y:c.y + 20, z:c.z, sx:5, sy:5, sz:5}); } }
  instanced(G[3], fl[0], mat("#ff8fb1"), "ball"); instanced(G[3], fl[1], mat("#b39ddb"), "ball"); }
plant(3, 860, 420, true); plant(3, 950, 520, true); plant(3, 205, 545, true);
Object.assign(S3, {
  game:[P(3,215,250),P(3,190,255)], easel:[P(3,80,235)], piano:[P(3,400,150)], board:[P(3,290,278),P(3,360,278)], seats:SEATS,
  table:[P(3,300,500),P(3,440,500)], lounger:[P(3,555,565),P(3,655,565)], bbq:[P(3,755,470)], flowers:[P(3,520,592)], view:[P(3,900,560)], sword:[P(3,880,480),P(3,820,520)],
});

/* night lights: 층마다 따뜻한 조명 두 개 */
const NIGHT = [];
if (QUALITY !== "low") for (const f of [1, 2, 3]) for (const x of [300, 820]){
  const l = new THREE.PointLight("#ffd9a0", 0, 900, 1); l.position.copy(W(x, CY, f)); l.position.y += 120; addTo(f, l); NIGHT.push(l);
}

/* ================= elevators & escalators ================= */
const ELEV = {};
for (const f of [1, 2, 3]){
  box(f, 30, 452, 62, 80, 78, "#aeb7c8");
  const l = box(f, 36, 532, 25, 2, 62, "#c9d0dc"), r = box(f, 61, 532, 25, 2, 62, "#c9d0dc"); l.userData.dyn = r.userData.dyn = true;
  const ind = canvasPanel(f, 26, 10, (g, w, h, t = `${f}F`) => { g.fillStyle = "#1f2337"; g.fillRect(0, 0, w, h); g.fillStyle = "#ffcf66"; g.font = `bold 8px ${FONT.mono}`; g.fillText(t, 7, 8); });
  placeAt(ind, 61, 533.5, f, 70);
  ELEV[f] = {l, r, ind, lx: l.position.x, rx: r.position.x, open: 0, want: 0, users: new Set()};
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
```

## 파트 2/29

[파트 2/29] 파일: 3d/app.js (2/8)
```
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
const GLASS2 = share(new THREE.MeshStandardMaterial({ color:"#a9d4ff", transparent:true, opacity:.16, roughness:.05, metalness:.3, depthWrite:false, side:THREE.DoubleSide }));
const FRAME = mat("#5d6578", { metalness:.4, roughness:.4 });
function facade(f){
  const fg = new THREE.Group(); G[f].add(fg); FRONT.push(fg);          // 앞쪽 유리는 한 묶음으로 켜고 꺼요
  const y0 = fy(f), H = FH - 8, add = (m, front) => { (front ? fg : G[f]).add(m); return m; };
  const sides = [[BX0, BY1, BX1, BY1, true], [BX0, BY0, BX1, BY0, false], [BX0, BY0, BX0, BY1, false], [BX1, BY0, BX1, BY1, false]];
  for (const [x0, z0, x1, z1, front] of sides){
    const horiz = z0 === z1, len = horiz ? x1 - x0 : z1 - z0;
    const g = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 2, H, horiz ? 2 : len), GLASS2);
    g.position.copy(W(horiz ? (x0 + x1) / 2 : x0, horiz ? z0 : (z0 + z1) / 2, f)); g.position.y = y0 + H / 2; g.renderOrder = 2; add(g, front);
    const mull = [];                                            // 세로 창틀 (InstancedMesh)
    for (let s = 0; s <= len; s += 60){ const c = W(horiz ? x0 + s : x0, horiz ? z0 : z0 + s, f); mull.push({x:c.x, y:y0 + H / 2, z:c.z, sx:3, sy:H, sz:3}); }
    instanced(front ? fg : G[f], mull, FRAME).castShadow = false;
    const band = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len + 6 : 6, 8, horiz ? 6 : len + 6), mat("#e4e8f0"));   // 층 띠
    band.position.copy(W(horiz ? (x0 + x1) / 2 : x0, horiz ? z0 : (z0 + z1) / 2, f)); band.position.y = y0 - 4; band.castShadow = true; add(band, front);
  }
}
[1, 2, 3].forEach(facade);
{ // 지붕과 옥상 간판 (건물 전체를 볼 때만)
  const r = new THREE.Mesh(new THREE.BoxGeometry(BX1 - BX0 + 10, 10, BY1 - BY0 + 10), mat("#e4e8f0")); r.position.set((BX0 + BX1) / 2 - CX, fy(4) - 3, (BY0 + BY1) / 2 - CY); r.castShadow = true; ROOF.add(r);
  const sign = canvasPanel("scene", 320, 60, (g, w, h) => { g.fillStyle = "#2d3149"; g.fillRect(0, 0, w, h); g.fillStyle = "#ffd36b"; g.font = `bold 34px ${FONT.ui}`; g.textAlign = "center"; g.fillText("CHIIKAWA OFFICE", w / 2, 42); });
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
{ const marks = [];                                                 // 중앙 점선·횡단보도 (InstancedMesh)
  for (let x = -1600; x < 2800; x += 90) marks.push({x:x + 25 - CX, y:.3, z:866 - CY, sx:50, sy:.6, sz:4});
  for (let i = 0; i < 8; i++) marks.push({x:1285 - CX, y:.3, z:795 + i * 20 - CY, sx:90, sy:.6, sz:10});
  instanced(CITY, marks, mat("#f2f2f2")).castShadow = false; }
cityBox(-1600, 790, 4400, 3, .6, "#f2cf4a"); cityBox(-1600, 941, 4400, 3, .6, "#f2f2f2");
cityPlane(-1600, 952, 4400, 80, "#d7d9de", .3);
for (const x of [-600, -200, 1500, 1900]) cityBox(x, 1060, 260, 160, 140 + (x % 3) * 40, ["#c9d6e8", "#e8d6c9", "#d6e8d1"][Math.abs(x) % 3]);   // 건너편 건물
// 정문
cityBox(1040, 652, 110, 4, 70, null, 0, GLASS2); cityBox(1030, 646, 130, 40, 4, "#5d6578", 82);
{ const s = cityPanel(110, 18, (g, w, h) => { g.fillStyle = "#2d3149"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = `bold 12px ${FONT.ui}`; g.textAlign = "center"; g.fillText("치이카와 오피스", w / 2, 13); }); s.position.set(1095 - CX, 96, 666 - CY); }
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
{ const s = cityPanel(64, 40, (g, w, h) => { g.fillStyle = "#2b7de9"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = `bold 9px ${FONT.ui}`; g.fillText("🚌 버스 정류장", 5, 13); g.fillText("치이카와 오피스 앞", 5, 25); g.font = `8px ${FONT.mono}`; g.fillText("101  202  303", 5, 36); });
  s.position.set(880 - CX, 70, 760 - CY); cityBox(878, 756, 4, 4, 50, "#5d6578"); }
// 지하철 입구
cityBox(120, 690, 130, 70, 1, "#2b2d3a", .2);
for (let i = 0; i < 6; i++) cityBox(130, 700 + i * 9, 110, 9, 1, "#8a93a8", -i * 4 + .4);
cityBox(118, 688, 4, 74, 28, "#7cc29a"); cityBox(248, 688, 4, 74, 28, "#7cc29a"); cityBox(118, 688, 134, 4, 28, "#7cc29a");
cityBox(112, 684, 146, 82, 3, null, 62, GLASS2);
for (const x of [114, 250]) for (const y of [686, 760]) cityBox(x, y, 4, 4, 62, "#5d6578");
{ const s = cityPanel(84, 30, (g, w, h) => { g.fillStyle = "#3f9d6b"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = `bold 11px ${FONT.ui}`; g.fillText("🚇 치이카와역", 6, 14); g.font = `9px ${FONT.ui}`; g.fillText("1번 출구", 6, 26); });
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
function stop(c){ if (c.resolve){ const r = c.resolve; c.resolve = null; r(false); } finishRide(c); c.path = []; c.act = null; c.mat.rotation = 0; c.hidden = false; [1, 2, 3].forEach(f => elevWant(f, c, false)); }
async function walkPts(c, pts){ for (const p of pts) if (!await walk(c, p)) return false; return true; }
async function escalate(c, e){
  if (!await walkPts(c, [...e.before, e.start])) return false;
  c.path = []; const ok = await new Promise(res => { c.ride = {e, t:0, resolve:res}; });
  if (!ok) return false;
  S.stats.esc = (S.stats.esc || 0) + 1; emit("escalator", c);
  return walkPts(c, e.after);
}
// 이동 명령 토큰: 새 명령(runSeq·stop)이 오면 c.seq가 바뀌고, 예전 비동기 이동은 await 뒤에 바로 멈춰요
const moveTag = c => c.seq || 0;
const cancelled = (c, tag) => moveTag(c) !== tag;
function elevWant(f, c, on){ const e = ELEV[f]; on ? e.users.add(c.id) : e.users.delete(c.id); e.want = e.users.size ? 1 : 0; }
async function elevator(c, to, tag = moveTag(c)){
  const from = c.floor;
  // 취소되면 엘리베이터 문 요청과 숨김만 정리해요. 경로(path)는 새 명령의 것이라 건드리지 않아요.
  const bail = () => { [1, 2, 3].forEach(f => elevWant(f, c, false)); if (c.hidden && !c.ride) c.hidden = false; return false; };
  try {
    if (!await walk(c, ELEV_FRONT) || cancelled(c, tag)) return bail();
    elevWant(from, c, true); await sleep(500); if (cancelled(c, tag)) return bail();
    if (!await walk(c, ELEV_IN) || cancelled(c, tag)) return bail();
    c.hidden = true; elevWant(from, c, false); await sleep(400); if (cancelled(c, tag)) return bail();
```

## 파트 3/29

[파트 3/29] 파일: 3d/app.js (3/8)
```
    for (let f = from; f !== to; f += to > from ? 1 : -1){ await sleep(800); if (cancelled(c, tag)) return bail(); for (const k of [1, 2, 3]) ELEV[k].ind.redraw(`${f + (to > from ? 1 : -1)}F`); }
    if (c.ride || c.path.length) return bail();
    c.floor = to; c.x = ELEV_IN.x; c.y = ELEV_IN.y; elevWant(to, c, true); await sleep(400); if (cancelled(c, tag)) return bail();
    c.hidden = false;
    const ok = await walk(c, ELEV_FRONT); elevWant(to, c, false); return ok && !cancelled(c, tag);
  } catch (e){ return bail(); }
}
async function travel(c, to, tag = moveTag(c)){
  let guard = 0;
  while (c.floor !== to && guard++ < 4){
    if (cancelled(c, tag)) return false;
    const up = to > c.floor, next = up ? c.floor + 1 : c.floor - 1;
    const useEsc = Math.abs(to - c.floor) === 1 ? Math.random() < .7 : Math.random() < .4;
    const ok = useEsc ? await escalate(c, ESC.find(e => e.f0 === c.floor && e.f1 === next)) : await elevator(c, to, tag);
    if (!ok || cancelled(c, tag)) return false;
  }
  return c.floor === to;
}
async function walkTo(c, p, tag = moveTag(c)){
  finishRide(c);
  if (p.f && p.f !== c.floor && !await travel(c, p.f, tag)) return false;
  if (cancelled(c, tag)) return false;                 // 예전 호출이 새 walk()를 덮어쓰지 않게
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
  if (name === "orbit"){ controls.autoRotate = true; controls.autoRotateSpeed = REDUCED ? .3 : 1.2; return; }
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
    camTween.t = REDUCED ? 1 : Math.min(1, camTween.t + dt / .9); const e = 1 - Math.pow(1 - camTween.t, 3);
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
$("shadowBtn").onclick = () => {
  if (!renderer.shadowMap.enabled && MOBILE && !confirm("그림자를 켜면 휴대폰이 느려지거나 뜨거워질 수 있어요. 켤까요?")) return;
  renderer.shadowMap.enabled = !renderer.shadowMap.enabled; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); $("shadowBtn").textContent = renderer.shadowMap.enabled ? "그림자 켬" : "그림자 끔"; };

/* ================= time of day ================= */
/* ================= tables (needs, actions, quests, shop) ================= */
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
  print:{name:ACTION_TEXT.print.name, emo:ACTION_TEXT.print.emo, at:pick(S1.printer), dur:3, eff:{fun:-.2}, skill:"work", lines:ACTION_TEXT.print.lines},
  sightsee:{name:ACTION_TEXT.sightsee.name, emo:ACTION_TEXT.sightsee.emo, at:pick(S3.view, S3.flowers), dur:6, eff:{fun:4, energy:.5}, lines:ACTION_TEXT.sightsee.lines},
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
const DECOR = {
  plant:{name:"화분", emo:"🪴", price:30}, flower:{name:"꽃병", emo:"💐", price:40}, lamp:{name:"무드등", emo:"💡", price:60},
  tree:{name:"큰 나무", emo:"🌳", price:90}, arcade:{name:"오락기", emo:"🕹️", price:150, act:"game"}, massage:{name:"안마의자", emo:"💺", price:180, act:"massage"},
  pudding:{name:"푸딩 자판기", emo:"🍮", price:200, act:"snack"}, fountain:{name:"미니 분수", emo:"⛲", price:220},
};
const UPGRADES = {coffee2:{name:"고급 커피머신", emo:"☕", price:250, desc:"커피 효과 1.5배"}};
const HATS = {ribbon:{name:"리본", emo:"🎀", price:50}, party:{name:"고깔모자", emo:"🥳", price:60}, flowerpin:{name:"꽃핀", emo:"🌸", price:70}, chef:{name:"요리사 모자", emo:"👨‍🍳", price:120}, crown:{name:"왕관", emo:"👑", price:300}};

const SAVE_KEY = KEYS.world3d;
// 저장 데이터는 버전·형식·범위를 검사해서 불러와요. 깨진 값이면 기본값으로 시작하고, 예전(v2) 값은 그대로 옮겨요.
const rawSaved = readJSON(SAVE_KEY, null);
const saved = rawSaved ? sanitizeWorld(rawSaved, {
  charIds:Object.keys(NAMES), needKeys:NEEDS.map(n => n.k), skillKeys:Object.keys(SKILLS), decorIds:Object.keys(DECOR),
  hatIds:Object.keys(HATS), upgradeIds:Object.keys(UPGRADES), questCount:QUESTS.length, actionKeys:Object.keys(ACTIONS),
}) : null;
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
```

## 파트 4/29

[파트 4/29] 파일: 3d/app.js (4/8)
```
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
    const place = opts.at || (A.place ? rand(A.place) : null), tf = place ? place.f : c.floor;
    const [ta, tb] = await Promise.all([travel(c, tf), travel(partner, tf)]);
    if (!ta || !alive()){ if (partner.seq === ptag) partner.cur = null; c.cur = null; return false; }
    if (!tb){ partner.cur = null; c.cur = null; return false; }
    const spot = place || clampWalk({x:(c.x + partner.x) / 2, y:(c.y + partner.y) / 2}, c.floor);
    const [a, b] = await Promise.all([walk(c, {x:spot.x - 24, y:spot.y}), walk(partner, {x:spot.x + 24, y:spot.y})]);
    if (!a || !alive()){ if (partner.seq === ptag) partner.cur = null; c.cur = null; return false; }
    if (!b || partner.seq !== ptag) partner = null;
  } else if (A.at || opts.at){
    const p = opts.at || A.at(opts.i, c); if (!p){ c.cur = null; return false; }
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
function newQuest(){
  const used = new Set(quests.map(q => q.i)), choices = QUESTS.map((q, i) => i).filter(i => !used.has(i));
  const i = rand(choices), Q = QUESTS[i], n = Q.n[0] + Math.floor(Math.random() * (Q.n[1] - Q.n[0] + 1));
  return {i, n, w:Q.who ? rand(CH).id : null, p:0, reward:30 + n * 10};
}
// 완료됐거나 다 채운 과업은 되살리지 않고, 같은 과업이 두 번 들어오지 않게 해요
let quests = (saved?.quests || []).filter((q, k, a) => QUESTS[q.i] && (!QUESTS[q.i].who || q.w) && a.findIndex(o => o.i === q.i) === k);
while (quests.length < 3) quests.push(newQuest());
const qText = q => QUESTS[q.i].t(q.n, q.w ? BY[q.w] : null);
function completeQuest(q, c){
  if (!markQuestDone(q, performance.now())) return;          // 이미 끝난 과업: 보상 중복 지급 방지 (보상 XP의 level 이벤트가 다시 불러도 무시)
  log(`🏆 과업 완료: ${qText(q)} (+${q.reward} 오피스 경험치, 🪙 +${Math.round(q.reward / 2)})`); SFX.quest();
  S.office.xp += q.reward; S.office.done++; CH.forEach(o => addXP(o, 6)); if (c) addXP(c, 20); addCoins(Math.round(q.reward / 2));
  while (S.office.xp >= officeNeed(S.office.lv)){ S.office.xp -= officeNeed(S.office.lv); S.office.lv++; log(`🏢 오피스 레벨 업! 이제 Lv.${S.office.lv}`); CH.forEach(o => say(o, rand(["야하!","와아…!","축하해~"]), 2400)); }
  save();
  setTimeout(() => { const k = quests.indexOf(q); if (k !== -1){ quests[k] = newQuest(); renderQuests(); save(); } }, 2500);
}
function emit(type, c, key){
  const name = type === "act" ? key : type;
  for (const q of quests){
    if (!questMatches(q, QUESTS[q.i], name, c?.id)) continue;
    if (advanceQuest(q)) completeQuest(q, c);
  }
  renderQuests();
}
setInterval(() => { for (const q of quests){ const Q = QUESTS[q.i]; if (Q.check && !q.doneAt && Q.check()){ q.p = 1; completeQuest(q); } } }, 1000);
let resetting = false;
function save(){
  if (resetting) return;
  writeJSON(SAVE_KEY, { version:WORLD_VERSION, ...S, quests:quests.filter(q => !q.doneAt).map(({i, n, w, p, reward}) => ({i, n, w, p, reward})),
    chars:Object.fromEntries(CH.map(c => [c.id, {needs:c.needs, lv:c.lv, xp:c.xp, skills:c.skills, stats:c.stats, prel:c.prel, hat:c.hat, chatLog:c.chatLog.slice(-20)}])) });
}
setInterval(save, 5000); addEventListener("pagehide", save);

/* ================= shop, decor, hats ================= */
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
  for (const m of [...c.hatG.children]) disposeObject(m);          // 예전 모자의 geometry를 해제 (공유 재질은 그대로)
  if (!c.hat) return;
  const m3 = (geo, col, y, o) => { const m = new THREE.Mesh(geo, mat(col, o)); m.position.y = y; c.hatG.add(m); return m; };
  if (c.hat === "ribbon"){ const a = m3(new THREE.ConeGeometry(6, 12, 8), "#ff6b9a", 2); a.rotation.z = Math.PI / 2; a.position.x = -7; const b = m3(new THREE.ConeGeometry(6, 12, 8), "#ff6b9a", 2); b.rotation.z = -Math.PI / 2; b.position.x = 7; m3(new THREE.SphereGeometry(3.5, 8, 6), "#ff6b9a", 2); }
  if (c.hat === "party"){ m3(new THREE.ConeGeometry(10, 26, 16), "#ffd36b", 13); m3(new THREE.SphereGeometry(3, 8, 6), "#ff8fb1", 27); }
  if (c.hat === "flowerpin"){ for (let i = 0; i < 5; i++){ const p = m3(new THREE.SphereGeometry(3.6, 8, 6), "#ffb3c8", 2); p.position.x = 12 + Math.cos(i * 1.26) * 4; p.position.z = Math.sin(i * 1.26) * 4; } m3(new THREE.SphereGeometry(2.5, 8, 6), "#ffe066", 2).position.x = 12; }
  if (c.hat === "chef"){ m3(new THREE.CylinderGeometry(11, 11, 12, 16), "#ffffff", 6); m3(new THREE.SphereGeometry(14, 16, 10), "#ffffff", 16).scale.y = .6; }
  if (c.hat === "crown"){ m3(new THREE.CylinderGeometry(12, 12, 8, 16, 1, true), "#f2c94c", 4, { side: THREE.DoubleSide, metalness: .5, roughness: .3 }); for (let i = 0; i < 5; i++){ const s = m3(new THREE.ConeGeometry(3, 8, 6), "#f2c94c", 12, { metalness: .5, roughness: .3 }); s.position.x = Math.cos(i * 1.26) * 11; s.position.z = Math.sin(i * 1.26) * 11; } }
}
CH.forEach(buildHat);
let placing = null;
const DECOR_WARN = 12, DECOR_MAX = 20;                         // 층마다 가구가 많아지면 휴대폰이 느려져요
const decorOn = f => S.decor.filter(d => d.f === f).length;
function cancelPlacing(msg){
  if (!placing) return; placing = null; $("placeCancel").hidden = true; $("sel").hidden = !selected;
  if (selected) $("sel").textContent = `${selected.name} 선택됨 · 사물이나 바닥을 누르면 그쪽으로 가요`;
  if (msg) log(msg);
}
$("placeCancel").onclick = () => cancelPlacing("가구 배치를 취소했어요 (코인은 그대로예요)");
addEventListener("keydown", e => { if (e.key !== "Escape") return; if (!$("omenu").hidden) hideMenu(); else if (placing) cancelPlacing("가구 배치를 취소했어요 (코인은 그대로예요)"); });
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
  if (kind === "decor"){
    const f = viewFloor || 1; if (decorOn(f) >= DECOR_MAX) return log(`${f}층에는 가구를 ${DECOR_MAX}개까지만 놓을 수 있어요 (휴대폰 성능 보호)`, true);
    placing = id; $("sel").hidden = false; $("placeCancel").hidden = false; hideMenu();
    $("sel").textContent = `${DECOR[id].emo} ${DECOR[id].name}: 놓을 바닥을 눌러 주세요 (${f}층) · 아직 코인은 빠지지 않았어요`;
    if (decorOn(f) >= DECOR_WARN) log(`${f}층 가구가 ${decorOn(f)}개예요. 많아지면 휴대폰이 느려질 수 있어요`, true);
    if (viewFloor === 0) showFloor(1); view.scrollIntoView({behavior: REDUCED ? "auto" : "smooth", block:"center"}); }
  if ((kind === "up" || kind === "hat") && S.coins < (kind === "up" ? UPGRADES : HATS)[id].price) return log("코인이 모자라요", true);
  if (kind === "up"){ S.coins -= UPGRADES[id].price; S.up[id] = true; addCoins(0); log(`🛠️ ${UPGRADES[id].name} 설치! ${UPGRADES[id].desc}`); }
  if (kind === "hat" && selected){ S.coins -= HATS[id].price; selected.hat = id; buildHat(selected); addCoins(0); say(selected, rand(["어때? 어울려?","와아…!","헤헤"]), 2000); log(`${HATS[id].emo} ${selected.name}에게 ${josa(HATS[id].name, "을를")} 씌웠어요`); }
  $("coins").textContent = `🪙 ${S.coins}`;
});

/* ================= random events ================= */
const broken = {};
let eventObjs = [], bobObj = null, eventActive = null;
function toast(text, btn, fn){
  const t = $("toast"); t.hidden = false; t.replaceChildren();
  const sp = document.createElement("span"); sp.textContent = text; t.append(sp);
  eventAction = null;
```

## 파트 5/29

[파트 5/29] 파일: 3d/app.js (5/8)
```
  if (btn){ const b = document.createElement("button"); b.type = "button"; b.textContent = btn; let used = false;
    const once = () => { if (used) return; used = true; b.disabled = true; fn(); };
    b.onclick = once; t.append(b); eventAction = {label:btn, fn:once}; }
}
const hideToast = () => { $("toast").hidden = true; };   // 버튼 행동(eventAction)은 endEvent에서 사물 등록을 지울 때까지 남겨 둬요
// 이벤트 종료는 한 번만: 다른 이벤트이거나 이미 끝났으면 아무것도 안 해요. 플래그를 먼저 지우고 보상을 줘요.
function endEvent(expected, msg, coins = 0){
  if (eventActive !== expected) return false;
  eventActive = null;
  eventObjs.forEach(o => { if (o.userData.interactiveId) unregisterObj(o.userData.interactiveId); disposeObject(o); }); eventObjs = []; bobObj = null;
  hideToast(); if (msg) log(msg); if (coins) addCoins(coins); emit("event");
  return true;
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
    toast("📦 택배가 왔어요! (1층 복도)", "열어 보기", () => { const c = rand(CH.filter(o => o.floor === 1)) || rand(CH); say(c, "와아… 선물이다!", 2000); endEvent("parcel", "📦 택배를 열었어요!", 30 + Math.floor(Math.random() * 50)); });
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
    setTimeout(() => endEvent("cake", "🎂 다 같이 케이크를 먹었어요!", 20), 26000);
    return 30;
  },
  blackout(){
    blackout = true; toast("⚡ 정전이에요!", "해결하기", fix);
    CH.forEach(c => say(c, c.id === "chiikawa" ? "…으앙!" : rand(["꺅!","깜깜해…","!?"]), 2200));
    async function fix(){ hideToast(); const h = CH.slice().sort((a, b) => skLv(b.skills.work) - skLv(a.skills.work))[0]; log(`${josa(h.name, "이가")} 배전반을 고치러 가요`);
      await sendHelpers([h.id], S1.panel[0], "끙차…!", 4); if (eventActive === "blackout"){ blackout = false; endEvent("blackout", "💡 전기가 돌아왔어요!", 40); } }
    setTimeout(() => { if (eventActive === "blackout"){ blackout = false; endEvent("blackout", "💡 전기가 저절로 돌아왔어요"); } }, 60000);
    return 0;
  },
  coffee(){
    broken.coffee = true; coffeeLight.material.color.set("#555"); coffeeLight.material.emissiveIntensity = 0;
    toast("☕ 커피머신이 고장 났어요!", "고치기", fix);
    async function fix(){ hideToast(); const ids = ["shisa", "rakko"]; log("시사와 랏코가 커피머신을 고치러 가요"); await sendHelpers(ids, S1.coffee[0], "뚝딱뚝딱!", 5);
      if (eventActive !== "coffee") return; broken.coffee = false; coffeeLight.material.color.set("#ff6b6b"); coffeeLight.material.emissiveIntensity = 1; endEvent("coffee", "☕ 커피머신을 고쳤어요!", 30); }
    return 0;
  },
  intruder(){
    const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(22, 18, 12), mat("#3a2f52")); body.position.y = 22; g.add(body);
    for (const sx of [-8, 8]){ const e = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), new THREE.MeshBasicMaterial({ color: "#ff5c7a" })); e.position.set(sx, 28, 19); g.add(e); }
    g.position.copy(W(700, 520, 3)); G[3].add(g); eventObjs = [g]; bobObj = g;
    toast("👾 3층 테라스에 수상한 녀석이 나타났어요!", "토벌하러 가기", fight);
    async function fight(){ hideToast(); showFloor(3); log("우사기·랏코·치이카와가 토벌하러 출동!"); await sendHelpers(["usagi", "rakko", "chiikawa"], P(3, 700, 470), "우라!!", 6);
      if (eventActive !== "intruder") return; CH.forEach(c => { if (["usagi","rakko","chiikawa"].includes(c.id)) addXP(c, 20, "fitness"); }); endEvent("intruder", "⚔️ 토벌 성공! 수상한 녀석이 도망갔어요", 100); }
    setTimeout(() => endEvent("intruder", "👾 수상한 녀석이 사라졌어요"), 120000);
    return 0;
  },
};
function startEvent(force){
  if (eventActive || document.hidden || (!force && (isNight() || activity.busy))) return false;   // 업무·회의 중에는 이벤트를 미뤄요
  const k = typeof force === "string" && EVENTS[force] ? force : rand(Object.keys(EVENTS)); eventActive = k; SFX.event(); log(`🔔 이벤트!`);
  const ttl = EVENTS[k](); registerEventObjs(k);
  if (ttl) setTimeout(() => endEvent(k, k === "parcel" ? "📦 누군가 택배를 정리했어요" : null, k === "parcel" ? 20 : 0), ttl * 1000);
  return true;
}
setInterval(() => { if (Math.random() < .5) startEvent(); }, 150000);
setTimeout(startEvent, 40000);

/* ================= Claude: chat & task ================= */
// 브라우저에는 API 키를 두지 않아요. claude.ai 아티팩트 안이면 샘플 기능, config.js에 서버 프록시가 있으면 접속 코드로,
// 둘 다 없으면 데모 모드예요. 연결되지 않았는데 연결된 것처럼 보이지 않게 상태 문구를 그대로 보여 줘요.
const connected = () => isConnected();
function connUI(){
  const st = aiStatus();
  $("aiState").textContent = st.label; $("codeRow").hidden = !(st.mode === "proxy" || st.mode === "proxy-needs-code");
  $("chatMode").textContent = st.connected ? st.label : "Claude가 연결되지 않아서 미리 정해 둔 대사로 대답해요 (아무것도 밖으로 보내지 않아요).";
  $("taskMode").textContent = st.connected ? st.label + " 업무 하나에 Claude를 한 번 불러요 (최대 90초)."
    : "Claude가 연결되지 않아서 예시 결과물로 보여 줘요. '프롬프트 복사'로 Claude에 직접 물어본 뒤 '답 붙여 넣기'로 결과를 정리할 수 있어요.";
}
$("codeSet").onclick = () => { setAccessCode($("accessCode").value); $("accessCode").value = ""; connUI(); log(isConnected() ? "🔒 서버 프록시에 연결했어요 (접속 코드는 저장하지 않아요)" : "접속 코드를 넣어 주세요", !isConnected()); };
$("codeClear").onclick = () => { setAccessCode(""); connUI(); };
$("clearChats").onclick = () => {
  if (!confirm("모든 캐릭터와의 대화 기록을 지울까요?")) return;
  CH.forEach(c => { c.chatLog = []; }); renderChat(); save(); log("💬 대화 기록을 지웠어요");
};
$("clearAll").onclick = () => {
  if (!confirm("이 브라우저에 저장된 치이카와 오피스 기록(2D 업무 기록, 3D 진행 상황, 대화, 화질 설정, 예전 API 키)을 모두 지울까요? 되돌릴 수 없어요.")) return;
  resetting = true; clearAllLocal(); location.reload();
};
initAI().then(connUI);
const askClaude = (system, messages, maxTokens, signal) => askAI({system, messages, maxTokens, signal});

/* chat with a character */
let chatWith = null;
const doingText = c => c.cur ? ACTIONS[c.cur].name : c.ride ? "에스컬레이터 타는" : c.path.length ? "걸어가는" : c.act?.kind === "sleep" ? "자는" : "쉬는";
function openChat(c){
  chatWith = c; $("chat").hidden = false; $("chatImg").src = `img/${c.id}.png`; $("chatName").textContent = `${josa(c.name, "과와")} 대화`;
  renderChat(); $("chat").scrollIntoView({behavior:"smooth", block:"nearest"}); setTimeout(() => $("chatIn").focus(), 300);
  if (!c.chatLog.length) addMsg(c, "them", LOCAL[c.id].greet[0]);
}
function renderChat(){
  const c = chatWith; if (!c){ $("msgs").replaceChildren(); return; }
  $("chatSub").textContent = `${TRAITS[c.id].title} · 나와의 사이: ${relTier(c.prel).name} ${relTier(c.prel).h} (${Math.round(c.prel)})`;
  $("msgs").replaceChildren(...c.chatLog.map(m => { const d = document.createElement("div"); d.className = `msg ${m.r}`; d.textContent = m.t; return d; }));
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
const activity = new ActivityController();
activity.onChange(cur => {
  const busy = !!cur;
  $("taskGo").disabled = busy; $("replayBtn").disabled = busy; $("meetForm").querySelector("button").disabled = busy;
  $("taskStop").hidden = !(cur && cur.name === "task");
});
// 다른 활동 중이면 알려 주고 null
function beginActivity(name, label){
  const tok = activity.tryBegin(name, label);
  if (!tok) log(activity.message(), true);
  return tok;
}
function showTaskResult(text, task){
  const a = finalizeAnswer(text, task), out = $("taskOut");
  out.replaceChildren();
  const h = document.createElement("h3"); h.textContent = a.title; out.append(h);
  const body = document.createElement("div"); body.innerHTML = md(a.body, "note2"); out.append(body);   // md()는 모든 글자를 esc() 한 뒤 허용한 태그만 만들어요
  const p = document.createElement("p"); p.className = "note";
  p.textContent = `우사기 검토: ${"★".repeat(a.score)}${"☆".repeat(5 - a.score)} · ${a.comment}${a.hasReview ? "" : " (검토 형식이 없어서 기본 점수예요)"}`;
  out.append(p);
  return a;
}
function taskNote(msg, bad){ const out = $("taskOut"); out.hidden = false; out.replaceChildren(); const p = document.createElement("p"); p.className = "note"; if (bad) p.style.color = "var(--bad)"; p.textContent = msg; out.append(p); }
$("taskCopy").onclick = async () => {
  const t = $("taskIn").value.trim(); if (!t) return log("업무 내용을 먼저 써 주세요", true);
  log(await copyText(buildTaskPrompt(t)) ? "📋 프롬프트를 복사했어요. Claude에 붙여 넣고, 받은 답을 '답 붙여 넣기'에 넣어 주세요." : "복사하지 못했어요. 브라우저가 클립보드를 막았어요.", false);
};
$("taskPasteBtn").onclick = () => { $("taskPaste").hidden = !$("taskPaste").hidden; if (!$("taskPaste").hidden) $("taskPasteIn").focus(); };
$("taskPasteGo").onclick = () => {
  const text = $("taskPasteIn").value.trim(), t = $("taskIn").value.trim() || "붙여 넣은 업무"; if (!text) return;
  $("taskOut").hidden = false;
  try { showTaskResult(text, t); log("📋 붙여 넣은 답을 정리했어요"); }
  catch (e) { taskNote(`${ERRMSG[e?.code] || "정리하지 못했어요"}. @결과물 아래에 본문이 있는지 확인해 주세요.`, true); }
};
$("taskStop").onclick = () => activity.cancel("stop");
$("taskGo").onclick = async () => {
  const t = $("taskIn").value.trim(); if (!t) return;
  const tok = beginActivity("task", "업무 지시"); if (!tok) return;
  const out = $("taskOut"); out.setAttribute("aria-busy", "true");
  const crew = CREW.slice(); claim(crew);
  let finished = false;
  try {
    taskNote("랏코 팀장이 회의를 소집했어요… 결과물을 쓰는 중이에요.");
    log(`📋 업무 접수: ${t.slice(0, 30)}`); showFloor(1);
    // 각자 회의실 → 자리 → 일하기. 단계마다 try/finally라서 Claude가 빨리 답해도 'work' 상태로 남지 않아요.
    crew.forEach((c, i) => runSeq(c, [() => walkTo(c, S1.meet[i]), () => { say(c, rand(["회의 시작!","…!","우라!","좋아, 해보자~"]), 1800); return sleep(2500); }, () => walkTo(c, DESK[c.id]),
      async () => {
        if (finished) return;
        c.act = {kind:"busy", t0:performance.now()}; c.cur = "work";
        try { while (!finished && c.cur === "work" && !tok.signal.aborted) await sleep(500); }
        finally { if (c.cur === "work"){ c.cur = null; c.act = null; } }
      }]));
    let text;
    if (connected()) text = await askClaude("", [{role:"user", content:buildTaskPrompt(t)}], 8000, tok.signal);
    else { await sleep(6000); if (tok.signal.aborted) throw {code:"cancelled"}; text = demoAnswer(t); }
    const a = showTaskResult(text, t);
    crew.forEach(c => addXP(c, 15, "work")); addCoins(50, "업무 완료"); emit("task");
    say(BY.usagi, a.score >= 4 ? "야하! 승인!" : "하아…? (조금 아쉬운 듯)", 2400); say(BY.rakko, "결과물 나왔어. 확인해 봐!", 2600);
  } catch (err) {
    taskNote(`${ERRMSG[err?.code] || "오류가 났어요"}. ${err?.code === "cancelled" ? "" : "다시 지시하거나 '프롬프트 복사'를 써 보세요."}`, err?.code !== "cancelled");
  } finally {
    finished = true; out.setAttribute("aria-busy", "false");
    crew.forEach(c => { if (c.cur === "work"){ c.cur = null; c.act = null; } });
    release(crew); activity.end(tok);
  }
};

/* ================= photo ================= */
$("photoBtn").onclick = () => {
  renderer.render(scene, camera);
  const src = renderer.domElement, cv = document.createElement("canvas"); cv.width = src.width; cv.height = src.height;
  const g = cv.getContext("2d"); g.drawImage(src, 0, 0);
  const s = cv.width / 900; g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(12 * s, cv.height - 52 * s, 330 * s, 40 * s);
  g.fillStyle = "#2d3149"; g.font = `bold ${20 * s}px ${FONT.ui}`; g.fillText(`치이카와 오피스 · ${$("clock").textContent}`, 22 * s, cv.height - 25 * s);
  const a = document.createElement("a"); a.href = cv.toDataURL("image/png"); a.download = `chiikawa-office-${Date.now()}.png`; a.click();
  log("📷 사진을 저장했어요");
};

/* ================= selection, tap, commands ================= */
let selected = null;
function select(c){
  selected = c;
  CH.forEach(o => o.nmEl.classList.toggle("on", o === c));
```

## 파트 6/29

[파트 6/29] 파일: 3d/app.js (6/8)
```
  document.querySelectorAll("#who .chip").forEach(b => b.classList.toggle("on", b.dataset.id === c?.id));
  ring.visible = !!c; $("sel").hidden = !c && !placing;
  if (c){ $("sel").textContent = `${c.name} 선택됨 · 바닥을 누르면 그쪽으로 가요`; if (c.floor !== viewFloor && viewFloor !== 0) showFloor(c.floor); }
  renderStatus(); renderShop();
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function rayFrom(e){ const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
let down = null;
renderer.domElement.addEventListener("pointerdown", e => { down = {x:e.clientX, y:e.clientY, t:performance.now()}; });
// 입력 우선순위: 가구 배치 → 캐릭터 → 사물 → 바닥 이동
renderer.domElement.addEventListener("pointerup", e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
  if (moved > 8 || dt > 600) return;
  rayFrom(e);
  const f = viewFloor || 1, pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -fy(f)), p = new THREE.Vector3();
  if (placing){ placeDecorAt(f, pl, p); return; }
  hideMenu();
  const hit = ray.intersectObjects(CH.filter(visibleChar).map(c => c.sprite))[0], obj = pickObject();
  if (hit && (!obj || hit.distance <= obj.dist)){ const c = hit.object.userData.c; select(selected === c ? null : c); if (selected) say(c, rand(["응?","…!","부르셨어요?","왜~?"]), 1500); return; }
  if (obj?.it){ tapObject(obj.it, e.clientX, e.clientY); return; }
  if (!selected || !ray.ray.intersectPlane(pl, p)) return;
  const to = {...clampWalk({x:p.x + CX, y:p.z + CY}, f), f}, c = selected, rk = roomAt(f, to);
  log(`${c.name} → ${f}층 ${rk ? FLOORS[f].rooms[rk].name : "복도"}`); emit("cmd", c);
  runSeq(c, [async () => { if (await walkTo(c, to)) say(c, rand(["도착!","여기?","왔어~"]), 1500); }]);
});
// 가구 놓기: 놓기 직전에 값을 다시 확인하고, 성공했을 때 한 번만 코인을 빼요
function placeDecorAt(f, pl, p){
  const id = placing, it = DECOR[id];
  if (!it) return cancelPlacing();
  if (S.coins < it.price) return cancelPlacing(`코인이 모자라서 ${josa(it.name, "을를")} 놓지 못했어요 (필요 🪙 ${it.price})`);
  if (decorOn(f) >= DECOR_MAX) return cancelPlacing(`${f}층에는 가구를 ${DECOR_MAX}개까지만 놓을 수 있어요`);
  if (!ray.ray.intersectPlane(pl, p)){ log("바닥을 눌러 주세요", true); return; }          // 바닥이 아니면 그대로 배치 모드 유지 (코인 그대로)
  const q = clampWalk({x:p.x + CX, y:p.z + CY}, f), d = {id, f, x:Math.round(q.x), y:Math.round(q.y)};
  if (!(d.x >= 0 && d.x <= 1180 && d.y >= 0 && d.y <= 640)){ log("그 자리에는 놓을 수 없어요", true); return; }
  let g = null;
  try { g = buildDecor(d); } catch (err) { g = null; }
  if (!g) return cancelPlacing("가구를 놓지 못했어요 (코인은 그대로예요)");
  S.coins -= it.price; S.decor.push(d); registerDecor(d, g);
  log(`${it.emo} ${josa(it.name, "을를")} ${f}층에 놓았어요 (🪙 -${it.price})`);
  placing = null; $("placeCancel").hidden = true; $("sel").hidden = !selected; addCoins(0); save();
}
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
// 글 해석은 commands.js의 순수 함수(parseCommand)가 하고, 여기서는 결과를 실제 행동으로 바꿔요
const PARTNER_ACTS = new Set(Object.keys(ACTIONS).filter(k => ACTIONS[k].partner));
function parseOne(s, lastWho){
  const r = parseCommand(s, {chars:CH.map(c => ({id:c.id, aliases:ALIAS[c.id]})), selectedId:selected?.id, lastWho:lastWho?.map(c => c.id), partnerActs:PARTNER_ACTS, places:PLACE});
  if (!r || r.err) return r;
  const who = r.who.map(id => BY[id]);
  switch (r.kind){
    case "say": return {who, run:c => doAnim(c, "say", r.text || rand(LINES[c.id])), desc:`말하기${r.text ? ` "${r.text}"` : ""}`};
    case "stop": return {who, run:c => { stop(c); c.cur = null; say(c, "멈춤!", 1200); }, desc:"멈추기"};
    case "wake": return {who, run:c => { stop(c); say(c, "으음… 잘 잤다!", 1800); }, desc:"일어나기"};
    case "jump": return {who, run:c => doAnim(c, "jump"), desc:"점프"};
    case "spin": return {who, run:c => doAnim(c, "spin"), desc:"빙글빙글"};
    case "home": return {who, run:c => walkTo(c, c.home), desc:"제자리로"};
    case "pair": return {who, run:(c, i) => doAction(c, r.act, {partner:BY[r.pairs[i][1]] || undefined}), desc:ACTIONS[r.act].name};
    case "act": return {who, run:c => doAction(c, r.act), desc:ACTIONS[r.act].name};
    case "place": { const pl = PLACE.find(p => p.name === r.place);
      return {who, run:(c, i) => walkTo(c, pl.at(i, c)).then(ok => { if (ok) say(c, rand(["도착!","왔어~","…!"]), 1500); return ok; }), desc:`${josa(pl.name, "으로")} 이동`}; }
    case "follow": return {who, run:(c, i) => walkTo(c, {f:selected.floor, x:selected.x + 40 + i * 30, y:selected.y + 10}), desc:"따라가기"};
  }
  return null;
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
const WORKSPOT = {momonga:P(1,465,548), kurimanju:P(1,830,240), shisa:P(1,835,100), kani:P(1,800,520)};
const workSpot = c => DESK[c.id] || WORKSPOT[c.id];
function minute(c, text, cls = ""){
  const d = document.createElement("div"); d.className = "mline " + cls;
  if (c){ const im = document.createElement("img"); im.src = `img/${c.id}.png`; im.alt = ""; const b = document.createElement("b"); b.textContent = c.name; d.append(im, b); }
  const sp = document.createElement("span"); sp.textContent = text; d.append(sp); $("minutes").appendChild(d); $("minutes").scrollTop = $("minutes").scrollHeight;
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
  const card = t => `<div class="task ${t.status}"><img src="img/${t.who}.png" alt=""><div><b>${esc(t.title)}</b><small>${BY[t.who].name} · ${ROLES[t.who].short}</small>${bar(t.p, 100, t.title)}</div></div>`;
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
  const tok = beginActivity("replay", "개발 일지 재생"); if (!tok) return;
  const team = CH.slice();
  try {
  showFloor(1); $("minutes").replaceChildren(); TASKS.length = 0; renderBoard();
  minute(null, `📅 ${sess.date} · ${sess.title}`, "head");
  claim(team); await gather(team);
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
  } catch (e) { minute(null, "(재생이 중간에 멈췄어요)", "head"); }
  finally { release(team); activity.end(tok); }
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
async function claudeMeeting(topic, signal){
  const roster = CH.map(c => `- ${c.name} (${ROLES[c.id].role}): ${TRAITS[c.id].speech}`).join("\n");
  const sys = `너는 팬이 만든 비공식 게임 "치이카와 오피스"의 회의 대본 작가야. 캐릭터는 각자 역할을 맡은 AI 에이전트 팀이야. 원작 설정을 지어내지 말고, 아래 말투를 지켜.\n${roster}`;
  const ask = `회의 주제: """${topic.slice(0, 300)}"""
아래 형식으로만 써.
이름: 대사   ← 10~14줄. 각 대사 50자 이내. 랏코가 시작하고 마지막에 정리해. 이름은 ${CH.map(c => c.name).join(", ")} 중에서.
@결정: (결정 사항, 1~3줄)
@할일: 이름 | 할 일 (2~5줄, 할 일은 20자 이내)`;
  const out = await askClaude(sys, [{role:"user", content:ask}], 3000, signal);
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
  const tok = beginActivity("meeting", "에이전트 회의"); if (!tok) return;
  const team = CH.slice();
  try {
  showFloor(1); $("minutes").replaceChildren(); minute(null, `🗣️ 회의 주제: ${topic}`, "head");
  let script = null;
  if (connected()){ minute(null, "Claude가 회의 대본을 쓰는 중…", "head"); try { script = await claudeMeeting(topic, tok.signal); } catch (e) { minute(null, `(${ERRMSG[e?.code] || "대본을 만들지 못했어요"} · 기본 대본으로 진행해요)`, "head"); } }
  script = script || localMeeting(topic);
  claim(team); await gather(team);
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
  } catch (e) { minute(null, "(회의가 중간에 멈췄어요)", "head"); }
  finally { release(team); activity.end(tok); }
}
// 자체 회의: 업무 시간에는 가끔 알아서 짧은 아침 회의를 해요
async function standup(){
  if (activity.busy || isNight() || phase().k !== "work") return;     // 다른 활동 중이면 조용히 건너뛰어요 (자동 실행이라 알림 없음)
  const team = CREW.filter(c => c.manual < performance.now() && !c.ride && !c.hidden); if (team.length < 3) return;
  const tok = activity.tryBegin("standup", "아침 스탠드업"); if (!tok) return;
  try {
  $("minutes").replaceChildren(); minute(null, "☀️ 자체 회의 (아침 스탠드업)", "head"); claim(team); await gather(team);
  await speak(BY.rakko, "짧게 스탠드업 하지. 각자 한 줄씩.");
  for (const c of team.filter(c => c.id !== "rakko")){
    const top = Object.entries(c.stats).filter(([k]) => ACTIONS[k] && !ACTIONS[k].hidden).sort((a, b) => b[1] - a[1])[0];
    const did = top ? `${ACTIONS[top[0]].name} ${top[1]}번` : "준비";
    await speak(c, c.id === "usagi" ? `우라! (${did} 했다는 듯 손가락을 폄)` : c.id === "chiikawa" ? `…${did} 했어…! 오늘도 할 수 있어…!` : `${did} 했어! 오늘은 ${ROLES[c.id].role} 일 계속할게!`);
  }
  await speak(BY.rakko, "좋아. 오늘도 잘 부탁해.");
  emit("meeting");
  } finally { release(team); activity.end(tok); }
}
setInterval(() => { if (Math.random() < .35) standup(); }, 240000);
$("logSel").innerHTML = SESSIONS.map((s, i) => `<option value="${i}">${s.date} · ${s.title}</option>`).join("");
$("replayBtn").onclick = () => playSession(SESSIONS[+$("logSel").value || 0]);
$("meetForm").addEventListener("submit", e => { e.preventDefault(); const t = $("meetIn").value.trim(); if (!t) return; $("meetIn").value = ""; agentMeeting(t); });

/* ================= object interactions ================= */
// 사물마다 보이지 않는 판정 상자를 두고 등록해요. 마우스·터치·키보드 모두 같은 useObject() → doAction() 길을 써요.
const POWER = () => blackout ? "정전이라 쓸 수 없어요" : true;
function addObj(id, name, f, rect, actions, spot, o = {}){
  const [x, y, w, h, H = 40, lift = 0] = rect;
  const object = hitBox(f, x, y, w, h, H, lift);
  return registry.register({id, name, floor:f, actions, spot, object, enabled:o.enabled || (() => true), ...o});
}
{
  // 1층
  addObj("coffee", "커피머신", 1, [738, 40, 54, 50, 60], ["coffee"], P(1, 765, 115), {enabled:() => broken.coffee ? "커피머신이 고장 났어요. 알림의 '고치기'를 눌러 주세요" : POWER()});
  addObj("fridge1", "냉장고", 1, [885, 30, 62, 70, 110], ["snack"], P(1, 915, 125));
  addObj("counter1", "간식 카운터", 1, [800, 40, 70, 40, 40], ["snack", "drink", "practice"], P(1, 835, 100));
```

## 파트 7/29

[파트 7/29] 파일: 3d/app.js (7/8)
```
  addObj("table1", "탕비실 식탁", 1, [780, 262, 120, 26, 30], ["meal", "snack"], () => rand(S1.table));
  addObj("water", "정수기", 1, [676, 298, 22, 18, 50], ["water"], P(1, 690, 330));
  addObj("stall1", "화장실 1번 칸", 1, [182, 530, 62, 80, 70], ["toilet"], P(1, 212, 505));
  addObj("stall2", "화장실 2번 칸", 1, [260, 530, 62, 80, 70], ["toilet"], P(1, 290, 505));
  addObj("sink", "세면대", 1, [185, 395, 120, 30, 40], ["wash"], () => rand(S1.sink));
  addObj("sofa1", "휴게실 소파", 1, [380, 560, 150, 42, 50], ["sofa"], () => rand(S1.sofa));
  addObj("bean", "빈백", 1, [360, 460, 52, 52, 30], ["sofa"], P(1, 385, 470));
  addObj("tv1", "휴게실 TV", 1, [590, 380, 84, 20, 70], ["tv"], () => rand(S1.tv), {enabled:POWER});
  addObj("shelf1", "왼쪽 책장", 1, [728, 365, 92, 40, 100], ["read", "tidy"], P(1, 770, 450));
  addObj("shelf2", "오른쪽 책장", 1, [862, 365, 92, 40, 100], ["read", "tidy"], P(1, 905, 450));
  addObj("printer", "프린터", 1, [806, 575, 70, 32, 34], ["print"], P(1, 840, 550), {enabled:POWER});
  addObj("meet", "회의 테이블", 1, [70, 150, 180, 50, 30], ["meeting"], () => rand(S1.meet));
  for (const [id, s] of Object.entries(DESK)) addObj("desk-" + id, `${NAMES[id]}의 책상`, 1, [s.x - 58, s.y - 68, 116, 44, 70], ["work", ...(id === "chiikawa" ? ["study"] : [])], s, {enabled:POWER});
  // 2층
  for (const [id, b] of Object.entries(BED)){ const top = b.y < CY, by = top ? b.y - 80 : b.y - 40; addObj("bed-" + id, `${NAMES[id]}의 침대`, 2, [b.x - 38, by, 76, 120, 30], ["nap", "sleep"], b, {owner:id}); }
  addObj("shower1", "샤워실 1번", 2, [180, 530, 64, 70, 90], ["shower"], P(2, 212, 560));
  addObj("shower2", "샤워실 2번", 2, [258, 530, 64, 70, 90], ["shower"], P(2, 290, 560));
  addObj("sofa2", "거실 소파", 2, [400, 560, 160, 42, 50], ["sofa"], () => rand(S2.sofa));
  addObj("tv2", "거실 TV", 2, [580, 380, 100, 20, 80], ["tv"], P(2, 620, 470), {enabled:POWER});
  addObj("kitchen", "주방", 2, [345, 365, 120, 36, 40], ["meal", "practice"], () => rand(S2.kitchen));
  addObj("dining", "식탁", 2, [470, 490, 90, 40, 20], ["meal", "snack"], P(2, 515, 470));
  addObj("fridge2", "기숙사 냉장고", 2, [470, 362, 40, 40, 90], ["snack"], P(2, 490, 420));
  // 3층
  addObj("console", "게임기", 3, [150, 40, 130, 22, 80], ["game"], () => rand(S3.game), {enabled:POWER});
  addObj("easel", "이젤", 3, [56, 150, 50, 30, 90], ["draw"], P(3, 80, 235));
  addObj("piano", "피아노", 3, [330, 50, 120, 50, 60], ["piano", "sing"], P(3, 400, 150));
  addObj("boardtable", "보드게임 테이블", 3, [270, 215, 110, 40, 30], ["boardgame", "study"], P(3, 325, 278));
  addObj("seats", "영화관 좌석", 3, [560, 150, 360, 140, 40], ["movie"], () => rand(SEATS), {enabled:POWER});
  addObj("lounger1", "선베드 1", 3, [520, 540, 70, 54, 30], ["sunbath"], P(3, 555, 565));
  addObj("lounger2", "선베드 2", 3, [620, 540, 70, 54, 30], ["sunbath"], P(3, 655, 565));
  addObj("bbq", "바비큐 그릴", 3, [720, 395, 70, 40, 50], ["bbq"], P(3, 755, 470));
  addObj("terrace", "테라스 테이블", 3, [270, 425, 280, 60, 40], ["bbq", "drink"], () => rand(S3.table));
  addObj("view", "전망대", 3, [870, 540, 70, 50, 40], ["sightsee", "exercise"], P(3, 900, 560));
  addObj("flowers", "꽃밭", 3, [190, 600, 710, 16, 24], ["sightsee"], () => rand(S3.flowers));
}
registerDecorAll();
function registerDecorAll(){ S.decor.forEach((d, k) => registerDecor(d, decorMeshes[k])); }
function registerDecor(d, g){
  const it = DECOR[d.id]; if (!it?.act || !g) return;
  const id = `decor-${++decorSeq}`;
  registry.register({id, name:it.name, floor:d.f, actions:[it.act], spot:P(d.f, d.x, d.y + 30), object:g, decor:d});
}
// 이벤트 물체 (택배, 수상한 녀석): 알림 버튼과 같은 행동을 해요
function registerEventObjs(k){
  const o = eventObjs[0]; if (!o || !eventAction) return;
  registry.register({id:"event-" + k, name:{parcel:"택배 상자", intruder:"수상한 녀석", cake:"케이크"}[k] || "이벤트", floor:k === "intruder" ? 3 : 1, actions:["__event"], custom:eventAction, object:o, spot:null});
}
const spotOf = it => typeof it.spot === "function" ? it.spot() : it.spot;
const actLabel = (it, k) => k === "__event" ? it.custom.label : objectActionLabel(it.name, k);
// 이 캐릭터가 이 사물로 이 행동을 할 수 없으면 이유, 가능하면 null
function whyNot(c, it, k){
  const r = registry.disabledReason(it); if (r) return r;
  if (k === "__event") return null;
  if (!c) return "먼저 캐릭터를 선택해 주세요";
  if (activity.busy && c.manual === Infinity) return activity.message();
  const A = ACTIONS[k]; if (!A) return "지금은 할 수 없어요";
  if (A.only && A.only !== c.id) return `${NAMES[A.only]}만 할 수 있어요`;
  if (A.need && !A.need()) return "지금은 할 수 없어요";
  return null;
}
function useObject(c, it, k){
  if (k === "__event"){ hideMenu(); it.custom.fn(); return true; }
  const why = whyNot(c, it, k); if (why){ log(why, true); return false; }
  hideMenu();
  const at = spotOf(it);
  log(`${c.name}: ${actLabel(it, k)}`); emit("cmd", c);
  runSeq(c, [() => doAction(c, k, at ? {at} : {})]);
  return true;
}
// 행동 메뉴 (마우스 클릭·터치)
let menuFor = null, menuReturn = null;
function hideMenu(){ if ($("omenu").hidden) return; $("omenu").hidden = true; menuFor = null; const r = menuReturn; menuReturn = null; if (r && document.contains(r)) r.focus?.(); }
function btn(text, on, why){ const b = document.createElement("button"); b.type = "button"; b.textContent = text; if (why){ b.disabled = true; b.title = why; const sm = document.createElement("small"); sm.textContent = ` (${why})`; b.append(sm); } else b.onclick = on; return b; }
function showMenu(it, px, py){
  const m = $("omenu"); m.replaceChildren(); menuFor = it; menuReturn = document.activeElement;
  const h = document.createElement("h3"); h.textContent = it.name; m.append(h);
  const c = selected, reason = registry.disabledReason(it);
  if (reason){ const p = document.createElement("p"); p.textContent = reason; m.append(p); }
  else if (!c && !it.custom){
    const p = document.createElement("p"); p.textContent = "먼저 캐릭터를 선택해 주세요"; m.append(p);
    const row = document.createElement("div"); row.className = "row";
    const here = CH.filter(o => o.floor === it.floor), rest = CH.filter(o => o.floor !== it.floor);
    for (const o of [...here, ...rest]) row.append(btn(`${o.name}${o.floor !== it.floor ? ` (${o.floor}층)` : ""}`, () => { select(o); showMenu(it, px, py); }));
    m.append(row);
  } else {
    if (c && !it.custom){ const p = document.createElement("p"); p.textContent = `${c.name}에게 시킬 행동`; m.append(p); }
    for (const k of it.actions) m.append(btn(actLabel(it, k), () => useObject(selected, it, k), whyNot(c, it, k)));
  }
  m.append(btn("닫기", hideMenu));
  m.hidden = false;
  const r = view.getBoundingClientRect(), w = m.offsetWidth, hh = m.offsetHeight;
  m.style.left = `${clamp(px - r.left - w / 2, 8, r.width - w - 8)}px`; m.style.top = `${clamp(py - r.top - hh - 12, 8, r.height - hh - 8)}px`;
  m.querySelector("button:not(:disabled)")?.focus({preventScroll:true});
}
// 클릭 하나로 바로 할 수 있으면 바로, 아니면 메뉴
function tapObject(it, px, py){
  const ok = it.actions.filter(k => !whyNot(selected, it, k));
  if (selected && ok.length === 1 && it.actions.length === 1) return useObject(selected, it, ok[0]);
  if (it.custom && ok.length === 1) return useObject(selected, it, "__event");
  showMenu(it, px, py);
}
// 마우스를 올리면 이름표와 얇은 테두리
const hl = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), share(new THREE.LineBasicMaterial({ color:"#ff6b9a", transparent:true, opacity:.9, depthTest:false })));
hl.renderOrder = 9; hl.visible = false; scene.add(hl);
const hlBox = new THREE.Box3(), hlSize = new THREE.Vector3();
function highlight(it){
  if (!it){ hl.visible = false; return; }
  hlBox.setFromObject(it.object); hlBox.getCenter(hl.position); hlBox.getSize(hlSize); hl.scale.copy(hlSize).addScalar(4); hl.visible = true;
}
const floorItems = () => { const f = viewFloor || 0; return f ? registry.list(it => it.floor === f && it.object) : []; };
function pickObject(){
  const items = floorItems(); if (!items.length) return null;
  const hit = ray.intersectObjects(items.map(it => it.object), true)[0];
  return hit ? {it:registry.resolve(hit.object), dist:hit.distance} : null;
}
let hoverRaf = 0, hoverEv = null;
renderer.domElement.addEventListener("pointermove", e => {
  if (e.pointerType === "touch") return;
  hoverEv = e; if (hoverRaf) return;
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0; const ev = hoverEv; if (!ev || placing){ setHover(null); return; }
    rayFrom(ev);
    const ch = ray.intersectObjects(CH.filter(visibleChar).map(c => c.sprite))[0], o = pickObject();
    setHover(o && (!ch || o.dist < ch.distance) ? o.it : null, ev);
  });
});
renderer.domElement.addEventListener("pointerleave", () => setHover(null));
function setHover(it, ev){
  highlight(it); view.classList.toggle("hovering", !!it);
  const tip = $("tip"); if (!it){ tip.hidden = true; return; }
  const r = view.getBoundingClientRect(), why = registry.disabledReason(it);
  tip.replaceChildren(document.createTextNode(it.name));
  const sm = document.createElement("small"); sm.textContent = why || (it.custom ? it.custom.label : it.actions.map(k => ACTIONS[k]?.name).filter(Boolean).join(" · ")); tip.append(sm);
  tip.style.left = `${ev.clientX - r.left}px`; tip.style.top = `${ev.clientY - r.top}px`; tip.hidden = false;
}

/* ================= panels ================= */
// 진행 막대: 화면 읽기 프로그램이 값을 읽을 수 있게 role=progressbar
const bar = (v, max = 100, name = "") => `<span class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${Math.round(max)}" aria-valuenow="${Math.round(v)}"${name ? ` aria-label="${esc(name)}"` : ""}><i style="width:${clamp(v / max * 100, 0, 100)}%;background:${moodColor(v / max * 100).getStyle()}"></i></span>`;
function setBar(el, v, max = 100){
  if (!el) return; const i = el.firstChild, w = `${clamp(v / max * 100, 0, 100)}%`;
  if (i.style.width !== w){ i.style.width = w; i.style.background = moodColor(v / max * 100).getStyle(); }
  const now = String(Math.round(v)); if (el.getAttribute("aria-valuenow") !== now) el.setAttribute("aria-valuenow", now);
  const mx = String(Math.round(max)); if (el.getAttribute("aria-valuemax") !== mx) el.setAttribute("aria-valuemax", mx);
}
const setText = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
const doingShort = o => o.cur ? ACTIONS[o.cur].emo + " " + ACTIONS[o.cur].name : o.ride ? "🛗 에스컬레이터" : o.hidden ? "🛗 엘리베이터" : o.path.length ? "🚶 이동 중" : o.act?.kind === "sleep" ? "💤 자는 중" : "대기";
// 상태창은 구조가 바뀔 때(선택·층·모자)만 새로 만들고, 0.7초마다 숫자·글자·막대 너비만 고쳐요.
// 포커스가 상태창 안에 있으면 구조를 다시 만들지 않아서 키보드 위치를 잃지 않아요.
let statusKey = "";
const objFloor = () => viewFloor || selected?.floor || 1;
function objectButtons(c){
  const f = objFloor(), items = registry.list(it => it.floor === f && !it.custom);
  if (!items.length) return `<p class="note">이 층에는 쓸 수 있는 사물이 없어요.</p>`;
  return `<div class="objs">${items.flatMap(it => it.actions.map(k => {
    const why = whyNot(c, it, k);
    return `<button type="button" class="act obj" data-obj="${esc(it.id)}" data-a="${esc(k)}" ${why ? `aria-disabled="true"` : ""}>${esc(actLabel(it, k))}${why ? `<small>${esc(why)}</small>` : ""}</button>`;
  })).join("")}</div>`;
}
function buildStatus(){
  const c = selected, el = $("status");
  if (!c){
    el.innerHTML = `<h2 tabindex="-1">팀 상태</h2><p class="note" style="margin-top:0">캐릭터를 누르면 상태창과 대화가 열려요.</p><div class="team">${CH.map(o =>
      `<button type="button" class="trow" data-id="${o.id}"><img src="img/${o.id}.png" alt=""><b>${o.name}</b><span data-u="lv:${o.id}"></span><span data-u="emo:${o.id}"></span><small data-u="doing:${o.id}"></small></button>`).join("")}</div>
      <div class="sub">주변 사물 (${objFloor()}층)</div>${objectButtons(null)}`;
  } else {
    const T = TRAITS[c.id];
    el.innerHTML = `
    <div class="shead"><img src="img/${c.id}.png" alt=""><div><h2 tabindex="-1">${c.name} <span class="lv" data-u="clv"></span></h2>
      <div class="xp">${bar(c.xp, xpNeed(c.lv), "경험치")}<small data-u="cxp"></small></div>
      <div class="moodline" data-u="mood"></div>
      <div class="trait">✨ ${T.title} · 좋아하는 것: ${T.likes}</div><div class="trait">🧩 에이전트 역할: ${ROLES[c.id].role}</div></div>
      <button type="button" class="x" id="closeSel" aria-label="상태창 닫기">✕</button></div>
    <div class="needs">${NEEDS.map(n => `<div class="need"><span>${n.icon} ${n.name}</span>${bar(c.needs[n.k], 100, n.name).replace('class="bar"', `class="bar" data-u="need:${n.k}"`)}</div>`).join("")}</div>
    <div class="skills" data-u="skills"></div>
    <div class="sub">관계</div><div class="rels" data-u="rels"></div>
    <div class="sub">주변 사물 (${objFloor()}층)</div>${objectButtons(c)}
    <div class="sub">행동</div><div class="acts"><button type="button" class="act talk" data-a="__talk">💬 대화하기</button>
      ${Object.entries(ACTIONS).filter(([k, a]) => a.only === c.id).map(([k, a]) => `<button type="button" class="act special" data-a="${k}">${a.emo} ${a.name}</button>`).join("")}
      ${Object.entries(ACTIONS).filter(([k, a]) => !a.only && !a.hidden).map(([k, a]) => `<button type="button" class="act" data-a="${k}" data-u="allow:${k}">${a.emo} ${a.name}</button>`).join("")}
      ${c.hat ? `<button type="button" class="act" data-a="__hat">🎩 모자 벗기</button>` : ""}</div>`;
  }
  updateStatus();
}
function updateStatus(){
  const el = $("status"), c = selected;
  for (const n of el.querySelectorAll("[data-u]")){
    const [k, a] = n.dataset.u.split(":");
    if (k === "lv") setText(n, `Lv.${BY[a].lv}`);
    else if (k === "emo"){ const e = emotion(BY[a]); setText(n, e.emo); if (n.title !== e.name){ n.title = e.name; n.setAttribute("aria-label", e.name); } }
    else if (k === "doing") setText(n, `${BY[a].floor}층 · ${doingShort(BY[a])}`);
    else if (!c) continue;
    else if (k === "clv") setText(n, `Lv.${c.lv}`);
    else if (k === "cxp"){ setText(n, `${Math.floor(c.xp)} / ${xpNeed(c.lv)} XP`); setBar(n.previousElementSibling, c.xp, xpNeed(c.lv)); }
    else if (k === "mood"){ const e = emotion(c); setText(n, `${e.emo} ${e.name} · 기분 ${Math.round(mood(c))} · ${c.floor}층에서 ${doingText(c)} 중`); }
    else if (k === "need") setBar(n, c.needs[a]);
    else if (k === "skills") setText(n, Object.entries(SKILLS).map(([sk, s]) => `${s.icon} ${s.name} Lv.${skLv(c.skills[sk])}`).join("   "));
    else if (k === "rels") setText(n, [...CH.filter(o => o !== c).map(o => ({o, v:rel(c, o)})).sort((x, y) => y.v - x.v).map(({o, v}) => `${o.name} ${relTier(v).name} ${relTier(v).h}`), `나 ${relTier(c.prel).name} ${relTier(c.prel).h}`].join(" · "));
    else if (k === "allow"){ const ok = allowed(c, a); if (n.disabled === ok) n.disabled = !ok; }
  }
  // 사물 버튼의 비활성 이유(고장·정전 등)는 바뀔 수 있어서 따로 확인
  for (const b of el.querySelectorAll(".obj")){
    const it = registry.get(b.dataset.obj); if (!it) continue;
    const why = whyNot(c, it, b.dataset.a), was = b.getAttribute("aria-disabled") === "true";
    if (!!why !== was || (why && b.querySelector("small")?.textContent !== why)){
      b.textContent = actLabel(it, b.dataset.a);
      if (why){ b.setAttribute("aria-disabled", "true"); const sm = document.createElement("small"); sm.textContent = why; b.append(sm); } else b.removeAttribute("aria-disabled");
    }
  }
}
function renderStatus(){
  const key = `${selected?.id || "-"}|${objFloor()}|${selected?.hat || ""}|${registry.size}`;
  const inside = $("status").contains(document.activeElement);
  if (key !== statusKey && !inside){ statusKey = key; buildStatus(); }
  else if (key !== statusKey && inside && document.activeElement.closest(".trow,#closeSel")){ statusKey = key; buildStatus(); $("status").querySelector("h2")?.focus(); }   // 사용자가 직접 바꾼 경우
  else updateStatus();
}
let questsDirty = false;
function renderQuests(){
  if ($("quests").contains(document.activeElement)){ questsDirty = true; return; }   // 포커스를 잃지 않게 나중에
  questsDirty = false;
  $("quests").innerHTML = `<h2>과업 <span class="lv">오피스 Lv.${S.office.lv}</span></h2>
    <div class="xp">${bar(S.office.xp, officeNeed(S.office.lv), "오피스 경험치")}<small>${S.office.xp} / ${officeNeed(S.office.lv)} · 완료 ${S.office.done}개</small></div>
    <ul class="qs">${quests.map(q => `<li class="${q.doneAt ? "done" : ""}"><span>${q.doneAt ? "✅" : "📌"} ${esc(qText(q))}</span>${bar(q.p, q.n, qText(q))}<small>${q.p}/${q.n} · 보상 ${q.reward}</small></li>`).join("")}</ul>
    <button type="button" class="chip" id="resetSave">처음부터 다시 하기</button>`;
}
$("quests").addEventListener("focusout", () => setTimeout(() => { if (questsDirty) renderQuests(); }, 0));
$("status").addEventListener("click", e => {
  const t = e.target.closest(".trow"); if (t) return select(BY[t.dataset.id]);
  if (e.target.closest("#closeSel")) return select(null);
  const ob = e.target.closest(".obj");
  if (ob){ const it = registry.get(ob.dataset.obj); if (!it) return; if (ob.getAttribute("aria-disabled") === "true") return log(whyNot(selected, it, ob.dataset.a) || "지금은 할 수 없어요", true); return useObject(selected, it, ob.dataset.a); }
  const b = e.target.closest(".act"); if (!b || !selected || b.disabled) return;
  const c = selected, k = b.dataset.a;
  if (k === "__talk") return openChat(c);
  if (k === "__hat"){ c.hat = null; buildHat(c); renderStatus(); return; }
  if (activity.busy && c.manual === Infinity) return log(activity.message(), true);
  log(`${c.name}: ${ACTIONS[k].name}`); emit("cmd", c);
  runSeq(c, [() => doAction(c, k)]);
});
$("quests").addEventListener("click", e => {
  if (!e.target.closest("#resetSave")) return;
  if (!confirm("레벨, 경험치, 코인, 가구, 과업, 관계를 모두 처음으로 되돌릴까요?")) return;
  resetting = true;
  writeJSON(SAVE_KEY, null); try { localStorage.removeItem(SAVE_KEY); } catch (err) {}
  location.reload();
});
setInterval(() => { renderStatus(); for (const f of [1, 2, 3]) setText($("n" + f), ` · ${CH.filter(c => c.floor === f).length}`); }, 700);

// 3D 조작 켜기/끄기: 끄면 화면 위에서 손가락으로 페이지를 스크롤할 수 있어요 (휴대폰은 처음에 꺼 둬요)
function setControls(on){
  controls.enabled = on; view.classList.toggle("locked", !on);
  $("ctrlBtn").setAttribute("aria-pressed", String(on)); $("ctrlBtn").textContent = on ? "3D 조작 켬" : "3D 조작 끔";
}
$("ctrlBtn").onclick = () => setControls(!controls.enabled);
setControls(!MOBILE);

```

## 파트 8/29

[파트 8/29] 파일: 3d/app.js (8/8)
```
/* ================= animation loop ================= */
const clock = new THREE.Clock();
const SPEED = 120, RIDE = 55;
let lastFrame = 0;
function tick(){
  requestAnimationFrame(tick);
  const now = performance.now();
  if (Q.fps && now - lastFrame < 1000 / Q.fps - 2) return;      // 휴대폰은 초당 그리는 장수를 줄여요
  lastFrame = now;
  const dt = Math.min(.1, clock.getDelta());
  S.time = (S.time + dt * 2 * speed) % 1440;
  if ((tick.t = (tick.t || 0) + dt) > .25){ tick.t = 0; applyTime(); }
  if ((tick.s = (tick.s || 0) + dt) > 1.2){ tick.s = 0; if (viewFloor === 3 && QUALITY !== "low" && !REDUCED) screenTex.redraw(Math.round(now / 2000 * 4) / 4); }   // 3층을 볼 때만, 값이 바뀔 때만 다시 그려요
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
      if (k === "jump"){ bob = Math.max(0, Math.sin(e * 7)) * (REDUCED ? 6 : 30); if (e > 2.7 && !c.cur) c.act = null; }
      else if (k === "dance"){ bob = Math.abs(Math.sin(e * 8)) * (REDUCED ? 3 : 12); rot = Math.sin(e * 6) * (REDUCED ? .08 : .35); if (e > 6 && !c.cur) c.act = null; }
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
}

/* ================= start ================= */
{ // 정적인 물체 합치기 (처음 한 번)
  let b = 0, a = 0; for (const g of [G[1], G[2], G[3], CITY, ROOF, ...FRONT]){ const [x, y] = mergeStatic(g); b += x; a += y; }
  console.info(`[치이카와 오피스] 정적 물체 ${b}개 → ${a}개로 합침 · 화질 ${Q.name}`);
}
$("qualityBtn").textContent = `화질: ${Q.name}`;
$("qualityBtn").onclick = () => {
  const next = {low:"mid", mid:"high", high:"low"}[QUALITY] || "mid";
  if (!confirm(`화질을 '${({low:"가볍게", mid:"보통", high:"고화질"})[next]}'(으)로 바꿀까요? 화면을 다시 불러와요 (진행 상황은 저장돼요).`)) return;
  writeStr(KEYS.quality, next);
  save(); location.reload();
};
applyView(); resize(); camHome(); applyTime(); renderBoard(); renderQuests(); renderShop(); renderStatus(); connUI();
$("coins").textContent = `🪙 ${S.coins}`;
if (isNight()) CH.forEach(c => { c.floor = 2; c.x = BED[c.id].x; c.y = BED[c.id].y; c.act = {kind:"sleep", t0:performance.now()}; });
tick();
window.__office = {CH, S, ESC, addCoins, startEvent, renderer, registry, activity, quests, completeQuest, useObject, select, endEvent, tapObject, walkTo, runSeq, stop, ELEV, newQuest, emit, P, playSession, SESSIONS, get eventActive(){ return eventActive; }};   // 디버그·시험용
if (DEV){   // ?dev=1 로 열면 그리기 요청·메모리 숫자를 보여 줘요 (일반 사용자에게는 숨김)
  const d = $("devStats"); d.hidden = false; let frames = 0, t0 = performance.now();
  const loop = () => { frames++; const now = performance.now(); if (now - t0 > 1000){ const i = renderer.info; d.textContent = `fps ${Math.round(frames * 1000 / (now - t0))}\ncalls ${i.render.calls}\ntris ${i.render.triangles}\ngeo ${i.memory.geometries}\ntex ${i.memory.textures}\nobjs ${registry.size}`; frames = 0; t0 = now; } requestAnimationFrame(loop); };
  loop();
}
log("출근 완료! 캐릭터를 누르거나 명령을 써 보세요.");
setTimeout(() => say(BY.hachiware, "오늘도 힘내자~!", 2600), 800);
```

## 파트 9/29

[파트 9/29] 파일: 3d/core.js (1/1)
```
// 3D 공통 바탕: 렌더러·장면·카메라·화질 설정과 물체를 만드는 도우미들
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { KEYS, readStr } from "../shared/storage.js";

export { THREE, CSS2DObject };
export const $ = id => document.getElementById(id);
export const rand = a => a[Math.floor(Math.random() * a.length)];
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// 받침에 따라 조사 고르기: josa("왕관", "을를") → "왕관을"
export function josa(w, pair){
  const ch = String(w).trim().slice(-1).charCodeAt(0) - 0xAC00, has = ch >= 0 && ch <= 11171 ? ch % 28 : -1;
  if (pair === "으로") return w + (has === 0 || has === 8 || has < 0 ? "로" : "으로");
  const [a, b] = [...pair]; return w + (has > 0 ? a : b);
}
export const view = $("view");
export const MOBILE = matchMedia("(pointer: coarse)").matches;
export const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const DEV = new URLSearchParams(location.search).has("dev");
export const FONT = { ui:"'Gowun Dodum','Apple SD Gothic Neo','Malgun Gothic',sans-serif", mono:"'Nanum Gothic Coding',ui-monospace,Consolas,monospace", dialogue:"Gaegu,'Comic Sans MS',cursive" };

/* ================= quality ================= */
// 휴대폰은 기본 '보통'(가벼운 조명·해상도 1.4배·초당 40장·그림자 끔), 컴퓨터는 '고화질'
export const QUALITY = (() => { const q = readStr(KEYS.quality, ""); return ["low", "mid", "high"].includes(q) ? q : (MOBILE ? "mid" : "high"); })();
const DPR_CAP = MOBILE ? 1.5 : 2;
export const Q = {
  low:{name:"가볍게", pr:1, aa:false, fps:30, shadow:false},
  mid:{name:"보통", pr:Math.min(1.4, DPR_CAP), aa:true, fps:40, shadow:false},
  high:{name:"고화질", pr:DPR_CAP, aa:true, fps:MOBILE ? 45 : 0, shadow:!MOBILE},
}[QUALITY];

/* ================= renderer, camera, lights ================= */
export let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: Q.aa, powerPreference: "high-performance" }); }
catch (e) { view.insertAdjacentHTML("beforeend", `<div class="err">이 브라우저에서는 3D 화면(WebGL)을 켤 수 없어요.<br><a href="./">2D 사무실로 가기</a></div>`); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
renderer.shadowMap.enabled = Q.shadow;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute("role", "img");
renderer.domElement.setAttribute("aria-label", "치이카와 오피스 3D 건물 화면. 캐릭터와 사물은 아래 상태창의 버튼으로도 똑같이 조작할 수 있어요.");
renderer.domElement.setAttribute("aria-describedby", "viewDesc");
view.prepend(renderer.domElement);
export const labels = new CSS2DRenderer();
labels.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none";
view.appendChild(labels.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color("#dfeaff");
export const camera = new THREE.PerspectiveCamera(40, 1, 5, 9000);
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !REDUCED; controls.maxPolarAngle = 1.5; controls.minDistance = 160; controls.maxDistance = 3600;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
export function resize(){
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
export const hemi = new THREE.HemisphereLight("#ffffff", "#c9c2d8", 1.6); scene.add(hemi);
export const sun = new THREE.DirectionalLight("#fff6e8", 1.6);
sun.castShadow = true;
const SHADOW_SIZE = MOBILE ? 1024 : 2048;                    // 휴대폰 그림자 지도는 최대 1024
sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
Object.assign(sun.shadow.camera, { left: -720, right: 720, top: 480, bottom: -480, near: 50, far: 2600 });
sun.shadow.bias = -0.0008; scene.add(sun); scene.add(sun.target);

/* ================= world helpers ================= */
export const BX0 = -12, BX1 = 1192, BY0 = -12, BY1 = 652;     // 건물 외곽
export const CX = 590, CY = 320, FH = 150;                    // 논리 좌표 x 0~1180, y 0~640, 층 높이 150
export const fy = f => (f - 1) * FH;
export const W = (x, y, f = 1) => new THREE.Vector3(x - CX, fy(f), y - CY);
export const P = (f, x, y) => ({f, x, y});
export const G = {1: new THREE.Group(), 2: new THREE.Group(), 3: new THREE.Group()};
Object.values(G).forEach(g => scene.add(g));
export const LABELS = {1: [], 2: [], 3: []};

// 공유 재질: 개별 물체를 지울 때 dispose하면 안 되는 것들
const SHARED = new Set();
export const share = m => { SHARED.add(m); return m; };
const MATS = {};
// 고화질이 아니면 계산이 가벼운 Lambert 재질을 써요
export const mat = (c, o = {}) => {
  const k = c + JSON.stringify(o); if (MATS[k]) return MATS[k];
  if (QUALITY === "high") return MATS[k] = share(new THREE.MeshStandardMaterial({ color: c, roughness: .85, ...o }));
  const { roughness, metalness, ...rest } = o; return MATS[k] = share(new THREE.MeshLambertMaterial({ color: c, ...rest }));
};
export const GLASS = share(new THREE.MeshStandardMaterial({ color: "#bfe3ff", transparent: true, opacity: .32, roughness: .1, depthWrite: false }));
export const HITMAT = share(new THREE.MeshBasicMaterial({ visible: false }));

// 객체 전용 geometry·material·texture를 해제해요 (공유 재질은 건드리지 않아요)
export function disposeObject(obj){
  if (!obj) return;
  obj.parent?.remove(obj);
  obj.traverse(o => {
    if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms){ if (SHARED.has(m)) continue; m.map?.dispose(); m.dispose(); }
  });
}

// 움직이지 않는 물체를 재질별로 하나로 합쳐서 그리기 요청을 줄여요
export function mergeStatic(group){
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), buckets = new Map();
  for (const m of [...group.children]){
    if (!m.isMesh || m.isInstancedMesh || m.userData.dyn || m.material.map || !m.material.visible) continue;
    if (!buckets.has(m.material)) buckets.set(m.material, []);
    buckets.get(m.material).push(m);
  }
  let before = 0, after = 0;
  for (const [material, list] of buckets){
    before += list.length; if (list.length < 2){ after += list.length; continue; }
    const geos = list.map(m => { let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g = g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); for (const a of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(a)) g.deleteAttribute(a); return g; });
    const merged = mergeGeometries(geos, false); if (!merged){ after += list.length; continue; }
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = list.some(m => m.castShadow); mesh.receiveShadow = true; mesh.renderOrder = list[0].renderOrder;
    list.forEach(m => { group.remove(m); m.geometry.dispose(); }); geos.forEach(g => g.dispose()); group.add(mesh); after++;
  }
  return [before, after];
}

// 같은 모양을 여러 개 그릴 때는 InstancedMesh 하나로 (창틀·책·도로 표식·꽃)
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1), UNIT_BALL = new THREE.SphereGeometry(1, 10, 8);
export function instanced(parent, items, material, shape = "box"){
  // items: [{x, y, z, sx, sy, sz}] (월드 좌표, 크기)
  const im = new THREE.InstancedMesh(shape === "ball" ? UNIT_BALL : UNIT_BOX, material, items.length);
  im.userData.sharedGeometry = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  items.forEach((it, i) => { p.set(it.x, it.y, it.z); s.set(it.sx, it.sy, it.sz); m.compose(p, q, s); im.setMatrixAt(i, m); });
  im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); parent.add(im); return im;
}
// 논리 좌표 상자를 instanced 항목으로
export const boxItem = (x, y, w, h, H, f = 1, lift = 0) => { const c = W(x + w / 2, y + h / 2, f); return {x:c.x, y:c.y + lift + H / 2, z:c.z, sx:w, sy:H, sz:h}; };

export function addTo(f, m){ (f === "scene" ? scene : G[f]).add(m); return m; }
export function box(f, x, y, w, h, H, color, lift = 0, material){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, h), material || mat(color));
  m.position.copy(W(x + w / 2, y + h / 2, f)); m.position.y += lift + H / 2;
  m.castShadow = m.receiveShadow = true; return addTo(f, m);
}
export function cyl(f, x, y, r, H, color, lift = 0, r2 = r, seg = 20){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, H, seg), mat(color));
  m.position.copy(W(x, y, f)); m.position.y += lift + H / 2; m.castShadow = m.receiveShadow = true; return addTo(f, m);
}
export function ball(f, x, y, r, color, lift = 0, sy = 1, o){
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat(color, o)); m.scale.y = sy;
  m.position.copy(W(x, y, f)); m.position.y += lift; m.castShadow = true; return addTo(f, m);
}
export function plane(f, x, y, w, h, color, lift = .5){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(color));
  m.rotation.x = -Math.PI / 2; m.position.copy(W(x + w / 2, y + h / 2, f)); m.position.y += lift; m.receiveShadow = true; return addTo(f, m);
}
// 클릭 판정용 보이지 않는 상자 (합치기에서 빠져요)
export function hitBox(f, x, y, w, h, H, lift = 0){
  const m = box(f, x, y, w, h, H, null, lift, HITMAT); m.castShadow = m.receiveShadow = false; m.userData.dyn = true; return m;
}
// 글자를 그려 넣는 판. 내용(인자)이 바뀔 때만 다시 그리고 GPU로 올려요.
export function canvasPanel(f, w, h, draw, px = 4){
  const cv = document.createElement("canvas"); cv.width = w * px; cv.height = h * px;
  const ctx = cv.getContext("2d"); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  let last = null, args = [];
  m.redraw = (...a) => { const key = JSON.stringify(a); if (key === last) return false; last = key; args = a; ctx.setTransform(px, 0, 0, px, 0, 0); draw(ctx, w, h, ...a); tex.needsUpdate = true; return true; };
  m.refresh = () => { last = null; m.redraw(...args); };
  PANELS.push(m); m.redraw(); return addTo(f, m);
}
// 웹 글꼴이 늦게 도착하면 글자판을 한 번 다시 그려요 (처음엔 기본 글꼴로 그려졌을 수 있어서)
const PANELS = [];
document.fonts?.ready.then(() => PANELS.forEach(m => m.refresh()));
export const placeAt = (m, x, y, f, h) => { m.position.copy(W(x, y, f)); m.position.y += h; return m; };
export function label(f, text, x, y, H, cls = "rlab"){
  const d = document.createElement("div"); d.className = cls; d.textContent = text;
  const o = new CSS2DObject(d); o.position.copy(W(x, y, f)); o.position.y += H; scene.add(o); LABELS[f].push(o); return o;
}
export function plant(f, x, y, big = false){
  cyl(f, x, y, big ? 14 : 10, big ? 22 : 16, "#c98b5e", 0, big ? 11 : 8);
  const g = new THREE.Mesh(new THREE.IcosahedronGeometry(big ? 24 : 16, 1), mat("#7cc29a"));
  placeAt(g, x, y, f, (big ? 22 : 16) + (big ? 20 : 13)); g.castShadow = true; addTo(f, g); return g;
}
export function sofa(f, x, y, w, col = "#ff9fb8"){
  box(f, x, y, w, 42, 22, col); box(f, x, y + 30, w, 12, 50, col); box(f, x, y, 14, 42, 34, col); box(f, x + w - 14, y, 14, 42, 34, col);
  for (let i = 0; i < Math.round(w / 50); i++) box(f, x + 18 + i * 42, y + 15, 34, 12, 12, "#fff3f6", 22);
}
// 공유 상태 (world.js와 app.js가 함께 봐요)
export const state = { broken: {} };
```

## 파트 10/29

[파트 10/29] 파일: 3d/commands.js (1/1)
```
// 글 명령 해석 (순수 함수). 화면을 움직이는 일은 app.js가 해요.
export const ACT_WORDS = [["coffee",/커피/],["snack",/간식|과자|푸딩/],["meal",/밥|식사|점심|저녁 먹/],["water",/물 마|물마/],["toilet",/화장실 가|쉬야/],["wash",/손 씻|씻어|씻자/],["shower",/샤워/],
  ["nap",/낮잠/],["sleep",/자자$|자$|자줘|잠자|자러|누워|주무/],["sofa",/소파|쉬어|휴식/],["tv",/티비|TV|tv|텔레비전/],["read",/책 읽|독서/],["print",/출력|프린트|인쇄/],["work",/일해|일하|업무해/],["meeting",/회의해|회의하/],
  ["exercise",/운동|달리기|스트레칭/],["dance",/춤|댄스|춰/],["draw",/그림|그려/],["boardgame",/보드게임/],["game",/게임/],["piano",/피아노|연주/],["movie",/영화 봐|영화 보|영화봐|영화 볼|영화보/],
  ["bbq",/바비큐|고기 구/],["sunbath",/일광욕|선베드/],["sightsee",/구경|망원경|경치/],["chat",/수다|얘기하|이야기하|놀아|대화하/],["massage",/안마/],
  ["study",/공부/],["sing",/노래/],["ura",/우라|소리 질러/],["sword",/검술|수련/],["aegyo",/애교/],["drink",/한 잔|한잔/],["practice",/연습/],["tidy",/정리|청소/]];

export function findAct(text){
  const a = ACT_WORDS.find(([k, re]) => re.test(text) && !(k === "sleep" && /자리|자료|가자|하자|먹자|보자|놀자/.test(text)));
  return a ? a[0] : null;
}

const QUOTE = /["'“”‘’「」『』](.+?)["'“”‘’「」『』]/;
/**
 * ctx: {chars:[{id, aliases:[]}], selectedId, lastWho:[ids], partnerActs:Set, places:[{k:[], name}]}
 * 결과: {who:[ids], kind, ...} 또는 {err}
 *   kind: say(text) | stop | wake | jump | spin | home | act(act) | pair(act, pairs:[[a,b]]) | place(place) | follow
 */
export function parseCommand(s, ctx){
  s = String(s ?? "").trim(); if (!s) return null;
  const quote = s.match(QUOTE), bare = s.replace(QUOTE, " ");
  const all = ctx.chars.map(c => c.id);
  let who = [];
  if (/모두|다들|전부|다 같이|다같이|모든|전원|친구들/.test(bare)) who = all.slice();
  else for (const c of ctx.chars) if (c.aliases.some(a => bare.includes(a))) who.push(c.id);
  if (!who.length && ctx.lastWho?.length) who = ctx.lastWho.slice();
  if (!who.length && ctx.selectedId) who = [ctx.selectedId];
  if (!who.length) return {err:"누구에게 시킬지 모르겠어요. 이름을 넣거나 캐릭터를 먼저 눌러 주세요."};
  if (quote || /라고|말해/.test(bare)) return {who, kind:"say", text: quote ? quote[1].slice(0, 80) : null};
  if (/멈춰|정지|스톱|그만/.test(bare)) return {who, kind:"stop"};
  if (/일어나|깨어|기상/.test(bare)) return {who, kind:"wake"};
  if (/점프|폴짝/.test(bare)) return {who, kind:"jump"};
  if (/돌아$|돌아줘|빙글|회전|한 바퀴|한바퀴/.test(bare)) return {who, kind:"spin"};
  if (/돌아와|제자리|원래 자리/.test(bare)) return {who, kind:"home"};
  const isMove = /(으로|로)\s*(가|와|이동|모여|올라|내려)|가$|가줘|와$|와줘|모여|이동|올라가|내려가/.test(bare);
  const act = isMove ? null : findAct(bare);
  if (act && ctx.partnerActs?.has(act) && who.length > 1 && who.length < all.length){
    const pairs = []; for (let i = 0; i < who.length; i += 2) pairs.push([who[i], who[i + 1] || null]);
    return {who: pairs.map(p => p[0]), kind:"pair", act, pairs};
  }
  if (act) return {who, kind:"act", act};
  const place = ctx.places.find(p => p.k.some(k => bare.includes(k)));
  if (place) return {who, kind:"place", place: place.name};
  if (/따라|나한테|이리|여기/.test(bare) && ctx.selectedId && !who.includes(ctx.selectedId)) return {who, kind:"follow"};
  return {err:`"${s}"는 아직 모르는 명령이에요. 장소 이름이나 행동(커피·춤·영화·노래 등)을 넣어 보세요.`};
}
```

## 파트 11/29

[파트 11/29] 파일: 3d/interactions.js (1/1)
```
// 사물 상호작용 등록 구조. Three.js에 의존하지 않아서 단독으로 테스트할 수 있어요.
// meta: {id, name, actions:[행동키], floor, spot:{f,x,y}, enabled?:()=>true|string(비활성 이유), object?}
export function createRegistry(){
  const items = new Map();
  const tag = (obj, id) => { if (obj && obj.userData) obj.userData.interactiveId = id; };
  return {
    register(meta){
      if (!meta || !meta.id || !Array.isArray(meta.actions) || !meta.actions.length) throw new Error("상호작용 정보가 올바르지 않아요");
      const item = { enabled: () => true, ...meta };
      items.set(item.id, item); tag(item.object, item.id); return item;
    },
    unregister(id){
      const item = items.get(id); if (!item) return null;
      items.delete(id); if (item.object?.userData) delete item.object.userData.interactiveId; return item;
    },
    get: id => items.get(id) || null,
    has: id => items.has(id),
    list(pred = () => true){ return [...items.values()].filter(pred); },
    get size(){ return items.size; },
    // 클릭된 객체(자식 Mesh일 수 있음)에서 부모로 올라가며 등록된 사물을 찾아요
    resolve(obj){
      for (let o = obj; o; o = o.parent){ const id = o.userData?.interactiveId; if (id && items.has(id)) return items.get(id); }
      return null;
    },
    // 비활성이면 이유 문자열, 가능하면 null
    disabledReason(item){
      try { const r = item.enabled(); return r === true || r == null ? null : (typeof r === "string" ? r : "지금은 쓸 수 없어요"); }
      catch (e) { return "지금은 쓸 수 없어요"; }
    },
  };
}
```

## 파트 12/29

[파트 12/29] 파일: 3d/persistence.js (1/1)
```
// 3D 월드 저장 데이터: 버전, 검증, 이전(마이그레이션). 손상된 값은 기본값으로 바꿔서 앱이 멈추지 않게 해요.
import { isObj, num, int, str } from "../shared/storage.js";

export const WORLD_VERSION = 3;
export const CHAT_ROLES = ["me", "them", "sys"];

// schema: {charIds, needKeys, skillKeys, decorIds, hatIds, upgradeIds, questCount, questN(i)->[min,max], actionKeys}
export function sanitizeWorld(raw, schema){
  const src = isObj(raw) ? raw : {};
  const out = {
    version: WORLD_VERSION,
    coins: int(src.coins, 0, 1e7, 50),
    time: num(src.time, 0, 1439.99, 8 * 60 + 30),
    office: {lv:int(src.office?.lv, 1, 999, 1), xp:int(src.office?.xp, 0, 1e7, 0), done:int(src.office?.done, 0, 1e7, 0)},
    stats: {}, decor: [], up: {}, rel: {}, quests: [], chars: {},
  };
  if (isObj(src.stats)) for (const [k, v] of Object.entries(src.stats).slice(0, 50)) if (/^[a-z]{1,20}$/.test(k)) out.stats[k] = int(v, 0, 1e7, 0);
  if (Array.isArray(src.decor)) for (const d of src.decor.slice(0, 200)){
    if (!isObj(d) || !schema.decorIds.includes(d.id)) continue;
    // 층·좌표가 범위를 벗어나면 고치지 않고 버려요 (엉뚱한 곳에 가구가 생기지 않게)
    const ok = Number.isInteger(d.f) && d.f >= 1 && d.f <= 3 && Number.isFinite(d.x) && d.x >= 0 && d.x <= 1180 && Number.isFinite(d.y) && d.y >= 0 && d.y <= 640;
    if (ok) out.decor.push({id:d.id, f:d.f, x:d.x, y:d.y});
  }
  if (isObj(src.up)) for (const k of schema.upgradeIds) if (src.up[k] === true) out.up[k] = true;
  if (isObj(src.rel)) for (const [k, v] of Object.entries(src.rel)){
    const [a, b] = k.split("|");
    if (a && b && a < b && schema.charIds.includes(a) && schema.charIds.includes(b)) out.rel[k] = num(v, 0, 100, 30);
  }
  if (Array.isArray(src.quests)) for (const q of src.quests.slice(0, 3)){
    if (!isObj(q)) continue;
    const i = int(q.i, 0, schema.questCount - 1, NaN); if (!Number.isFinite(i)) continue;
    const n = int(q.n, 1, 20, NaN), p = int(q.p, 0, 20, 0);
    if (!Number.isFinite(n) || p >= n || q.doneAt) continue;            // 이미 끝난 과업은 되살리지 않아요 (보상 중복 방지)
    out.quests.push({i, n, p, w: schema.charIds.includes(q.w) ? q.w : null, reward: int(q.reward, 0, 1000, 30 + n * 10)});
  }
  if (isObj(src.chars)) for (const id of schema.charIds){
    const c = src.chars[id]; if (!isObj(c)) continue;
    const needs = {}; for (const k of schema.needKeys) needs[k] = num(c.needs?.[k], 0, 100, 70);
    const skills = {}; for (const k of schema.skillKeys) skills[k] = int(c.skills?.[k], 0, 1e7, 0);
    const stats = {}; if (isObj(c.stats)) for (const [k, v] of Object.entries(c.stats)) if (schema.actionKeys.includes(k)) stats[k] = int(v, 0, 1e7, 0);
    const chatLog = Array.isArray(c.chatLog) ? c.chatLog.filter(m => isObj(m) && CHAT_ROLES.includes(m.r) && typeof m.t === "string").slice(-40).map(m => ({r:m.r, t:m.t.slice(0, 500)})) : [];
    out.chars[id] = {needs, skills, stats, chatLog, lv:int(c.lv, 1, 999, 1), xp:int(c.xp, 0, 1e7, 0), prel:num(c.prel, 0, 100, 20), hat: schema.hatIds.includes(c.hat) ? c.hat : null};
  }
  return out;
}
```

## 파트 13/29

[파트 13/29] 파일: 3d/quests.js (1/1)
```
// 과업 진행·완료 판정 (순수 함수). 보상 지급 전에 완료 표시를 먼저 해서 중복 지급을 막아요.
// q: {i, n, p, w, reward, doneAt?}, Q: {ev?:[], who?:bool}
export function questMatches(q, Q, eventName, charId){
  if (!q || q.doneAt || !Q?.ev || !Q.ev.includes(eventName)) return false;
  if (Q.who && charId !== q.w) return false;
  return true;
}
// 진행 1 올리고, 목표에 닿으면 true (완료 처리는 markQuestDone으로)
export function advanceQuest(q){ if (q.doneAt) return false; q.p = Math.min(q.n, q.p + 1); return q.p >= q.n; }
// 이미 완료면 false. 처음 완료할 때만 true를 돌려주고 즉시 표시해요.
export function markQuestDone(q, now = Date.now()){ if (!q || q.doneAt) return false; q.doneAt = now; q.p = q.n; return true; }
```

## 파트 14/29

[파트 14/29] 파일: 3d/worklog.js (1/1)
```
// 개발 일지: 이 프로젝트에서 실제로 한 작업을 캐릭터(에이전트)들이 재현해요.
// 새 작업을 하면 맨 위 세션에 항목을 추가해 주세요.
export const ROLES = {
  rakko:{role:"팀장·오케스트레이터", short:"PM"},
  hachiware:{role:"프론트엔드 개발", short:"FE"},
  chiikawa:{role:"디자인·3D 모델링", short:"디자인"},
  usagi:{role:"QA·테스트", short:"QA"},
  shisa:{role:"로직·데이터", short:"BE"},
  kurimanju:{role:"배포·인프라", short:"배포"},
  momonga:{role:"문서·안내", short:"문서"},
  kani:{role:"코드 리뷰·정리", short:"리뷰"},
};

export const SESSIONS = [
  {
    date:"2026-10-22", title:"사물 상호작용 · 버그 수정 · 보안 · 글꼴 · 접근성 · 성능",
    request:"가구를 눌러 행동하게 하고, 멈춤·중복 보상 버그를 고치고, 브라우저의 API 키를 없애고, 글꼴과 접근성, 휴대폰 성능을 다듬어 줘",
    items:[
      {who:"rakko", title:"요구사항 나누기", plan:"버그, 사물, 보안, 글꼴, 접근성, 성능. 하나씩 나누지.", work:["우선순위 정리 중","활동 잠금 규칙 정하는 중"], done:"모두 배정했어."},
      {who:"shisa", title:"멈춤·중복 보상 버그", plan:"업무가 멈추는 문제랑 보상이 두 번 나오는 걸 고칠게요!", work:["신호를 꼭 풀기","과업 완료 먼저 표시","이벤트 한 번만 끝내기"], done:"이제 멈추지 않아요!"},
      {who:"hachiware", title:"사물 상호작용", plan:"커피머신, 침대, 피아노… 눌러서 쓰게 만들게!", work:["판정 상자 붙이기","행동 메뉴","주변 사물 버튼"], done:"뭐든 눌러 봐!"},
      {who:"kani", title:"보안 정리", plan:"…브라우저 키, 없앨게.", work:["…키 저장 삭제","…프록시 예시","…기록 지우기 버튼"], done:"…안전해."},
      {who:"chiikawa", title:"글꼴 나누기", plan:"…대사만 손글씨로 할게…!", work:["…대사 글꼴","…UI 글꼴","…시계는 고정폭"], done:"…읽기 쉬워…!"},
      {who:"momonga", title:"접근성과 안내문", plan:"화면 읽기 도구도 읽을 수 있게 할게! 칭찬해 줘!", work:["진행 막대 이름표","포커스 지키기","README 고치기"], done:"다 했어! 칭찬해 줘!"},
      {who:"kurimanju", title:"휴대폰 성능", plan:"하아… 휴대폰이 덜 뜨겁게 해 볼게~", work:["책·꽃 한 번에 그리기","그림자 끄기","해상도 낮추기"], done:"캬~ 가벼워졌다~"},
      {who:"usagi", title:"시나리오 시험", plan:"우라! (시험 목록을 번쩍)", work:["(빠른 답 시험)","(깨진 저장 시험)","하아…? (엘리베이터!)"], done:"야하! (전부 통과!)",
        bug:"(엘리베이터 취소하면 새 걸음이 멈춤!)", fixBy:"shisa", fix:"취소할 때 새 명령의 경로는 건드리지 않게 했어요!"},
    ],
  },
  {
    date:"2026-10-21", title:"카메라 시점 · 유리 건물 · 거리 · 에이전트 회의 · 코드 검수 정리",
    request:"작업하는 모습을 치이카와들이 일하는 걸로 보여 주고, 에이전트 회의, 카메라 시점, 유리 통창 건물과 바깥 거리, GPT 코드 검수용 정리를 해 줘",
    items:[
      {who:"rakko", title:"요청 나누기와 역할 배정", plan:"오늘 요청은 다섯 가지야. 역할을 나눌게.", work:["요청 정리 중…","우선순위 정하는 중"], done:"모두에게 일을 나눠 줬어."},
      {who:"hachiware", title:"카메라 시점 바꾸기", plan:"시점 버튼이랑 따라가기, 자동 회전을 만들게!", work:["시점 프리셋 7개","부드럽게 이동하기","캐릭터 따라가기"], done:"이제 어디서든 볼 수 있어!"},
      {who:"chiikawa", title:"유리 통창 건물 외형", plan:"…유리 건물, 예쁘게 해 볼게…!", work:["유리 외벽 세우는 중…","창틀 붙이는 중…","옥상 간판…!"], done:"…완성…! 반짝반짝…!"},
      {who:"kurimanju", title:"도로·인도·가로수·버스 정류장·지하철 입구", plan:"하아… 바깥 거리는 내가 깔게~", work:["도로 포장 중~","가로수 심는 중","버스랑 지하철 입구~"], done:"캬~ 거리 완성이다~"},
      {who:"shisa", title:"에이전트 회의와 작업 보드", plan:"회의 대본이랑 할 일 보드를 만들게요!", work:["회의 대본 만들기","할 일 배정 로직","진행률 표시"], done:"회의하면 바로 일이 생겨요!"},
      {who:"momonga", title:"안내 문구와 README", plan:"안내문은 내가 쓸게! 다 쓰면 칭찬해 줘!", work:["사용법 정리 중","README 고치는 중"], done:"다 썼어! 칭찬해 줘!"},
      {who:"kani", title:"GPT 코드 검수용 정리", plan:"…코드, 파트별로 나눌게.", work:["…파일 모으는 중","…파트 나누는 중","…복사 버튼"], done:"…정리 끝."},
      {who:"usagi", title:"PC·휴대폰 화면 시험", plan:"우라! (테스트 맡겨 달라는 듯 손을 번쩍)", work:["(이리저리 눌러 봄)","하아…? (버그 냄새)","우라!"], done:"야하! (통과!)",
        bug:"(유리 앞면이 안을 가림!)", fixBy:"chiikawa", fix:"…층을 볼 땐 앞쪽 유리를 숨길게…!"},
    ],
  },
  {
    date:"2026-10-21", title:"3층 건물 · 에스컬레이터 · 관계 · 하루 흐름 · 상점 · 이벤트 · 대화",
    request:"2·3층, 관계도, 하루 흐름, 고유 특성, 나머지 기능, 에스컬레이터, 캐릭터와 대화",
    items:[
      {who:"chiikawa", title:"2·3층 3D 모델링", plan:"…기숙사랑 영화관 만들게…!", work:["침대…","영화관 좌석…"], done:"…다 됐어…!"},
      {who:"hachiware", title:"에스컬레이터와 엘리베이터", plan:"층을 오가게 해 볼게!", work:["계단 움직이기","타고 내리기"], done:"위아래로 다닐 수 있어!"},
      {who:"usagi", title:"이동 경로 시험", plan:"우라!", work:["(에스컬레이터 타 봄)"], done:"야하!", bug:"(방을 대각선으로 뚫고 지나감!)", fixBy:"shisa", fix:"복도를 따라가게 고쳤어요!"},
      {who:"kani", title:"문장 다듬기", plan:"…조사가 어색해.", work:["…'을(를)' 고치는 중"], done:"…받침 따라 고르게 했어."},
    ],
  },
  {
    date:"2026-10-19", title:"2D 사무실 · GitHub 공유 · 원작 이미지 · 3D 1단계",
    request:"GitHub 공유, 원작 이미지, 실제 구동, 3D 엔진",
    items:[
      {who:"kurimanju", title:"GitHub Pages 공유", plan:"하아… 올려 둘게~", work:["푸시 중~"], done:"캬~ 링크 나왔다~"},
      {who:"chiikawa", title:"원작 이미지 오리기", plan:"…배경 지울게…!", work:["…오리는 중"], done:"…깔끔해…!", bug:"(우사기 몸통이 투명!)", fixBy:"chiikawa", fix:"…윤곽선 안쪽을 다 채웠어…!"},
      {who:"hachiware", title:"Three.js 3D 1층", plan:"진짜 3D로 만들어 보자!", work:["카메라","캐릭터 스프라이트"], done:"돌려 볼 수 있어!"},
    ],
  },
];
```

## 파트 15/29

[파트 15/29] 파일: shared/ai-client.js (1/1)
```
// AI 연결. 브라우저에는 API 키를 두지 않아요.
// 1) claude.ai 아티팩트 안에서 열면 window.claude 샘플 기능을 써요 (키 없음, 사용자의 claude.ai 사용량).
// 2) config.js의 proxyUrl에 서버 프록시가 설정돼 있고 접속 코드를 넣으면 프록시를 거쳐 호출해요.
//    접속 코드는 이 탭의 메모리에만 두고 저장하지 않아요.
// 3) 둘 다 없으면 데모 모드 (연결된 척하지 않아요).
const CFG = (globalThis.CHIIKAWA_CONFIG && typeof globalThis.CHIIKAWA_CONFIG === "object") ? globalThis.CHIIKAWA_CONFIG : {};
export const PROXY_URL = typeof CFG.proxyUrl === "string" ? CFG.proxyUrl.replace(/\/+$/, "") : "";
export const TIMEOUT_MS = 90000;
let sample = null, accessCode = "", ready = null;

export function initAI(){
  if (!ready) ready = (async () => {
    try { sample = globalThis.claude?.use ? await globalThis.claude.use("sample") : null; } catch (e) { sample = null; }
  })();
  return ready;
}
export function setAccessCode(code){ accessCode = String(code || "").trim().slice(0, 200); }
export function aiStatus(){
  if (sample) return {mode:"claude-ai", connected:true, label:"claude.ai에서 Claude와 연결돼 있어요 (키 없이, 내 claude.ai 사용량)."};
  if (PROXY_URL && accessCode) return {mode:"proxy", connected:true, label:"서버 프록시를 거쳐 Claude와 연결돼 있어요. 접속 코드는 이 탭에만 있고 저장되지 않아요."};
  if (PROXY_URL) return {mode:"proxy-needs-code", connected:false, label:"서버 프록시가 설정돼 있어요. 관리자에게 받은 접속 코드를 넣으면 연결돼요."};
  return {mode:"demo", connected:false, label:"Claude가 연결되지 않은 데모 모드예요. '프롬프트 복사'로 Claude에 직접 물어보고 답을 붙여 넣을 수 있어요."};
}
export const isConnected = () => aiStatus().connected;

export const ERRMSG = {
  timeout:"90초 안에 답이 오지 않았어요", cancelled:"멈췄어요", bad_auth:"접속 코드가 맞지 않아요", rate_limited:"사용량이 많아요. 잠시 뒤에 다시 해 주세요",
  too_large:"요청이 너무 길어요", refused:"이 요청에는 답할 수 없대요", format:"형식이 달라서 정리하지 못했어요", not_connected:"Claude가 연결되지 않았어요",
  network:"연결이 끊겼어요", not_granted:"Claude 사용이 허용되지 않았어요", overloaded:"Claude가 지금 바빠요. 잠시 뒤에 다시 해 주세요",
};

// 대화 형식을 하나의 글로 (claude.ai 샘플 기능은 글 하나를 받아요)
const flatten = (system, messages) => `${system ? system + "\n\n" : ""}${messages.map(m => (m.role === "user" ? "사용자: " : "답변: ") + m.content).join("\n")}${messages.length > 1 ? "\n답변:" : ""}`;

/**
 * askAI({system, messages, maxTokens, signal, onText}) → 전체 답 텍스트
 * 90초가 지나면 {code:"timeout"}, 사용자가 멈추면 {code:"cancelled"} 오류를 던져요.
 */
export async function askAI({system = "", messages, maxTokens = 1500, signal, onText, timeoutMs = TIMEOUT_MS} = {}){
  await initAI();
  const st = aiStatus(); if (!st.connected) throw { code: "not_connected" };
  const ctrl = new AbortController();
  let why = null;
  const timer = setTimeout(() => { why = "timeout"; ctrl.abort(); }, timeoutMs);
  const onAbort = () => { why = why || "cancelled"; ctrl.abort(); };
  if (signal){ if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true }); }
  // 호출 쪽이 signal을 무시해도 시간 초과·멈춤이 바로 적용되게 경주(race)시켜요
  const aborted = new Promise((_, rej) => ctrl.signal.addEventListener("abort", () => rej({ code: why || "cancelled" }), { once: true }));
  aborted.catch(() => {});
  try {
    if (ctrl.signal.aborted) throw { code: why || "cancelled" };
    if (st.mode === "claude-ai"){
      const res = await Promise.race([sample(flatten(system, messages), { signal: ctrl.signal, cache: false, onText: onText ? ({text}) => onText(text) : undefined }), aborted]);
      return String(res?.text ?? "");
    }
    const res = await Promise.race([fetch(`${PROXY_URL}/messages`, {
      method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${accessCode}` },
      body: JSON.stringify({ system: String(system).slice(0, 8000), messages: messages.slice(-12).map(m => ({role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 6000)})), max_tokens: maxTokens }),
    }), aborted]);
    if (!res.ok) throw { code: {401:"bad_auth", 403:"bad_auth", 413:"too_large", 429:"rate_limited"}[res.status] || (res.status >= 500 ? "overloaded" : "network") };
    const data = await Promise.race([res.json().catch(() => null), aborted]);
    if (data?.stop_reason === "refusal") throw { code: "refused" };
    const text = String(data?.text ?? "");
    onText?.(text);
    return text;
  } catch (e) {
    if (ctrl.signal.aborted) throw { code: why || "cancelled" };
    if (e?.code) throw e;
    throw { code: "network" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}

// 클립보드 복사 (실패하면 false)
export async function copyText(text){
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    try { const a = document.createElement("textarea"); a.value = text; a.setAttribute("readonly", ""); a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select(); const ok = document.execCommand("copy"); a.remove(); return ok; }
    catch (e2) { return false; }
  }
}
```

## 파트 16/29

[파트 16/29] 파일: shared/parse.js (1/1)
```
// AI 업무 응답(@제목/@구성/@결과물/@검토 형식)을 해석하는 순수 함수들
export const DEFAULT_SCORE = 4, DEFAULT_COMMENT = "야하!";

// 점수는 늘 1~5 정수. 0, 6, 9, 문자열, 빈 값도 안전하게 처리해요.
export function normalizeScore(v, def = DEFAULT_SCORE){
  const n = typeof v === "number" ? v : Number((String(v ?? "").match(/-?\d+/) || [])[0]);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.trunc(n))) : def;
}

// 스트리밍 도중에도 부르는 관대한 해석기. phase: 0 시작, 1 제목/구성, 2 결과물, 3 검토
export function parseTaskAnswer(text){
  text = String(text ?? "");
  const r = {title:"", outline:[], body:"", score:0, comment:"", phase:0, hasBody:false, hasReview:false};
  const t = text.match(/@제목\s*[:：]\s*(.+)/); if (t){ r.title = t[1].trim().slice(0, 40); r.phase = 1; }
  const iO = text.indexOf("@구성"), iB = text.indexOf("@결과물"), iR = text.indexOf("@검토");
  if (iO >= 0){ r.phase = Math.max(r.phase, 1); const end = [iB, iR].filter(i => i > iO).sort((a, b) => a - b)[0];
    r.outline = text.slice(iO + 3, end).split("\n").map(s => s.replace(/^\s*[-*•\d.)]+\s*/, "").trim()).filter(Boolean).slice(0, 6); }
  if (iB >= 0){ r.phase = 2; r.hasBody = true; r.body = text.slice(iB + 4, iR > iB ? iR : undefined).trim(); }
  if (iR >= 0){
    r.phase = 3; r.hasReview = true;
    const seg = text.slice(iR + 3);
    const s = seg.match(/점수\s*[:：]\s*(-?\d+)/); if (s) r.score = normalizeScore(s[1]);
    const c = seg.match(/한줄평\s*[:：]\s*(.+)/); if (c) r.comment = c[1].trim().slice(0, 80);
  }
  return r;
}

// 스트림이 끝난 뒤 최종 결과로 정리. 결과물이 없으면 format 오류, 검토만 없으면 기본값으로 완료.
export function finalizeAnswer(text, task = ""){
  const r = parseTaskAnswer(text);
  if (!r.body.trim()) throw { code: "format", text };
  return {
    ...r,
    title: r.title || String(task).slice(0, 14) || "업무",
    score: r.score ? normalizeScore(r.score) : DEFAULT_SCORE,
    comment: r.comment || DEFAULT_COMMENT,
  };
}

export const buildTaskPrompt = task => `너는 작은 사무실 팀이야. 아래 업무를 실제로 끝까지 해내고, 정확히 이 형식으로만 답해.

업무: """${String(task).slice(0, 4000)}"""

@제목: (업무를 14자 이내로 줄인 이름)
@구성
- (결과물의 구성 또는 작업 단계, 3~5줄, 각 25자 이내)
@결과물
(업무를 완수한 실제 결과물. 한국어. 인사말이나 서론 없이 바로 본문. 마크다운은 ##, ###, -, 1., **굵게** 만 사용. 업무 크기에 맞게 충실하게, 보통 600~1500자.)
@검토
점수: (1~5 정수, 결과물이 업무 요구를 얼마나 채우는지)
한줄평: (40자 이내, 보완하면 좋을 점 또는 칭찬)`;

export function demoAnswer(task){
  const one = String(task).replace(/\s+/g, " ").trim();
  const short = one.length > 14 ? one.slice(0, 14) + "…" : one;
  return `@제목: ${short}
@구성
- 요청 내용 정리
- 진행 순서 세우기
- 바로 쓸 체크리스트
@결과물
## ${short}

> 데모 모드라서 정해진 예시 형식으로 보여 주고 있어요. 'Claude 연결' 안내를 따라 서버 프록시를 연결하거나, '프롬프트 복사'로 Claude에 직접 물어본 뒤 답을 붙여 넣을 수 있어요.

### 요청 내용
- ${one.slice(0, 140)}

### 진행 순서
1. 원하는 결과물의 모양과 분량을 정해요.
2. 필요한 자료를 자료실에서 모아요.
3. 초안을 쓰고 우사기가 검토해요.
4. 팀장이 최종본을 전달해요.

### 체크리스트
- **목적**: 이 결과물을 누가, 어디에 쓰나요?
- **마감**: 언제까지 필요한가요?
- **형식**: 글, 표, 목록 중 무엇이 좋을까요?
@검토
점수: 3
한줄평: 연결되면 진짜로 일할 수 있어! 야하!`;
}
```

## 파트 17/29

[파트 17/29] 파일: shared/storage.js (1/1)
```
// 브라우저 저장소를 안전하게 다루는 도우미 (localStorage가 막혀 있거나 손상돼도 앱이 멈추지 않게)
export const KEYS = {
  tasks2d: "chiikawa-office-v2",
  world3d: "chiikawa3d-world-v2",
  life3dOld: "chiikawa3d-life-v1",
  quality: "chiikawa3d-quality",
  legacyApiKey: "chiikawa-office-apikey",   // 예전 버전이 저장하던 API 키. 시작할 때 지워요.
  legacyModel: "chiikawa-office-model",
};

const store = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };
const session = () => { try { return globalThis.sessionStorage || null; } catch (e) { return null; } };

export function readStr(key, fallback = ""){
  try { const v = store()?.getItem(key); return v == null ? fallback : v; } catch (e) { return fallback; }
}
export function writeStr(key, value){
  try { store()?.setItem(key, String(value)); return true; } catch (e) { return false; }
}
export function remove(key){
  try { store()?.removeItem(key); } catch (e) {}
  try { session()?.removeItem(key); } catch (e) {}
}
// 손상된 JSON은 fallback으로 돌려요
export function readJSON(key, fallback = null){
  const raw = readStr(key, null);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}
export function writeJSON(key, value){
  try { return writeStr(key, JSON.stringify(value)); } catch (e) { return false; }
}
// 예전 버전이 브라우저에 남긴 비밀값을 지워요
export function purgeSecrets(){ remove(KEYS.legacyApiKey); remove(KEYS.legacyModel); }
// "로컬 기록 모두 삭제": 2D 업무, 3D 월드·대화 기록, 화질 설정, 예전 API 키까지 지워요
export function clearAllLocal(){ for (const k of Object.values(KEYS)) remove(k); }

/* ---------- 값 검증 도우미 ---------- */
export const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
export function num(v, min, max, def){
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
export const int = (v, min, max, def) => { const n = num(v, min, max, NaN); return Number.isFinite(n) ? Math.trunc(n) : def; };
export const str = (v, maxLen, def = "") => typeof v === "string" ? v.slice(0, maxLen) : def;
```

## 파트 18/29

[파트 18/29] 파일: shared/markdown.js (1/1)
```
// 모델 출력을 안전하게 화면에 보여 주는 작은 마크다운 변환기. 모든 글자는 먼저 이스케이프해요.
export const esc = s => String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
export const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
export function md(src, noteClass = "note"){
  let out = "", list = null;
  const close = () => { if (list){ out += `</${list}>`; list = null; } };
  for (const raw of String(src).split("\n")){
    const l = raw.trimEnd(); let m;
    if (!l.trim()){ close(); continue; }
    if ((m = l.match(/^#{1,2}\s+(.*)/))){ close(); out += `<h3>${inl(m[1])}</h3>`; continue; }
    if ((m = l.match(/^#{3,6}\s+(.*)/))){ close(); out += `<h4>${inl(m[1])}</h4>`; continue; }
    if ((m = l.match(/^>\s?(.*)/))){ close(); out += `<p class="${noteClass}">${inl(m[1])}</p>`; continue; }
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))){ if (list !== "ul"){ close(); out += "<ul>"; list = "ul"; } out += `<li>${inl(m[1])}</li>`; continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))){ if (list !== "ol"){ close(); out += "<ol>"; list = "ol"; } out += `<li>${inl(m[1])}</li>`; continue; }
    close(); out += `<p>${inl(l)}</p>`;
  }
  close(); return out;
}
```

## 파트 19/29

[파트 19/29] 파일: shared/activity-controller.js (1/1)
```
// 오래 걸리는 활동(업무 지시, 회의, 개발 일지 재생, 자체 회의)을 한 번에 하나만 실행하게 하는 공통 잠금
export class ActivityController {
  constructor(){ this.cur = null; this.listeners = new Set(); }
  get current(){ return this.cur; }
  get busy(){ return !!this.cur; }
  onChange(fn){ this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(){ for (const fn of this.listeners){ try { fn(this.cur); } catch (e) {} } }
  // 성공하면 토큰, 이미 다른 활동 중이면 null
  tryBegin(name, label = name){
    if (this.cur) return null;
    const ctrl = new AbortController();
    this.cur = { name, label, ctrl, signal: ctrl.signal, startedAt: Date.now() };
    this._emit(); return this.cur;
  }
  // 토큰이 현재 활동일 때만 끝내요 (늦게 도착한 정리 코드가 다른 활동을 끝내지 못하게)
  end(token){ if (token && this.cur === token){ this.cur = null; this._emit(); return true; } return false; }
  cancel(reason = "cancelled"){ if (this.cur && !this.cur.signal.aborted) this.cur.ctrl.abort(reason); }
  message(){ return this.cur ? `지금은 ${this.cur.label} 중이에요. 끝난 뒤에 다시 해 주세요.` : ""; }
}
```

## 파트 20/29

[파트 20/29] 파일: shared/actions.js (1/1)
```
// 2D와 3D가 같은 이름·이모지·대사를 쓰도록 모아 둔 행동 문구
export const ACTION_TEXT = {
  coffee:{name:"커피 마시기", emo:"☕", lines:["커피 최고…","카페인 충전!"]},
  snack:{name:"간식 먹기", emo:"🍙", lines:["냠냠","푸딩 발견!"]},
  meal:{name:"밥 먹기", emo:"🍚", lines:["잘 먹겠습니다!","든든해~"]},
  water:{name:"물 마시기", emo:"💧", lines:["꿀꺽꿀꺽","시원해~"]},
  toilet:{name:"화장실 가기", emo:"🚻", lines:["휴~ 살았다","잠깐만…!"]},
  wash:{name:"손 씻기", emo:"🫧", lines:["뽀득뽀득","깨끗해!"]},
  shower:{name:"샤워하기", emo:"🚿", lines:["샤워 중~♪","따끈따끈…"]},
  sofa:{name:"소파에서 쉬기", emo:"🛋️", lines:["푹신…","좋다~"]},
  nap:{name:"낮잠 자기", emo:"💤", lines:["Zzz…","쿨쿨…"]},
  sleep:{name:"잠자기", emo:"🌙", lines:["Zzz…","쿨쿨… (잠꼬대)"]},
  tv:{name:"TV 보기", emo:"📺", lines:["재밌다!","ㅋㅋㅋ"]},
  read:{name:"책 읽기", emo:"📚", lines:["흠흠…","하나 배웠다!"]},
  print:{name:"자료 출력하기", emo:"🖨️", lines:["위잉… 출력 중","종이 걸렸다…!","자료 완성!"]},
  work:{name:"일하기", emo:"💻", lines:["타닥타닥…","집중!","거의 다 했다"]},
  meeting:{name:"회의하기", emo:"🗣️", lines:["좋은 생각이에요!","음음"]},
  game:{name:"게임하기", emo:"🎮", lines:["이겼다!","한 판 더!"]},
  draw:{name:"그림 그리기", emo:"🎨", lines:["슥슥…","무슨 색 칠하지?"]},
  piano:{name:"피아노 치기", emo:"🎹", lines:["♪ 도레미~","♬ 띵동띵동"]},
  boardgame:{name:"보드게임", emo:"🎲", lines:["내 차례!","주사위 굴린다~"]},
  movie:{name:"영화 보기", emo:"🎬", lines:["(두근두근)","감동…","팝콘 냠냠"]},
  sunbath:{name:"일광욕", emo:"🌞", lines:["햇볕 좋다…","(꾸벅)"]},
  bbq:{name:"바비큐", emo:"🍖", lines:["지글지글~","다 익었다!"]},
  sightsee:{name:"구경하기", emo:"🔭", lines:["경치 최고!","저기 구름 봐","꽃이 예쁘다"]},
  massage:{name:"안마받기", emo:"💺", lines:["시원하다~","으으…"]},
};
// 사물 버튼 이름: "커피머신에서 커피 마시기"
export const objectActionLabel = (objName, key) => `${objName}에서 ${ACTION_TEXT[key]?.name ?? key}`;
```

## 파트 21/29

[파트 21/29] 파일: 2d/app.js (1/3)
```
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
```

## 파트 22/29

[파트 22/29] 파일: 2d/app.js (2/3)
```
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
```

## 파트 23/29

[파트 23/29] 파일: 2d/app.js (3/3)
```
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
```

## 파트 24/29

[파트 24/29] 파일: 3d.html (1/2)
```
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>치이카와 오피스 3D</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Gowun+Dodum&family=Nanum+Gothic+Coding&display=swap">
<style>
/* Layout: a 3-floor 3D building you can orbit (HUD + floor tabs on top), then status/quests, chat, and tool panels below. Light office; dark mode recolors only the UI chrome, the 3D scene follows the in-game clock. */
:root{
  --bg:#f4f7fc; --panel:#ffffff; --line:#dbe2ef; --ink:#2d3149; --muted:#6b7190;
  --pink:#ff8fb1; --blue:#6f9fd8; --yellow-soft:#fdf3c9; --ok:#3f9d6b; --bad:#d0505f;
  /* 글꼴 3종: 대사(말풍선·채팅·회의 대사)만 손글씨, 나머지 UI는 읽기 쉬운 고딕, 시계·기록·숫자는 고정폭 */
  --font-dialogue:"Gaegu","Comic Sans MS",cursive;
  --font-ui:"Gowun Dodum","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  --font-mono:"Nanum Gothic Coding",ui-monospace,Consolas,monospace;
  --tap:44px;
  color-scheme:light;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#12162a; --panel:#1b2038; --line:#2e3555; --ink:#eef0fb; --muted:#a2a8c8; --yellow-soft:#463d1e; --ok:#6cd09a; --bad:#ff8592; color-scheme:dark}}
:root[data-theme="dark"]{--bg:#12162a; --panel:#1b2038; --line:#2e3555; --ink:#eef0fb; --muted:#a2a8c8; --yellow-soft:#463d1e; --ok:#6cd09a; --bad:#ff8592; color-scheme:dark}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-ui);font-size:15px;line-height:1.5;
  padding:12px max(16px,env(safe-area-inset-right,0px)) 32px max(16px,env(safe-area-inset-left,0px))}
.wrap{max-width:1240px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
header{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;flex-wrap:wrap}
h1{font-family:var(--font-ui);font-size:2.1rem;line-height:1;margin:0}
h1 small{display:block;font-family:var(--font-ui);font-size:.85rem;color:var(--muted);margin-top:6px;font-weight:400}
header a{color:var(--blue);font-size:.85rem}
.view{position:relative;height:min(70vh,660px);min-height:360px;border-radius:18px;overflow:hidden;border:2px solid var(--line);background:#cfe0ff;touch-action:none}
.view.locked{touch-action:pan-y}            /* 3D 조작을 끄면 화면 위에서도 페이지가 스크롤돼요 */
.view.hovering canvas{cursor:pointer}
.view canvas{display:block}
.hud{position:absolute;left:10px;top:10px;z-index:5;display:flex;flex-direction:column;gap:6px;align-items:flex-start;max-width:calc(100% - 20px)}
.pill{font-family:var(--font-ui);font-size:.8rem;min-height:var(--tap);display:inline-flex;align-items:center;border:2px solid rgba(45,49,73,.15);background:rgba(255,255,255,.92);color:#2d3149;border-radius:999px;padding:3px 10px;white-space:nowrap}
button.pill{cursor:pointer}
button.pill[aria-pressed="true"]{border-color:#2d3149;background:#fdf3c9;font-weight:700}
.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.clock{font-weight:700;font-family:var(--font-mono)}
.tools{position:absolute;right:10px;bottom:10px;z-index:5;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:60%}
.sel{position:absolute;left:10px;bottom:40px;z-index:5;background:rgba(255,255,255,.94);color:#2d3149;border:2px solid var(--pink);border-radius:12px;padding:4px 10px;font-size:.85rem;max-width:calc(100% - 20px)}
.help{position:absolute;left:10px;bottom:10px;z-index:4;background:rgba(255,255,255,.85);color:#4a4f6a;border-radius:10px;padding:3px 9px;font-size:.72rem;max-width:40%}
@media (max-width:640px){.help{display:none}}
@media (max-width:640px){.tools{left:10px;right:10px;max-width:none;flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;scrollbar-width:none;
  -webkit-mask-image:linear-gradient(90deg,#000 85%,transparent);mask-image:linear-gradient(90deg,#000 85%,transparent);padding-right:28px}
  .tools .pill{flex:none}.tools::after{content:"›";flex:none;align-self:center;font-size:1.4rem;color:#2d3149;padding:0 6px}.sel{bottom:62px}}
.toast{position:absolute;left:50%;top:84px;transform:translateX(-50%);z-index:6;background:#fff;color:#2d3149;border:2px solid #2d3149;border-radius:14px;padding:6px 12px;font-size:.88rem;box-shadow:0 4px 0 rgba(45,49,73,.25);display:flex;gap:8px;align-items:center;max-width:calc(100% - 20px)}
.toast button{font-family:var(--font-ui);min-height:36px;font-size:.8rem;border:2px solid #2d3149;background:#ff8fb1;color:#2d3149;border-radius:10px;padding:1px 8px;cursor:pointer;white-space:nowrap}
.panel{background:var(--panel);border:2px solid var(--line);border-radius:16px;padding:12px;min-width:0}
.panel h2{font-family:var(--font-ui);font-size:1.45rem;margin:0 0 6px;line-height:1.1}
.grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:12px;align-items:start}
@media (max-width:820px){.grid{grid-template-columns:minmax(0,1fr)}}
.cmd{display:flex;gap:8px}
.cmd input,.field{flex:1;min-width:0;font-family:var(--font-ui);font-size:1rem;min-height:var(--tap);border:2px solid var(--line);border-radius:12px;padding:8px 12px;background:var(--bg);color:var(--ink)}
textarea.field{width:100%;min-height:80px;resize:vertical}
input:focus-visible,textarea:focus-visible,button:focus-visible,select:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
.btn{font-family:var(--font-ui);font-weight:700;font-size:1rem;min-height:var(--tap);border:2px solid var(--ink);background:var(--pink);color:#2d3149;border-radius:12px;padding:4px 16px;cursor:pointer;box-shadow:0 3px 0 var(--ink);white-space:nowrap}
.btn:active{transform:translateY(3px);box-shadow:none}
.btn.ghost{background:var(--panel);color:var(--ink);font-size:1rem}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.chip{font-family:var(--font-ui);font-size:.85rem;min-height:var(--tap);border:1px dashed var(--muted);background:transparent;color:var(--muted);border-radius:999px;padding:3px 10px;cursor:pointer}
.chip.who{border-style:solid}
.chip.on{background:var(--yellow-soft);color:var(--ink);border-color:var(--ink)}
.note{font-size:.78rem;color:var(--muted);margin:8px 0 0}
.log{font-family:var(--font-mono);font-size:.78rem;max-height:160px;overflow:auto;margin-top:8px;display:flex;flex-direction:column;gap:2px}
.log .bad{color:var(--bad)}
.lv{font-family:var(--font-ui);font-size:.8rem;font-weight:700;background:var(--yellow-soft);border-radius:999px;padding:1px 8px;vertical-align:middle}
.bar{display:inline-block;flex:1;min-width:60px;height:10px;border-radius:10px;background:var(--line);overflow:hidden;vertical-align:middle}
.bar i{display:block;height:100%;border-radius:10px;transition:width .5s}
.xp{display:flex;align-items:center;gap:8px;font-size:.75rem;color:var(--muted)}
.shead{display:flex;gap:10px;align-items:flex-start;position:relative}
.shead img{width:64px;height:64px;object-fit:contain;flex:none}
.shead>div{flex:1;min-width:0}
.moodline{font-size:.85rem;margin-top:4px}
.trait{color:var(--muted);font-size:.8rem;margin-top:2px}
.x{position:absolute;right:0;top:0;border:0;background:transparent;color:var(--muted);font-size:1.1rem;cursor:pointer;min-width:var(--tap);min-height:var(--tap)}
.needs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px;margin-top:10px}
.need{display:flex;align-items:center;gap:8px;font-size:.82rem}.need span:first-child{flex:none;width:5.5em}
.skills{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:10px;font-size:.8rem;color:var(--muted)}.skills b{color:var(--ink)}
.rels{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:.78rem;color:var(--muted)}.rels b{color:var(--ink);font-weight:400}
.sub{font-size:.75rem;color:var(--muted);margin:10px 0 4px;font-weight:700}
.acts{display:flex;flex-wrap:wrap;gap:6px}
.act{font-family:var(--font-ui);font-size:.85rem;min-height:var(--tap);border:2px solid var(--line);background:var(--bg);color:var(--ink);border-radius:10px;padding:3px 8px;cursor:pointer}
.act.special{border-color:var(--pink)}
.act.talk{background:var(--pink);color:#2d3149;border-color:var(--ink);font-weight:700}
.team{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
@media (max-width:480px){.team{grid-template-columns:minmax(0,1fr)}}
.trow{font-family:var(--font-ui);min-height:var(--tap);display:grid;grid-template-columns:32px auto auto 1fr;grid-template-rows:auto auto;gap:0 6px;align-items:center;text-align:left;border:2px solid var(--line);background:var(--bg);color:var(--ink);border-radius:12px;padding:4px 8px;cursor:pointer}
.trow img{grid-row:1 / 3;width:32px;height:32px;object-fit:contain}
.trow span{font-size:.75rem;color:var(--muted)}.trow span:nth-of-type(2){justify-self:end;font-size:1rem}
.trow small{grid-column:2 / 5;font-size:.72rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qs{list-style:none;margin:10px 0;padding:0;display:flex;flex-direction:column;gap:8px}
.qs li{display:grid;grid-template-columns:1fr;gap:3px;font-size:.88rem}
.qs li small{font-size:.72rem;color:var(--muted)}
.qs li.done span{color:var(--ok);font-weight:700}
.chat .msgs{max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:6px;padding:4px 2px;margin:8px 0}
.msg{max-width:85%;padding:6px 12px;border-radius:14px;font-family:var(--font-dialogue);font-size:17px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
.msg.me{align-self:flex-end;background:var(--yellow-soft);border-bottom-right-radius:4px}
.msg.them{align-self:flex-start;background:var(--bg);border:2px solid var(--line);border-bottom-left-radius:4px}
.msg.sys{align-self:center;font-family:var(--font-ui);font-size:.78rem;line-height:1.4;color:var(--muted);background:transparent;padding:0}
.shop{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:8px}
.item{font-family:var(--font-ui);min-height:var(--tap);text-align:left;border:2px solid var(--line);background:var(--bg);color:var(--ink);border-radius:12px;padding:6px 9px;cursor:pointer;display:flex;flex-direction:column;gap:2px}
.item b{font-size:.9rem}.item small{font-size:.72rem;color:var(--muted)}
.item[disabled]{opacity:.5;cursor:default}
details.panel summary{cursor:pointer;font-family:var(--font-ui);font-weight:700;font-size:1.15rem;min-height:var(--tap);display:flex;align-items:center}
.result{margin-top:10px;max-height:380px;overflow:auto;font-size:.9rem;border-top:2px dashed var(--line);padding-top:8px}
.result h3,.result h4{font-family:var(--font-ui);margin:10px 0 4px}
.result .note2{background:var(--yellow-soft);border-radius:10px;padding:6px 10px;font-size:.85rem}
/* 3D labels (CSS2D) */
.nm{font-family:var(--font-ui);font-size:12px;line-height:1;white-space:nowrap;background:rgba(255,255,255,.92);color:#2d3149;border:1px solid #dbe2ef;border-radius:10px;padding:2px 6px;transform:translateY(12px);pointer-events:none}
.nm.on{border-color:#ff8fb1;background:#fff0f5;font-weight:700}
.bub{font-family:var(--font-dialogue);font-weight:700;font-size:17px;line-height:1.3;white-space:nowrap;background:#fff;color:#2d3149;border:2px solid #2d3149;border-radius:14px;padding:3px 10px;opacity:0;transition:opacity .2s;pointer-events:none;position:relative;transform:translateY(-8px)}
.bub.show{opacity:1}
.bub::after{content:"";position:absolute;left:50%;bottom:-7px;width:10px;height:10px;background:#fff;border-right:2px solid #2d3149;border-bottom:2px solid #2d3149;transform:translateX(-50%) rotate(45deg)}
.rlab{font-family:var(--font-ui);font-weight:700;font-size:15px;color:#2d3149;background:rgba(255,255,255,.78);border-radius:8px;padding:0 6px;pointer-events:none;white-space:nowrap}
.err{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:20px;color:#2d3149;background:rgba(255,255,255,.92);z-index:7}
footer{font-size:.75rem;color:var(--muted);text-align:center}
select.pill{appearance:auto;padding:2px 8px}
/* 사물 상호작용: 이름표(마우스를 올리면), 행동 메뉴, 배치 취소 */
.tip{position:absolute;z-index:6;pointer-events:none;background:rgba(45,49,73,.92);color:#fff;border-radius:10px;padding:4px 9px;font-size:.8rem;max-width:240px;transform:translate(-50%,calc(-100% - 12px))}
.tip small{display:block;opacity:.8}
.omenu{position:absolute;z-index:7;background:var(--panel);color:var(--ink);border:2px solid var(--ink);border-radius:14px;padding:8px;box-shadow:0 4px 0 rgba(45,49,73,.25);max-width:min(300px,calc(100% - 20px));display:flex;flex-direction:column;gap:6px}
.omenu h3{margin:0;font-size:.95rem}.omenu .row{gap:6px}.omenu p{margin:0;font-size:.8rem;color:var(--muted)}
.omenu button{font-family:var(--font-ui);font-size:.85rem;min-height:var(--tap);border:2px solid var(--line);background:var(--bg);color:var(--ink);border-radius:10px;padding:2px 10px;cursor:pointer;text-align:left}
.omenu button:disabled{opacity:.55;cursor:default}
.objs{display:flex;flex-wrap:wrap;gap:6px}
.objs .act small{display:block;font-size:.7rem;color:var(--muted)}
.dev{position:absolute;right:10px;top:10px;z-index:6;background:rgba(0,0,0,.7);color:#9fe3c0;font-family:var(--font-mono);font-size:11px;padding:4px 8px;border-radius:8px;white-space:pre;pointer-events:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.privacy{font-size:.82rem;color:var(--ink);background:var(--bg);border-radius:12px;padding:8px 12px;margin-top:8px}
.privacy ul{margin:4px 0;padding-left:18px}
.result{font-family:var(--font-ui)}
@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
.board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}
@media (max-width:700px){.board{grid-template-columns:repeat(2,minmax(0,1fr))}}
.bcol{background:var(--bg);border-radius:12px;padding:6px;min-height:70px;display:flex;flex-direction:column;gap:5px}
.bcol h3{margin:0;font-size:.75rem;color:var(--muted);font-weight:400;display:flex;justify-content:space-between}
.task{display:flex;gap:6px;align-items:center;background:var(--panel);border:2px solid var(--line);border-radius:10px;padding:4px 6px}
.task img{width:26px;height:26px;object-fit:contain;flex:none}.task>div{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.task b{font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.task small{font-size:.68rem;color:var(--muted)}
.task.done{border-color:var(--ok)}.task.doing{border-color:var(--pink)}
.minutes{margin-top:10px;max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:4px;border-top:2px dashed var(--line);padding-top:8px}
.mline{display:flex;gap:6px;align-items:flex-start;font-size:.85rem}.mline span{font-family:var(--font-dialogue);font-size:17px;line-height:1.4}
.mline.head span,.mline.todo span{font-family:var(--font-ui);font-size:.82rem}.mline img{width:22px;height:22px;object-fit:contain;flex:none}.mline b{flex:none;font-size:.8rem}
.mline.head{color:var(--muted);font-size:.78rem}.mline.todo span{color:var(--blue)}
</style>
<script type="importmap">
{"imports":{
  "three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
}}
</script>
</head>
<body>
<div class="wrap">
  <header>
    <h1>치이카와 오피스 3D<small>3층 건물에서 치이카와 친구들이 일하고, 놀고, 자요. 캐릭터를 누르면 상태창과 대화가 열려요.</small></h1>
    <span class="row"><a href="./">← 2D 사무실</a><a href="review.html">🔍 코드 검수 묶음</a></span>
  </header>

  <p class="sr" id="viewDesc">마우스나 손가락으로 돌려 볼 수 있는 3D 화면이에요. 화면을 쓰지 않아도 아래 '팀 상태'와 '주변 사물' 버튼, 명령 입력으로 모든 조작을 할 수 있어요.</p>
  <div class="view" id="view">
    <div class="hud">
      <div class="row"><span class="pill clock" id="clock">☀️ 08:30</span><button type="button" class="pill" id="speed">시간 ×1</button><span class="pill" id="coins">🪙 0</span></div>
      <div class="row" id="floors" role="group" aria-label="층 선택">
        <button type="button" class="pill" data-f="1" aria-pressed="true">1F 사무실<span id="n1"></span></button>
        <button type="button" class="pill" data-f="2" aria-pressed="false">2F 기숙사<span id="n2"></span></button>
        <button type="button" class="pill" data-f="3" aria-pressed="false">3F 취미층<span id="n3"></span></button>
        <button type="button" class="pill" data-f="0" aria-pressed="false">건물 전체</button>
      </div>
    </div>
    <div class="tools">
      <select class="pill" id="camSel" aria-label="카메라 시점"></select>
      <button type="button" class="pill" id="camReset">처음 시점</button>
      <button type="button" class="pill" id="qualityBtn">화질</button>
      <button type="button" class="pill" id="shadowBtn">그림자</button>
      <button type="button" class="pill" id="soundBtn">🔇 소리</button>
      <button type="button" class="pill" id="photoBtn">📷 사진</button>
      <button type="button" class="pill" id="ctrlBtn" aria-pressed="true">3D 조작 켬</button>
    </div>
    <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
    <div class="sel" id="sel" role="status" aria-live="polite" hidden></div>
    <button type="button" class="pill" id="placeCancel" hidden style="position:absolute;left:10px;bottom:84px;z-index:6;background:#fff0f5">✕ 배치 취소 (Esc)</button>
    <div class="tip" id="tip" hidden></div>
    <div class="omenu" id="omenu" role="dialog" aria-label="사물 행동 고르기" hidden></div>
    <div class="dev" id="devStats" hidden></div>
    <div class="help">한 손가락: 회전 · 두 손가락: 확대/이동 · 캐릭터를 고르고 사물이나 바닥 누르기</div>
  </div>

  <section class="panel">
    <form class="cmd" id="cmdForm">
      <input id="cmd" autocomplete="off" placeholder="예: 우사기 테라스로 가 / 모두 회의실로 모여 / 하치와레 노래 불러 / 치이카와 영화 봐" aria-label="명령">
      <button class="btn" type="submit">명령</button>
    </form>
    <div class="chips" id="who"></div>
    <div class="chips" id="ex"></div>
```

## 파트 25/29

[파트 25/29] 파일: 3d.html (2/2)
```
    <p class="note">행동: <b>커피·간식·밥·물·화장실·씻어·샤워·낮잠·자·소파·TV·책·일해·회의해·운동·춤·그림·게임·피아노·보드게임·영화·바비큐·일광욕·수다</b>와 캐릭터 전용 행동(<b>공부·노래·우라·검술·애교·한 잔·연습·정리</b>). 이동: <b>가/와/모여</b> + 장소(회의실·탕비실·화장실·휴게실·자료실·기숙사·침대·샤워실·거실·취미방·영화관·테라스·1층·2층·3층). 쉼표나 "그리고"로 이어 써요. 명령은 페이지 안에서 해석해서 토큰을 쓰지 않아요.</p>
    <div class="log" id="log" aria-live="polite"></div>
  </section>

  <div class="grid">
    <section class="panel" id="status"></section>
    <section class="panel" id="quests"></section>
  </div>

  <section class="panel" id="agentPanel">
    <h2>🤖 에이전트 회의 · 개발 현황</h2>
    <p class="note" style="margin-top:0">캐릭터 한 명 한 명이 역할을 맡은 에이전트예요. 실제로 한 개발 작업을 다시 보거나, 주제를 주고 회의를 열면 회의실에 모여 의견을 나누고 할 일을 정한 뒤 자리로 가서 일해요. 업무 시간에는 가끔 알아서 짧은 아침 회의도 해요.</p>
    <div class="row"><select class="field" id="logSel" aria-label="개발 일지" style="flex:1 1 220px"></select><button class="btn ghost" type="button" id="replayBtn">작업 다시 보기</button></div>
    <form class="cmd" id="meetForm" style="margin-top:8px"><input id="meetIn" autocomplete="off" placeholder="회의 주제. 예: 사무실 이벤트를 더 재밌게 만들기" aria-label="회의 주제"><button class="btn" type="submit">회의 열기</button></form>
    <div class="board" id="board"></div>
    <div class="minutes" id="minutes" aria-live="polite"><p class="note">회의록이 여기에 적혀요.</p></div>
  </section>

  <section class="panel chat" id="chat" hidden>
    <div class="shead"><img id="chatImg" alt=""><div><h2 id="chatName">대화</h2><div class="trait" id="chatSub"></div></div><button type="button" class="x" id="chatClose" aria-label="대화 닫기">✕</button></div>
    <div class="msgs" id="msgs" aria-live="polite"></div>
    <form class="cmd" id="chatForm"><input id="chatIn" autocomplete="off" placeholder="말을 걸어 보세요. 예: 안녕! / 오늘 기분 어때? / 같이 커피 마시러 가자" aria-label="캐릭터에게 할 말"><button class="btn" type="submit">보내기</button></form>
    <p class="note" id="chatMode"></p>
  </section>

  <details class="panel" id="shopPanel">
    <summary>🛍️ 상점과 꾸미기</summary>
    <p class="note">일하고 과업을 깨면 코인이 쌓여요. 가구는 산 다음 지금 보는 층의 바닥을 누르면 그 자리에 놓여요. 모자는 상태창에서 고른 캐릭터에게 씌워요.</p>
    <div class="shop" id="shop"></div>
  </details>

  <details class="panel" id="taskPanel">
    <summary>📋 업무 지시 (Claude)</summary>
    <p class="note" id="taskMode"></p>
    <label for="taskIn" class="sub" style="display:block">업무 내용</label>
    <textarea class="field" id="taskIn" placeholder="예: 다음 주 팀 회식 장소 후보 3곳과 공지 문구 만들어줘"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn" type="button" id="taskGo">지시하기</button><button class="btn ghost" type="button" id="taskStop" hidden>멈추기</button>
      <button class="btn ghost" type="button" id="taskCopy">프롬프트 복사</button><button class="btn ghost" type="button" id="taskPasteBtn">답 붙여 넣기</button></div>
    <div id="taskPaste" hidden style="margin-top:8px"><label for="taskPasteIn" class="sub" style="display:block">Claude에게 받은 답 (형식: @제목 / @결과물 / @검토)</label>
      <textarea class="field" id="taskPasteIn"></textarea><div class="row" style="margin-top:6px"><button class="btn ghost" type="button" id="taskPasteGo">결과 정리하기</button></div></div>
    <div class="result" id="taskOut" role="status" aria-live="polite" aria-busy="false" hidden></div>
  </details>

  <details class="panel" id="aiPanel">
    <summary>🔒 Claude 연결 · 기록과 개인정보</summary>
    <p class="note" id="aiState" role="status"></p>
    <div id="codeRow" class="row" hidden><label for="accessCode" class="sr">접속 코드</label><input class="field" id="accessCode" type="password" autocomplete="off" placeholder="관리자에게 받은 접속 코드">
      <button class="btn ghost" type="button" id="codeSet">연결</button><button class="btn ghost" type="button" id="codeClear">연결 끊기</button></div>
    <div class="privacy">
      <b>이 브라우저에 저장되는 것</b>
      <ul><li>3D 사무실 진행 상황(코인·레벨·가구·과업·관계)과 캐릭터별 대화 기록 최근 20개</li><li>화질 설정</li><li>2D 사무실의 업무 기록</li></ul>
      <b>저장하지 않는 것</b>: API 키·접속 코드 (접속 코드는 이 탭의 메모리에만 있고, 탭을 닫으면 사라져요)<br>
      <b>밖으로 보내는 것</b>: Claude가 연결됐을 때만, 내가 쓴 대화·업무 내용을 claude.ai(아티팩트 안) 또는 설정된 서버 프록시로 보내요. 데모 모드에서는 아무것도 보내지 않아요.
    </div>
    <div class="row" style="margin-top:8px"><button class="btn ghost" type="button" id="clearChats">대화 기록 지우기</button><button class="btn ghost" type="button" id="clearAll">로컬 기록 모두 삭제</button></div>
  </details>

  <footer>팬이 만든 비영리·비공식 프로젝트예요. 치이카와 캐릭터의 권리는 원작자 나가노에게 있어요. 캐릭터 성격과 행동은 팬의 해석이에요.</footer>
</div>
<script src="config.js"></script>
<script type="module" src="3d/app.js"></script>
</body>
</html>
```

## 파트 26/29

[파트 26/29] 파일: index.html (1/1)
```
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>치이카와 오피스</title>
<meta name="description" content="치이카와 친구들이 업무를 나눠 하는 팬메이드 사무실 시뮬레이션 (2D)">
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Gowun+Dodum&family=Nanum+Gothic+Coding&display=swap">
<link rel="stylesheet" href="2d/styles.css">
</head>
<body>
<div class="wrap">
  <header class="top">
    <h1>치이카와 오피스<small>업무를 지시하면 팀이 회의실에 모이고, 자료실·탕비실·자리를 오가며 일을 끝내요.</small></h1>
    <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><a class="mode" href="3d.html" style="text-decoration:none"><b>3D 버전(베타)</b> · 직접 움직이기 →</a>
    <span class="mode" id="mode">연결 확인 중…</span></span>
  </header>

  <div class="status"><span class="lbl">지금 하는 일</span><span class="now" id="now" role="status" aria-live="polite">대기 중이에요</span><div class="bar" id="barBox" role="progressbar" aria-label="업무 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="bar"></i></div><span class="clock" id="clock"></span></div>

  <div class="mapwrap" id="mapwrap">
    <div class="floors" role="group" aria-label="층 선택">
      <button type="button" data-f="1" aria-pressed="true">1F 사무실<span class="cnt" id="cnt1"></span></button>
      <button type="button" data-f="2" aria-pressed="false">2F 기숙사<span class="cnt" id="cnt2"></span></button>
      <button type="button" data-f="3" aria-pressed="false">3F 취미·영화관·테라스<span class="cnt" id="cnt3"></span></button>
    </div>
    <div class="stage">
      <div class="map f1" id="map1" role="img" aria-label="1층 사무실: 회의실, 업무 공간, 탕비실, 엘리베이터, 화장실, 휴게실, 자료실"></div>
      <div class="map f2 off up" id="map2" role="img" aria-label="2층 기숙사: 캐릭터별 방, 샤워실, 공용 거실, 엘리베이터"></div>
      <div class="map f3 off up" id="map3" role="img" aria-label="3층: 취미방, 영화관, 외부 테라스, 엘리베이터"></div>
    </div>
  </div>
  <div class="maptools"><button type="button" id="fitBtn" aria-pressed="false">화면에 맞춤</button><p class="maphint" id="maphint" style="margin:0">지도는 옆으로 밀어서 볼 수 있어요.</p></div>
  <section class="panel objpanel" aria-labelledby="objH">
    <h2 id="objH">사물과 행동</h2>
    <p class="hint" style="margin-top:0">캐릭터를 고른 뒤 지도 위 가구를 누르거나, 아래 버튼을 눌러요. 키보드로는 Tab으로 옮기고 Enter나 Space로 눌러요.</p>
    <div class="row" id="pickRow" role="group" aria-label="캐릭터 고르기"></div>
    <div class="sub" style="margin:8px 0 4px;font-size:.8rem;color:var(--muted)">주변 사물 (<span id="objFloor">1층</span>)</div>
    <div class="row" id="objList"></div>
  </section>
  <div class="toast2" id="notice" role="status" aria-live="polite" hidden></div>

  <div class="grid2">
    <div class="stack">
      <section class="panel">
        <h2>업무 지시서</h2>
        <form id="form">
          <label for="task" class="hint">맡길 일을 적어 주세요. 여러 개를 넣으면 순서대로 처리해요. (Ctrl+Enter)</label>
          <textarea id="task" placeholder="예: 다음 주 팀 회식 장소 후보 3곳과 공지 문구 만들어줘"></textarea>
          <div class="row">
            <button class="btn" type="submit">지시하기</button>
            <button class="btn ghost" type="button" id="stop" hidden>멈추기</button>
          </div>
          <div class="chips" id="chips"></div>
        </form>
        <div class="row" style="margin-top:6px">
            <button class="btn ghost" type="button" id="promptCopy" style="font-size:.95rem;padding:3px 12px">프롬프트 복사</button>
            <button class="btn ghost" type="button" id="pasteToggle" style="font-size:.95rem;padding:3px 12px">답 붙여 넣기</button>
          </div>
          <div class="pastebox" id="pasteBox" hidden style="margin-top:8px">
            <label for="pasteIn" class="hint">Claude에게 받은 답 (형식: @제목 / @구성 / @결과물 / @검토)</label>
            <textarea id="pasteIn"></textarea>
            <button class="btn ghost" type="button" id="pasteGo" style="font-size:.95rem;padding:3px 12px">결과 정리하기</button>
          </div>
        <details class="byok aibox" id="aiBox">
          <summary>Claude 연결 · 기록과 개인정보</summary>
          <p id="aiState" role="status"></p>
          <div class="row" id="codeRow" hidden><label for="accessCode" class="sr">접속 코드</label><input id="accessCode" type="password" autocomplete="off" placeholder="관리자에게 받은 접속 코드">
            <button class="btn ghost" type="button" id="codeSet" style="font-size:.95rem;padding:3px 12px">연결</button><button class="btn ghost" type="button" id="codeClear" style="font-size:.95rem;padding:3px 12px">연결 끊기</button></div>
          <div class="privacy"><b>이 브라우저에 저장되는 것</b><ul><li>업무 기록 최근 30개 (지시 내용·결과물)</li><li>3D 사무실 진행 상황과 대화 기록 (3D에서 쓴 경우)</li></ul>
            <b>저장하지 않는 것</b>: API 키·접속 코드 (접속 코드는 이 탭의 메모리에만 있어요)<br>
            <b>밖으로 보내는 것</b>: Claude가 연결됐을 때만 업무 내용을 claude.ai(아티팩트 안) 또는 설정된 서버 프록시로 보내요. 데모 모드에서는 아무것도 보내지 않아요.</div>
          <div class="row"><button class="btn ghost" type="button" id="clearTasks" style="font-size:.95rem;padding:3px 12px">업무 기록 지우기</button><button class="btn ghost" type="button" id="clearAll" style="font-size:.95rem;padding:3px 12px">로컬 기록 모두 삭제</button></div>
        </details>
      </section>
      <section class="panel">
        <h2>업무 보드</h2>
        <div class="kanban">
          <div class="col"><h3>대기 <span id="nQ">0</span></h3><div id="colQ"></div></div>
          <div class="col"><h3>진행 중 <span id="nW">0</span></h3><div id="colW"></div></div>
          <div class="col"><h3>완료 <span id="nD">0</span></h3><div id="colD"></div></div>
        </div>
      </section>
    </div>
    <div class="stack">
      <section class="panel result" id="result" role="status" aria-live="polite" aria-busy="false">
        <div class="meta"><span class="ttl" id="rTitle">결과물</span><button class="btn ghost" type="button" id="copy" style="font-size:.95rem;padding:3px 12px">복사</button></div>
        <div class="doc" id="rDoc"><p class="empty">업무를 지시하면 여기에 결과물이 나와요.</p></div>
        <div class="review" id="rReview" hidden></div>
        <div class="stamp" id="stamp">야하! 승인</div>
      </section>
      <section class="panel">
        <h2>사무실 로그</h2>
        <div class="log" id="log" role="log" aria-live="off"></div>
      </section>
    </div>
  </div>
  <footer>팬이 만든 비공식 프로젝트예요. 치이카와 캐릭터의 권리는 원작자 나가노에게 있어요.</footer>
</div>

<script src="config.js"></script>
<script type="module" src="2d/app.js"></script>
</body>
</html>
```

## 파트 27/29

[파트 27/29] 파일: 2d/styles.css (1/2)
```
/* 치이카와 오피스 2D 스타일 */
:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
html{scroll-padding-top:env(safe-area-inset-top,0px)}
body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}
img{max-width:100%}
[hidden]:not([hidden=until-found i]){display:none!important}

/* Layout: a top-down company floor plan (7 rooms around one corridor) the crew walks through; work order + result + board below. Day office in light, night office in dark. */
:root{
  --bg:#f4f7fc; --panel:#ffffff; --line:#dbe2ef; --ink:#2d3149; --muted:#6b7190;
  --corridor:#eef1f6; --corridor2:#e6eaf2; --wall:#9aa6c4;
  --r-meet:#ece6fb; --r-work:#e2eefa; --r-pantry:#fdf3d2; --r-elev:#e3e7ee; --r-wc:#dff3ec; --r-lounge:#fde4ec; --r-archive:#f3eadf;
  --desk:#ffffff; --desk-edge:#c3cfe6; --screen:#eaf3ff; --screen-ink:#43608f; --wood:#e8d2b4; --sofa:#ff9fb8; --metal:#c9d0dc; --steel:#aeb7c8;
  --pink:#ff8fb1; --blue:#6f9fd8; --blue-soft:#e1ecfa; --yellow:#f2cf4a; --yellow-soft:#fdf3c9;
  --ok:#3f9d6b; --ok-soft:#dcf2e5; --bad:#d0505f; --leaf:#7cc29a;
  --wall-face:#e4e9f3; --wall-side:#d3dae8; --sky1:#eaf2ff; --sky2:#f8f3ff; --rug:#ffd7e3; --tilt:38deg; --stand:-70deg; --wood-dk:#b8936a;
  /* 글꼴 3종: 대사만 손글씨(--font-dialogue), UI는 고딕(--font-ui), 시계·로그·모니터는 고정폭(--font-mono) */
  --font-dialogue:"Gaegu","Comic Sans MS",cursive; --font-ui:"Gowun Dodum","Apple SD Gothic Neo","Malgun Gothic",sans-serif; --font-mono:"Nanum Gothic Coding",ui-monospace,Consolas,monospace; --tap:44px;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:#12162a; --panel:#1b2038; --line:#2e3555; --ink:#eef0fb; --muted:#a2a8c8;
  --corridor:#202642; --corridor2:#1c2240; --wall:#4d5885;
  --r-meet:#2b2850; --r-work:#1f2d4f; --r-pantry:#3a3423; --r-elev:#262c40; --r-wc:#1d3833; --r-lounge:#3d2537; --r-archive:#352d27;
  --desk:#323a5e; --desk-edge:#46507c; --screen:#16213f; --screen-ink:#9fc2ff; --wood:#6b5640; --sofa:#b85b78; --metal:#59627e; --steel:#4a5370;
  --pink:#ff9cbb; --blue:#8db6ea; --blue-soft:#25365a; --yellow:#f5d65e; --yellow-soft:#463d1e;
  --ok:#6cd09a; --ok-soft:#1c3b2c; --bad:#ff8592; --leaf:#5c9c78; --wall-face:#323a60; --wall-side:#2a3152; --sky1:#151a33; --sky2:#1d1838; --rug:#5a3346; --wood-dk:#4a3a2a; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#12162a; --panel:#1b2038; --line:#2e3555; --ink:#eef0fb; --muted:#a2a8c8;
  --corridor:#202642; --corridor2:#1c2240; --wall:#4d5885;
  --r-meet:#2b2850; --r-work:#1f2d4f; --r-pantry:#3a3423; --r-elev:#262c40; --r-wc:#1d3833; --r-lounge:#3d2537; --r-archive:#352d27;
  --desk:#323a5e; --desk-edge:#46507c; --screen:#16213f; --screen-ink:#9fc2ff; --wood:#6b5640; --sofa:#b85b78; --metal:#59627e; --steel:#4a5370;
  --pink:#ff9cbb; --blue:#8db6ea; --blue-soft:#25365a; --yellow:#f5d65e; --yellow-soft:#463d1e;
  --ok:#6cd09a; --ok-soft:#1c3b2c; --bad:#ff8592; --leaf:#5c9c78; --wall-face:#323a60; --wall-side:#2a3152; --sky1:#151a33; --sky2:#1d1838; --rug:#5a3346; --wood-dk:#4a3a2a; color-scheme:dark}

*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-ui);font-size:15px;line-height:1.6;
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:20px 40px}
.wrap{max-width:1240px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
header.top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
h1{font-family:var(--font-ui);font-weight:700;font-size:2.4rem;line-height:1;margin:0}
h1 small{display:block;font-family:var(--font-ui);font-weight:400;font-size:.9rem;color:var(--muted);margin-top:6px}
.mode{font-size:.8rem;padding:4px 10px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--muted)}
.mode b{color:var(--ink)}
.mode.live{border-color:var(--ok);color:var(--ok);background:var(--ok-soft)}

.status{display:flex;align-items:center;gap:12px;background:var(--panel);border:2px solid var(--line);border-radius:14px;padding:8px 14px;flex-wrap:wrap}
.status .lbl{font-size:.72rem;letter-spacing:.08em;color:var(--muted)}
.status .now{font-family:var(--font-ui);font-weight:700;font-size:1.3rem;line-height:1.1;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.status .bar{flex:0 1 220px;height:10px;border-radius:10px;background:var(--line);overflow:hidden;min-width:100px}
.status .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--pink),var(--blue),var(--yellow));transition:width .6s ease}
.status .clock{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:.9rem;color:var(--muted)}

/* ---------- floor plan: 3D diorama (1000 x 640 logical units per floor, 100cqw = 1000) ---------- */
.mapwrap{overflow-x:auto;border-radius:20px;border:2px solid var(--line);background:linear-gradient(var(--sky1),var(--sky2));padding:10px 10px 0}
.floors{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0 0 4px}
.floors button{font-family:var(--font-ui);font-size:inherit;font-family:var(--font-ui);font-weight:700;font-size:1.05rem;border:2px solid var(--line);background:var(--panel);color:var(--muted);border-radius:999px;padding:2px 14px;cursor:pointer}
.floors button[aria-pressed="true"]{border-color:var(--ink);color:var(--ink);background:var(--yellow-soft)}
.floors .cnt{font-family:var(--font-ui);font-weight:400;font-size:.75rem;margin-left:4px}
.stage{position:relative;min-width:760px;perspective:2200px;perspective-origin:50% -20%;container-type:inline-size}
.map{position:relative;width:100%;aspect-ratio:1000/640;transform-style:preserve-3d;transform-origin:50% 100%;
  transform:translateY(-10cqw) rotateX(var(--tilt)) scale(.94);margin-bottom:-8cqw;
  background:repeating-linear-gradient(90deg,var(--corridor) 0 4cqw,var(--corridor2) 4cqw 8cqw);border-radius:1.2cqw;
  box-shadow:0 0 0 .6cqw var(--wall);transition:transform .7s cubic-bezier(.4,.1,.2,1),visibility 0s}
.map.f2,.map.f3{position:absolute;inset:0 0 auto 0}
.map.off{visibility:hidden;pointer-events:none;transition:transform .7s cubic-bezier(.4,.1,.2,1),visibility 0s .7s}
.map.off.up{transform:translateY(-10cqw) rotateX(var(--tilt)) translateZ(30cqw) scale(.94)}
.map.off.down{transform:translateY(-10cqw) rotateX(var(--tilt)) translateZ(-30cqw) scale(.94)}
.map *{transform-style:preserve-3d}
.room{position:absolute;border:.3cqw solid var(--wall);border-radius:.4cqw}
.r-meeting{background:var(--r-meet)}.r-work{background:var(--r-work)}.r-pantry{background:var(--r-pantry)}
.r-elevator{background:var(--r-elev)}.r-restroom,.r-bath{background:var(--r-wc)}.r-lounge,.r-living{background:var(--r-lounge)}.r-archive{background:var(--r-archive)}
.r-hobby{background:#eef6e6}.r-cinema{background:#2b2240}
.r-terrace{background:repeating-linear-gradient(90deg,#d9b48a 0 3.2cqw,#cfa77a 3.2cqw 3.4cqw)}
.r-cinema::after,.r-terrace::after{display:none}
.r-bed1{background:#fdeef3}.r-bed2{background:#fdf6dc}.r-bed3{background:#f1e8de}.r-bed4{background:#fbeede}.r-bed5{background:#e9f0fb}
.room::after{content:"";position:absolute;inset:6%;border-radius:2cqw;background:repeating-linear-gradient(0deg,transparent 0 1.6cqw,rgba(0,0,0,.025) 1.6cqw 1.7cqw)}
.wall{position:absolute;background:var(--wall-face);box-shadow:inset 0 .35cqw 0 var(--wall)}
.wall.h{transform-origin:50% 100%;transform:rotateX(-90deg)}
.wall.v{transform-origin:100% 50%;transform:rotateY(90deg);background:var(--wall-side)}
.wall.front{opacity:.55}
.wall.rail{background:rgba(170,210,240,.35);box-shadow:inset 0 .4cqw 0 var(--steel);border-left:.2cqw solid var(--steel);border-right:.2cqw solid var(--steel)}
/* furniture details */
.dc{position:absolute;border-radius:.3cqw}
.laptop{background:#3a3f55;border:.15cqw solid #22263a}
.laptop::after{content:"";position:absolute;left:0;right:0;bottom:100%;height:120%;background:linear-gradient(#9fc2ff,#5d7fbf);border:.15cqw solid #22263a;transform-origin:50% 100%;transform:rotateX(-70deg)}
.paper{background:#fff;border:.1cqw solid var(--line);box-shadow:.2cqw .2cqw 0 rgba(0,0,0,.08)}
.bottle{background:linear-gradient(90deg,#9fd3f5,#d6efff);border-radius:.4cqw;border:.1cqw solid #7fb3d5}
.mug{background:#fff;border:.15cqw solid var(--wall);border-radius:50%}
.kb{background:repeating-linear-gradient(90deg,#fff 0 9%,var(--line) 9% 11%);border:.15cqw solid var(--desk-edge);border-radius:.2cqw}
.kettle{background:#e9edf3;border:.2cqw solid var(--wall);border-radius:40% 40% 20% 20%}
.plate{background:#fff;border:.15cqw solid var(--wall);border-radius:50%;display:flex;gap:6%;align-items:center;justify-content:center}
.plate i{width:22%;aspect-ratio:1;border-radius:50%;background:#e0a96d;border:.1cqw solid #a8743e}
.sink{background:radial-gradient(#cfe3f3 40%,#9fb7cc);border:.15cqw solid var(--wall);border-radius:40%}
.stove{background:#2b2d3a;border-radius:.3cqw;display:flex;gap:10%;align-items:center;justify-content:center}
.stove i{width:34%;aspect-ratio:1;border-radius:50%;border:.25cqw solid #ff7a59}
.keys{background:repeating-linear-gradient(90deg,#fff 0 6%,#2b2d3a 6% 7%);border:.15cqw solid #000}
.board{background:conic-gradient(#ff8fb1 0 25%,#6f9fd8 0 50%,#f2cf4a 0 75%,#7cc29a 0);border-radius:.4cqw;border:.15cqw solid var(--wall)}
.grill{background:repeating-linear-gradient(90deg,#555 0 8%,#ff8a5b 8% 10%);border-radius:.4cqw}
.grill i{position:absolute;top:25%;width:22%;height:45%;border-radius:40%;background:#c4573a}.grill i:first-child{left:18%}.grill i:last-child{right:18%}
.flowers{display:flex;justify-content:space-around;align-items:center}
.flowers i{width:12%;aspect-ratio:1;border-radius:50%;background:radial-gradient(#ffe066 30%,#ff8fb1 32%);transform:translateZ(.8cqw)}
.flowers i:nth-child(2n){background:radial-gradient(#ffe066 30%,#b39ddb 32%)}
.blk>.fr.books{filter:none;background:
  linear-gradient(transparent 30%,var(--wood-dk) 30% 35%,transparent 35% 64%,var(--wood-dk) 64% 69%,transparent 69%),
  repeating-linear-gradient(90deg,#e57373 0 6%,#64b5f6 6% 11%,#ffd54f 11% 15%,#81c784 15% 21%,#ba68c8 21% 25%,#ff8a65 25% 31%,var(--wood) 31% 34%)}
.blk>.fr.fridge{filter:none;background:linear-gradient(transparent 36%,var(--wall) 36% 38%,transparent 38%),var(--metal)}
.fridge em,.fridge u{position:absolute;right:10%;width:5%;background:var(--wall);border-radius:.3cqw}
.fridge em{top:12%;height:18%}.fridge u{top:45%;height:30%}
.fridge s{position:absolute;left:18%;top:52%;width:12%;aspect-ratio:1;border-radius:50%;background:#ff8fb1;box-shadow:2cqw .8cqw 0 #f2cf4a,.6cqw 2.2cqw 0 #6f9fd8}
.blk>.fr.coffee{filter:none;background:#5d6578}
.coffee em{position:absolute;left:25%;right:25%;top:40%;bottom:6%;background:#2b2d3a;border-radius:.3cqw .3cqw 0 0}
.coffee em::after{content:"";position:absolute;left:30%;right:30%;bottom:0;height:40%;background:#fff;border-radius:0 0 .4cqw .4cqw}
.coffee u{position:absolute;left:40%;top:12%;width:20%;height:16%;border-radius:50%;background:#ff6b6b;box-shadow:0 0 .6cqw #ff6b6b}
.blk>.fr.stall{filter:none;background:#f3f5fa}
.stall em{position:absolute;right:14%;top:45%;width:8%;height:12%;border-radius:.3cqw;background:var(--wall)}
.stall u{position:absolute;left:40%;top:10%;width:20%;height:10%;border-radius:.3cqw;background:#3f9d6b}
.blk>.fr.printer em{position:absolute;left:15%;right:15%;top:30%;height:18%;background:#2b2d3a;border-radius:.2cqw}
.blk>.fr.drawers{filter:none;display:flex;flex-direction:column;gap:6%;padding:6%}
.drawers em{flex:1;border:.15cqw solid var(--wall);border-radius:.3cqw;position:relative}
.drawers em::after{content:"";position:absolute;left:40%;right:40%;top:40%;height:20%;background:var(--wall);border-radius:.2cqw}
.leaf{background:radial-gradient(circle at 50% 70%,var(--leaf) 0 30%,transparent 31%),radial-gradient(circle at 25% 45%,var(--leaf) 0 22%,transparent 23%),radial-gradient(circle at 75% 45%,var(--leaf) 0 22%,transparent 23%),radial-gradient(circle at 50% 25%,#93d4ad 0 22%,transparent 23%);transform:rotateX(-90deg)}
.lamp{background:linear-gradient(#ffe8a3 0 45%,transparent 45% 55%,var(--wall) 55% 60%,transparent 60%);clip-path:polygon(25% 0,75% 0,90% 45%,55% 45%,55% 100%,45% 100%,45% 45%,10% 45%);transform:rotateX(-90deg);filter:drop-shadow(0 0 .6cqw #ffe8a3)}
.sword{background:linear-gradient(#e9edf3 0 70%,#8a5a3a 70%);border-radius:.4cqw .4cqw 0 0;transform:rotateX(-90deg)}
.mirror{background:linear-gradient(135deg,#dff0ff,#bcd7ef 60%,#e8f4ff);border:.3cqw solid var(--steel);border-radius:.6cqw;transform:rotateX(-90deg)}
.showerhead{background:var(--steel);border-radius:50% 50% .3cqw .3cqw;transform:rotateX(-90deg)}
.towel{display:flex;gap:6%;transform:rotateX(-90deg)}.towel i{flex:1;border-radius:.3cqw;background:#ffd3df}.towel i:nth-child(2){background:#cfe0f5}.towel i:nth-child(3){background:#fde9a8}
.bottle3d{background:linear-gradient(90deg,#8ec5ee,#cfe8fb);border-radius:40% 40% .3cqw .3cqw;transform:rotateX(-90deg)}
.floorsign{background:#1f2337;color:#ffcf66;font-family:var(--font-mono);font-size:1.4cqw;display:grid;place-items:center;border-radius:.4cqw;transform:rotateX(-90deg)}
.tv.game{background:linear-gradient(#2b3d6b,#1b2a4a);color:#ffe066;font-family:var(--font-ui);font-size:1.5cqw}
.easel{transform:rotateX(-75deg);background:linear-gradient(90deg,transparent 46%,var(--wood-dk) 46% 54%,transparent 54%)}
.easel i{position:absolute;inset:4% 8% 30%;background:#fff;border:.3cqw solid var(--wood-dk);background-image:radial-gradient(circle at 30% 40%,#ff8fb1 0 14%,transparent 15%),radial-gradient(circle at 65% 55%,#6f9fd8 0 18%,transparent 19%),radial-gradient(circle at 50% 80%,#7cc29a 0 12%,transparent 13%)}
.pianoback{background:#2b2d3a;border-radius:.4cqw .4cqw 0 0;transform:rotateX(-90deg) translateY(-4cqw)}
.curtain{background:repeating-linear-gradient(90deg,#b02a3a 0 18%,#8a1f2c 18% 25%);border-radius:0 0 1cqw 1cqw;transform:rotateX(-90deg)}
.screen{background:linear-gradient(120deg,#1b2a4a,#4a2f6b,#1b4a5a,#1b2a4a);background-size:300% 100%;animation:pan 9s linear infinite;border:.5cqw solid #111;color:#fff;display:grid;place-content:center;text-align:center;font-family:var(--font-ui);transform:rotateX(-90deg);box-shadow:0 0 3cqw rgba(140,170,255,.5)}
.screen b{font-size:3.2cqw;line-height:1.1}.screen span{font-size:1.6cqw;opacity:.8}
@keyframes pan{to{background-position:300% 0}}
.popcorn{background:radial-gradient(circle,#fff6c9 0 18%,transparent 20%) 0 0/1.4cqw 1.4cqw,rgba(255,240,170,.6);border:.3cqw solid #d63a3a;border-radius:.4cqw;transform:rotateX(-90deg)}
.pole{background:#eee;border:.1cqw solid var(--wall);transform:rotateX(-90deg)}
.parasol{position:absolute;border-radius:50%;background:repeating-conic-gradient(#ff8fb1 0 30deg,#fff 30deg 60deg);border:.25cqw solid var(--wall);opacity:.72}
.smoke{background:radial-gradient(circle at 40% 70%,rgba(255,255,255,.7) 0 20%,transparent 22%),radial-gradient(circle at 60% 35%,rgba(255,255,255,.5) 0 18%,transparent 20%);transform:rotateX(-90deg);animation:puff 2.4s ease-in-out infinite alternate}
@keyframes puff{to{translate:0 -1cqw;opacity:.5}}
.telescope{background:linear-gradient(#3a3f55 0 40%,transparent 40% 45%,#3a3f55 45% 50%,transparent 50%),linear-gradient(90deg,transparent 45%,#3a3f55 45% 55%,transparent 55%);transform:rotateX(-90deg)}
.wall .rl,.flab{position:absolute;font-family:var(--font-ui);font-weight:700;font-size:2.1cqw;line-height:1;color:var(--ink);opacity:.85;white-space:nowrap}
.wall .rl{left:1.2cqw;top:.9cqw}
.blk>.fr.elevdoor{filter:none;background:#2a2e40;overflow:hidden;border-radius:.4cqw .4cqw 0 0}
.elevdoor s{position:absolute;left:30%;right:30%;top:3%;height:12%;background:#1f2337;color:#ffcf66;font-family:var(--font-mono);font-size:1.1cqw;text-decoration:none;display:grid;place-items:center;border-radius:.3cqw}
.elevdoor b{position:absolute;top:20%;bottom:0;width:50%;background:var(--steel);transition:transform .6s ease}
.elevdoor .l{left:0;border-right:.15cqw solid var(--wall)}.elevdoor .r{right:0;border-left:.15cqw solid var(--wall)}
.elevdoor.open .l{transform:translateX(-100%)}.elevdoor.open .r{transform:translateX(100%)}
.corr-label{position:absolute;font-family:var(--font-ui);font-size:1.5cqw;color:var(--muted);letter-spacing:.3em}
.blk{position:absolute}
.blk>i{position:absolute;display:block;background:var(--c);border:.15cqw solid var(--e)}
.blk>.tp{inset:0;transform:translateZ(var(--h));border-radius:.5cqw}
.blk>.fr{left:0;right:0;bottom:0;height:var(--h);transform-origin:50% 100%;transform:rotateX(-90deg);filter:brightness(.86)}
.blk>.sd{top:0;bottom:0;left:100%;width:var(--h);transform-origin:0 50%;transform:rotateY(-90deg);filter:brightness(.74)}
.blk>.sl{top:0;bottom:0;right:100%;width:var(--h);transform-origin:100% 50%;transform:rotateY(90deg);filter:brightness(.8)}
.panel3d{position:absolute;transform-origin:50% 100%}
.wb{background:var(--panel);border:.35cqw solid var(--steel);border-radius:.6cqw;padding:.5cqw .9cqw;overflow:hidden;font-size:1.1cqw;line-height:1.35;transform:rotateX(-62deg)}
.wb b{display:block;font-family:var(--font-ui);font-size:1.6cqw;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wb ul{margin:.3cqw 0 0;padding-left:1.3cqw}
.mon{background:var(--screen);border:.25cqw solid var(--desk-edge);border-radius:.4cqw;padding:.2cqw .4cqw;font-family:var(--font-mono);font-size:.78cqw;line-height:1.25;color:var(--screen-ink);overflow:hidden;white-space:pre-wrap;word-break:break-all;transform:rotateX(-68deg)}
.np{position:absolute;inset:auto .3cqw .3cqw;font-size:.95cqw;line-height:1;text-align:center;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transform:translateZ(calc(var(--h) + .1cqw))}
.desk.on .np{color:var(--ink);font-weight:700}
.desk.on .mon::after{content:"▍";animation:blink .7s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
```

## 파트 28/29

[파트 28/29] 파일: 2d/styles.css (2/2)
```
.tv{background:#1f2337;border:.4cqw solid var(--wall);color:#9fe3c0;font-family:var(--font-mono);font-size:.9cqw;display:grid;place-items:center;transform:rotateX(-90deg)}
.sign{font-family:var(--font-ui);font-weight:700;font-size:1.6cqw;color:var(--blue);text-align:center;transform:rotateX(-90deg)}
.rug{position:absolute;border-radius:50%;background:var(--rug);opacity:.7}
.pillow{position:absolute;left:12%;right:12%;top:6%;height:20%;background:#fff;border-radius:.8cqw;transform:translateZ(calc(var(--h) + .6cqw));border:.15cqw solid var(--e)}
.blanket{position:absolute;left:4%;right:4%;top:34%;bottom:4%;border-radius:.6cqw;transform:translateZ(calc(var(--h) + .3cqw));border:.15cqw solid var(--e)}
.glass{position:absolute;background:rgba(150,200,240,.35);border:.25cqw solid var(--wall);transform-origin:50% 100%;transform:rotateX(-90deg)}

.mate{position:absolute;width:5.6cqw;aspect-ratio:1;transform-origin:50% 100%;transform:translateZ(var(--z,.2cqw)) translate(-50%,-96%) rotateX(var(--stand)) scaleY(1.15);transition:opacity .4s}
.mate .body{width:100%;height:100%;position:relative}
.mate svg,.mate img{width:100%;height:100%;display:block;overflow:visible;transition:transform .15s}
.mate img{position:absolute;left:0;bottom:0;height:auto}
.mate.left svg,.mate.left img{transform:scaleX(-1)}
.mate.sleep{--z:2.4cqw}
.mate.sleep .body{transform:rotate(-78deg) translate(10%,-20%)}
.review .mini img{width:100%;height:100%;object-fit:contain}
.mate.walk .body{animation:waddle .28s ease-in-out infinite alternate}
.mate.work .body{animation:bob .45s ease-in-out infinite alternate}
.mate.cheer .body{animation:hop .5s ease-out 3}
.mate.gone{opacity:0}
.mate .nm{position:absolute;left:50%;top:96%;transform:translateX(-50%);font-size:1.05cqw;line-height:1;white-space:nowrap;background:var(--panel);border:.15cqw solid var(--line);border-radius:1cqw;padding:.15cqw .5cqw}
.mate.sleep .nm{display:none}
@keyframes waddle{from{transform:rotate(-7deg) translateY(0)}to{transform:rotate(7deg) translateY(-6%)}}
@keyframes bob{to{transform:translateY(-6%) rotate(-2deg)}}
@keyframes hop{50%{transform:translateY(-22%)}}
.bub{position:absolute;opacity:0;pointer-events:none;transform-origin:50% 100%;
  transform:translateZ(var(--z,.2cqw)) translate(-50%,-100%) rotateX(var(--stand)) translateY(-7cqw) scale(.6);
  background:var(--panel);border:.25cqw solid var(--ink);border-radius:1.4cqw;padding:.35cqw 1cqw;font-family:var(--font-dialogue);font-weight:700;font-size:max(16px,1.5cqw);line-height:1.3;white-space:nowrap;transition:opacity .25s,transform .25s}
.bub::after{content:"";position:absolute;left:50%;bottom:-.75cqw;width:1.1cqw;height:1.1cqw;background:var(--panel);border-right:.25cqw solid var(--ink);border-bottom:.25cqw solid var(--ink);transform:translateX(-50%) rotate(45deg)}
.bub.show{opacity:1;transform:translateZ(var(--z,.2cqw)) translate(-50%,-100%) rotateX(var(--stand)) translateY(-7cqw) scale(1)}
.maphint{font-size:.78rem;color:var(--muted);margin:-8px 0 0}
@media (min-width:800px){.maphint{display:none}}

/* ---------- panels ---------- */
.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:16px;align-items:start}
@media (max-width:900px){.grid2{grid-template-columns:minmax(0,1fr)}}
.panel{background:var(--panel);border:2px solid var(--line);border-radius:18px;padding:16px;min-width:0}
.panel h2{font-family:var(--font-ui);font-size:1.5rem;margin:0 0 10px;line-height:1.1}
.stack{display:flex;flex-direction:column;gap:16px;min-width:0}
textarea{width:100%;min-height:96px;resize:vertical;border:2px solid var(--line);border-radius:12px;padding:10px 12px;font-family:var(--font-ui);font-size:inherit;color:var(--ink);background:var(--bg)}
textarea:focus-visible,button:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.btn{font-family:var(--font-ui);font-size:inherit;font-family:var(--font-ui);font-weight:700;font-size:1.15rem;border:2px solid var(--ink);background:var(--pink);color:#2d3149;border-radius:12px;padding:6px 18px;cursor:pointer;box-shadow:0 3px 0 var(--ink);transition:transform .1s,box-shadow .1s}
.btn:active{transform:translateY(3px);box-shadow:0 0 0 var(--ink)}
.btn.ghost{background:var(--panel);color:var(--ink)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chip{font-family:var(--font-ui);font-size:inherit;font-size:.8rem;border:1px dashed var(--desk-edge);background:transparent;color:var(--muted);border-radius:999px;padding:3px 10px;cursor:pointer}
.chip:hover{color:var(--ink);border-color:var(--ink)}
.byok{margin-top:12px;border-top:2px dashed var(--line);padding-top:10px;font-size:.85rem}
.byok summary{cursor:pointer;font-weight:700}
.byok input,.byok select{font-family:var(--font-ui);font-size:inherit;font-size:.85rem;border:2px solid var(--line);border-radius:10px;padding:5px 9px;background:var(--bg);color:var(--ink);min-width:0}
.byok input{flex:1 1 220px}
.byok p{margin:6px 0;color:var(--muted);font-size:.78rem}
.byok a{color:var(--blue)}
.hint{font-size:.78rem;color:var(--muted);margin:0 0 6px;display:block}
.result{position:relative;min-height:240px}
.result .meta{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.result .ttl{font-family:var(--font-ui);font-size:1.5rem;font-weight:700;line-height:1.1}
.doc{max-height:460px;overflow:auto;padding-right:6px;font-size:.92rem}
.doc h3,.doc h4{font-family:var(--font-ui);font-size:1.3rem;margin:14px 0 4px;line-height:1.2}
.doc h4{font-size:1.15rem}
.doc p{margin:6px 0}.doc ul,.doc ol{margin:6px 0;padding-left:1.3em}.doc li{margin:2px 0}
.doc .note{background:var(--yellow-soft);border-radius:10px;padding:6px 10px;font-size:.85rem}
.doc .empty{color:var(--muted)}
.review{margin-top:12px;border-top:2px dashed var(--line);padding-top:10px;display:flex;gap:10px;align-items:flex-start}
.review .mini{width:40px;height:40px;flex:none}
.review .stars{color:var(--yellow);letter-spacing:2px}
.review p{margin:0;font-size:.88rem}
.stamp{position:absolute;right:16px;top:14px;transform:rotate(-12deg) scale(1.6);opacity:0;border:3px solid var(--bad);color:var(--bad);font-family:var(--font-ui);font-weight:700;font-size:1.25rem;padding:0 10px;border-radius:8px;transition:all .35s cubic-bezier(.3,1.6,.5,1);pointer-events:none}
.stamp.on{opacity:.9;transform:rotate(-12deg) scale(1)}
.kanban{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
@media (max-width:560px){.kanban{grid-template-columns:minmax(0,1fr)}}
.col{background:var(--bg);border-radius:12px;padding:8px;min-height:90px;display:flex;flex-direction:column;gap:6px}
.col h3{margin:0 0 2px;font-size:.78rem;letter-spacing:.06em;color:var(--muted);font-weight:400;display:flex;justify-content:space-between}
.card{background:var(--panel);border:2px solid var(--line);border-radius:10px;padding:6px 9px;font-size:.84rem;cursor:pointer;text-align:left;font-family:inherit;color:inherit;width:100%}
.card.sel{border-color:var(--pink)}.card.fail{border-color:var(--bad)}
.card .t{display:block;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card .s{font-size:.72rem;color:var(--muted)}
.ex{font-size:.65rem;background:var(--blue-soft);color:var(--blue);border-radius:6px;padding:0 5px;margin-left:4px}
.log{font-family:var(--font-mono);font-size:.76rem;max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:3px}
.log div{display:flex;gap:8px}.log time{color:var(--muted);flex:none;font-variant-numeric:tabular-nums}
.log b{font-weight:400;flex:none}
.who-rakko{color:#a87a52}.who-chiikawa{color:var(--pink)}.who-hachiware{color:var(--blue)}.who-usagi{color:#c9a21a}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .who-rakko{color:#d7ab84}}
:root[data-theme="dark"] .who-rakko{color:#d7ab84}
footer{font-size:.75rem;color:var(--muted);text-align:center}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

/* ---- 접근성·상호작용 추가 ---- */
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.btn,.chip,.floors button,.card,.objbtn,.pickbtn{min-height:var(--tap)}
.mapwrap.fit .stage{min-width:0}
.maptools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:-4px 0 0}
.maptools button{font-family:var(--font-ui);font-size:.85rem;min-height:var(--tap);border:2px solid var(--line);background:var(--panel);color:var(--ink);border-radius:999px;padding:2px 14px;cursor:pointer}
.maptools button[aria-pressed="true"]{border-color:var(--ink);background:var(--yellow-soft,#fdf3c9)}
/* 지도 위 사물 판정 영역: 평소엔 안 보이고, 마우스·포커스가 오면 테두리 */
.hot{position:absolute;border:0;background:transparent;padding:0;margin:0;cursor:pointer;border-radius:.8cqw;outline:none}
.hot:hover,.hot:focus-visible{box-shadow:0 0 0 .35cqw var(--pink),0 0 2cqw rgba(255,143,177,.6);background:rgba(255,143,177,.12)}
.hot[aria-disabled="true"]{cursor:not-allowed}
.mate{cursor:pointer}
.mate.picked .nm{border-color:var(--pink);background:#fff0f5;font-weight:700}
.objpanel .row{display:flex;flex-wrap:wrap;gap:6px}
.objbtn,.pickbtn{font-family:var(--font-ui);font-size:.85rem;border:2px solid var(--line);background:var(--bg);color:var(--ink);border-radius:10px;padding:3px 10px;cursor:pointer;text-align:left}
.objbtn small{display:block;font-size:.72rem;color:var(--muted)}
.objbtn[aria-disabled="true"]{opacity:.6;cursor:not-allowed}
.pickbtn[aria-pressed="true"]{border-color:var(--ink);background:var(--yellow-soft,#fdf3c9);font-weight:700}
.toast2{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:20;background:var(--panel);color:var(--ink);border:2px solid var(--ink);border-radius:14px;padding:8px 14px;max-width:calc(100% - 32px);box-shadow:0 4px 0 rgba(45,49,73,.25);display:flex;flex-direction:column;gap:6px}
.toast2 .row{display:flex;flex-wrap:wrap;gap:6px}
.privacy{font-size:.82rem;background:var(--bg);border-radius:12px;padding:8px 12px;margin-top:8px}
.privacy ul{margin:4px 0;padding-left:18px}
.aibox .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.aibox input,.pastebox textarea{font-family:var(--font-ui);font-size:1rem;min-height:var(--tap);border:2px solid var(--line);border-radius:10px;padding:5px 9px;background:var(--bg);color:var(--ink);min-width:0;flex:1}
.doc{font-family:var(--font-ui)}
```

## 파트 29/29

[파트 29/29] 파일: server/proxy.mjs (1/1)
```
// 치이카와 오피스 서버 프록시 예시. 브라우저에는 API 키를 두지 않고, 이 서버만 키를 가져요.
// 공개 무인증 프록시가 되지 않도록: 접속 코드(Bearer) 필수, 모델 고정, 크기·토큰 제한, 사용자·IP별 속도 제한, 하루 비용 상한, 시간 초과.
// CORS 허용 목록은 브라우저 편의일 뿐 보호 수단이 아니에요 (curl 같은 도구는 CORS를 무시해요). 진짜 보호는 접속 코드와 제한들이에요.
import http from "node:http";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

const env = (k, d) => process.env[k] ?? d;
const API_KEY = env("ANTHROPIC_API_KEY");                                   // 코드·로그·커밋에 절대 넣지 마세요
const TOKENS = env("ACCESS_TOKENS", "").split(",").map(s => s.trim()).filter(s => s.length >= 16);   // 사용자별 접속 코드 (16자 이상)
const ORIGINS = env("ALLOWED_ORIGINS", "").split(",").map(s => s.trim()).filter(Boolean);
const MODEL = env("MODEL", "claude-opus-5-5");
const ALLOWED_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
const MAX_TOKENS = Math.min(+env("MAX_TOKENS", 4000), 8000);
const MAX_BODY = 64 * 1024;                                                // 요청 본문 최대 64KB
const PER_MIN = +env("RATE_PER_MIN", 6), PER_DAY = +env("RATE_PER_DAY", 100);
const DAILY_BUDGET_TOKENS = +env("DAILY_OUTPUT_TOKEN_BUDGET", 200000);      // 하루 전체 출력 토큰 상한 (비용 상한)
const TIMEOUT_MS = 90000, PORT = +env("PORT", 8787);

if (!API_KEY) throw new Error("ANTHROPIC_API_KEY 환경 변수가 필요해요");
if (!TOKENS.length) throw new Error("ACCESS_TOKENS 환경 변수(쉼표로 구분, 16자 이상)가 필요해요. 무인증으로는 켜지 않아요");
if (!ALLOWED_MODELS.has(MODEL)) throw new Error("허용되지 않은 MODEL이에요");

const client = new Anthropic({ apiKey: API_KEY, maxRetries: 1, timeout: TIMEOUT_MS });
const hash = s => crypto.createHash("sha256").update(s).digest("hex").slice(0, 10);   // 로그에는 원문 대신 짧은 해시만
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const today = () => new Date().toISOString().slice(0, 10);
let day = today(), spent = 0;
const hits = new Map();                                                    // key → {min:[timestamps], day:count, d}
function allow(key){
  const now = Date.now(), h = hits.get(key) || {min:[], day:0, d:day};
  if (h.d !== day){ h.day = 0; h.d = day; }
  h.min = h.min.filter(t => now - t < 60000);
  if (h.min.length >= PER_MIN || h.day >= PER_DAY) return false;
  h.min.push(now); h.day++; hits.set(key, h); return true;
}
function send(res, status, obj, origin){
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (origin && ORIGINS.includes(origin)){ headers["access-control-allow-origin"] = origin; headers["vary"] = "Origin"; }
  res.writeHead(status, headers); res.end(JSON.stringify(obj));
}
function readBody(req){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > MAX_BODY){ reject({status:413}); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))); req.on("error", () => reject({status:400}));
  });
}
const clean = (m) => Array.isArray(m) ? m.slice(-12).map(x => ({ role: x?.role === "assistant" ? "assistant" : "user", content: String(x?.content ?? "").slice(0, 6000) })).filter(x => x.content) : [];

http.createServer(async (req, res) => {
  const origin = req.headers.origin, ip = req.socket.remoteAddress || "?";
  if (req.method === "OPTIONS"){
    if (!origin || !ORIGINS.includes(origin)) return send(res, 403, {error:"origin"});
    res.writeHead(204, { "access-control-allow-origin": origin, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type, authorization", "access-control-max-age": "600", vary: "Origin" });
    return res.end();
  }
  if (req.method !== "POST" || req.url !== "/messages") return send(res, 404, {error:"not_found"}, origin);
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!TOKENS.some(t => safeEq(t, token))) return send(res, 401, {error:"bad_auth"}, origin);
  if (today() !== day){ day = today(); spent = 0; }
  if (!allow("t:" + hash(token)) || !allow("ip:" + ip)) return send(res, 429, {error:"rate_limited"}, origin);
  if (spent >= DAILY_BUDGET_TOKENS) return send(res, 429, {error:"daily_budget"}, origin);
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e?.status || 400, {error: e?.status === 413 ? "too_large" : "bad_json"}, origin); }
  const messages = clean(body.messages);
  if (!messages.length || messages[0].role !== "user") return send(res, 400, {error:"bad_messages"}, origin);
  const params = { model: MODEL, max_tokens: Math.max(64, Math.min(MAX_TOKENS, +body.max_tokens || 1500)), output_config: { effort: "low" },
    ...(body.system ? { system: String(body.system).slice(0, 8000) } : {}), messages };
  const t0 = Date.now();
  try {
    const msg = MODEL === "claude-haiku-5-5"
      ? await client.messages.create(params)
      : await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });   // 거절되면 서버가 다른 모델로 한 번 더
    spent += msg.usage?.output_tokens || 0;
    const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
    console.log(JSON.stringify({ t: new Date().toISOString(), who: hash(token), ms: Date.now() - t0, out: msg.usage?.output_tokens, stop: msg.stop_reason }));   // 대화 내용은 기록하지 않아요
    return send(res, 200, { text, stop_reason: msg.stop_reason }, origin);
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : 0;
    console.log(JSON.stringify({ t: new Date().toISOString(), who: hash(token), ms: Date.now() - t0, error: status || "network" }));
    return send(res, status === 429 ? 429 : status >= 500 ? 503 : 502, { error: "upstream" }, origin);
  }
}).listen(PORT, () => console.log(`치이카와 오피스 프록시: http://localhost:${PORT}/messages (모델 ${MODEL})`));
```
