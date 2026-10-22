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
