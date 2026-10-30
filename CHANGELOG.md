# Changelog

## 1.1.0 — 2026-10-30
Renamed to **Three Keys Table Suite** (formerly Three Keys Touch Table Kit) in the module title, settings and docs. The module id `three-keys-touch-table-kit` is unchanged, so existing installs and settings carry over.

### Display presets
- New client setting **Display preset**: *TV / touch panel*, *Projector (top-down)*, *IR touch frame* or *Custom*. Choosing one writes tuned values once (touch scale, smoothing, deadzone, tap tolerance, long-press time and the new input filters); you can fine-tune afterwards.
- **Display rotation** (0°/180°) and **Display mirror** (none/horizontal/vertical) flip only the board on that client, for projectors that face the other way or bounce off a mirror. Touches are remapped so they still land on what you see. Presets never change these.
- IR frame / projector input tuning: **Accepted input** (touch only; touch and pen; touch, pen and mouse for frames that emulate a pointer), **Palm rejection size**, **Maximum contacts**, **Ghost-touch filter** (minimum tap time) and **Touch debounce**. Rejected contacts are swallowed for their whole life, so Foundry never sees half a gesture.

### Second-screen handouts
- GMs can show a journal page or an image on the Table Display only, from the **Show page on Table Display** journal sheet header control, the journal sidebar context menu (**Show on Table Display**), or `api.showHandout(pageOrUuidOrImagePath)`.
- Secret blocks, scripts and embeds are removed on the GM client **before** anything is sent, and again on the table before it is enriched with `secrets: false`. The table does not need permission on the journal.
- The handout is a full-screen card with a large close button. The GM has a floating **Clear the Table Display handout** button and `api.clearHandout()`. Handout messages from non-GM senders are ignored.

### Miniature tracking groundwork
- **Mini base rings**: on the Table Display, each player-owned token gets a ring in its owning player's color (the Table user and GMs are ignored). *All tokens* also rings unowned tokens by disposition color.
- **Mini highlight**: tapping your token makes its base glow for **Mini highlight time**. GMs can call `api.minis.ping(tokenId)` to make a token glow on the table.
- **Physical mini input (preview)**: a world setting plus `api.minis.report({ tokenId | actorId, x, y, source })` and the hooks `three-keys-touch-table-kit.preMiniInput` (return `false` to veto) and `three-keys-touch-table-kit.miniInput`, for future physical-miniature or marker trackers. In this version a report only highlights the token; nothing moves.

### Roadmap
- Physical mini reports will move the matching token through Foundry movement in a future version. This is not implemented in 1.1.0.

### Tests
- `tests/touch-table.test.mjs` now has 43 checks (19 from v1.0 and 24 new): presets, palm/ghost/debounce filters, pointer types, mirror/rotation remap, handouts (secret stripping in the DOM and in the socket payload, shown on the table only, close/clear, forged sender), and mini rings, highlight, ping and input hook. Console errors are now tagged with the step they followed.

## 1.0.0 — 2026-10-30
- First release for Foundry VTT v13–v14 (verified 14.364), system agnostic (tested with dnd5e 5.3.3).
- Table Display client mode: a chosen Table user (or a client forced into table mode) is auto-decluttered and is the only client that runs touch handlers by default.
- Native touch input (`pointerType: "touch"`): tap to select, tap an empty square to move via `TokenDocument#move` (walls and collision respected), hold on empty space for a ruler, long-press a token for its sheet or HUD. Tapping never opens a sheet.
- Smoothed two-finger pan and pinch-zoom with deadzone and smoothing settings.
- Touch target scale for scene controls, sidebar tabs and token HUD.
- Declutter mode with a floating button and `Alt+D` keybinding.
- GM view sync (manual push button, `Alt+V`, or continuous follow).
- Compatibility mode: touch handling only on the bare canvas, plus known-conflict selectors (Monk's Token Bar, Token Action HUD) and custom selectors.
