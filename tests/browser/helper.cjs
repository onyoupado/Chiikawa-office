// 브라우저 시나리오 시험 공통 도구 (Playwright 필요, npm 의존성으로 넣지 않았어요)
// 실행: python3 -m http.server 8765 를 저장소 루트에서 켠 뒤
//   PLAYWRIGHT=$(npm root -g)/playwright node tests/browser/3d.cjs
// 선택 환경변수: CHROMIUM(브라우저 경로), THREE_DIR(three@0.160.0 패키지 폴더: CDN이 막힌 곳에서 로컬 파일로 대신), BASE(기본 http://127.0.0.1:8765/)
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const fs = require("fs"), path = require("path");
const BASE = process.env.BASE || "http://127.0.0.1:8765/";
exports.open = async (page = "3d.html", opt = {}) => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await b.newContext({ viewport: opt.viewport || { width: 1100, height: 900 }, isMobile: !!opt.mobile, hasTouch: !!opt.mobile, reducedMotion: opt.reduced ? "reduce" : "no-preference" });
  await ctx.addInitScript(q => { try { if (!localStorage.getItem("chiikawa3d-quality")) localStorage.setItem("chiikawa3d-quality", q); } catch (e) {} }, opt.quality || "low");
  if (opt.init) await ctx.addInitScript(opt.init, opt.initArg);
  if (process.env.THREE_DIR) await ctx.route("https://cdn.jsdelivr.net/npm/three@0.160.0/**", r => {
    const rel = new URL(r.request().url()).pathname.replace("/npm/three@0.160.0/", "");
    r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(process.env.THREE_DIR, rel)) });
  });
  await ctx.route("https://fonts.googleapis.com/**", r => r.fulfill({ contentType: "text/css", body: "" }));   // 글꼴 서버 없이도 시험
  await ctx.route("https://api.github.com/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify(opt.live || { state: "idle" }) }));   // 실시간 작업 상태는 가짜로
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  await p.goto(BASE + page); await p.waitForTimeout(opt.wait ?? 2500);
  return { b, ctx, p, errs };
};
exports.reporter = () => {
  const R = []; let fail = 0;
  return { ok(name, cond, info = ""){ if (!cond) fail++; R.push(`${cond ? "PASS" : "FAIL"} ${name}${info ? "  " + info : ""}`); },
    done(){ console.log(R.join("\n")); console.log(`\n${R.length - fail}/${R.length} 통과`); process.exitCode = fail ? 1 : 0; } };
};
