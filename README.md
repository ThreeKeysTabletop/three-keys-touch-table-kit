# Three Keys Touch Table Kit

*By Three Keys Tabletop · Foundry VTT v13–v14 · system agnostic · MIT*

Make a touchscreen lying on the table a first-class Foundry client. The GM runs the game from a laptop; the players see and touch a clean **Table Display** with no GM information, no sidebar, chat or hotbar, and with touch controls built for fingers.

## Install
1. On Foundry's setup screen, open **Add-on Modules** and click **Install Module**.
2. Paste this manifest URL and install:

```
https://github.com/ThreeKeysTabletop/three-keys-touch-table-kit/releases/latest/download/module.json
```

3. In your world, enable **Three Keys Touch Table Kit** under Module Management.

## Features
- **Table Display mode.** Pick the Table user in the world settings. That client is auto-decluttered: it hides the sidebar, chat, navigation, hotbar, players list and scene controls, and it is the only client that handles touch.
- **Touch that does not depend on the mouse.** The module reads raw `pointerType: "touch"` pointer events, so the GM's mouse on the laptop never fights the table.
- **Tap to select, tap to move.** Tap your token to select it, then tap an empty square to move it there. Movement goes through Foundry's own `TokenDocument#move`, so walls, collision and movement history work as usual. A tap never opens a sheet.
- **Long-press.** Hold on a token to open its sheet or token HUD (configurable). Hold on empty space to measure with the ruler, then drag your finger to extend it.
- **Smooth two-finger pan and pinch-zoom.** A deadzone and a smoothing setting tame jitter on cheap infrared frames.
- **Large touch targets.** A scale setting enlarges scene controls, sidebar tabs and token HUD buttons.
- **Declutter on any client.** A floating button or `Alt+D` toggles it.
- **GM view sync.** Push your view to the table with the floating display button or `Alt+V`, or set it to follow your view continuously.
- **Compatibility mode.** Only touches that land directly on the canvas are handled. Elements from known conflicting modules (Monk's Token Bar, Token Action HUD) and any selectors you add are always left alone.

## Recommended setup: GM laptop and table touchscreen
1. **Create a Table user.** Go to Configure Players, add a user named `Table` with the **Player** role (never Assistant GM or GM), and give it a password.
2. **Set ownership.** Give each player's character token Owner permission for the `Table` user as well as for that player, so anyone at the table can move their own token by touch. Give it Observer only on things the table may look at but not move.
3. **Choose the Table user.** Open Game Settings, then Three Keys Touch Table Kit, and set **Table Display user** to `Table`. Set **GM view sync** to *Manual* or *Follow*.
4. **Open the table client.** Use one of these:
   - **Same laptop:** open a *second browser window* (a separate window, not a tab, and ideally a different browser profile so the logins do not collide), go to your Foundry URL, log in as `Table`, drag the window onto the touchscreen and make it fullscreen (F11).
   - **Separate device:** a mini-PC or tablet that drives the touchscreen, logged in as `Table`.
5. **Calibrate touch (Windows).** In Control Panel, open Tablet PC Settings, choose Setup, and tell Windows which display is the touchscreen. Otherwise touches can land on the laptop screen.
6. **Tune the table client.** On the table client, open the module's client settings and adjust the touch target scale, smoothing and deadzone.

**Why only the table handles touch:** if two windows on one PC both reacted to touch, the GM window could act on the players' touches. By default (*Touch handlers on this client: Auto*), handlers run only on the Table Display client. A single-screen touch setup can set this to *On*.

**Monk's Common Display:** if it already drives your table's view, set our **GM view sync** to *Off*. Everything else works alongside it.

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
**Keybindings:** Toggle declutter `Alt+D` · Push view to table `Alt+V` (GM).

## API
`game.modules.get("three-keys-touch-table-kit").api` provides `isTable`, `touchEnabled`, `toggleDeclutter()` and `pushView()`. The hook `three-keys-touch-table-kit.action` fires with `(type, data)` for each touch action.

## Known limits
- If a tap-move would cross a wall, the token stops where Foundry's collision stops it (the same as a mouse drag), which may be short of the square you tapped.
- Touch support covers the canvas. Sheets and dialogs use the browser's normal touch-to-click behavior.
- The Table user only sees what its permissions allow. Do not log the table in as a GM.

## License
MIT © 2026 Three Keys Tabletop. Contains no third-party game content.

## Development tests
`./build.sh` builds `dist/three-keys-touch-table-kit.zip`. With the headless Foundry test server, `foundry-test/tests/test-module.sh dist/three-keys-touch-table-kit.zip` and then `node tests/touch-table.test.mjs` run the touch tests. The touch test opens two browser contexts (GM, and a Table user with touch), creates a disposable fixture scene, and saves screenshots to `foundry-test/tests/out/touch/`.
