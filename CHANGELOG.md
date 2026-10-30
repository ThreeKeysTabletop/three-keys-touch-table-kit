# Changelog

## 1.0.0 — 2026-10-30
- First release for Foundry VTT v13–v14 (verified 14.364), system agnostic (tested with dnd5e 5.3.3).
- Table Display client mode: a chosen Table user (or a client forced into table mode) is auto-decluttered and is the only client that runs touch handlers by default.
- Native touch input (`pointerType: "touch"`): tap to select, tap an empty square to move via `TokenDocument#move` (walls and collision respected), hold on empty space for a ruler, long-press a token for its sheet or HUD. Tapping never opens a sheet.
- Smoothed two-finger pan and pinch-zoom with deadzone and smoothing settings.
- Touch target scale for scene controls, sidebar tabs and token HUD.
- Declutter mode with a floating button and `Alt+D` keybinding.
- GM view sync (manual push button, `Alt+V`, or continuous follow).
- Compatibility mode: touch handling only on the bare canvas, plus known-conflict selectors (Monk's Token Bar, Token Action HUD) and custom selectors.
