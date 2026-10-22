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
