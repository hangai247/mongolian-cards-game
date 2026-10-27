# Edge cases and assumption audit

This audit separates confirmed gameplay from implementation conventions and future product decisions. Tests provide bounded evidence, not a claim that every possible sequence has been exhaustively checked.

## Clarifications resolved with the user

| Earlier uncertainty | Confirmed decision |
| --- | --- |
| Empty hand before reserve draw | Refill first, then check victory |
| Who draws and when | The acting player automatically draws after a lead or successful defense; complete this before the next seat acts |
| Pickup refill | Never refill after picking up, even below five |
| Deck and unusual ranks | Exactly 43 cards; 7, 8, 9, 10, J, Q, K, 3, 2, A in every suit, plus three jokers |
| Player count and seating | Eight players, four per team, alternating seats; five cards each and three reserve |
| Three-card lead | Requires every player to hold at least three cards before play; reserve may remain; does not restrict defense |
| Five-card lead | Allowed only with reserve empty and all eight hands at least five before play |
| Five-card defense | Same-count one-to-one beating; lead eligibility and pair structure do not apply |
| Triple and four of a kind | Triple contains a pair; four of a kind contains two disjoint pairs |
| Joker combinations | Jokers may only be played singly |
| Eight-player chain | One lead plus seven beats puts the full pile to sleep; the eighth actor leads again unless they win |
| Table pickup | Takes every accumulated card, not just the highest play |
| Optional pickup | Allowed even when a beating response exists |
| Starting player | Deal first; the eligible team discusses privately held hands by voice, then agrees on its opener |
| Next-round leader | Same discussion after the new deal; any player on the winning team |
| Trump sequence | First round hearts; advance hearts → diamonds → spades → clubs every round, repeating |
| Choice among beating cards | Any beating card is allowed, including trump when a same-suit winner is held; pickup remains optional |
| Different ordinary suits | A non-trump card only beats a lower card of its own suit |

## Boundary coverage

| Boundary | Implemented outcome |
| --- | --- |
| One, two or three reserve cards when a hand becomes empty | Draw the available cards; no premature round or match point |
| Not enough reserve to reach five | Take all remaining reserve and continue with the resulting smaller hand |
| Five or more cards remain after play | Draw nothing |
| Reserve empty and hand empty after leading or defending | End the round immediately; do not advance turn |
| Five-card lead with exactly five in the leader's hand | Legal if other conditions hold; wins after play |
| Five-card lead with six or more in the leader's hand | Legal if other conditions hold; continue with remaining cards |
| One reserve card remains before a five-card lead | Reject without mutating state |
| Any seat holds fewer than three | Reject a new three-card lead, including a triple; a three-card defense remains legal |
| Leader has exactly three cards and all others have at least three | Three-card lead is legal; refill before victory if reserve remains |
| Pickup brings every hand back to at least three | Three-card leads become available again |
| Any other seat holds fewer than five | Reject five-card lead, including when that seat is a teammate or not next to act |
| Five-card defense while another hand has fewer than five | Allowed if matching succeeds |
| Multi-card defense has no pairs | Allowed if each card beats a distinct target |
| Greedy matching spends trump on the wrong target | Backtrack to find a valid complete assignment |
| One strong card could beat several targets | It still covers only one target |
| Joker added to a valid pair set | Reject; jokers cannot join multi-card plays |
| Reusing a physical card or selecting an opponent's card | Reject |
| Pickup despite holding a winning response | Allowed |
| Pickup leaves hand below five | No draw |
| Pickup creates a hand larger than five | Keep all cards |
| Pickup requested on an empty table | Reject; a new lead is required |
| Seat seven finishes an ordinary non-winning turn | Advance to seat zero, except when completing a sleep cycle |
| Eighth actor completes the cycle from any starting seat | Sleep the pile and keep that actor as the new leader |
| Eighth actor picks up instead | No sleep; reset the chain and pass the lead |
| Eighth actor empties hand with reserve remaining | Refill before sleep and victory; continue if any cards were drawn |
| Eighth actor goes out with empty reserve | Sleep the pile, then win once; no extra turn |
| Sleeping cards after pickup, reload, or later sleep | Remain out of play, conserved and absent from visible history |
| Teammates appear in the same sequence of plays | No team-based restriction or skipped turns |
| Stale/repeated action | Reject against current revision |
| Invalid play or failed defense | No hand, reserve, table, turn or score change |
| Fifth team point | End match once; reject more actions or round restarts |
| Refill at a 4–4 score | Do not accidentally award the fifth point |
| Opponent chosen to lead next round | Reject |
| New round | Restore full deck, five cards per seat, three reserve, empty table; preserve scores and advance trump |

The suite also runs 100 reproducible legal single-card simulations. Each action checks conservation and uniqueness of all 43 cards, turn order, revision progression, refill and victory invariants. These simulations exercise single-card play and pickup; separate targeted tests cover multi-card rules.

## Reachable versus defensive fixtures

With an ordinary legal deal, all hands have at least five while reserve remains: playing one or three cards refills or exhausts reserve, and pickup only adds cards. Consequently, an empty hand with a nonempty reserve does not normally arise in legal play from the initial deal. The refill-before-victory rule is still explicit and tested for restored/synthetic positions, as requested.

A five-card table with nonempty reserve is likewise unreachable through legal engine moves because the initial five-card lead is forbidden then. A separate synthetic regression ensures the lead-only reserve condition is not accidentally imposed on a defending response. It does not assert that such a position can arise naturally.

## Response selection confirmed

The user explicitly confirmed that any beating card is allowed. A player may use trump even when holding a same-suit winning card, and pickup remains optional. The existing engine behavior and targeted regression test already implement this rule; no code change was necessary.

## Explicit implementation conventions

These choices make behavior deterministic without adding gameplay requirements:

- Seats are numbered 0–7 internally and advance numerically with wraparound. A UI may show seats 1–8.
- The caller provides the shuffled deck. Dealing goes one card per seat in stored seat order, repeated five times; the final three cards are reserve. The starting player is independent of this storage order.
- Draws take cards from the front of the reserve array. There is no choice among hidden reserve cards.
- The original lead plus successful defenses stays on the table until pickup, an eight-play sleep cycle, or round completion. Sleeping inventory and the final live pile are reset during the next full-deck deal.
- Card IDs are stable identifiers, not rank strength. Custom IDs are accepted only when the complete 43-card composition is valid and IDs are unique.
- State and events are synchronous values. A UI can animate draws, but must not accept the next action until the host commits the complete resulting state.
- Pair counting uses disjoint cards: a triple counts as one pair, four of a kind counts as two. A full house therefore qualifies as two pairs plus a card.
- The interactive lifecycle deals into `choosing-leader` before accepting the team’s agreed opener. Each player sees only their own cards. Low-level compatibility initializers remain available for fixtures and existing integrations; the Site uses the discussion-stage lifecycle.

## Product policies deliberately left open

No gameplay clarification remains open in this specification. The following are future app/lobby decisions, not hidden defaults in move legality:

- Voice implementation and how team agreement is recorded (for example, a designated member confirming the agreed seat); how players join or are assigned to teams. The rule itself is confirmed: discuss dealt hands by voice before choosing.
- Physical clockwise/counterclockwise table orientation; the app maps it to stored seat order.
- Disconnect, reconnect, abandonment, timeout and forfeiture behavior.
- Whether a repeatedly cycling game should have a draw or repetition rule. Voluntary pickup can prolong play; the starter imposes no invented turn limit or automatic draw.
- Authentication, authoritative persistence, concurrent commit protection and restored-state validation.
- Rematches, spectator permissions, communications and animations.

Tests use controlled fixtures and a bounded simulation policy. A passed simulation is not a proof that arbitrary voluntary-pickup play always terminates.

## Deal-and-discuss regression coverage

Both eligible teams can choose any teammate only after dealing. Card actions are rejected during discussion, and stale or repeated confirmations cannot change the opener. Player views reveal only the viewer’s hand. Confirmation preserves all dealt hands and reserve order. A restored pending discussion remains pending with the same cards. Subsequent rounds preserve scores and advance trump before discussion; completed matches cannot prepare another round.

Voice is shared by all eight players: opposing teams can hear each other’s discussion, while each screen shows only its owner’s hand.

## Sleeping-pile regression coverage

The sleep tests cover all eight possible starting seats, eight single-card plays, eight three-card plays, pickup breaking the chain, refill before sleep, immediate round/match wins, rejected actions, continued card conservation, multiple sleeping piles, and privacy of player views. Save-format tests preserve sleeping inventory and the same-player lead across reloads; compatible old saves migrate. An old saved pile already containing eight or more plays is rejected with a fresh-match message rather than guessing a different prior turn sequence.
