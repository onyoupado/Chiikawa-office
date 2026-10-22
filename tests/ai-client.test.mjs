import test from "node:test";
import assert from "node:assert/strict";

test("프록시 없으면 데모, 연결된 척하지 않음", async () => {
  globalThis.CHIIKAWA_CONFIG = { proxyUrl: "" };
  const ai = await import("../shared/ai-client.js?demo");
  await ai.initAI(); assert.equal(ai.aiStatus().mode, "demo"); assert.equal(ai.isConnected(), false);
  await assert.rejects(ai.askAI({messages:[{role:"user", content:"hi"}]}), e => e.code === "not_connected");
});

test("프록시: 접속 코드가 있어야 연결, 키 대신 Bearer 접속 코드 전송, 시간 초과", async () => {
  globalThis.CHIIKAWA_CONFIG = { proxyUrl: "https://proxy.example/" };
  let seen = null;
  globalThis.fetch = async (url, opt) => { seen = {url, opt}; if (JSON.parse(opt.body).messages[0].content === "slow") return new Promise((res, rej) => { if (opt.signal.aborted) rej(new Error("aborted")); opt.signal.addEventListener("abort", () => rej(new Error("aborted"))); }); return { ok: true, status: 200, json: async () => ({ text: "안녕", stop_reason: "end_turn" }) }; };
  const ai = await import("../shared/ai-client.js?proxy");
  assert.equal(ai.aiStatus().mode, "proxy-needs-code");
  ai.setAccessCode("code-123"); assert.equal(ai.aiStatus().mode, "proxy");
  assert.equal(await ai.askAI({messages:[{role:"user", content:"hi"}]}), "안녕");
  assert.equal(seen.url, "https://proxy.example/messages"); assert.equal(seen.opt.headers.authorization, "Bearer code-123");
  assert.ok(!JSON.stringify(seen.opt).includes("x-api-key"));
  await assert.rejects(ai.askAI({messages:[{role:"user", content:"slow"}], timeoutMs: 50}), e => e.code === "timeout");
  const ctrl = new AbortController(); const p = ai.askAI({messages:[{role:"user", content:"slow"}], signal: ctrl.signal}); ctrl.abort();
  await assert.rejects(p, e => e.code === "cancelled");
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(ai.askAI({messages:[{role:"user", content:"hi"}]}), e => e.code === "rate_limited");
});

test("signal을 무시하는 호출도 시간 초과·멈춤이 적용됨 (멈춘 채로 남지 않음)", async () => {
  globalThis.CHIIKAWA_CONFIG = { proxyUrl: "https://proxy.example" };
  globalThis.fetch = () => new Promise(() => {});          // 영원히 답하지 않고 signal도 무시
  const ai = await import("../shared/ai-client.js?deaf");
  ai.setAccessCode("c");
  await assert.rejects(ai.askAI({messages:[{role:"user", content:"x"}], timeoutMs: 30}), e => e.code === "timeout");
  const ctrl = new AbortController(); const p = ai.askAI({messages:[{role:"user", content:"x"}], signal: ctrl.signal});
  setTimeout(() => ctrl.abort(), 10);
  await assert.rejects(p, e => e.code === "cancelled");
});
