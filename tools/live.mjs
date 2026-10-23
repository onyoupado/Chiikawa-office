#!/usr/bin/env node
// 터미널 작업 상태를 사무실 화면으로 보내요. 저장소의 live 브랜치에 status.json 하나만 올려요 (main 기록과 Pages 배포는 건드리지 않아요).
//   node tools/live.mjs start "제목" "요청 한 줄"            작업 시작
//   node tools/live.mjs step hachiware "화면 고치기" doing    단계 추가·변경 (todo|doing|done)
//   node tools/live.mjs done                                작업 끝
//   node tools/live.mjs show                                현재 상태 보기
//   --no-push 를 붙이면 파일만 바꾸고 올리지 않아요.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "live", "status.json");
const WHO = ["rakko", "chiikawa", "hachiware", "usagi", "momonga", "kurimanju", "shisa", "kani"];
const args = process.argv.slice(2).filter(a => a !== "--no-push"), push = !process.argv.includes("--no-push");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const load = () => { try { return JSON.parse(readFileSync(FILE, "utf8")); } catch (e) { return { state: "idle", title: "", request: "", steps: [] }; } };

const st = load(), [cmd, ...rest] = args;
if (cmd === "start"){ Object.assign(st, { state: "working", title: (rest[0] || "작업").slice(0, 60), request: (rest[1] || "").slice(0, 200), steps: [] }); }
else if (cmd === "step"){
  const [who, title, status = "doing"] = rest;
  if (!WHO.includes(who) || !title || !["todo", "doing", "done"].includes(status)) { console.error(`사용법: step <${WHO.join("|")}> "제목" [todo|doing|done]`); process.exit(1); }
  const s = st.steps.find(x => x.title === title);
  if (s) Object.assign(s, { who, status }); else st.steps.push({ who, title: title.slice(0, 40), status });
  st.state = "working";
}
else if (cmd === "done"){ st.state = "idle"; st.steps.forEach(s => { s.status = "done"; }); }
else if (cmd === "show"){ console.log(JSON.stringify(st, null, 2)); process.exit(0); }
else { console.error("사용법: start | step | done | show (파일 맨 위 설명 참고)"); process.exit(1); }
st.updatedAt = new Date().toISOString();
mkdirSync(dirname(FILE), { recursive: true });
writeFileSync(FILE, JSON.stringify(st, null, 2) + "\n");
console.log(`${st.state === "working" ? "🛠" : "✅"} ${st.title} · ${st.steps.map(s => `${s.who}:${s.status}`).join(" ")}`);

if (push){
  // live 브랜치에 status.json만 담은 커밋을 올려요 (작업 트리·main은 그대로)
  const blob = git("hash-object", "-w", FILE);
  const tree = execFileSync("git", ["mktree"], { cwd: ROOT, input: `100644 blob ${blob}\tstatus.json\n`, encoding: "utf8" }).trim();
  let parent = ""; try { git("fetch", "-q", "origin", "live"); parent = git("rev-parse", "FETCH_HEAD"); } catch (e) {}
  const commit = git("commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", `live: ${st.state} ${st.title}`.slice(0, 72));
  for (let i = 0, wait = 2000; ; i++, wait *= 2){
    try { git("push", "-q", "origin", `${commit}:refs/heads/live`); break; }
    catch (e) { if (i >= 3) { console.error("live 브랜치에 올리지 못했어요:", e.message.split("\n")[0]); process.exit(1); } execFileSync("sleep", [String(wait / 1000)]); }
  }
  console.log("live 브랜치에 올렸어요");
}
