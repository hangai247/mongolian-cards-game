# Release verification

Updated October 27, 2026 with Node.js 24.18.0, npm 11.16.0 and TypeScript 5.9.3.

## Commands and results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed strict TypeScript checking |
| `npm test` | Passed all 103 tests; zero failures or skipped tests |
| `npm run demo` | Passed; event order was `played → refilled → turn-changed`; acting hand returned to five and reserve decreased from three to two |
| Packaged compiled JavaScript | Included with matching TypeScript declarations; tests and demo can run without installing dependencies |

The 103 tests include one test running 100 seeded legal single-card simulations. All 100 completed within their 3,000-action bounds. Every simulated transition checked the 43-card inventory, unique physical IDs, current turn, revision, and refill/victory invariants. Separate targeted tests cover three- and five-card rules and complete one-to-one matching.

Tests include synthetic conserved positions for empty-hand-with-reserve and five-card-defense-with-reserve cases. Those positions isolate requested rule behavior; they are not claimed to arise from legal initial play. See `EDGE_CASES.md`.

The package registry was unavailable during development. The pinned TypeScript 5.9.3 package and metadata were recovered from the local npm cache and installed offline. The lockfile retains its normal registry URL and integrity digest. The archive does not include `node_modules` or machine-specific dependency paths.

## Scope

This verifies the headless engine, not a browser interface or networked game service. Node 24.18.0 was exercised; Node 22 compatibility is declared but was not separately run. Authentication, storage concurrency, timers and saved-game import validation belong to the future host application.

The deal-and-discuss update adds eight tests for deferred opener selection, blocked moves, private hands, immutable deal confirmation, eligible-team validation, preserved next-round scoring, persisted pending state, and completed-match handling. Type-checking and all 66 engine tests passed after this update.

The three-card lead restriction adds 21 regression cases covering every other seat with one or two cards, exact-three boundaries, reserve refill, triples, single-card fallback, eligibility after pickup, inactive phases and defense exemption. Strategy checks also verify hint/computer fallback to one card and preservation of three-card defenses.

The Унтана update adds 16 engine regressions. Strict type-checking and all 103 engine tests pass, including 100 seeded single-card simulations. The Site has 9 passing tests: 20 complete simulated matches, strategy constraints, and four save-format/migration checks. All conservation checks now include the sleeping inventory.
