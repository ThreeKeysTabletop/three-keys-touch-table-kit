/**
 * Three Keys Table Suite — system-agnostic touchscreen table support for Foundry VTT v13/v14.
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
  // v1.1 display presets & input tuning (client)
  reg("displayPreset", { scope: "client", config: true, type: String, default: "custom", onChange: v => TKTT.applyPreset(v),
    choices: { custom: S("displayPreset.Custom"), tv: S("displayPreset.Tv"), projector: S("displayPreset.Projector"), irFrame: S("displayPreset.IrFrame") } });
  reg("displayRotation", { scope: "client", config: true, type: String, default: "0", onChange: () => TKTT.applyChrome(),
    choices: { "0": S("displayRotation.R0"), "180": S("displayRotation.R180") } });
  reg("displayMirror", { scope: "client", config: true, type: String, default: "none", onChange: () => TKTT.applyChrome(),
    choices: { none: S("displayMirror.None"), horizontal: S("displayMirror.Horizontal"), vertical: S("displayMirror.Vertical") } });
  reg("pointerTypes", { scope: "client", config: true, type: String, default: "touch",
    choices: { touch: S("pointerTypes.Touch"), touchPen: S("pointerTypes.TouchPen"), all: S("pointerTypes.All") } });
  reg("palmSize", { scope: "client", config: true, type: Number, default: 0, range: { min: 0, max: 200, step: 5 } });
  reg("maxContacts", { scope: "client", config: true, type: Number, default: 2, range: { min: 2, max: 10, step: 1 } });
  reg("minTapMs", { scope: "client", config: true, type: Number, default: 0, range: { min: 0, max: 300, step: 10 } });
  reg("debounceMs", { scope: "client", config: true, type: Number, default: 0, range: { min: 0, max: 500, step: 10 } });
  // v1.1 miniature tracking groundwork (world)
  reg("miniRings", { scope: "world", config: true, type: String, default: "owned", onChange: () => TKTT.minis.refreshAll(),
    choices: { off: S("miniRings.Off"), owned: S("miniRings.Owned"), all: S("miniRings.All") } });
  reg("miniHighlightMs", { scope: "world", config: true, type: Number, default: 2500, range: { min: 0, max: 10000, step: 250 } });
  reg("miniInput", { scope: "world", config: true, type: String, default: "off",
    choices: { off: S("miniInput.Off"), highlight: S("miniInput.Highlight") } });

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
  rejected = new Set();     // pointerIds of contacts ignored by palm/contact/debounce filters
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
    if (!this.accepts(e.pointerType)) return;
    this.lastTouch = Date.now();
    if (e.type === "pointerdown" && (!canvas?.ready || this.isConflict(e.target))) return;
    if (e.type === "pointerdown" && this.reject(e)) { this.rejected.add(e.pointerId); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (this.rejected.has(e.pointerId)) { // swallow the whole life of a rejected contact so Foundry never sees half of it
      if (e.type === "pointerup" || e.type === "pointercancel") this.rejected.delete(e.pointerId);
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if (e.type !== "pointerdown" && !this.pointers.has(e.pointerId)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    this[`_${e.type}`](e);
  }

  /** Which pointer types count as fingers. IR frames often report as pen or as an emulated mouse. */
  accepts(type) {
    const m = get("pointerTypes");
    return type === "touch" || (m === "touchPen" && type === "pen") || (m === "all" && (type === "pen" || type === "mouse"));
  }

  /** Palm, extra-contact and bounce rejection. Returns true (and logs) when a new contact is ignored. */
  reject(e) {
    const palm = get("palmSize");
    let reason = null;
    if (palm > 0 && Math.max(e.width || 0, e.height || 0) >= palm) reason = "palm";
    else if (this.pointers.size >= get("maxContacts")) reason = "contacts";
    else {
      const db = get("debounceMs"), last = this.lastUp;
      if (db > 0 && last && this.pointers.size === 0 && e.timeStamp - last.t < db
        && Math.hypot(e.clientX - last.x, e.clientY - last.y) < get("tapTolerance") * 2) reason = "debounce";
    }
    if (!reason) return false;
    this.record("rejected", { reason });
    if (reason === "palm") this._cancelAll();
    return true;
  }

  _cancelAll() {
    clearTimeout(this.timer);
    if (this.mode === "ruler") canvas.controls.ruler.reset();
    if (this.mode === "gesture") this._endGesture();
    this.pointers.clear(); this.mode = null;
  }

  /** Map a client point through the display's mirror/rotation so touches land where the image is. */
  map(e) {
    const { fx, fy } = TKTT.flip;
    if (!fx && !fy) return { x: e.clientX, y: e.clientY };
    const r = canvas.app.view.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return { x: fx ? 2 * cx - e.clientX : e.clientX, y: fy ? 2 * cy - e.clientY : e.clientY };
  }

  _pointerdown(e) {
    const m = this.map(e);
    this.pointers.set(e.pointerId, { x: m.x, y: m.y, sx: m.x, sy: m.y, t: performance.now(), ts: e.timeStamp });
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
    const p = this.pointers.get(e.pointerId); const m = this.map(e); p.x = m.x; p.y = m.y;
    if (this.mode === "tap" && Math.hypot(p.x - p.sx, p.y - p.sy) > get("tapTolerance")) { clearTimeout(this.timer); this.mode = "done"; }
    else if (this.mode === "ruler") this._updateRuler(p);
    else if (this.mode === "gesture") this._updateGesture();
  }

  _pointerup(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    clearTimeout(this.timer);
    this.lastUp = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    if (this.mode === "tap" && e.type === "pointerup" && this.pointers.size === 0) {
      const minTap = get("minTapMs");
      // Event timestamps measure the real contact time, independent of main-thread lag.
      if (minTap > 0 && (e.timeStamp - p.ts) < minTap) this.record("rejected", { reason: "ghost" });
      else this._onTap(p);
    }
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
      TKTT.minis.highlight(token);
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

/** Values each display preset writes. Rotation and mirror are physical setup and are never changed by a preset. */
const PRESETS = {
  tv:        { uiScale: 1.4, panSmoothing: 0.4, deadzone: 10, tapTolerance: 14, longPressMs: 600, pointerTypes: "touch", palmSize: 0, maxContacts: 2, minTapMs: 0, debounceMs: 0 },
  projector: { uiScale: 1.7, panSmoothing: 0.5, deadzone: 14, tapTolerance: 20, longPressMs: 700, pointerTypes: "all", palmSize: 0, maxContacts: 2, minTapMs: 0, debounceMs: 80 },
  irFrame:   { uiScale: 1.6, panSmoothing: 0.7, deadzone: 20, tapTolerance: 24, longPressMs: 800, pointerTypes: "all", palmSize: 60, maxContacts: 2, minTapMs: 40, debounceMs: 120 }
};

/** Remove everything a GM may hide from players before HTML leaves the GM client. */
function stripSecrets(html) {
  const doc = new DOMParser().parseFromString(`<div>${html ?? ""}</div>`, "text/html");
  doc.querySelectorAll("section.secret, .secret, [data-visibility='gm'], script, iframe, object, embed").forEach(n => n.remove());
  return doc.body.firstElementChild.innerHTML;
}

/* ------------------------------------------------------------------ */
/*  Miniature tracking groundwork                                     */
/* ------------------------------------------------------------------ */

const minis = {
  /** The non-GM, non-Table user who owns this token's actor; their color marks the base. */
  ownerOf(token) {
    const doc = token.actor ?? token.document; const table = get("tableUser");
    return game.users.find(u => !u.isGM && u.id !== table && doc?.testUserPermission?.(u, "OWNER")) ?? null;
  },
  colorOf(token) {
    const u = this.ownerOf(token);
    if (u) return Number(u.color);
    if (get("miniRings") !== "all") return null;
    const D = CONST.TOKEN_DISPOSITIONS, d = token.document.disposition;
    return d === D.FRIENDLY ? 0x43dfdf : d === D.HOSTILE ? 0xe72124 : d === D.NEUTRAL ? 0xf1d836 : 0x9b9b9b;
  },
  get active() { return TKTT.isTable && get("miniRings") !== "off"; },
  draw(token) {
    if (!token?.document || token.destroyed) return;
    let g = token.tkttRing;
    const color = this.active ? this.colorOf(token) : null;
    const lit = TKTT.isTable && token.tkttHighlightUntil > Date.now();
    if (color === null && !lit) { if (g && !g.destroyed) { g.destroy(); token.tkttRing = null; } return; }
    if (!g || g.destroyed) { g = token.tkttRing = new PIXI.Graphics(); g.eventMode = "none"; token.addChildAt(g, 0); }
    const w = token.w, h = token.h, lw = Math.max(4, canvas.grid.size * 0.06);
    g.clear();
    if (lit) g.beginFill(0xffffff, 0.25).lineStyle(lw * 2.2, 0xffffff, 0.95).drawEllipse(w / 2, h / 2, w / 2 + lw * 2, h / 2 + lw * 2).endFill();
    if (color !== null) g.lineStyle(lw, color, 1).drawEllipse(w / 2, h / 2, w / 2 + lw / 2, h / 2 + lw / 2);
    g.tkttColor = color; g.tkttLit = lit;
  },
  refreshAll() { if (canvas?.ready) for (const t of canvas.tokens.placeables) this.draw(t); },
  /** Flash a bright base under a token on the Table Display so players can find their mini. */
  highlight(token, ms = get("miniHighlightMs")) {
    if (!token || !TKTT.isTable || ms <= 0) return;
    token.tkttHighlightUntil = Date.now() + ms; this.draw(token);
    clearTimeout(token.tkttHighlightTimer);
    token.tkttHighlightTimer = setTimeout(() => this.draw(token), ms + 20);
  },
  /** GM: highlight a token on the Table Display. */
  ping(tokenId) {
    if (!game.user.isGM) return;
    game.socket.emit(SOCKET, { type: "miniPing", from: game.user.id, sceneId: canvas.scene?.id, tokenId });
  },
  /**
   * Groundwork for physical-mini / fiducial-marker input. A tracker module reports a detection; with the
   * Mini input setting on "Highlight" we flash that token's base. Nothing moves yet; other modules can
   * listen to the `three-keys-touch-table-kit.miniInput` hook (return false from preMiniInput to veto).
   * @param {{tokenId?: string, actorId?: string, x?: number, y?: number, source?: string}} report
   */
  report(report = {}) {
    if (get("miniInput") === "off" || !canvas?.ready) return null;
    if (Hooks.call(`${ID}.preMiniInput`, report) === false) return null;
    const token = report.tokenId ? canvas.tokens.get(report.tokenId) : canvas.tokens.placeables.find(t => t.actor?.id === report.actorId);
    Hooks.callAll(`${ID}.miniInput`, report, token ?? null);
    if (token) this.highlight(token);
    return token ?? null;
  }
};

const TKTT = {
  touch: null,
  minis,
  PRESETS,
  get flip() {
    if (!this.isTable && get("touchMode") !== "on") return { fx: false, fy: false };
    const r = get("displayRotation") === "180", m = get("displayMirror");
    return { fx: r !== (m === "horizontal"), fy: r !== (m === "vertical") };
  },

  async applyPreset(name) {
    const values = PRESETS[name]; if (!values) return;
    for (const [k, v] of Object.entries(values)) if (get(k) !== v) await game.settings.set(ID, k, v);
    ui.notifications?.info(game.i18n.format("TKTT.Notify.Preset", { name: game.i18n.localize(S(`displayPreset.${name[0].toUpperCase()}${name.slice(1)}`)) }));
  },

  /* ---------- second-screen handouts ---------- */
  /** GM: build a secret-free payload from a JournalEntryPage (or its uuid) or an image path. */
  async _handoutPayload(what) {
    if (typeof what === "string" && !what.includes(".JournalEntryPage.") && !what.startsWith("JournalEntry.")) return { kind: "image", src: what, title: "" };
    let doc = typeof what === "string" ? await fromUuid(what) : what;
    if (doc?.documentName === "JournalEntry") doc = doc.pages.contents.sort((a, b) => a.sort - b.sort)[0];
    if (doc?.documentName !== "JournalEntryPage") return null;
    const title = doc.title?.show === false ? "" : doc.name;
    if (doc.type === "image") return { kind: "image", src: doc.src, title, caption: doc.image?.caption ?? "" };
    if (doc.type === "text") return { kind: "text", html: stripSecrets(doc.text?.content), title };
    return null;
  },
  async showHandout(what) {
    if (!game.user.isGM) return false;
    if (!get("tableUser")) ui.notifications.warn(L("Notify.NoTable"));
    const payload = await this._handoutPayload(what);
    if (!payload) { ui.notifications.warn(L("Notify.HandoutUnsupported")); return false; }
    game.socket.emit(SOCKET, { type: "handout", from: game.user.id, payload });
    ui.notifications.info(L("Notify.HandoutSent"));
    return true;
  },
  clearHandout() {
    if (!game.user.isGM) return;
    game.socket.emit(SOCKET, { type: "handoutClear", from: game.user.id });
  },
  async _renderHandout(payload) {
    this._lastHandout = payload;
    document.getElementById("tktt-handout")?.remove();
    const wrap = document.createElement("div"); wrap.id = "tktt-handout"; wrap.className = `tktt-handout ${payload.kind}`;
    const card = document.createElement("div"); card.className = "tktt-handout-card";
    if (payload.title) { const h = document.createElement("h2"); h.textContent = payload.title; card.append(h); }
    if (payload.kind === "image") {
      const img = document.createElement("img"); img.src = payload.src; img.alt = payload.caption || payload.title || ""; card.append(img);
      if (payload.caption) { const c = document.createElement("p"); c.className = "caption"; c.textContent = payload.caption; card.append(c); }
    } else {
      const body = document.createElement("div"); body.className = "tktt-handout-body";
      body.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(stripSecrets(payload.html), { secrets: false });
      card.append(body);
    }
    const close = document.createElement("button"); close.type = "button"; close.className = "tktt-handout-close";
    close.setAttribute("aria-label", L("Button.CloseHandout")); close.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
    close.addEventListener("click", ev => { ev.preventDefault(); wrap.remove(); });
    wrap.append(card, close);
    document.body.append(wrap);
    Hooks.callAll(`${ID}.handout`, payload);
  },
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
    if (!TKTT.isTable || !msg?.type) return;
    const fromGM = !!game.users.get(msg.from)?.isGM;
    if (msg.type === "view" && canvas.ready && canvas.scene?.id === msg.sceneId) canvas.animatePan({ x: msg.x, y: msg.y, scale: msg.scale, duration: 300 });
    else if (msg.type === "handout" && fromGM && msg.payload) TKTT._renderHandout(msg.payload);
    else if (msg.type === "handoutClear" && fromGM) document.getElementById("tktt-handout")?.remove();
    else if (msg.type === "miniPing" && fromGM && canvas.ready && canvas.scene?.id === msg.sceneId) minis.highlight(canvas.tokens.get(msg.tokenId));
  },

  applyChrome() {
    const body = document.body;
    const table = this.isTable;
    body.classList.toggle("tktt-table", table);
    body.classList.toggle("tktt-declutter", table ? !(get("tableAllowUndeclutter") && this._tableRevealed) : get("declutter"));
    document.documentElement.style.setProperty("--tktt-scale", String(get("uiScale")));
    body.classList.toggle("tktt-scaled", get("uiScale") !== 1);
    const { fx, fy } = this.flip;
    const board = document.getElementById("board");
    if (board) board.style.transform = fx || fy ? `scale(${fx ? -1 : 1}, ${fy ? -1 : 1})` : "";
    body.classList.toggle("tktt-flipped", fx || fy);
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
    if (game.user?.isGM && get("tableUser")) mk("tktt-handout-clear-btn", "fa-rectangle-xmark", L("Button.ClearHandout"), () => this.clearHandout());
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
Hooks.on("refreshToken", token => { if (minis.active || token.tkttRing) minis.draw(token); });
Hooks.on("destroyToken", token => clearTimeout(token.tkttHighlightTimer));
Hooks.on("canvasReady", () => minis.refreshAll());
Hooks.on("updateUser", (u, ch) => { if ("color" in ch) minis.refreshAll(); });
Hooks.on("updateActor", (a, ch) => { if ("ownership" in ch) minis.refreshAll(); });

/* GM entry points for handouts: journal sheet header, journal directory, token HUD-free ping via API. */
Hooks.on("getHeaderControlsJournalEntrySheet", (app, controls) => {
  if (!game.user.isGM) return;
  controls.push({ icon: "fa-solid fa-display", label: "TKTT.Handout.ShowPage", action: "tkttShowOnTable",
    onClick: () => TKTT.showHandout(app.document.pages.get(app.pageId) ?? app.document) });
});
Hooks.on("getJournalEntryContextOptions", (app, options) => {
  options.push({ label: "TKTT.Handout.ShowEntry", icon: '<i class="fa-solid fa-display"></i>', visible: () => game.user.isGM, condition: () => game.user.isGM,
    callback: li => TKTT.showHandout(game.journal.get(li.closest("[data-entry-id]")?.dataset.entryId)) });
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
