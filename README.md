# Three Keys Table Suite

> Formerly *Three Keys Touch Table Kit*. The module id stays `three-keys-touch-table-kit`, so existing installs, settings and macros keep working.

*By Three Keys Tabletop · Foundry VTT v13–v14 · system agnostic · MIT*

Make a touchscreen lying on the table a first-class Foundry client. The GM runs the game from a laptop; the players see and touch a clean **Table Display** with no GM information, no sidebar, chat or hotbar, and with touch controls built for fingers.

## Features
- **Table Display mode.** Pick the Table user in the world settings. That client is auto-decluttered: it hides the sidebar, chat, navigation, hotbar, players list and scene controls, and it is the only client that handles touch.
- **Touch that does not depend on the mouse.** The module reads raw `pointerType: "touch"` pointer events, so the GM's mouse on the laptop never fights the table.
- **Tap to select, tap to move.** Tap your token to select it, then tap an empty square to move it there. Movement goes through Foundry's own `TokenDocument#move`, so walls, collision and movement history work as usual. A tap never opens a sheet.
- **Long-press.** Hold on a token to open its sheet or token HUD (configurable). Hold on empty space to measure with the ruler, then drag your finger to extend it.
- **Smooth two-finger pan and pinch-zoom.** A deadzone and a smoothing setting tame jitter on cheap infrared frames.
- **Large touch targets.** A scale setting enlarges scene controls, sidebar tabs and token HUD buttons.
- **Declutter on any client.** A floating button or `Alt+D` toggles it.
- **GM view sync.** Push your view to the table with the floating display button or `Alt+V`, or set it to follow your view continuously.
- **Display presets (v1.1).** One-click tuning for a *TV / touch panel*, a *top-down projector* or an *IR touch frame*, plus board **rotation (180°)** and **mirror** for projectors, with touches remapped to match.
- **IR frame input tuning (v1.1).** Accept pen or emulated-mouse input from touch-to-pointer frames, and reject palms, extra contacts, ghost touches and double-trigger bounces.
- **Second-screen handouts (v1.1).** Show a journal page or an image on the Table Display only. GM secrets are removed before anything leaves the GM laptop.
- **Mini base rings (v1.1).** Each player's tokens get a ring in that player's color on the table, and a token's base glows when you tap it, so everyone can find their mini. There is also a preview hook for future physical-mini or marker trackers.
- **Compatibility mode.** Only touches that land directly on the canvas are handled. Elements from known conflicting modules (Monk's Token Bar, Token Action HUD) and any selectors you add are always left alone.

## Recommended setup: GM laptop and table touchscreen
1. **Create a Table user.** Go to Configure Players, add a user named `Table` with the **Player** role (never Assistant GM or GM), and give it a password.
2. **Set ownership.** Give each player's character token Owner permission for the `Table` user as well as for that player, so anyone at the table can move their own token by touch. Give it Observer only on things the table may look at but not move.
3. **Choose the Table user.** Open Game Settings, then Three Keys Table Suite, and set **Table Display user** to `Table`. Set **GM view sync** to *Manual* or *Follow*.
4. **Open the table client.** Use one of these:
   - **Same laptop:** open a *second browser window* (a separate window, not a tab, and ideally a different browser profile so the logins do not collide), go to your Foundry URL, log in as `Table`, drag the window onto the touchscreen and make it fullscreen (F11).
   - **Separate device:** a mini-PC or tablet that drives the touchscreen, logged in as `Table`.
5. **Calibrate touch (Windows).** In Control Panel, open Tablet PC Settings, choose Setup, and tell Windows which display is the touchscreen. Otherwise touches can land on the laptop screen.
6. **Tune the table client.** On the table client, open the module's client settings and adjust the touch target scale, smoothing and deadzone.

**Why only the table handles touch:** if two windows on one PC both reacted to touch, the GM window could act on the players' touches. By default (*Touch handlers on this client: Auto*), handlers run only on the Table Display client. A single-screen touch setup can set this to *On*.

**Monk's Common Display:** if it already drives your table's view, set our **GM view sync** to *Off*. Everything else works alongside it.

## Display presets (v1.1)
Open **Configure Settings**, then **Three Keys Table Suite**, on the table client and pick a **Display preset**. A preset writes its values once, and you can change any of them afterwards.

| Preset | Use for | Main values |
|---|---|---|
| TV / touch panel | Flat LCD or OLED touchscreen laid on the table | Touch only, light smoothing, no filters |
| Projector (top-down) | Ceiling or mirror projector, often with a camera or IR tracker | Touch, pen and mouse accepted, bigger targets, 80 ms debounce |
| IR touch frame | Infrared overlay frame on a TV | Touch, pen and mouse accepted, heavy smoothing, 60 px palm rejection, 40 ms ghost filter, 120 ms debounce |

Set **Display rotation** to 180° if the image faces the far side of the table. Set **Display mirror** for rear projection or a mirror-folded projector. Only the board flips, so text in the UI stays readable. Presets never change these two settings.

## Handouts on the table (v1.1)
- Open a journal entry as GM and choose **Show page on Table Display** in the sheet's header menu. You can also right-click the entry in the Journal sidebar and choose **Show on Table Display**, or call `api.showHandout(uuid)` from a macro.
- Text and image pages are supported, and so is a plain image path such as `api.showHandout("worlds/x/map.webp")`.
- Secret blocks are removed on the GM laptop before sending. The table does not need permission on the journal.
- Players close the handout with its large ✕ button. The GM can clear it with the floating button or `api.clearHandout()`.
- Note: module sockets reach every connected client, so other player browsers also receive the secret-free payload, but only the Table Display shows it.

## Mini rings and tracking groundwork (v1.1)
- **Mini base rings** (world setting): *Player-owned tokens* (default), *All tokens* (unowned tokens use their disposition color) or *Off*. Ring color is the owning player's user color. GMs and the Table user never count as owners. Rings are drawn only on the Table Display.
- Tapping your token makes its base glow for **Mini highlight time**. A GM macro can call `api.minis.ping(tokenId)` to light a token on the table.
- **Physical mini input (preview)**: set it to *Highlight* to let a tracker module call `api.minis.report({ tokenId | actorId, x, y, source })`. The hooks `three-keys-touch-table-kit.preMiniInput` (return `false` to veto) and `three-keys-touch-table-kit.miniInput` fire for each report. In this version a report only highlights the token.

## Roadmap
- **Physical mini input will move tokens.** A future version will let a tracker's `api.minis.report()` move the matching token to the reported position through Foundry movement, so walls still apply. In v1.1 a report only highlights the token.

## Gestures (Table Display)
| Gesture | Result |
|---|---|
| Tap your token | Select it (never opens the sheet) |
| Tap an empty square with a token selected | Move there through Foundry movement (walls block) |
| Long-press a token | Open its sheet or HUD (setting) |
| Long-press empty space, then drag | Ruler; it clears shortly after you lift your finger |
| Two fingers | Pan and pinch-zoom with smoothing |

## Settings
**World:** Table Display user · Table may un-declutter · GM view sync (Off/Manual/Follow) · Compatibility mode · Extra conflict selectors.
**Client:** Touch handlers (Auto/On/Off) · Force Table Display on this client · Touch target scale · Pan/zoom smoothing · Two-finger deadzone · Tap tolerance · Long-press time · Long-press action · Floating declutter button.
**v1.1 client:** Display preset · Display rotation · Display mirror · Accepted input · Palm rejection size · Maximum contacts · Ghost-touch filter · Touch debounce.
**v1.1 world:** Mini base rings · Mini highlight time · Physical mini input (preview).
**Keybindings:** Toggle declutter `Alt+D` · Push view to table `Alt+V` (GM).

## API
`game.modules.get("three-keys-touch-table-kit").api` provides `isTable`, `touchEnabled`, `toggleDeclutter()`, `pushView()`, and from v1.1 `applyPreset(name)`, `showHandout(pageOrUuidOrImage)`, `clearHandout()`, `minis.ping(tokenId)`, `minis.highlight(token)` and `minis.report(report)`. The hooks `three-keys-touch-table-kit.handout`, `.preMiniInput` and `.miniInput` are also available. The hook `three-keys-touch-table-kit.action` fires with `(type, data)` for each touch action.

## Known limits
- If a tap-move would cross a wall, the token stops where Foundry's collision stops it (the same as a mouse drag), which may be short of the square you tapped.
- Touch support covers the canvas. Sheets and dialogs use the browser's normal touch-to-click behavior.
- Mirror and rotation flip the board only. HTML overlays such as the token HUD and tooltips are not flipped, which matters little because the table has no HUD by default.
- Palm rejection depends on the frame reporting contact size. Many cheap IR frames do not, so use Maximum contacts and the ghost and debounce filters on those.
- The Table user only sees what its permissions allow. Do not log the table in as a GM.

## License
MIT © 2026 Three Keys Tabletop. Contains no third-party game content.

## Development tests
`./build.sh` builds `dist/three-keys-touch-table-kit.zip`. With the headless Foundry test server, `foundry-test/tests/test-module.sh dist/three-keys-touch-table-kit.zip` and then `node tests/touch-table.test.mjs` run the touch tests (43 checks). Test the built zip, not the source folder: `test-module.sh` picks the first `module.json` it finds, which can be `dist/module.json`. The touch test opens two browser contexts (GM, and a Table user with touch), creates a disposable fixture scene, and saves screenshots to `foundry-test/tests/out/touch/`.
