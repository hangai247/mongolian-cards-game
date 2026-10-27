# Mongolian 8 гар — TypeScript engine starter

A headless, deterministic rules engine built from scratch using the rules confirmed on October 26, 2026. Includes TypeScript source, compiled JavaScript and declarations, automated tests, a runnable example, and a rules specification. There is no web interface or multiplayer server in this starter.

## Run

Requires Node.js 22 or newer. The release archive includes compiled files, so these commands work without installing packages:

```sh
node --test test/*.test.mjs
node examples/demo.mjs
```

To develop and verify the TypeScript source:

```sh
npm ci
npm run check
npm run demo
```

`npm run check` runs strict type-checking, compiles the engine, and runs the automated tests. TypeScript 5.9.3 is the only development dependency; the engine has no runtime dependencies.

## Confirmed rules

- Eight players, two teams of four, seated alternately.
- Exactly 43 cards: four suits of `7 8 9 10 J Q K 3 2 A`, plus gray, black and red jokers.
- Five cards per player; three hidden reserve cards. Deal first, discuss hands by voice with the eligible team, then confirm its opener. Each player sees only their own cards.
- After leading or beating, automatically refill the acting hand toward five, limited by reserve availability. Finish drawing before checking victory or advancing the turn.
- Picking up the full accumulated table never triggers a refill.
- Lead one card, or a three-card pair set only when every player holds at least three cards before the lead. A five-card two-pair lead is a special exception: reserve must be empty and every player must have at least five cards before the play.
- Defenses match the current play's count and beat its cards one-to-one, with free rearrangement. They do not need pairs and do not inherit either the three-card or five-card lead restrictions.
- Jokers are single-card plays only. Gray < black < red; every joker beats every ordinary card.
- The first trump is hearts; advance hearts → diamonds → spades → clubs after every round, then repeat.
- One teammate with no cards after refill wins the round. First team to five round wins wins the match.

Confirmed response selection: any beating card is allowed, including trump when a same-suit winning card is available. Pickup remains optional.

See [the full specification](docs/SPECIFICATION.md) and [edge-case audit](docs/EDGE_CASES.md).

## Use the engine

```ts
import {
  createDeck, shuffleDeck, prepareMatch, chooseLeader, applyAction, viewForPlayer,
} from './src/engine.js';

// The lobby randomly selects the opening team, then deals before discussion.
// Seat indices 0, 2, 4, 6 are team 0; 1, 3, 5, 7 are team 1.
const pending = prepareMatch(shuffleDeck(createDeck(), Math.random), 0);
const myHand = viewForPlayer(pending, 0).hand;
// After the team discusses its dealt hands by voice and agrees:
const state = chooseLeader(pending, 0, pending.revision);

const result = applyAction(state, {
  type: 'play',
  player: state.turn,
  cards: [state.hands[state.turn]![0]!.id],
  expectedRevision: state.revision,
});

// This state already includes the reserve draw and any victory determination.
const nextState = result.state;
const playerSnapshot = viewForPlayer(nextState, nextState.turn);
```

The import path uses `.js` intentionally for TypeScript's NodeNext module resolution. JavaScript consumers can import `./dist/engine.js` directly.

## Files

| Path | Purpose |
| --- | --- |
| `src/engine.ts` | Card types, deck/deal, comparison, set matching, turn transitions, scoring, views |
| `test/engine.test.mjs` | Rule regressions and 100 seeded single-card gameplay simulations |
| `test/helpers.mjs` | Complete 43-card fixtures, conservation checks, seeded randomness |
| `examples/demo.mjs` | One turn showing play → refill → next player |
| `docs/SPECIFICATION.md` | Formal rules and API behavior |
| `docs/EDGE_CASES.md` | Clarifications, boundaries, implementation conventions, open product decisions |
| `docs/VERIFICATION.md` | Verification results for this release |
| `dist/` | Compiled JavaScript and TypeScript declarations, included in the ZIP |

## Integration contract

Keep the full `State` and internal events on the authoritative game host. Give each player only `viewForPlayer(state, seat)`, with the seat derived from the authenticated session. A refill event contains private drawn cards and must not be broadcast to everyone.

Process actions sequentially per game and save the entire returned state atomically. `expectedRevision` rejects stale actions against the current state; the host must also prevent two simultaneous requests from both committing against the same old revision. There is no separate draw action and no asynchronous gap inside `applyAction`.

Use engine-created state as the trusted input. TypeScript types are not a runtime validator for arbitrary uploaded state. The starter does not implement authentication, persistence, saved-game import validation, timers, or reconnect policies.

`RuleError.code` identifies a rejected move. Input state is unchanged on success or failure. Returned snapshots are readonly in TypeScript; callers should treat them as immutable at runtime as well.

## Private teammate signals

Players can voluntarily share real 3-card and 5-card sets with only their three teammates during discussion or play. Signals persist until cleared, invalidated by a completed hand change, or the round ends. They do not consume turns or change timers. Bots share their own sets without changing their move choices. The online server checks and filters every declaration; practice is available at `/practice.html`.

`npm run build` also generates the browser copies of the shared rules. `npm run test:all` includes signal validation, save/reconnect, team privacy and authenticated socket tests. See the specification for the `./signals` helper API and `game:signal` protocol.
