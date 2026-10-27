# 8 гар · Naiman Gar Site

Private practice game deployed in ChatGPT Sites. One human player and seven computer players share the confirmed 43-card engine. This is not networked eight-person multiplayer.

## Run locally

Serve `dist/` with a static HTTP server. Three.js and generated artwork are bundled locally; there are no API keys or external AI calls at runtime. `npm test` runs strategy verification, including 20 complete seeded matches. `dist/engine.js` is the compiled engine from the parent workspace; its existing 87-test suite validates the confirmed rules.

The browser stores practice progress locally, resumes paused, and validates its saved inventory before restoring. A new match replaces the current browser save. No progress synchronizes across devices. The practice browser owns all computer hands; this architecture must not be reused as an authoritative online multiplayer host.

## Online deployment resources

Sites already provides the web hosting and HTTPS for this practice release. A real eight-human-player release additionally needs:

1. Authenticated players and server-side membership checks. Sites provides visitor identity; the app still needs rooms, seats, invitations, and a policy for guests.
2. An authoritative server running this rules engine. Keep shuffling, reserve, all private hands, move validation and scoring on that server. Return only each player's permitted view.
3. Durable room state, player/seat mappings and move history. Sites supports D1-backed structured storage. Commit each move atomically with a revision check; retry/reject conflicting submissions.
4. A live update transport and reconnection. Start with revision-based short polling if supported latency is adequate. Validate streaming or realtime-room support before promising WebSocket hosting. Restore each player's latest safe snapshot after reconnect.
5. Agreed room policies: who starts, how leaders are selected, what happens on disconnect, inactivity, abandonment, and rematches. Do not invent forfeits or turn limits.
6. Operational checks: error monitoring, request limits, backups/retention, malicious-client validation and full eight-device concurrency tests.

Sites' server and storage capabilities can support a first hosted implementation. A separate realtime service is a design option if room latency or concurrency requires it; it is not a requirement for this static release. No custom domain, payment processor, OpenAI API key, image storage or separate database subscription is needed for this practice app. Costs and capacity depend on hosting entitlements, live room counts, update frequency and retention; no unverified price estimate is asserted here.

## Verification

- Existing engine: 87 tests and strict TypeScript checking passed in the parent project.
- Strategy: 20 complete simulated matches, with legal multi-card moves, pickups and conservation of all 43 cards after every action; hidden-card independence check passed.
- Browser QA: starting-team/leader dialog, hints, playing, refill before turn progression, computer turns, pause/resume, local save restore, rulebook, desktop and 390px mobile layout.
- Practice is labelled throughout. New Sites remain private until the owner explicitly chooses sharing.

The full accumulated table pile is visible face up by default, grouped in play order. A gold outline marks the latest play that must be beaten. The table grows vertically for long piles, including on phones; the enlargement dialog remains optional.

## Opening-player discussion

Every round deals the full eight hands before choosing an opener. `prepareMatch` and `prepareNextRound` enter a persisted `choosing-leader` phase with no active seat; only `chooseLeader` starts play, without changing any dealt cards. The starting team is still random in round one and the winning team thereafter. Each player sees only their own hand. In human multiplayer the team discusses hands by voice before a member confirms the agreed opener. The practice table does not implement live voice: the user confirms their team’s choice, while the computer team compares only its own dealt hands to choose. No arbitrary or random player selection occurs before dealing.

## Three-card lead eligibility

A new three-card lead requires every one of the eight players to hold at least three cards before the move. The reserve need not be empty. Three-card defenses remain permitted when another player has fewer than three. The engine, computer strategy, hints, live guidance, and rulebook share this rule. Eligibility is recalculated after every move and pickup.

The intended voice arrangement is one shared channel for all eight players, so both teams hear the discussions. Hands remain visible only to their owners. The practice Site still has no live voice service.

## Live play and memory

Computer turns wait 2.5 seconds between moves. A single transient caption describes the most recent lead, the target and cards used to beat it, or a pickup. The next move replaces that caption; it is not stored or restored. The notes/history sidebar is removed. Legacy browser saves are rewritten without their old notes when restored. The current accumulated table pile stays face up, as requested, and Pause remains available for longer review.

## Realistic character layers and card movement

The room image contains no people or cards. Seven independent photographic character cutouts use subdivided Three.js meshes for restrained breathing, head tilts, forward leans and forearm gestures during thinking, play, pickup and refill. These are 2.5D actors, not fully volumetric human models. The angled poses, adult proportions, textured skin and deel fabric replace the former toy-like procedural figures. Seats form an arc with nearer side players and smaller far-side players. Artwork and live card fans share measured seat coordinates. Paused and reduced-motion states settle to a neutral pose. The renderer receives only public hand counts, phase, turn and team winner. Anonymous card-back elements are generated one-for-one from each opponent's actual hand count; none contain hidden ranks, suits or physical card IDs. Large fans compress on phones. The individual photographic images remain as a static fallback during loading or if WebGL is unavailable; live card fans and the game remain functional. Asset generation details and the prompt set are recorded in `docs/character-art.md`.

Play, pickup, reserve draw and sleeping-pile animations run as an ordered presentation of the already-committed engine result. Card inventory is saved once, atomically, before animation begins. The actor remains the displayed actor until movement finishes; the next computer waits its usual 2.5 seconds afterward. Human controls prevent duplicate actions during movement. Pickups animate every card into the recipient's hand; opponent pickups turn the public faces down. Opponent reserve draws never put their hidden identity into the animation DOM.

Pause, resize, tab hiding and a reduced-motion preference change settle the presentation immediately to the committed result and remove temporary cards. Reduced-motion users receive the result without flying cards. WebGL rendering uses a bounded pixel ratio and 30 fps, stops while the document is hidden, and does not repeatedly redraw a paused/reduced-motion scene. Runtime dependencies are bundled locally (Three.js 0.180.0 with its MIT license in `dist/vendor/`); no CDN is required.

The table and local hand retain keyboard-accessible HTML cards. Large local hands scroll horizontally. The public pile wraps as needed. This remains the single-device practice game with seven computer players; networked rooms and voice are still outside this release.

### Animation verification

`npm test` covers presentation ordering, conservation through every visual phase, complete-pile pickup for human and computer seats, eight-play sleep, immediate victory, all fan sizes 0–43, and animation bypass for reduced motion, hidden tabs and cancellation. Browser checks verify card-fan counts and absence of private IDs, seven-card pickup with input locking, pause during pickup, computer collection, and responsive large fans.

## Унтана: eight-player cycle

One lead plus seven successful beats automatically puts the accumulated pile out of play. Reserve refill completes first. If the acting hand is nonempty afterward, the eighth player leads again; an empty hand wins the round. Pickup breaks the count and passes the lead normally. Sleeping cards stay internal to the engine/save for conservation and cannot be displayed or picked up. The next full-deck deal resets them. The latest-move caption announces sleep and the same-player lead without adding history.

Browser saves now use format 2 and include sleeping inventory. Compatible format-1 saves migrate. Older live piles already containing eight or more plays are rejected with the existing fresh-match prompt because their earlier turns cannot be safely reconstructed under the new rule.
