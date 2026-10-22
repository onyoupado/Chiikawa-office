// 3D 나머지 기능 점검: 마우스 올림 이름표, 명령, 대화, 회의, 층 버튼, 카메라 따라가기·거리 보기, 사진, 소리, 화질, 그림자, 시간 배속, 이벤트 버튼
const {open, reporter} = require('./helper.cjs');
const rep = reporter(), ok = rep.ok;
(async () => {
  const {b, p, errs} = await open('3d.html');
  const vb = await p.locator('#view canvas').first().boundingBox();
  // 마우스 올림: 화면을 훑어서 사물 이름표가 뜨는지
  let tip = false;
  for (let y = .25; y < .9 && !tip; y += .05) for (let x = .1; x < .95 && !tip; x += .05){ await p.mouse.move(vb.x + vb.width * x, vb.y + vb.height * y); await p.waitForTimeout(30); tip = await p.isVisible('#tip'); }
  ok('hover shows object tooltip', tip, tip ? await p.textContent('#tip') : '');
  // 층 버튼
  await p.click('#floors button[data-f="2"]'); await p.waitForTimeout(400);
  ok('floor button 2F', await p.getAttribute('#floors button[data-f="2"]', 'aria-pressed') === 'true');
  await p.click('#floors button[data-f="1"]');
  // 글 명령
  await p.fill('#cmd', '우사기 테라스로 가'); await p.press('#cmd', 'Enter'); await p.waitForTimeout(800);
  ok('text command moves usagi', await p.evaluate(() => { const u = __office.CH.find(c => c.id === 'usagi'); return u.path.length > 0 || !!u.ride || u.floor !== 1 || u.hidden; }));
  await p.fill('#cmd', '하치와레 노래 불러'); await p.press('#cmd', 'Enter'); await p.waitForTimeout(800);
  ok('special action command', await p.evaluate(() => __office.CH.find(c => c.id === 'hachiware').cur === 'sing'));
  await p.fill('#cmd', '알 수 없는 말'); await p.press('#cmd', 'Enter'); await p.waitForTimeout(300);
  ok('unknown command message', (await p.textContent('#log')).includes('누구에게') || (await p.textContent('#log')).includes('모르는 명령'));
  // 대화 (데모 대사)
  await p.evaluate(() => { __office.select(__office.CH.find(c => c.id === 'chiikawa')); document.querySelector('#status .act.talk').click(); });
  await p.waitForTimeout(500);
  await p.fill('#chatIn', '안녕!'); await p.press('#chatIn', 'Enter'); await p.waitForTimeout(500);
  const msgs = await p.$$eval('#msgs .msg', ms => ms.map(m => m.className + ':' + m.textContent));
  ok('chat replies (demo)', msgs.some(m => m.startsWith('msg me')) && msgs.filter(m => m.startsWith('msg them')).length >= 2, JSON.stringify(msgs.slice(-3)));
  ok('chat uses dialogue font', (await p.$eval('#msgs .msg.them', m => getComputedStyle(m).fontFamily)).startsWith('Gaegu'));
  await p.fill('#chatIn', '같이 커피 마시러 가자'); await p.press('#chatIn', 'Enter'); await p.waitForTimeout(800);
  ok('chat suggestion triggers action', await p.evaluate(() => __office.CH.find(c => c.id === 'chiikawa').cur === 'coffee'));
  // 카메라
  await p.evaluate(() => document.getElementById('view').scrollIntoView({block: 'center'}));
  await p.selectOption('#camSel', 'follow'); await p.waitForTimeout(1500);
  ok('camera follow (with selection)', await p.$eval('#camSel', s => s.value) === 'follow');
  await p.selectOption('#camSel', 'street'); await p.waitForTimeout(1500);
  ok('street view shows whole building', await p.getAttribute('#floors button[data-f="0"]', 'aria-pressed') === 'true');
  await p.selectOption('#camSel', 'orbit'); await p.waitForTimeout(300);
  ok('orbit on', await p.evaluate(() => __office.controls.autoRotate));
  await p.click('#camReset'); await p.waitForTimeout(1200);
  ok('camera reset', await p.$eval('#camSel', s => s.value) === 'default' && !(await p.evaluate(() => __office.controls.autoRotate)));
  // 사진·소리·시간·그림자
  const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 5000}).catch(() => null), p.click('#photoBtn')]);
  ok('photo downloads PNG', !!dl && dl.suggestedFilename().endsWith('.png'));
  await p.click('#soundBtn'); ok('sound toggles', (await p.textContent('#soundBtn')).includes('🔊'));
  await p.click('#speed'); ok('time speed', (await p.textContent('#speed')).includes('4'));
  p.once('dialog', d => d.accept()); await p.click('#shadowBtn'); await p.waitForTimeout(200);
  ok('shadow toggle', (await p.textContent('#shadowBtn')).length > 0);
  // 이벤트 버튼 (정전 해결)
  await p.evaluate(() => { __office.endEvent(__office.eventActive); __office.startEvent('blackout'); });
  ok('event toast + button', await p.isVisible('#toast button'));
  await p.click('#toast button');
  let fixed = false; for (let i = 0; i < 30 && !fixed; i++){ await p.waitForTimeout(1500); fixed = await p.evaluate(() => __office.eventActive === null); }   // 고치러 가는 친구가 다른 층이면 오래 걸려요
  ok('blackout fixed via button', fixed, fixed ? '' : await p.evaluate(() => __office.CH.map(c => `${c.id}@${c.floor}:${Math.round(c.x)},${Math.round(c.y)} p${c.path.length} r${!!c.ride} h${!!c.hidden} m${c.manual === Infinity ? 'inf' : ''} act=${c.act?.kind} cur=${c.cur}`).join(' ; ')));
  // 회의 열기 (데모 대본) → 끝까지
  await p.fill('#meetIn', '이벤트 더 재밌게'); await p.press('#meetIn', 'Enter'); await p.waitForTimeout(500);
  ok('meeting starts', await p.evaluate(() => __office.activity.current?.name === 'meeting'));
  const t0 = Date.now(); while (Date.now() - t0 < 150000 && await p.evaluate(() => __office.activity.busy)) await p.waitForTimeout(2000);
  ok('meeting finishes + unlocks', !(await p.evaluate(() => __office.activity.busy)) && (await p.textContent('#minutes')).includes('결정'), `${Math.round((Date.now() - t0) / 1000)}s`);
  ok('crew released after meeting', await p.evaluate(() => __office.CH.every(c => c.manual !== Infinity)));
  ok('no errors', errs.length === 0, JSON.stringify(errs));
  await b.close();
  rep.done();
})();
