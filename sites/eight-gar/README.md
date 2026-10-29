# 8 гар · Naiman Gar online table

Networked client for the Mongolian eight-player team card game. Eight humans (or humans plus server-side computer players) sit at one table, talk on one shared LiveKit voice channel, and play in real time against an authoritative server. The browser only ever receives its own hand and the public table; every other seat is rendered from card counts.

## How a table works

1. Open the site, pick a name and **Open a new table**. You get a six-character code and a link (`/r/CODE`) to share.
2. Friends join with the link or code. Everyone picks a seat by clicking an empty one; seats alternate between the two teams.
3. The host can **Fill with computers** for empty seats, then **Deal cards** once all eight seats are filled.
4. After each deal the opening team discusses on voice; choose the opener on the panel («Та») or on a teammate's seat label (framed in gold and tagged «Сонгох»), then confirm with the button, which names the chosen opener. Arrow keys also move the selection, and the choice survives table updates. Everyone else sees who confirmed.
5. Play as usual: lead, beat or pick up. Every turn has a three-minute clock. If it runs out, the server plays the lowest safe legal move for that seat.
6. When a round ends the whole table gets a 10-second review window with the final pile visible, then any player on the winning team (or the host) deals the next round; the server deals automatically after 60 seconds.
7. After a match the host can start a rematch in the same seats.

Reload or reopen the link at any time: the session token in this browser puts you back in your seat. A player who stays offline for three minutes is covered by a computer until they return.

## Files

| File | Role |
| --- | --- |
| `dist/app.js` | Table controller: lobby, server payloads → scene, animations, intents |
| `dist/scene.js` | Pure rotation of the server `PlayerView` into the renderer's State-shaped scene (viewer at display seat 0, placeholders for hidden cards) |
| `dist/net.js` | HTTP room endpoints, session storage, socket.io wrapper with acked requests and clock offset |
| `dist/voice.js` | LiveKit audio-only wrapper: voice joins automatically when you sit down (listening, mic muted), one button unmutes, per-seat mic badges, active speakers, a tap-to-hear prompt when the browser blocks autoplay, token refresh |
| `dist/presentation.js`, `dist/motion.js`, `dist/photographic-room.js`, `dist/room-layout.js` | Committed card animation and a photographic room with live viewer-relative seat labels; only public counts and cards enter presentation |
| `dist/vendor/` | Three.js and livekit-client bundles with licenses |

`engine.js` and `strategy.js` are served by the game server from the root engine build, so there is a single source of rules. `index.html` uses `<base href="/">` because tables live under `/r/CODE`.

## Interface language

Online and practice interfaces use Mongolian Cyrillic (`lang="mn"`), including the player rulebook, accessibility labels, game messages and voice controls. `dist/locale-mn.js` provides shared card labels, computer-player names and error-code translations. Render errors through `errorText` instead of showing raw engine or server messages. Human display names and standard card ranks remain unchanged. Code identifiers, protocol values, saved data, diagnostics and technical documentation stay in English; localization does not change the game rules.

Round and match results use a nonmodal panel in the hand dock (`dist/round-review.css`). The final table pile remains visible as a stack and available to enlarge while online review and deal timers continue. Voice controls remain available. To verify the layout and next-deal flow at desktop, portrait and landscape sizes, serve the repository on a disposable local origin and run `tests/round-review-qa.html`; it writes practice fixtures to that origin's browser storage.

## Guided rules

Both rules dialogs open with a Mongolian introduction and four illustrated lessons: leading, defending, pickup, and Унтана. The shared `dist/rules-guide.js` module mounts from the table chrome, with isolated styles in `dist/rules-guide.css`. Full rules retain the online/practice wording and return to the current lesson; reopening starts at the introduction. Examples are static and do not read or change the match. Existing practice pause/resume and online timers are preserved.

## Run locally

The client needs the game server (`server/` in the repository root). Build the engine, then start the server with `STATIC_DIR` pointing at `dist/`; see the deployment README for the full environment. `npm test` here runs the scene, presentation and character-layout tests with Node's test runner against the root `dist/engine.js`.

## Not in this release

- Accounts, rankings or match history: identity is a name plus a per-table session token.
- Spectators and joining a match that has already started.
- Text chat. Voice is one shared channel for all eight players; computer players never join it.
- TURN over TLS on port 443: strict corporate networks that block UDP and non-443 TCP get the game without voice.

## Private set signals and practice

Run the root `npm run build` before serving the browser files; it copies the shared compiled engine, strategy and signal helpers into `dist/rules/`. `practice.html` preserves the local game separately from the online landing page, including its existing browser save key. Signal controls are in the hand area and stay available during opening discussion and other players’ turns. Only teammates receive name badges. Active signals survive reloads, and older saves continue to load with no declarations.

The common `team-signals.js` controls accept only a viewer’s hand and filtered team declarations. Online callers must rotate real seats to display seats before rendering, while sending the actual game revision to `game:signal`. A private update must refresh signal controls without resetting the move animation, opening-player selection, or turn countdown.

## Practice table clarity and atmosphere

`practice.html` now has a jade shield for your team and an ochre ring for opponents, a named teammate hand-count summary, and explicit current/next-seat markers. At seven plays the next seat is labelled “After pickup”; a successful eighth defense returns the lead to the actor unless the round ends. The eight-step Унтана meter follows the displayed transition, including reserve refill before sleep, and never exposes sleeping cards.

While defending, the preview pairs selected cards with the latest targets and explains incomplete coverage, unused cards, and joker restrictions. `analyzeDefense(candidate, target, trump)` in the engine returns maximum one-to-one coverage, unmatched indices, and legality. Stable card-ID tie-breaking keeps equivalent mappings consistent through hand sorting. `beatsSet` retains its original boolean contract and rules.

Both practice and online tables fit in one dynamic viewport. Seven players sit along both sides and the far edge of a generated photographic table, seen from the viewer’s eighth seat, with a fixed hand and action area below. The wide and portrait compositions use one coordinate map for their live seat labels, public card fans and animation destinations; the image is never stretched. Names, counts, team signals and cards remain live UI. Eligible teammate seats become the opener choices, including the viewer at the near rail. The old row picker is no longer shown. Short landscape screens place the hand beside the table. Large hands scroll within their own area while preserving scroll position and card selection. Table plays overlap in chronological order, with the ranks and suits of every earlier level exposed and every card in the latest play fully visible on top; the pile count opens all accumulated cards for review. Rules, lobby content, and review dialogs scroll internally when needed.

Practice atmosphere is always enabled. Short sounds are synthesized locally with Web Audio at 25% after interaction; no media service or runtime network request is needed. A device reduced-motion preference skips flying cards and seat reactions. The photographic people are static artwork; bounded seat highlights acknowledge pickups and wins. The room requires no WebGL. Effects stop on cancellation, pause, tab hiding, or a fresh match. Restoring a save does not replay sounds or reactions.

The Atmosphere and Focus table controls have been removed, and their obsolete stored preferences are ignored. `viewport-table.css` owns the shared viewport layout, while `realistic-table.css` and `room-layout.js` align its overlays with the artwork; `practice-table.css` retains the practice insights styling. Match saves and the server protocol are unchanged.

Verification: `npm run check` at the repository root, `npm test -w sites/eight-gar`, and `npm test -w server`. For repeatable browser checks, serve the repository root on a separate local test origin and open `sites/eight-gar/tests/browser-qa.html`. The runner uses disposable browser saves on that origin and exercises 320/390/700/1440px layouts, defense pairing, sleep/refill/win transitions, large pickups, layout cancellation, orientation, and unavailable audio/WebGL and reduced-motion fallbacks. It must not run against a browser origin containing a match you want to retain.

The viewport runner also covers 568×320 and 844×390 landscape screens, main mobile touch targets, and obsolete preferences. `tests/online-viewport-qa.html` checks the real lobby, room and game layout, plus visible voice/reconnect controls. To run it, temporarily symlink it into `dist/` on a disposable local game server, open that URL, then remove the symlink before publishing. It creates test rooms and fills them with computers.

Generated artwork: `dist/assets/table-room-v2.jpg` and `table-room-mobile-v2.jpg`. Exact built-in image generation prompts are recorded in `dist/assets/table-room-v2-prompts.md`. Original art is retained separately.

## Reference-based ger interface (v3)

Character artwork revision (v4): `ger-table-wide-v4.jpg` and `ger-table-portrait-v4.jpg` give the four women distinct facial structures, ages, and hairstyles with corresponding identities across desktop and mobile. `room-layout.js` uses these revised images with the existing seat coordinates. Exact built-in image generation prompts are recorded in `dist/assets/ger-table-v4-prompts.md`; v3 originals are retained.

`dist/ger-table.css` and `dist/ger-table.js` provide the shared desktop, portrait and short-landscape presentation. The room fills the viewport; score, round/trump, seat counts, table pile, turn guidance, hand and actions remain live. The seven people and room are decorative images derived from the supplied references, with all baked-in UI/cards removed. `room-layout.js` maps live overlays to each composition.

The hand uses fanned ivory cards, a turquoise selection outline, and a Mongolian court-card atlas. Larger hands scroll and retain their position through sorting. Settings holds rules and new-match/leave controls; practice has a persisted sound toggle. The always-visible “3 масстай” and “5 масстай” buttons in the bottom controls declare private team signals; each carries a one-line state caption (багтаа мэдэгдэх / мэдэгдсэн; a greyed button has none), a “?” beside them opens the rules at the signal section, and teammates’ declared sets show as small chips inside their seat name row. The practice defense-coaching control is available in Settings. The turn capsule shows whose turn it is, a clock icon with the remaining time, the last move and, only when a selection is illegal, why; the online clock remains server-driven.

Artwork and exact built-in generation prompts: `dist/assets/ger-table-v3-prompts.md`, `ger-table-wide-v3.jpg`, `ger-table-portrait-v3.jpg`, and `mongolian-courts-v1.jpg`. The original artwork remains available. Preview captures are `../ger-table-desktop-v3.png` and `../ger-table-mobile-v3.png`.

Validation: 126 engine tests, 44 client tests, 28 server tests, TypeScript checking, and browser runners for practice (320×568 through 1440×900, plus landscape), online lobby/room/game, and round/match review. Browser checks include selection/sorting, legal defense, opener confirmation, stacked piles, pickup/refill/sleep, large hands, rotation, and reduced motion. Use the `Reference preview` scenario in `tests/browser-qa.html` on a disposable origin to review the reference hand. No production deployment is performed by these preview runners.

Control refinement (v4): microphone mute/unmute (online) and sound mute/unmute (practice) sit at the bottom beside private team signals and sorting. Shared SVG icons in `dist/control-icons.js` replace text-symbol controls and survive game rerenders. Translucent charcoal panels, silver borders, circular utility buttons, and the turquoise play action follow the supplied reference. Mobile targets remain at least 44px; labels, pressed states, keyboard focus and disabled actions are retained. The room-code copy control shares the existing link; the duplicate invite icon has been removed. Updated previews: `../ger-controls-desktop-v4.png` and `../ger-controls-mobile-v4.png`.

Mobile readability: set signals remain visible beside audio and sorting, with 44px touch targets and a checked state. Court ranks and suits use card-relative gutters clear of the artwork, including small landscape hands. Phone seat labels, turn guidance and pile information use larger text. The browser QA court scenario checks both signal toggles and rank/art separation from 320px phones through desktop.

## Keep the screen on

Online and practice tables request a Screen Wake Lock during opening discussion and active play. Settings → **Дэлгэцийг асаалттай байлгах** defaults to on and remembers the preference locally. The status underneath reflects the actual browser lock rather than just the preference. Practice pause, round/match end, leaving the table, or hiding the page releases the lock. Returning to a visible active game requests it again, including restoration from the back/forward cache. A denied or system-released lock retries on return or user interaction, without polling. Unsupported browsers and blocked storage do not interrupt play. HTTPS (or localhost for development) is required; battery-saving settings and manual screen locking remain under device control.

`screen-wake-lock.test.mjs` covers lifecycle, preference persistence, pending-request cancellation, browser revocation/rejection and unsupported environments. Actual display sleep behavior still needs a physical iPhone/Android check.

Move suggestions have been removed: the practice table has no lightbulb button or automatic selection of a suggested hand. Players select their own cards; computer turns still use the shared strategy engine.

## Responsive entrance lobby

`dist/lobby-entry.css` and `dist/lobby-entry.js` implement the desktop two-column welcome panel and phone form over the existing ger artwork. `lobby-home` scopes the entrance presentation so room seating and the live game retain their layouts. The scoreboard appears after dealing. Inputs remain at least 16px and actions at least 48px, with safe-area padding, visible focus, and a scrollable entrance on short screens. The invitation URL retains its join-only flow.

The entrance follows `VisualViewport` resize and pan events above software keyboards, with a layout-viewport fallback. It collapses the decorative heading while editing, keeps that compact form during button focus, and restores the scene when the keyboard closes. Touch devices do not autofocus a field on arrival. Successful room entry dismisses the keyboard; validation keeps the field and error available. This does not change card rules, sessions, voice, or practice behavior.

Validation: `npm test -w sites/eight-gar` includes keyboard lifecycle regressions. On a disposable local game server, temporarily symlink `tests/lobby-entry-qa.html` into `dist/`, then open `/lobby-entry-qa.html` and run the checks. The runner covers 320/390/430/700/844/1440px layouts, touch targets, scroll reachability, simulated 480px and 260px keyboard viewports, validation, create/deal, and invitation join. Remove the symlink afterward. Physical iOS/Android keyboard and rotation behavior still require a device check.

Waiting-room refinement: `dist/lobby-room.css` carries the entrance palette into a wide invitation-and-seating panel. Live occupancy and per-team counts update with the roster; phones stack the teams and retain the host actions in a sticky footer (short screens use normal scrolling). Native seat-move and bot buttons are siblings, preventing keyboard activation of a bot control from also moving the player. Roster updates restore focus to the corresponding action. `lobby-waiting` is cleared on dealing or leaving, so these styles do not affect gameplay. The local lobby QA runner also checks waiting-room touch targets at five sizes, bot add/remove, team/seat switching, occupancy, focus retention, and guest-only control visibility. The existing 58 client tests and extended browser runner pass.

### Selectable avatars

Online and practice players can choose one of seven still characters; a character is always preselected (the remembered one, otherwise a random one), so play can start without choosing. The browser remembers the choice; online rooms permit changes only while waiting. Characters are now separate layers over people-free v5 room artwork, with a persistent local portrait. See [avatar behavior, verification and artwork prompts](docs/selectable-avatars.md). The root build now also copies the shared avatar catalog; the server applies migration `002_player_avatars.sql` at startup.

### Card depth and movement

`dist/card-depth.css` adds paper edges, contact shadows, a small lift tilt and stable resting angles to both tables. `dist/motion.js` keeps the existing arc and flip, matches rotated landing bounds, eases played cards onto the felt, and gathers pickups into a bounded stack before traveling and spreading into the destination hand. Reduced motion, private opponent draws, offscreen hand destinations and cancellation retain their existing behavior.

On a disposable local origin, open `tests/card-motion-qa.html` and run the motion checks. It verifies landing alignment, gathering and shared travel for both player types, private refills, sleep cleanup and cancellation during three pickup phases; replay buttons show the play and pickup sequences.

## Mobile feedback audit (October 2026)

Verified the reported hidden mobile sleep meter, trailing sleep narration, reserved-bot name fallback, hidden review hand, repeated reconnect messages, scrolling rules navigation, voice-banner positioning, clipped mic label, speaking-style override, and undiscoverable large-hand overflow against the current source.

The table now shows a shared `Унтана N/8` chip in online and practice modes. An eighth play leads the narration and remains in the turn capsule for 2.5 seconds after the animation, including reduced-motion mode. Hand counts and directional scroll hints remain visible; sorting preserves the scroll position. Rules content scrolls between fixed header and navigation controls, and full-rule anchors scroll independently of the header. Opening discussion stays within its table area. Round results keep remaining cards and pile inspection available, using the action column on wide screens and a separate dock row in portrait.

Online reconnect feedback uses one game message, dims unavailable cards, and confirms reconnection. Settings and match-end waiting text identify the current host, and host changes produce a notification. The existing ownership policy is retained: the promoted host keeps the role when the original host reclaims a seat. A reducer regression verifies that the promoted host can still rematch. The configured default takeover delay is 180 seconds; the report's 20 seconds was not the production default.

Reserved bot seats preserve their human's name. Microphone captions distinguish connection, permission, mute, and playback states; blocked playback is resumed from the existing audio control, without a banner over play controls. Voice-error notifications are limited to one per outage, and speaking seats have a visible outline.

Validation: engine, client, and server tests; both TypeScript checks; `tests/mobile-feedback-qa.html` and `tests/round-review-qa.html` on a disposable local origin at 320×568, 390×844, 568×320, 844×390, 820×1180, and 1440×900. The online viewport runner also passes with microphone visibility simulated. Real microphone permissions, LiveKit audio, and device interruptions still need physical-device verification. Lower-priority report suggestions such as rematch celebrations and practice/online new-match parity are deferred. The older general `browser-qa.html` runner contains stale assertions about the removed viewer seat; the focused runners above exercise this change.
