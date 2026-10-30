// Touch Table Kit end-to-end test: two browser contexts (GM laptop + Table Display touch client).
// Usage: node tests/touch-table.test.mjs   (env: URL, FOUNDRY_TESTS=<foundry-test/tests dir>, OUT)
// Requires a running Foundry with the module enabled in the world (tests/test-module.sh does that).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const FT = process.env.FOUNDRY_TESTS || join(here, '../../foundry-test/tests');
const { chromium } = createRequire(join(FT, 'package.json'))('playwright');
const base = process.env.URL || 'http://localhost:30000';
const out = process.env.OUT || join(FT, 'out', 'touch');
mkdirSync(out, { recursive: true });
const ID = 'three-keys-touch-table-kit';
const results = []; const errors = []; const shots = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
async function join_(ctxOpts, userName, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ...ctxOpts });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`));
  await page.goto(base + '/join'); await page.waitForSelector('select[name="userId"]', { timeout: 60000 });
  const uid = await page.$eval('select[name="userId"]', (s, n) => [...s.options].find(o => o.textContent.trim() === n)?.value, userName);
  if (!uid) throw new Error(`user ${userName} missing`);
  await page.selectOption('select[name="userId"]', uid); await page.click('button[name="join"]');
  await page.waitForFunction(() => globalThis.game?.ready === true && canvas?.ready, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  // close first-login dialogs (e.g. player character picker) so the board is unobstructed
  await page.evaluate(async () => { for (const a of [...foundry.applications.instances.values()]) if (a.hasFrame && a.rendered) await a.close(); for (const w of Object.values(ui.windows)) await w.close(); });
  await page.waitForTimeout(500);
  return { ctx, page };
}
const shot = async (page, name) => { const p = join(out, `${name}.png`); await page.screenshot({ path: p }); shots.push(p); };

try {
  // ---------- GM: fixtures ----------
  const gm = await join_({}, 'Gamemaster', 'GM');
  const fx = await gm.page.evaluate(async ID => {
    let table = game.users.getName('Table') ?? await User.create({ name: 'Table', role: CONST.USER_ROLES.PLAYER });
    for (const s of game.scenes.filter(s => s.name === 'TKTT Test')) await s.delete();
    for (const a of game.actors.filter(a => a.name === 'TKTT Hero')) await a.delete();
    const type = Object.keys(game.system.documentTypes.Actor).find(t => t !== 'base');
    const actor = await Actor.create({ name: 'TKTT Hero', type, ownership: { default: 0, [table.id]: 3 }, prototypeToken: { actorLink: true } });
    const scene = await Scene.create({ name: 'TKTT Test', width: 2000, height: 1500, padding: 0, tokenVision: false,
      grid: { size: 100, type: 1 }, fog: { exploration: false }, backgroundColor: '#3a4a3a' });
    await scene.createEmbeddedDocuments('Wall', [{ c: [1000, 200, 1000, 1000] }]);
    const td = await actor.getTokenDocument({ x: 500, y: 500 });
    await scene.createEmbeddedDocuments('Token', [td.toObject()]);
    await game.settings.set(ID, 'tableUser', table.id);
    await game.settings.set(ID, 'viewSync', 'manual');
    await scene.activate();
    return { tableId: table.id, sceneId: scene.id };
  }, ID);
  // reload GM so requiresReload settings apply
  await gm.page.reload(); await gm.page.waitForFunction(() => game?.ready && canvas?.ready && canvas.scene?.name === 'TKTT Test', null, { timeout: 120000 });
  await gm.page.waitForTimeout(1500);

  // ---------- Table Display: touch client ----------
  const tb = await join_({ hasTouch: true, isMobile: false }, 'Table', 'TABLE');
  await tb.page.waitForFunction(() => canvas.scene?.name === 'TKTT Test' && canvas.tokens.placeables.length === 1, null, { timeout: 60000 });
  await tb.page.waitForTimeout(1500);
  const page = tb.page;
  // Two software-rendered WebGL clients on one box are slow; give taps headroom vs. the long-press timer.
  await page.evaluate(ID => game.settings.set(ID, 'longPressMs', 2000), ID);
  const cdp = await tb.ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
  const tap = async p => { await touch('touchStart', [p]); await sleep(60); await touch('touchEnd', []); await sleep(250); };
  const toClient = (x, y) => page.evaluate(([x, y]) => { const r = canvas.app.view.getBoundingClientRect(); const c = canvas.clientCoordinatesFromCanvas({ x, y }); return { x: c.x + r.left, y: c.y + r.top }; }, [x, y]);
  const tok = () => page.evaluate(() => { const t = canvas.tokens.placeables[0]; return { x: t.document.x, y: t.document.y, controlled: t.controlled, sheet: !!t.actor?.sheet?.rendered }; });
  const appsOpen = () => page.evaluate(() => foundry.applications.instances.size + Object.keys(ui.windows).length);

  const state = await page.evaluate(ID => ({ table: game.modules.get(ID).api.isTable, touch: !!game.modules.get(ID).api.touch }), ID);
  const gmState = await gm.page.evaluate(ID => ({ table: game.modules.get(ID).api.isTable, touch: !!game.modules.get(ID).api.touch }), ID);
  ok('Table client is Table Display with touch handlers', state.table && state.touch, JSON.stringify(state));
  ok('GM client has no touch handlers (no input competition)', !gmState.table && !gmState.touch, JSON.stringify(gmState));

  // Declutter
  const vis = (p, sel) => p.evaluate(sel => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null; }, sel);
  const tableChrome = { sidebar: await vis(page, '#sidebar'), hotbar: await vis(page, '#hotbar'), nav: await vis(page, '#scene-navigation'), players: await vis(page, '#players'), controls: await vis(page, '#scene-controls') };
  ok('Table auto-declutter hides sidebar/chat, nav, hotbar, players, controls', Object.values(tableChrome).every(v => !v), JSON.stringify(tableChrome));
  await shot(page, '01-table-initial');

  // Tap select
  if (process.env.DEBUG) { page.on('console', m => { if (m.text().startsWith('RENDER')) console.log(m.text().slice(0,1500)); }); await page.evaluate(()=>{window.__ev=[];for(const t of ['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel'])window.addEventListener(t,e=>__ev.push(t+':'+(e.pointerId??'')+':'+e.target.tagName+':'+Math.round(performance.now())),{capture:true});const s=canvas.tokens.placeables[0].actor.sheet;const o=s.render.bind(s);s.render=(...a)=>{console.log('RENDER '+new Error().stack);return o(...a)}}); }
  const apps0 = await appsOpen();
  const tc = await toClient(550, 550);
  await tap(tc);
  let t = await tok();
  ok('Tap selects own token', t.controlled);
  ok('Tap does not open a sheet', !t.sheet && (await appsOpen()) === apps0);
  // Double tap also must not open
  await tap(tc); await tap(tc); t = await tok();
  if (process.env.DEBUG) console.log(JSON.stringify(await page.evaluate(ID=>game.modules.get(ID).api.touch.log,ID)), await page.evaluate(()=>__ev.join(' ')));
  ok('Double tap does not open a sheet', !t.sheet && (await appsOpen()) === apps0);
  await shot(page, '02-tap-select');

  // Tap move (two squares right)
  await tap(await toClient(750, 550));
  await page.waitForFunction(() => { const d = canvas.tokens.placeables[0].document; return d.x === 700 && d.y === 500; }, null, { timeout: 15000 }).catch(() => {});
  await sleep(800); t = await tok();
  ok('Tap empty square moves selected token (snapped)', t.x === 700 && t.y === 500, `at ${t.x},${t.y}`);
  const gmSees = await gm.page.evaluate(() => { const d = canvas.scene.tokens.contents[0]; return [d.x, d.y]; });
  ok('Move is persisted (GM client sees it)', gmSees[0] === 700 && gmSees[1] === 500, gmSees.join(','));
  await shot(page, '03-tap-move');

  // Wall blocks
  await tap(await toClient(1250, 550)); await sleep(1500); t = await tok();
  ok('Wall blocks tap move (Foundry movement API)', t.x < 1000, `at ${t.x},${t.y}`);
  await shot(page, '04-wall-blocked');

  // Hold ruler on empty space
  const tBefore = await tok();
  const lp = await page.evaluate(ID => game.settings.get(ID, 'longPressMs'), ID);
  const r0 = await toClient(350, 1150), r1 = await toClient(850, 1150);
  await touch('touchStart', [r0]); await sleep(lp + 250);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: r0.x + (r1.x - r0.x) * i / 5, y: r0.y }]); await sleep(40); }
  await sleep(600);
  const ruler = await page.evaluate(() => ({ active: canvas.controls.ruler.active, path: canvas.controls.ruler.path.map(p => [p.x, p.y]) }));
  ok('Tap-and-hold starts ruler and follows finger', ruler.active && ruler.path.length === 2 && ruler.path[1][0] === 850, JSON.stringify(ruler.path));
  await shot(page, '05-hold-ruler');
  await touch('touchEnd', []); await sleep(1500);
  ok('Ruler clears after release', !(await page.evaluate(() => canvas.controls.ruler.active)));
  t = await tok();
  ok('Ruler gesture did not move the token', t.x === tBefore.x && t.y === tBefore.y);

  // Long-press token opens sheet
  const tp = await toClient(tBefore.x + 50, tBefore.y + 50);
  await touch('touchStart', [tp]); await sleep(lp + 300); await touch('touchEnd', []);
  await page.waitForFunction(() => canvas.tokens.placeables[0].actor?.sheet?.rendered, null, { timeout: 10000 }).catch(() => {});
  t = await tok();
  ok('Long-press on token opens the sheet', t.sheet);
  await shot(page, '06-longpress-sheet');
  await page.evaluate(() => canvas.tokens.placeables[0].actor.sheet.close()); await sleep(800);

  // Pinch zoom
  await page.evaluate(() => canvas.pan({ x: 1000, y: 750, scale: 0.5 })); await sleep(300);
  const s0 = await page.evaluate(() => canvas.stage.scale.x);
  const c = { x: 800, y: 450 };
  await touch('touchStart', [{ x: c.x - 100, y: c.y, id: 0 }, { x: c.x + 100, y: c.y, id: 1 }]);
  for (let i = 1; i <= 15; i++) { const d = 100 + 100 * i / 15; await touch('touchMove', [{ x: c.x - d, y: c.y, id: 0 }, { x: c.x + d, y: c.y, id: 1 }]); await sleep(30); }
  await sleep(150); await touch('touchEnd', []); await sleep(1200);
  const s1 = await page.evaluate(() => canvas.stage.scale.x);
  ok('Pinch zoom doubles scale (smoothed)', Math.abs(s1 / s0 - 2) < 0.15, `${s0.toFixed(3)} -> ${s1.toFixed(3)}`);
  await shot(page, '07-pinch-zoom');

  // Two-finger pan
  const p0 = await page.evaluate(() => ({ x: canvas.stage.pivot.x, y: canvas.stage.pivot.y }));
  await touch('touchStart', [{ x: 700, y: 450, id: 0 }, { x: 900, y: 450, id: 1 }]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [{ x: 700 - 20 * i, y: 450, id: 0 }, { x: 900 - 20 * i, y: 450, id: 1 }]), await sleep(30);
  await touch('touchEnd', []); await sleep(1200);
  const p1 = await page.evaluate(() => ({ x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, s: canvas.stage.scale.x }));
  const expect = 200 / p1.s;
  ok('Two-finger pan moves view by finger distance', Math.abs((p1.x - p0.x) - expect) < 10 && Math.abs(p1.y - p0.y) < 5, `dx=${(p1.x - p0.x).toFixed(1)} expected ${expect.toFixed(1)}`);

  // Deadzone: tiny jitter must not move view
  await sleep(1500);
  const q0 = await page.evaluate(() => ({ x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, s: canvas.stage.scale.x }));
  const n0 = await page.evaluate(ID => game.modules.get(ID).api.touch.log.filter(l => l.type === 'gestureStart').length, ID);
  await touch('touchStart', [{ x: 700, y: 450, id: 0 }, { x: 900, y: 450, id: 1 }]);
  for (let i = 0; i < 10; i++) await touch('touchMove', [{ x: 700 + (i % 2 ? 4 : -4), y: 450, id: 0 }, { x: 900 + (i % 2 ? -3 : 3), y: 452, id: 1 }]), await sleep(30);
  await touch('touchEnd', []); await sleep(600);
  const q1 = await page.evaluate(() => ({ x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, s: canvas.stage.scale.x }));
  const n1 = await page.evaluate(ID => game.modules.get(ID).api.touch.log.filter(l => l.type === 'gestureStart').length, ID);
  ok('Deadzone ignores two-finger jitter (no gesture armed, view unchanged)', n1 === n0 && Math.abs(q0.x - q1.x) < 0.01 && Math.abs(q0.y - q1.y) < 0.01 && q0.s === q1.s, `armed=${n1 - n0} ` + JSON.stringify([q0, q1]));

  // GM view sync
  await gm.page.evaluate(() => canvas.pan({ x: 600, y: 400, scale: 1.25 }));
  await gm.page.click('#tktt-sync-btn'); await sleep(1500);
  const synced = await page.evaluate(() => ({ x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, s: canvas.stage.scale.x }));
  ok('GM "push view" syncs table pan/zoom', Math.abs(synced.x - 600) < 2 && Math.abs(synced.y - 400) < 2 && Math.abs(synced.s - 1.25) < 0.01, JSON.stringify(synced));
  await shot(page, '08-view-synced');

  // Declutter toggle on GM (button + keybinding); table stays decluttered
  const gmSidebar0 = await vis(gm.page, '#sidebar');
  await gm.page.click('#tktt-declutter-btn'); await sleep(500);
  const gmSidebar1 = await vis(gm.page, '#sidebar'), gmHotbar1 = await vis(gm.page, '#hotbar');
  await shot(gm.page, '09-gm-decluttered');
  await gm.page.keyboard.press('Alt+KeyD'); await sleep(500);
  const gmSidebar2 = await vis(gm.page, '#sidebar');
  ok('Declutter button hides GM sidebar/hotbar; Alt+D restores', gmSidebar0 && !gmSidebar1 && !gmHotbar1 && gmSidebar2, `${gmSidebar0}/${gmSidebar1}/${gmSidebar2}`);
  ok('Table has no declutter button by default (stays locked)', !(await page.$('#tktt-declutter-btn')));
  await shot(gm.page, '10-gm-laptop');
  await shot(page, '11-table-final');
} catch (e) { errors.push(`fatal: ${e.stack || e.message}`); }

await browser.close();
const failed = results.filter(r => !r.pass).length;
writeFileSync(join(out, 'results.json'), JSON.stringify({ results, errors, shots }, null, 2));
console.log(`\n${results.length - failed}/${results.length} passed, console errors: ${errors.length}`);
if (errors.length) console.log(' - ' + errors.join('\n - '));
process.exit(failed || errors.length ? 1 : 0);
