// 2D 시나리오 시험. 사용법은 helper.cjs 맨 위를 보세요.
const {open, reporter} = require('./helper.cjs');
const rep = reporter(), ok = rep.ok;
const fake = a => { window.claude = { use: async () => async (t, o) => { o?.onText?.({text: a.slice(0, 20)}); await new Promise(r => setTimeout(r, a.includes('SLOW') ? 4000 : 300)); return { text: a }; } }; };
async function submit(p, text = '업무'){ await p.evaluate(t => { document.getElementById('task').value = t; document.getElementById('form').requestSubmit(); }, text); }
async function waitIdle(p, ms = 60000){ const t0 = Date.now(); while (Date.now() - t0 < ms){ if (!(await p.evaluate(() => __office2d.busy))) return true; await p.waitForTimeout(500); } return false; }
(async () => {
  let {b, p, errs} = await open('index.html', {init: fake, initArg: '@제목: 검토없음\n@구성\n- a\n@결과물\n본문이에요'});
  await submit(p);
  ok('missing @검토 → finishes (no deadlock)', await waitIdle(p, 90000));
  let last = await p.evaluate(() => __office2d.tasks.at(-1));
  ok('missing @검토 → done, default 4', last.status === 'done' && last.score === 4, last.status + last.score);
  ok('no errors', errs.length === 0, JSON.stringify(errs)); await b.close();

  ({b, p, errs} = await open('index.html', {init: fake, initArg: '@제목: 몸통없음\n@검토\n점수: 9'}));
  await submit(p);
  ok('missing body → finishes', await waitIdle(p, 40000));
  last = await p.evaluate(() => __office2d.tasks.at(-1));
  ok('missing body → format error', last.status === 'failed' && last.error.includes('형식'), last.error);
  await b.close();

  ({b, p, errs} = await open('index.html', {init: fake, initArg: '@제목: 끝\n@결과물\n본문\n@검토\n점수: 0\n한줄평: 음'}));
  await submit(p); await p.waitForTimeout(2500);
  ok('stream ended before stop', await p.evaluate(() => __office2d.busy));
  await p.click('#stop');
  ok('stop after stream end → recovers', await waitIdle(p, 20000));
  last = await p.evaluate(() => __office2d.tasks.at(-1));
  ok('result kept, score 0→1', last.status === 'done' && last.score === 1, JSON.stringify([last.status, last.score]));
  ok('UI restored', await p.evaluate(() => document.getElementById('stop').hidden && document.getElementById('result').getAttribute('aria-busy') === 'false' && __office2d.ALL.every(c => !c.job)));
  // 다음 업무도 정상
  await submit(p, '두 번째');
  ok('next task runs after stop', await waitIdle(p, 60000) && await p.evaluate(() => __office2d.tasks.at(-1).status === 'done'));
  await b.close();

  ({b, p, errs} = await open('index.html', {init: fake, initArg: 'SLOW @제목: 느림\n@결과물\n본문'}));
  await submit(p); await p.waitForTimeout(1500); await p.click('#stop');
  ok('stop during stream → cancelled', await waitIdle(p, 20000) && (await p.evaluate(() => __office2d.tasks.at(-1).error)) === '멈췄어요');
  await b.close();

  // 사물: 선택 없음 → 안내, 선택 후 커피
  ({b, p, errs} = await open('index.html'));
  await p.evaluate(() => document.querySelector('.hot[data-interactive-id="coffee"]').click());
  ok('2D no selection guide', (await p.textContent('#notice')).includes('먼저 캐릭터를 선택해 주세요'));
  await p.evaluate(() => [...document.querySelectorAll('#notice .pickbtn')].find(b => b.textContent === '모몽가').click());
  await p.waitForTimeout(500);
  ok('2D object action runs', await p.evaluate(() => { const c = __office2d.M.momonga; return !!c.job && c.path.length > 0; }));
  // 키보드: Tab으로 사물 버튼에 가서 Enter
  await p.evaluate(() => document.querySelector('.hot[data-interactive-id="tv1"]').focus());
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok('2D keyboard Enter on furniture', (await p.textContent('#notice')).includes('TV') || await p.evaluate(() => __office2d.M.momonga.job !== null));
  // 업무 중 CREW 막기
  await submit(p, '업무'); await p.waitForTimeout(500);
  await p.evaluate(() => __office2d.pick(__office2d.M.usagi));
  await p.evaluate(() => document.querySelector('.hot[data-interactive-id="tv1"]').click());
  ok('2D activity lock respected', (await p.textContent('#notice')).includes('업무 처리 중'));
  // 맞춤 보기
  await p.click('#fitBtn');
  ok('fit toggle', await p.evaluate(() => document.getElementById('mapwrap').classList.contains('fit') && document.getElementById('fitBtn').getAttribute('aria-pressed') === 'true'));
  const fonts = await p.evaluate(() => ({bub: getComputedStyle(document.querySelector('.bub')).fontFamily, btn: getComputedStyle(document.querySelector('.btn')).fontFamily, log: getComputedStyle(document.getElementById('log')).fontFamily, doc: getComputedStyle(document.getElementById('rDoc')).fontFamily, bubSize: parseFloat(getComputedStyle(document.querySelector('.bub')).fontSize)}));
  ok('2D fonts split', fonts.bub.startsWith('Gaegu') && fonts.btn.startsWith('"Gowun') && fonts.log.startsWith('"Nanum') && fonts.doc.startsWith('"Gowun') && fonts.bubSize >= 16, JSON.stringify(fonts));
  // 바깥 손님 (택배) · 터미널 동기화
  await p.evaluate(() => { __office2d.ALL.forEach(c => { if (!['rakko','chiikawa','hachiware','usagi'].includes(c.id)) c.job = null; }); });
  ok('2D courier visit completes', await p.evaluate(async () => { await __office2d.visit2d('courier'); await new Promise(r => setTimeout(r, 4000)); return __office2d.VIS.length === 0; }));
  await p.evaluate(() => __office2d.liveApply2d({state:'working', title:'시험 작업', request:'', steps:[{who:'kani', title:'리뷰', status:'doing'}], updatedAt:Date.now()}));
  ok('2D live bar shows', (await p.textContent('#livebar')).includes('시험 작업') && !(await p.isHidden('#livebar')));
  await p.evaluate(() => __office2d.liveApply2d({state:'idle', title:'시험 작업', request:'', steps:[], updatedAt:Date.now()}));
  ok('2D live bar hides', await p.isHidden('#livebar'));
  ok('no errors 2D obj', errs.length === 0, JSON.stringify(errs));
  await b.close();
  rep.done();
})();
