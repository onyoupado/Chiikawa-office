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
