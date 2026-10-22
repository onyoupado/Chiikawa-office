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
