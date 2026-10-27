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
