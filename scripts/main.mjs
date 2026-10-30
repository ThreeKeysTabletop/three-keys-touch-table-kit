/**
 * Three Keys Touch Table Kit — system-agnostic touchscreen table support for Foundry VTT v13/v14.
 * (c) Three Keys Tabletop, MIT License.
 */
const ID = "three-keys-touch-table-kit";
const SOCKET = `module.${ID}`;
const L = k => game.i18n.localize(`TKTT.${k}`);
const S = k => `TKTT.Settings.${k}`;
const get = k => game.settings.get(ID, k);

/** Elements of known conflicting modules where we never handle touches. */
const KNOWN_CONFLICTS = [
  "#tokenbar", ".tokenbar", "#monks-tokenbar", ".monks-tokenbar", "[id^='tokenbar']", // Monk's Token Bar
  "#token-action-hud", "#token-action-hud-app",                                     // Token Action HUD
  ".app", ".application", "#token-hud", "#context-menu", "#tooltip"                  // any DOM UI over the board
];

/* ------------------------------------------------------------------ */
/*  Settings & keybindings                                            */
/* ------------------------------------------------------------------ */

const tableUserChoices = { "": S("tableUser.None") };

function registerSettings() {
  const reg = (key, data) => game.settings.register(ID, key, { name: S(`${key}.Name`), hint: S(`${key}.Hint`), ...data });
  // World
  reg("tableUser", { scope: "world", config: true, type: String, default: "", choices: tableUserChoices, requiresReload: true });
  reg("tableAllowUndeclutter", { scope: "world", config: true, type: Boolean, default: false, onChange: () => TKTT.applyChrome() });
  reg("viewSync", { scope: "world", config: true, type: String, default: "manual", onChange: () => TKTT.applyChrome(),
    choices: { off: S("viewSync.Off"), manual: S("viewSync.Manual"), follow: S("viewSync.Follow") } });
  reg("compatMode", { scope: "world", config: true, type: Boolean, default: true });
  reg("conflictSelectors", { scope: "world", config: true, type: String, default: "" });
  // Client
  reg("touchMode", { scope: "client", config: true, type: String, default: "auto", requiresReload: true,
    choices: { auto: S("touchMode.Auto"), on: S("touchMode.On"), off: S("touchMode.Off") } });
  reg("tableDisplay", { scope: "client", config: true, type: Boolean, default: false, requiresReload: true });
  reg("uiScale", { scope: "client", config: true, type: Number, default: 1.4, range: { min: 1, max: 2.5, step: 0.1 }, onChange: () => TKTT.applyChrome() });
  reg("panSmoothing", { scope: "client", config: true, type: Number, default: 0.5, range: { min: 0, max: 0.9, step: 0.05 } });
  reg("deadzone", { scope: "client", config: true, type: Number, default: 12, range: { min: 0, max: 60, step: 1 } });
  reg("tapTolerance", { scope: "client", config: true, type: Number, default: 14, range: { min: 4, max: 50, step: 1 } });
  reg("longPressMs", { scope: "client", config: true, type: Number, default: 600, range: { min: 300, max: 2000, step: 50 } });
  reg("longPressAction", { scope: "client", config: true, type: String, default: "sheet",
    choices: { sheet: S("longPressAction.Sheet"), hud: S("longPressAction.Hud"), none: S("longPressAction.None") } });
  reg("showButton", { scope: "client", config: true, type: Boolean, default: true, onChange: () => TKTT.applyChrome() });
  reg("declutter", { scope: "client", config: false, type: Boolean, default: false, onChange: () => TKTT.applyChrome() });

  game.keybindings.register(ID, "declutter", { name: "TKTT.Keys.Declutter", editable: [{ key: "KeyD", modifiers: ["Alt"] }],
    onDown: () => { TKTT.toggleDeclutter(); return true; } });
  game.keybindings.register(ID, "syncView", { name: "TKTT.Keys.SyncView", restricted: true, editable: [{ key: "KeyV", modifiers: ["Alt"] }],
    onDown: () => { TKTT.pushView(true); return true; } });
}

/* ------------------------------------------------------------------ */
/*  Touch controller                                                  */
/* ------------------------------------------------------------------ */

class TouchController {
  pointers = new Map();     // pointerId -> {x, y, sx, sy, t}
  mode = null;              // null | "tap" | "ruler" | "gesture" | "done"
  timer = null;
  gesture = null;
  lastTouch = 0;
  log = [];                 // last actions, for tests & debugging

  attach() {
    for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) window.addEventListener(t, this, { capture: true, passive: false });
    window.addEventListener("contextmenu", this, { capture: true });
    // PIXI handles touch through legacy touch events; keep those away from the canvas while we own the touch.
    for (const t of ["touchstart", "touchmove", "touchend", "touchcancel"]) window.addEventListener(t, this, { capture: true, passive: false });
  }

  record(type, data = {}) { this.log.push({ type, ...data, t: Date.now() }); if (this.log.length > 50) this.log.shift(); Hooks.callAll(`${ID}.action`, type, data); }

  isConflict(target) {
    if (!(target instanceof Element)) return true;
    if (target !== canvas?.app?.view) return true; // only ever handle touches that land on the board itself
    if (!get("compatMode")) return false;
    const extra = get("conflictSelectors").split(",").map(s => s.trim()).filter(Boolean);
    return [...KNOWN_CONFLICTS, ...extra].some(sel => { try { return !!target.closest(sel); } catch { return false; } });
  }

  enabled = false;

  handleEvent(e) {
    if (!this.enabled) return;
    if (e.type === "contextmenu") { if (Date.now() - this.lastTouch < 1500) { e.preventDefault(); e.stopPropagation(); } return; }
    if (e.type.startsWith("touch")) {
      if (e.target === canvas?.app?.view && !this.isConflict(e.target)) { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); }
      return;
    }
    if (e.pointerType !== "touch") return;
    this.lastTouch = Date.now();
    if (e.type === "pointerdown" && (!canvas?.ready || this.isConflict(e.target))) return;
    if (e.type !== "pointerdown" && !this.pointers.has(e.pointerId)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    this[`_${e.type}`](e);
  }

  _pointerdown(e) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    clearTimeout(this.timer);
    if (this.pointers.size === 1) {
      this.mode = "tap";
      this.timer = setTimeout(() => this._onLongPress(), get("longPressMs"));
    } else if (this.pointers.size === 2) {
      if (this.mode === "ruler") canvas.controls.ruler.reset();
      this._startGesture();
    }
  }

  _pointermove(e) {
    const p = this.pointers.get(e.pointerId); p.x = e.clientX; p.y = e.clientY;
    if (this.mode === "tap" && Math.hypot(p.x - p.sx, p.y - p.sy) > get("tapTolerance")) { clearTimeout(this.timer); this.mode = "done"; }
    else if (this.mode === "ruler") this._updateRuler(p);
    else if (this.mode === "gesture") this._updateGesture();
  }

  _pointerup(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    clearTimeout(this.timer);
    if (this.mode === "tap" && e.type === "pointerup" && this.pointers.size === 0) this._onTap(p);
    if (this.mode === "ruler" && this.pointers.size === 0) { setTimeout(() => canvas.controls.ruler.reset(), 1200); this.record("rulerEnd"); }
    if (this.mode === "gesture" && this.pointers.size < 2) this._endGesture();
    if (this.pointers.size === 0) this.mode = null;
  }
  _pointercancel(e) { this._pointerup(e); }

  world(p) { return canvas.canvasCoordinatesFromClient({ x: p.x, y: p.y }); }

  tokenAt(pt) {
    const hits = canvas.tokens.placeables.filter(t => t.visible && t.renderable !== false && t.bounds.contains(pt.x, pt.y));
    hits.sort((a, b) => (b.isOwner - a.isOwner) || (b.controlled - a.controlled) || ((b.document.sort ?? 0) - (a.document.sort ?? 0)));
    return hits[0] ?? null;
  }

  /* ---------- tap select / tap move ---------- */
  async _onTap(p) {
    const pt = this.world(p);
    const token = this.tokenAt(pt);
    if (token) {
      if (!token.isOwner) return this.record("tapForeign", { token: token.id });
      if (canvas.activeLayer !== canvas.tokens) canvas.tokens.activate();
      token.control({ releaseOthers: true });
      return this.record("select", { token: token.id }); // never opens a sheet
    }
    const mover = canvas.tokens.controlled.find(t => t.isOwner);
    if (!mover) return this.record("tapEmpty");
    const dest = mover.getSnappedPosition({ x: pt.x - mover.w / 2, y: pt.y - mover.h / 2 });
    this.record("moveStart", { token: mover.id, x: dest.x, y: dest.y });
    let ok = false;
    try { ok = await mover.document.move({ x: dest.x, y: dest.y }); } catch (err) { console.warn(`${ID} | move failed`, err); }
    const doc = mover.document;
    const at = () => doc.x === dest.x && doc.y === dest.y;
    for (let i = 0; ok && !at() && i < 40; i++) await new Promise(r => setTimeout(r, 75)); // wait for the server round-trip
    const arrived = !!ok && at();
    if (!arrived) ui.notifications.info(L("Notify.MoveBlocked"));
    this.record("move", { token: mover.id, ok: !!ok, arrived, x: doc.x, y: doc.y });
  }

  /* ---------- long press ---------- */
  _onLongPress() {
    if (this.mode !== "tap" || this.pointers.size !== 1) return;
    const p = [...this.pointers.values()][0];
    const pt = this.world(p);
    const token = this.tokenAt(pt);
    if (token) {
      this.mode = "done";
      const action = get("longPressAction");
      if (!token.isOwner || action === "none") return;
      if (action === "sheet" && token.actor?.testUserPermission(game.user, "OBSERVER")) token.actor.sheet.render(true);
      else if (action === "hud") { token.control({ releaseOthers: true }); canvas.tokens.hud.bind(token); }
      return this.record("longPress", { token: token.id, action });
    }
    this.mode = "ruler";
    const origin = canvas.grid.getCenterPoint ? canvas.grid.getCenterPoint(pt) : pt;
    this.rulerOrigin = { x: origin.x, y: origin.y, elevation: 0 };
    canvas.controls.ruler.path = [this.rulerOrigin, { ...this.rulerOrigin }];
    this.record("rulerStart", { x: origin.x, y: origin.y });
  }
  _updateRuler(p) {
    const pt = this.world(p);
    const dest = canvas.grid.getCenterPoint ? canvas.grid.getCenterPoint(pt) : pt;
    canvas.controls.ruler.path = [this.rulerOrigin, { x: dest.x, y: dest.y, elevation: 0 }];
  }

  /* ---------- smoothed two-finger pan / pinch ---------- */
  _pair() { const [a, b] = [...this.pointers.values()]; return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }; }

  _startGesture() {
    this.mode = "gesture";
    const g = this._pair();
    const rect = canvas.app.view.getBoundingClientRect();
    const stage = canvas.stage;
    this.gesture = { start: g, raw: g, smooth: { ...g }, armed: false, rect,
      s0: stage.scale.x, anchor: this.world({ x: g.cx, y: g.cy }) };
    if (!this.raf) this.raf = requestAnimationFrame(() => this._frame());
  }
  _updateGesture() {
    const g = this.gesture; if (!g) return;
    g.raw = this._pair();
    if (!g.armed) {
      const dz = get("deadzone");
      if (Math.hypot(g.raw.cx - g.start.cx, g.raw.cy - g.start.cy) < dz && Math.abs(g.raw.d - g.start.d) < dz) return;
      g.armed = true; this.record("gestureStart");
    }
    g.target = g.raw;
  }
  _endGesture() { if (this.gesture) this.gesture.ending = true; this.mode = "done"; this.record("gestureEnd", { scale: canvas.stage.scale.x }); }
  _frame() {
    this.raf = null;
    const g = this.gesture; if (!g) return;
    if (g.target) {
      const k = 1 - get("panSmoothing");
      const s = g.smooth, t = g.target;
      s.cx += (t.cx - s.cx) * k; s.cy += (t.cy - s.cy) * k; s.d += (t.d - s.d) * k;
      const settled = Math.abs(t.cx - s.cx) < 0.5 && Math.abs(t.cy - s.cy) < 0.5 && Math.abs(t.d - s.d) < 0.5;
      if (g.ending && settled) Object.assign(s, t); // land exactly on the finger target
      const scale = g.s0 * (s.d / g.start.d);
      const sx = s.cx - g.rect.left - g.rect.width / 2, sy = s.cy - g.rect.top - g.rect.height / 2;
      canvas.pan({ x: g.anchor.x - sx / scale, y: g.anchor.y - sy / scale, scale });
      if (g.ending && settled) { this.gesture = null; return; }
    } else if (g.ending) { this.gesture = null; return; }
    this.raf = requestAnimationFrame(() => this._frame());
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

const TKTT = {
  touch: null,
  get isTable() { return !!game.user && (get("tableDisplay") || (get("tableUser") !== "" && get("tableUser") === game.user.id)); },
  get touchEnabled() { const m = get("touchMode"); return m === "on" || (m === "auto" && this.isTable); },

  toggleDeclutter(force) {
    if (this.isTable && !get("tableAllowUndeclutter")) return this.applyChrome();
    return game.settings.set(ID, "declutter", force ?? !get("declutter"));
  },

  pushView(notify = false) {
    if (!game.user.isGM || get("viewSync") === "off" || !canvas.ready) return;
    if (!get("tableUser") && notify) ui.notifications.warn(L("Notify.NoTable"));
    const { x, y } = canvas.stage.pivot;
    game.socket.emit(SOCKET, { type: "view", sceneId: canvas.scene.id, x, y, scale: canvas.stage.scale.x });
    if (notify) ui.notifications.info(L("Notify.Synced"));
  },

  _onSocket(msg) {
    if (msg?.type !== "view" || !TKTT.isTable || !canvas.ready || canvas.scene?.id !== msg.sceneId) return;
    canvas.animatePan({ x: msg.x, y: msg.y, scale: msg.scale, duration: 300 });
  },

  applyChrome() {
    const body = document.body;
    const table = this.isTable;
    body.classList.toggle("tktt-table", table);
    body.classList.toggle("tktt-declutter", table ? !(get("tableAllowUndeclutter") && this._tableRevealed) : get("declutter"));
    document.documentElement.style.setProperty("--tktt-scale", String(get("uiScale")));
    body.classList.toggle("tktt-scaled", get("uiScale") !== 1);
    this._renderButtons();
  },

  _renderButtons() {
    let wrap = document.getElementById("tktt-buttons");
    if (!wrap) { wrap = document.createElement("div"); wrap.id = "tktt-buttons"; document.body.append(wrap); }
    wrap.replaceChildren();
    const mk = (id, icon, label, fn) => {
      const b = document.createElement("button"); b.type = "button"; b.id = id; b.className = "tktt-fab";
      b.dataset.tooltip = label; b.setAttribute("aria-label", label); b.innerHTML = `<i class="fa-solid ${icon}"></i>`;
      b.addEventListener("click", ev => { ev.preventDefault(); fn(); }); wrap.append(b);
    };
    const tableLocked = this.isTable && !get("tableAllowUndeclutter");
    if (get("showButton") && !tableLocked) mk("tktt-declutter-btn", "fa-eye-slash", L("Button.Declutter"), () => {
      if (this.isTable) { this._tableRevealed = !this._tableRevealed; this.applyChrome(); } else this.toggleDeclutter();
    });
    if (game.user?.isGM && get("viewSync") !== "off" && get("tableUser")) mk("tktt-sync-btn", "fa-display", L("Button.Sync"), () => this.pushView(true));
  }
};

/* ------------------------------------------------------------------ */
/*  Hooks                                                             */
/* ------------------------------------------------------------------ */

Hooks.once("init", () => {
  registerSettings();
  // Listeners must be registered before the canvas/PIXI registers its window capture listeners, so attach now and
  // enable later once we know whether this client is the Table Display.
  TKTT._controller = new TouchController();
  TKTT._controller.attach();
});

Hooks.once("ready", () => {
  for (const u of game.users) if (!u.isGM) tableUserChoices[u.id] = u.name;
  TKTT._tableRevealed = false;
  TKTT.applyChrome();
  game.socket.on(SOCKET, TKTT._onSocket);
  if (TKTT.touchEnabled) {
    TKTT.touch = TKTT._controller; TKTT.touch.enabled = true;
    document.body.classList.add("tktt-touch");
  }
  if (TKTT.isTable && game.user.isGM) console.warn(`${ID} | The Table Display is logged in as a GM; GM-only info may be visible. Use a player account.`);
  if (game.modules.get("monks-common-display")?.active) console.info(`${ID} | Monk's Common Display is active; set our View Sync to Off if it already drives the table.`);
  const mod = game.modules.get(ID); mod.api = TKTT;
  console.info(`${ID} | ready (table=${TKTT.isTable}, touch=${TKTT.touchEnabled})`);
});

let followTimer = null;
Hooks.on("canvasPan", () => {
  if (!game.user?.isGM || get("viewSync") !== "follow" || followTimer) return;
  followTimer = setTimeout(() => { followTimer = null; TKTT.pushView(false); }, 150);
});
Hooks.on("canvasReady", () => { if (game.user?.isGM && get("viewSync") === "follow") TKTT.pushView(false); });

/* Tapping a token never opens its sheet: block the double-click sheet path on touch clients. */
Hooks.once("setup", () => {
  const Token = foundry.canvas.placeables.Token;
  const orig = Token.prototype._onClickLeft2;
  Token.prototype._onClickLeft2 = function (event) {
    if (TKTT.touch && (event?.pointerType === "touch" || event?.nativeEvent?.pointerType === "touch")) return;
    return orig.call(this, event);
  };
});
