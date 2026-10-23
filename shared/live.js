// 터미널(Claude Code)에서 실제로 하는 작업을 사무실 화면에 보여 주는 동기화.
// 작업 상태는 두 곳 중 하나에서 읽어요 (쓰는 쪽은 tools/live.mjs와 Claude가 맡아요).
//  1) claude.ai 아티팩트 안: 아티팩트 db의 live/status 문서 (실시간)
//  2) 그 밖(GitHub Pages 등): 저장소 live 브랜치의 status.json을 GitHub API로 75초마다 확인
// 상태 형식: {state:"working"|"idle", title, request, steps:[{who, title, status:"todo"|"doing"|"done"}], updatedAt}
import { isObj, str } from "./storage.js";

const REPO = "onyoupado/Chiikawa-office";
const API = `https://api.github.com/repos/${REPO}/contents/status.json?ref=live`;
const POLL_MS = 75000, STALE_MS = 45 * 60 * 1000;      // 45분 넘게 소식이 없으면 끝난 것으로 봐요
const WHO = ["rakko", "chiikawa", "hachiware", "usagi", "momonga", "kurimanju", "shisa", "kani"];

// 바깥에서 온 값이라 형식을 검사해요
export function normalizeLive(raw, now = Date.now()){
  if (!isObj(raw)) return null;
  const at = Date.parse(raw.updatedAt);
  const stale = !Number.isFinite(at) || now - at > STALE_MS;
  const steps = Array.isArray(raw.steps) ? raw.steps.slice(0, 12).filter(isObj).map(s => ({
    who: WHO.includes(s.who) ? s.who : "rakko", title: str(s.title, 40, "작업"), status: ["todo", "doing", "done"].includes(s.status) ? s.status : "todo",
  })) : [];
  return { state: raw.state === "working" && !stale ? "working" : "idle", title: str(raw.title, 60, ""), request: str(raw.request, 200, ""), steps, updatedAt: Number.isFinite(at) ? at : 0, stale };
}

export function startLiveSync(onStatus){
  let last = "", stopped = false, timer = null;
  const emit = raw => { const st = normalizeLive(raw); const key = JSON.stringify(st); if (key !== last){ last = key; try { onStatus(st); } catch (e) {} } };
  (async () => {
    // 아티팩트 db가 있으면 그걸로 (없으면 null)
    let db = null;
    try { db = globalThis.claude?.use ? await globalThis.claude.use("db") : null; } catch (e) { db = null; }
    if (stopped) return;
    if (db){
      try { db.doc("live/status").onSnapshot(snap => emit(snap?.data ? snap.data() : snap), () => {}); return; } catch (e) {}
    }
    const poll = async () => {
      if (stopped) return;
      if (!document.hidden){
        try {
          const res = await fetch(API, { headers: { accept: "application/vnd.github.raw+json" }, cache: "no-store" });
          if (res.ok) emit(await res.json());
        } catch (e) {}            // 막혀 있거나(아티팩트 CSP 등) 오프라인이면 조용히 넘어가요
      }
      timer = setTimeout(poll, POLL_MS);
    };
    poll();
  })();
  return () => { stopped = true; clearTimeout(timer); };
}
