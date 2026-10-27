# 8 гар · Naiman Gar online table

Networked client for the Mongolian eight-player team card game. Eight humans (or humans plus server-side computer players) sit at one table, talk on one shared LiveKit voice channel, and play in real time against an authoritative server. The browser only ever receives its own hand and the public table; every other seat is rendered from card counts.

## How a table works

1. Open the site, pick a name and **Open a new table**. You get a six-character code and a link (`/r/CODE`) to share.
2. Friends join with the link or code. Everyone picks a seat by clicking an empty one; seats alternate between the two teams.
3. The host can **Fill with computers** for empty seats, then **Deal cards** once all eight seats are filled.
4. After each deal the opening team discusses on voice; any member of that team confirms the agreed opener. Everyone else sees who confirmed.
5. Play as usual: lead, beat or pick up. Every turn has a 60-second clock. If it runs out, the server plays the lowest safe legal move for that seat.
6. When a round ends the whole table gets a 10-second review window with the final pile visible, then any player on the winning team (or the host) deals the next round; the server deals automatically after 60 seconds.
7. After a match the host can start a rematch in the same seats.

Reload or reopen the link at any time: the session token in this browser puts you back in your seat. A player who stays offline for three minutes is covered by a computer until they return.

## Files

| File | Role |
| --- | --- |
| `dist/app.js` | Table controller: lobby, server payloads → scene, animations, intents |
| `dist/scene.js` | Pure rotation of the server `PlayerView` into the renderer's State-shaped scene (viewer at display seat 0, placeholders for hidden cards) |
| `dist/net.js` | HTTP room endpoints, session storage, socket.io wrapper with acked requests and clock offset |
| `dist/voice.js` | LiveKit audio-only wrapper (join on click, mute, active speakers, token refresh) |
| `dist/presentation.js`, `dist/motion.js`, `dist/characters.js`, `dist/character-layout.js` | Unchanged animation and 2.5D renderer; they receive only counts and public cards |
| `dist/vendor/` | Three.js and livekit-client bundles with licenses |

`engine.js` and `strategy.js` are served by the game server from the root engine build, so there is a single source of rules. `index.html` uses `<base href="/">` because tables live under `/r/CODE`.

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

On screens up to 700px, **Focus table** collapses portraits into a compact roster, enlarges cards, and keeps actions at the bottom while the hand is in view. All public table cards remain available, private team signals retain their visibility rules, and large hands scroll horizontally. The full room remains the default, and desktop always uses it.

**Atmosphere** offers independent sound, volume, and motion settings. Short sounds are synthesized locally with Web Audio; no media service or runtime network request is needed. Sound defaults to 25% and starts only after interaction. Motion-off or a device reduced-motion preference skips flying cards and settles character poses. Character reactions are brief and suppressed while portraits are collapsed. Effects stop on cancellation, pause, tab hiding, or a fresh match. Restoring a save does not replay sounds or reactions.

Preferences use the separate browser key `naiman-gar-table-preferences-v1`; the match schema and server protocol are unchanged. These controls are wired to the practice entrypoint, with styles isolated in `practice-table.css`. The shared motion and character components keep their existing defaults for the multiplayer entrypoint.

Verification: `npm run check` at the repository root, `npm test -w sites/eight-gar`, and `npm test -w server`. For repeatable browser checks, serve the repository root on a separate local test origin and open `sites/eight-gar/tests/browser-qa.html`. The runner uses disposable browser saves on that origin and exercises 320/390/700/1440px layouts, defense pairing, sleep/refill/win transitions, large pickups, layout cancellation, orientation, and unavailable audio/WebGL and reduced-motion fallbacks. It must not run against a browser origin containing a match you want to retain.
