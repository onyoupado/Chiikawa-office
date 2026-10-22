// 3D 시나리오 시험. 사용법은 helper.cjs 맨 위를 보세요.
const {open, reporter} = require('./helper.cjs');
const rep = reporter(), ok = rep.ok;
const fakeClaude = (answer) => { window.claude = { use: async () => async () => ({ text: answer }) }; };
(async () => {
  // A. 기본 + 상호작용
  var {b, p, errs} = await open('3d.html', {init: () => { localStorage.setItem('chiikawa-office-apikey', 'sk-ant-test'); localStorage.setItem('chiikawa-office-model', 'x'); }});
  ok('legacy key purged', await p.evaluate(() => localStorage.getItem('chiikawa-office-apikey') === null && localStorage.getItem('chiikawa-office-model') === null));
  // 1 coffee
  await p.evaluate(() => { const o = __office; const c = o.CH.find(c => c.id === 'chiikawa'); o.select(c); o.useObject(c, o.registry.get('coffee'), 'coffee'); });
  let coffeeOk = false;
  for (let i = 0; i < 30 && !coffeeOk; i++){ await p.waitForTimeout(500); coffeeOk = await p.evaluate(() => { const c = __office.CH.find(c => c.id === 'chiikawa'); return c.cur === 'coffee' || (c.stats.coffee || 0) > 0; }); }
  ok('1 coffee via object', coffeeOk);
  // 2 bed menu
  await p.evaluate(() => __office.tapObject(__office.registry.get('bed-usagi'), 500, 300));
  const bedBtns = await p.$$eval('#omenu button', bs => bs.map(b => b.textContent));
  ok('2 bed menu nap/sleep', bedBtns.some(t => t.includes('낮잠')) && bedBtns.some(t => t.includes('잠자기')), JSON.stringify(bedBtns));
  await p.keyboard.press('Escape'); ok('menu closes on Esc', await p.$eval('#omenu', m => m.hidden));
  // 3 piano/game/easel/seats
  const r3 = await p.evaluate(() => ['piano','console','easel','seats'].map(id => { const it = __office.registry.get(id); return it && it.floor === 3 && it.actions.length > 0; }));
  ok('3 hobby objects registered', r3.every(Boolean), JSON.stringify(r3));
  // 9 no character selected → guide
  await p.evaluate(() => { __office.select(null); __office.tapObject(__office.registry.get('tv1'), 500, 300); });
  const guide = await p.textContent('#omenu');
  ok('no selection guide', guide.includes('먼저 캐릭터를 선택해 주세요') && (await p.$$('#omenu .row button')).length === 8);
  await p.keyboard.press('Escape');
  // 7 broken coffee
  await p.evaluate(() => { __office.startEvent('coffee'); __office.select(__office.CH[1]); });
  await p.waitForTimeout(900);
  const br = await p.evaluate(() => { const b = [...document.querySelectorAll('#status .obj')].find(b => b.dataset.obj === 'coffee'); return b && b.getAttribute('aria-disabled') === 'true' && b.textContent.includes('고장'); });
  ok('7 broken coffee disabled with reason', br);
  // 5 keyboard-only: obj buttons are real buttons with labels
  const labels = await p.$$eval('#status .obj', bs => bs.slice(0, 3).map(b => b.tagName + ':' + b.textContent));
  ok('5 nearby object buttons', labels.length === 3 && labels[0].startsWith('BUTTON'), JSON.stringify(labels));
  // focus kept > 3s
  await p.focus('#status .obj:not([aria-disabled])');
  const before = await p.evaluate(() => { window.__f = document.activeElement; return document.activeElement.textContent; });
  await p.waitForTimeout(3200);
  ok('a11y focus kept 3s', await p.evaluate(() => document.activeElement === window.__f), before);
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('keyboard Enter runs action', await p.evaluate(() => !!__office.CH[1].cur || __office.CH[1].path.length > 0));
  // 6 quest re-level
  const q = await p.evaluate(() => { const o = __office; const q = o.quests[0]; const c0 = o.S.coins; o.completeQuest(q); const c1 = o.S.coins; o.completeQuest(q); o.emit('level', o.CH[0]); return [c0, c1, o.S.coins, !!q.doneAt]; });
  ok('quest reward once', q[1] > q[0] && q[2] === q[1] && q[3], JSON.stringify(q));
  // event end once
  const ev = await p.evaluate(() => { const o = __office; o.endEvent(o.eventActive, null, 0); o.startEvent('parcel'); const c0 = o.S.coins; o.endEvent('parcel', 'x', 30); o.endEvent('parcel', 'x', 30); o.endEvent('cake', 'y', 20); return [c0, o.S.coins, o.eventActive, o.registry.has('event-parcel')]; });
  ok('event reward once + unregister', ev[1] - ev[0] === 30 && ev[2] === null && ev[3] === false, JSON.stringify(ev));
  // task during replay
  await p.evaluate(() => document.getElementById('replayBtn').click()); await p.waitForTimeout(300);
  await p.evaluate(() => { document.getElementById('taskPanel').open = true; document.getElementById('taskIn').value = '테스트 업무'; });
  const tdis = await p.$eval('#taskGo', b => b.disabled);
  await p.evaluate(() => document.getElementById('taskGo').click());
  ok('task blocked during replay', tdis && await p.evaluate(() => __office.activity.current?.name === 'replay'));
  await p.evaluate(() => { __office.activity.cancel(); });
  ok('no page errors A', errs.length === 0, JSON.stringify(errs));
  await b.close();
  
  // fast Claude + score 9 → 5
  ({b, p, errs} = await open('3d.html', {init: fakeClaude, initArg: "@제목: 빠른 답\n@결과물\n## 본문\n내용 <script>alert(1)</script>\n@검토\n점수: 9\n한줄평: 좋아"}));
  ok('claude-ai mode label', (await p.textContent('#aiState')).includes('claude.ai'));
  await p.evaluate(() => { document.getElementById('taskPanel').open = true; document.getElementById('taskIn').value = '빠른 업무'; document.getElementById('taskGo').click(); });
  await p.waitForTimeout(1500);
  const out = await p.evaluate(() => ({t: document.getElementById('taskOut').textContent, html: document.getElementById('taskOut').innerHTML, busy: document.getElementById('taskOut').getAttribute('aria-busy'), act: __office.activity.busy}));
  ok('fast claude result + score clamp 5', out.t.includes('★★★★★') && !out.t.includes('☆') && out.busy === 'false' && !out.act, out.t.slice(-40));
  ok('model output escaped', !out.html.includes('<script>'));
  await p.waitForTimeout(9000);
  ok('fast claude: nobody stuck in work', await p.evaluate(() => __office.CH.slice(0, 4).every(c => c.cur !== 'work')));
  ok('no errors B1', errs.length === 0, JSON.stringify(errs)); await b.close();

  // missing @결과물 → format
  ({b, p, errs} = await open('3d.html', {init: fakeClaude, initArg: "@제목: 몸통없음\n@검토\n점수: 3"}));
  await p.evaluate(() => { document.getElementById('taskPanel').open = true; document.getElementById('taskIn').value = 'x'; document.getElementById('taskGo').click(); });
  await p.waitForTimeout(1500);
  ok('missing body → format error, unlocked', (await p.textContent('#taskOut')).includes('형식') && !(await p.evaluate(() => __office.activity.busy)));
  await b.close();

  // missing @검토 → default score, score 0 → 1
  ({b, p, errs} = await open('3d.html', {init: fakeClaude, initArg: "@제목: 검토없음\n@결과물\n본문만 있어요"}));
  await p.evaluate(() => { document.getElementById('taskPanel').open = true; document.getElementById('taskIn').value = 'x'; document.getElementById('taskGo').click(); });
  await p.waitForTimeout(1500);
  ok('missing review → default 4', (await p.textContent('#taskOut')).includes('★★★★☆'));
  await b.close();

  // corrupt storage
  ({b, p, errs} = await open('3d.html', {init: () => { localStorage.setItem('chiikawa3d-world-v2', JSON.stringify({coins:-500, time:'x', decor:[{id:'plant', f:9, x:1, y:1}, {id:'arcade', f:1, x:400, y:320}, 'bad'], quests:[{i:999}, {i:0, n:3, p:3}, {i:1, n:3, p:1}], chars:{usagi:{needs:{hunger:'a'}, chatLog:[{r:'evil', t:'x'}, {r:'me', t:'hi'}], hat:'gun'}}})); }}));
  const cs = await p.evaluate(() => { const o = __office, u = o.CH.find(c => c.id === 'usagi'); return {coins:o.S.coins, decor:o.S.decor.length, q:o.quests.map(q => q.i), log:u.chatLog.length, hat:u.hat, hunger:u.needs.hunger, arcadeReg:o.registry.list(i => i.decor).length}; });
  ok('corrupt storage sanitized', cs.coins === 0 && cs.decor === 1 && cs.log === 1 && cs.hat === null && cs.hunger === 70 && cs.q.length === 3 && !cs.q.includes(0) || (cs.q[0] !== 0), JSON.stringify(cs));
  ok('purchased decor interactive after load', cs.arcadeReg === 1);
  ok('no errors corrupt', errs.length === 0, JSON.stringify(errs));
  ({errs} = {errs});
  await b.close();
  ({b, p, errs} = await open('3d.html', {init: () => { localStorage.setItem('chiikawa3d-world-v2', '{not json'); }}));
  ok('broken JSON → starts', errs.length === 0 && await p.evaluate(() => __office.S.coins === 50));
  await b.close();

  // placement: coins drop before click → cancel, never negative; Escape cancels
  ({b, p, errs} = await open('3d.html'));
  await p.evaluate(() => { __office.addCoins(200); document.getElementById('shopPanel').open = true; document.querySelector('#shop .item[data-id="arcade"]').click(); });
  ok('placing mode + cancel button', await p.isVisible('#placeCancel'));
  await p.evaluate(() => { __office.S.coins = 10; });
  const box = await p.locator('#view canvas').first().boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  ok('placement cancelled when short, no negative', await p.evaluate(() => __office.S.coins === 10 && __office.S.decor.length === 0) && !(await p.isVisible('#placeCancel')));
  await p.evaluate(() => { __office.S.coins = 500; document.querySelector('#shop .item[data-id="arcade"]').click(); });
  await p.keyboard.press('Escape');
  ok('Escape cancels placement', !(await p.isVisible('#placeCancel')) && await p.evaluate(() => __office.S.coins === 500));
  await p.evaluate(() => document.querySelector('#shop .item[data-id="arcade"]').click());
  await p.mouse.click(box.x + box.width / 2, box.y + box.height * .62);
  const pl = await p.evaluate(() => ({coins: __office.S.coins, n: __office.S.decor.length, reg: __office.registry.list(i => i.decor).length}));
  ok('placement charges once + registers', pl.coins === 350 && pl.n === 1 && pl.reg === 1, JSON.stringify(pl));
  await p.evaluate(() => document.querySelector('#shop .item[data-id="plant"]').click());
  await p.mouse.click(box.x + box.width * .3, box.y + box.height * .62);
  ok('decor then other purchase', await p.evaluate(() => __office.S.coins === 320 && __office.S.decor.length === 2));
  // hats geometry
  const geo = await p.evaluate(async () => {
    const o = __office, c = o.CH[0]; o.select(c); o.S.coins = 99999;
    const wait = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const buy = id => document.querySelector(`#shop .item[data-id="${id}"]`).click();
    buy('crown'); await wait(); const g0 = o.renderer.info.memory.geometries;
    for (let i = 0; i < 15; i++){ buy(['party','ribbon','chef','flowerpin','crown'][i % 5]); await wait(); }
    return [g0, o.renderer.info.memory.geometries];
  });
  ok('geometry stable after hats', geo[1] <= geo[0] + 2, JSON.stringify(geo));
  const ev2 = await p.evaluate(async () => { const o = __office, wait = () => new Promise(r => setTimeout(r, 200)); await wait(); const g0 = o.renderer.info.memory.geometries;
    for (let i = 0; i < 5; i++){ o.startEvent('intruder'); await wait(); o.endEvent('intruder', null, 0); o.startEvent('parcel'); await wait(); o.endEvent('parcel', null, 0); } await wait(); return [g0, o.renderer.info.memory.geometries]; });
  ok("geometry stable after events", ev2[1] <= ev2[0] + 3, JSON.stringify(ev2));
  ok('no errors placement', errs.length === 0, JSON.stringify(errs));
  await b.close();

  // mobile + reduced motion
  ({b, p, errs} = await open('3d.html', {mobile:true, reduced:true, viewport:{width:390, height:800}, quality:'mid'}));
  const m = await p.evaluate(() => ({pr: __office.renderer.getPixelRatio(), sh: __office.renderer.shadowMap.enabled, ctrl: document.getElementById('ctrlBtn').getAttribute('aria-pressed'), locked: document.getElementById('view').classList.contains('locked'),
    tap: Math.min(...[...document.querySelectorAll('.tools .pill')].map(e => e.getBoundingClientRect().height)), scroll: document.querySelector('.tools').scrollWidth > document.querySelector('.tools').clientWidth}));
  ok('mobile DPR<=1.5, shadows off, controls off, 44px', m.pr <= 1.5 && !m.sh && m.ctrl === 'false' && m.locked && m.tap >= 44 && m.scroll, JSON.stringify(m));
  const sy0 = await p.evaluate(() => scrollY); await p.mouse.wheel(0, 400); await p.waitForTimeout(400);
  ok('page scrolls (mobile)', await p.evaluate(() => scrollY) > sy0);
  await p.screenshot({path: require('os').tmpdir() + '/chiikawa-mobile.png'});
  ok('no errors mobile', errs.length === 0, JSON.stringify(errs));
  await b.close();
  
  // 엘리베이터·이동 중 새 명령: 예전 이동이 새 걷기를 덮어쓰지 않아야 해요
  for (const delay of [1500, 3500, 6000]){
    ({b, p, errs} = await open('3d.html', {wait: 1500}));
    const el = await p.evaluate(async (delay) => {
      const o = __office, c = o.CH.find(c => c.id === 'kani');
      o.runSeq(c, [() => o.walkTo(c, o.P(3, 300, 320))]);
      await new Promise(r => setTimeout(r, delay));
      o.runSeq(c, [() => o.walkTo(c, o.P(1, 600, 320))]);
      await new Promise(r => setTimeout(r, 25000));
      return {hidden: c.hidden, floor: c.floor, mine: [1,2,3].some(f => o.ELEV[f].users.has('kani')), path: c.path.length, x: Math.round(c.x)};
    }, delay);
    ok(`elevator/new command after ${delay}ms`, !el.hidden && !el.mine && el.floor === 1 && el.path === 0 && Math.abs(el.x - 600) < 3, JSON.stringify(el));
    await b.close();
  }
  rep.done();
})();
