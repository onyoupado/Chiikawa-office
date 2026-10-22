import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScore, parseTaskAnswer, finalizeAnswer, demoAnswer } from "../shared/parse.js";
import { esc, md } from "../shared/markdown.js";
import { num, int, str, readJSON, writeJSON, clearAllLocal, purgeSecrets, KEYS } from "../shared/storage.js";
import { ActivityController } from "../shared/activity-controller.js";

test("점수는 늘 1~5", () => {
  for (const [v, want] of [[0, 1], [6, 5], [9, 5], ["3", 3], ["점수 10", 5], [-2, 1], [3.9, 3], ["", 4], [null, 4], ["abc", 4], [undefined, 4]]) assert.equal(normalizeScore(v), want, String(v));
  assert.equal("☆".repeat(5 - normalizeScore(9)), "");
});

test("정상 응답 해석", () => {
  const r = finalizeAnswer("@제목: 회식 공지\n@구성\n- 후보\n- 문구\n@결과물\n## 본문\n내용\n@검토\n점수: 9\n한줄평: 좋아요", "회식");
  assert.equal(r.title, "회식 공지"); assert.deepEqual(r.outline, ["후보", "문구"]); assert.match(r.body, /본문/); assert.equal(r.score, 5); assert.equal(r.comment, "좋아요");
});
test("@결과물이 없으면 format 오류", () => {
  assert.throws(() => finalizeAnswer("@제목: 제목만\n@구성\n- a\n@검토\n점수: 3", "x"), e => e.code === "format");
  assert.throws(() => finalizeAnswer("", "x"), e => e.code === "format");
});
test("@검토가 없으면 기본 점수·한줄평으로 완료", () => {
  const r = finalizeAnswer("@제목: t\n@결과물\n본문만 있어요", "x");
  assert.equal(r.score, 4); assert.equal(r.comment, "야하!"); assert.equal(r.hasReview, false);
});
test("중간에 잘린 응답: 결과물 일부만 있어도 본문으로 인정, 제목 없으면 업무명", () => {
  const r = finalizeAnswer("@구성\n- a\n@결과물\n## 반쯤 쓰다 끊", "다음 주 회식 장소 후보 정리");
  assert.equal(r.title, "다음 주 회식 장소 후보 "); assert.match(r.body, /반쯤/);
  assert.equal(parseTaskAnswer("@제목: 끊긴").phase, 1);
});
test("데모 답은 올바른 형식", () => { const r = finalizeAnswer(demoAnswer("테스트"), "테스트"); assert.equal(r.score, 3); });

test("마크다운은 HTML을 이스케이프", () => {
  assert.equal(esc(`<img src=x onerror="a">'`), "&lt;img src=x onerror=&quot;a&quot;&gt;&#39;");
  const h = md("## <b>제목</b>\n- **굵게** <script>\n> 메모");
  assert.ok(!h.includes("<script>")); assert.match(h, /<strong>굵게<\/strong>/); assert.match(h, /&lt;b&gt;/);
});

test("값 정규화", () => {
  assert.equal(num("7", 0, 5, 1), 5); assert.equal(num("x", 0, 5, 1), 1); assert.equal(num(NaN, 0, 5, 2), 2);
  assert.equal(int(3.7, 0, 9, 0), 3); assert.equal(str(5, 3, "d"), "d"); assert.equal(str("abcdef", 3), "abc");
});

test("손상된 저장소와 전체 삭제", () => {
  const m = new Map(); globalThis.localStorage = { getItem:k => m.has(k) ? m.get(k) : null, setItem:(k, v) => m.set(k, String(v)), removeItem:k => m.delete(k) };
  m.set("broken", "{not json"); assert.equal(readJSON("broken", "fallback"), "fallback");
  writeJSON(KEYS.world3d, {a:1}); m.set(KEYS.legacyApiKey, "sk-ant-should-be-removed");
  purgeSecrets(); assert.equal(m.has(KEYS.legacyApiKey), false);
  clearAllLocal(); assert.equal(m.has(KEYS.world3d), false);
  delete globalThis.localStorage;
});

test("활동 잠금은 하나만", () => {
  const a = new ActivityController();
  const t1 = a.tryBegin("task", "업무 지시"); assert.ok(t1);
  assert.equal(a.tryBegin("meeting", "회의"), null); assert.match(a.message(), /업무 지시/);
  assert.equal(a.end({}), false); assert.ok(a.busy);
  assert.equal(a.end(t1), true); assert.ok(!a.busy);
  const t2 = a.tryBegin("meeting"); a.cancel(); assert.ok(t2.signal.aborted); a.end(t2);
});
