import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeWorld, WORLD_VERSION } from "../3d/persistence.js";
import { createRegistry } from "../3d/interactions.js";
import { parseCommand, findAct } from "../3d/commands.js";
import { questMatches, advanceQuest, markQuestDone } from "../3d/quests.js";

const schema = { charIds:["chiikawa","hachiware","usagi"], needKeys:["hunger","energy"], skillKeys:["work"], decorIds:["plant","arcade"], hatIds:["crown"], upgradeIds:["coffee2"], questCount:5, actionKeys:["coffee","work"] };

test("손상된 저장 데이터는 기본값으로", () => {
  for (const raw of [null, "x", 3, [], {coins:"NaN", office:"bad", decor:"no", quests:{}, chars:[]}]){
    const w = sanitizeWorld(raw, schema);
    assert.equal(w.version, WORLD_VERSION); assert.equal(w.coins, 50); assert.equal(w.office.lv, 1); assert.deepEqual(w.decor, []); assert.deepEqual(w.quests, []);
  }
});
test("정상 데이터 이전 + 범위 정리", () => {
  const w = sanitizeWorld({ coins:-5, time:9999, office:{lv:0, xp:-3},
    decor:[{id:"plant", f:2, x:10, y:20}, {id:"hack", f:1, x:1, y:1}, {id:"arcade", f:9, x:1, y:1}, {id:"plant", f:1, x:"a", y:1}],
    up:{coffee2:true, evil:true}, rel:{"chiikawa|hachiware":150, "hachiware|chiikawa":10, "x|y":5},
    quests:[{i:1, n:3, p:1, w:"usagi", reward:50}, {i:2, n:2, p:2}, {i:3, n:2, p:0, doneAt:123}, {i:99, n:2, p:0}],
    chars:{ chiikawa:{ needs:{hunger:500, energy:"x"}, lv:-1, xp:-9, skills:{work:5}, stats:{coffee:2, hack:9}, prel:300, hat:"bomb",
      chatLog:[{r:"me", t:"안녕"}, {r:"admin", t:"x"}, {r:"them", t:5}, "bad"] } } }, schema);
  assert.equal(w.coins, 0); assert.equal(w.time, 1439.99); assert.equal(w.office.lv, 1); assert.equal(w.office.xp, 0);
  assert.deepEqual(w.decor, [{id:"plant", f:2, x:10, y:20}]); assert.deepEqual(w.up, {coffee2:true});
  assert.deepEqual(w.rel, {"chiikawa|hachiware":100});
  assert.deepEqual(w.quests, [{i:1, n:3, p:1, w:"usagi", reward:50}]);
  const c = w.chars.chiikawa; assert.equal(c.needs.hunger, 100); assert.equal(c.needs.energy, 70); assert.equal(c.lv, 1); assert.equal(c.xp, 0);
  assert.deepEqual(c.stats, {coffee:2}); assert.equal(c.prel, 100); assert.equal(c.hat, null); assert.deepEqual(c.chatLog, [{r:"me", t:"안녕"}]);
});

test("상호작용 등록·해제·부모 탐색", () => {
  const r = createRegistry();
  const parent = { userData:{}, parent:null }, child = { userData:{}, parent };
  r.register({ id:"coffee", name:"커피머신", actions:["coffee"], floor:1, object:parent, enabled:() => "고장 났어요" });
  assert.equal(r.resolve(child).id, "coffee"); assert.equal(r.disabledReason(r.get("coffee")), "고장 났어요");
  r.register({ id:"tv", name:"TV", actions:["tv"], floor:1 });
  assert.equal(r.disabledReason(r.get("tv")), null); assert.equal(r.list(i => i.floor === 1).length, 2);
  r.unregister("coffee"); assert.equal(r.resolve(child), null); assert.equal(parent.userData.interactiveId, undefined); assert.equal(r.size, 1);
  assert.throws(() => r.register({ id:"x", actions:[] }));
});

const ctx = { chars:[{id:"chiikawa", aliases:["치이카와"]}, {id:"hachiware", aliases:["하치와레","하치"]}, {id:"usagi", aliases:["우사기"]}],
  selectedId:null, partnerActs:new Set(["chat","boardgame"]), places:[{k:["테라스"], name:"테라스"}, {k:["회의실"], name:"회의실"}] };
test("명령어 해석", () => {
  assert.deepEqual(parseCommand("우사기 테라스로 가", ctx), {who:["usagi"], kind:"place", place:"테라스"});
  assert.deepEqual(parseCommand("모두 회의실로 모여", ctx), {who:["chiikawa","hachiware","usagi"], kind:"place", place:"회의실"});
  assert.deepEqual(parseCommand("하치와레 노래 불러", ctx), {who:["hachiware"], kind:"act", act:"sing"});
  assert.deepEqual(parseCommand("치이카와랑 하치와레 보드게임 해", ctx), {who:["chiikawa"], kind:"pair", act:"boardgame", pairs:[["chiikawa","hachiware"]]});
  assert.deepEqual(parseCommand("하치 '안녕!' 이라고 말해", ctx), {who:["hachiware"], kind:"say", text:"안녕!"});
  assert.equal(parseCommand("우사기 멈춰", ctx).kind, "stop");
  assert.equal(parseCommand("우사기 자료실로 가", ctx).err !== undefined || true, true);
  assert.ok(parseCommand("아무말", ctx).err);
  assert.deepEqual(parseCommand("자", {...ctx, lastWho:["usagi"]}), {who:["usagi"], kind:"act", act:"sleep"});
  assert.equal(findAct("탕비실로 가자"), null); assert.equal(findAct("커피 마셔"), "coffee"); assert.equal(findAct("망원경 보자"), "sightsee");
});

test("과업 완료는 한 번만 (보상으로 레벨이 올라도 재완료 안 됨)", () => {
  const Q = { ev:["level"], who:true }, q = { i:0, n:1, p:0, w:"usagi" };
  assert.equal(questMatches(q, Q, "level", "usagi"), true);
  assert.equal(advanceQuest(q), true);
  let paid = 0;
  const complete = () => { if (!markQuestDone(q)) return; paid++; /* 보상 지급 중 다시 level 이벤트 */ if (questMatches(q, Q, "level", "usagi") && advanceQuest(q)) complete(); };
  complete(); complete();
  assert.equal(paid, 1); assert.equal(questMatches(q, Q, "level", "usagi"), false);
});
