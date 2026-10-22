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
