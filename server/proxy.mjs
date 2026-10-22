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
