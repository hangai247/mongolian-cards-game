# Mongolian 8 гар rules specification

Version 1.1 — October 27, 2026. Based on the referenced “Mongolian 8 Gar Rules” conversation and the explicit confirmations in the current conversation. This is a new implementation, not a recovered earlier archive.

## Players, cards, and initial state

Eight players occupy seats 0–7 in turn order. Team 0 occupies seats 0, 2, 4, 6; team 1 occupies seats 1, 3, 5, 7. No seat is skipped based on team membership.

The deck has exactly 43 distinct physical cards:

- Ten ranks in each of hearts, diamonds, spades, clubs.
- Ordinary ranks, weakest to strongest: **7 < 8 < 9 < 10 < J < Q < K < 3 < 2 < A**.
- One gray joker, one black joker, one red joker.

Shuffle the full deck before each round. Deal five cards per seat. The three undealt cards form a hidden reserve; their stored order is their draw order. Unused reserve cards stay available until drawn. Picked-up or played cards are never returned to reserve during a round.

For round one, the lobby randomly selects the opening team. **Deal the cards first. Each player sees only their own hand, and the team discusses its hands by voice before agreeing on an opening player.** No turn begins during discussion. After each later deal, the previous round’s winning team follows the same discussion-and-confirmation process; any of its four members may open. Choosing the leader never reshuffles, redeals or draws reserve cards.

Use `prepareMatch` to deal into `choosing-leader`, where `turn` is `-1` and `openingTeam` identifies the eligible team. Use `chooseLeader` only after the team agrees. `viewForPlayer` keeps teammates’ and opponents’ cards hidden throughout discussion. All eight players share one voice channel, so both teams hear each other’s discussions; only the cards on each player’s screen stay private. Voice transport and the method for recording team agreement belong to the multiplayer host; the practice Site does not claim to provide live voice.

The trump sequence is **hearts (бундан) → diamonds (дөрвөлжин) → spades (гил) → clubs (цэцэг)**. Round one uses hearts. Every completed round advances one position, regardless of winning team; the sequence repeats.

## Single-card comparison

1. Red joker beats black and gray; black beats gray. Every joker beats every ordinary card. Nothing beats red joker.
2. A trump card beats any non-trump ordinary card, regardless of rank.
3. Within the same ordinary suit, strictly higher rank wins.
4. A non-trump card cannot beat a different suit, including trump. Equal rank in the same suit does not win.

**Confirmed response-selection rule:** any beating card is allowed; there is no forced suit-following choice among otherwise legal responses: a player may use trump even if a same-suit winning card exists, or voluntarily pick up instead.

## Leading

A new lead is possible only when the table is empty. Legal lead sizes are one or three, with five allowed only as the special exception below. Two- and four-card leads are invalid.

- **One card:** any ordinary card or joker.
- **Three cards:** a pair by rank plus any ordinary third card. A triple qualifies, because it contains a pair. **Every player, including the leader and both teams, must hold at least three cards before the lead.** Reserve cards may remain; the empty-reserve condition applies only to five-card leads.
- **Five cards:** two disjoint pairs by rank plus any ordinary fifth card. This includes two distinct pairs, a full house, or four of a kind plus a fifth card. A triple plus two unrelated singletons does not qualify.

Jokers cannot appear in any multi-card lead or defense. They cannot substitute for a pair or an ordinary fifth card.

Before a five-card lead, both of these must hold:

1. The reserve is empty.
2. **Every** player, including the leader and all teammates, holds at least five cards.

Evaluate those conditions before removing any cards. A leader holding exactly five cards may lead all five and win after the empty-reserve victory check. Pair structure remains required even when the eligibility conditions hold.

## Defending and the table

When the table is nonempty, the next seat must either beat the highest play or pick up. There is no pass action.

A defense must contain exactly as many cards as the current highest play. There must be a one-to-one assignment of defending cards to target cards such that every defending card beats its target. Cards can be rearranged freely; no card can cover multiple targets. The engine searches for a complete matching, rather than relying on positional comparison or a greedy assignment.

A three- or five-card defense does not need pairs. Neither the three-card minimum-hand condition nor the five-card lead eligibility conditions apply to a defense. Jokers still can only be used singly.

Every successful play is appended to the accumulated table pile and becomes the new highest play. The next player compares against this highest play only. Earlier cards remain in the pile for a later pickup, until the eight-player sleep rule below clears the chain.

## Унтана — sleeping pile

Count **plays**, not individual cards: the opening lead is play 1; seven consecutive successful defenses bring the chain to play 8. This is relative to the current lead, not a fixed numbered seat. After the eighth play and automatic reserve refill, move the **entire** table pile to `State.sleeping` and clear both pile and highest play. Sleeping cards cannot be played, drawn, picked up, or inspected as a move history for the rest of the round. The next round restores the full 43-card deck.

If the eighth player's hand is not empty after refill, **that same player starts a fresh lead**. Check all normal lead rules again using the new hand counts: this is no longer a defense. If their hand is empty, their team wins immediately and no further lead is made. A pickup at any point, including by the eighth player, breaks the chain and passes a fresh lead to the next seat; it does not put cards to sleep.

One-card chains put 8 cards to sleep; three-card chains put 24 cards to sleep. With the 43-card deck and immediate victory, a legal five-card chain cannot reach eight plays: someone goes out first. The implementation counts plays consistently for every allowed size without delaying victory to complete a cycle.

## Pickup

Pickup is always available when the table is nonempty, including when the player could beat it. The acting player takes **all accumulated table cards**, including earlier leads and defenses. For example, after 7♠ is beaten by 8♠, pickup takes both cards.

Pickup clears the pile and highest play. **It never draws reserve cards**, even if the resulting hand has fewer than five. The next seat starts a fresh lead. Hands may exceed five cards after pickup; five is a refill target, not a hand-size ceiling.

## Atomic turn resolution

For a valid lead or defense, resolve this exact order:

1. Check current phase, action revision, active player, ownership, card uniqueness and move legality against the pre-play state.
2. Remove selected cards and append them to the table; update the highest play.
3. Automatically draw `min(max(5 − remainingHandSize, 0), reserveSize)` cards for the acting player, in reserve order.
4. If this is play 8 of the current chain, put the full pile to sleep and clear the table.
5. Check whether the acting hand is empty **after** the draw. If empty, award that team one round point and end the round. If its score becomes five, end the match.
6. Otherwise, the eighth actor retains the turn after sleep and starts a new lead. On every other play, advance to the next seat.

For pickup, validate and transfer the full pile, clear the table, omit refill, then advance to the next seat.

No user-controlled draw action exists. The returned state includes all turn effects. A player cannot legally act in an intermediate state between playing and refilling. If reserve runs out before reaching five, the player retains the cards actually drawn; drawing the last reserve card does not itself win the round.

Example: a restored position has one card in the acting hand and two reserve cards. Playing the card produces an empty hand temporarily, then automatically draws both reserve cards. The round continues with a two-card hand and unchanged score.

## Round and match lifecycle

The first empty acting hand after refill wins for its team. No further player takes a turn in that round. A score is incremented once. Both play and pickup are rejected after the round closes.

If neither team has five points, the host obtains a freshly shuffled full 43-card deck and calls `prepareNextRound`. This deals new hands, resets table, sleeping cards, reserve and winner, preserves scores, increments the round, advances trump, and enters `choosing-leader`. The winning team discusses its newly dealt hands by voice, then confirms any winning teammate with `chooseLeader`. The leader is not limited to the player who went out. No moves are legal before confirmation.

At five round wins, phase becomes `match-over`. Starting another round is rejected. A new interactive match requires a new `prepareMatch` call and a separate host-side match identity.

## State and API

| API | Behavior |
| --- | --- |
| `createDeck()` | Returns exactly the confirmed 43 cards in a deterministic, unshuffled order |
| `shuffleDeck(deck, random)` | Returns a copy shuffled with caller-supplied random samples in `[0, 1)` |
| `prepareMatch(deck, startingTeam)` | Deals first and waits for the opening team’s discussion; no active player |
| `chooseLeader(state, leader, expectedRevision)` | Confirms an eligible opener after discussion, with hands and reserve unchanged |
| `createMatch(deck, firstLeader)` | Low-level compatibility initializer for already-selected-leader integrations and fixtures; interactive games use `prepareMatch` and `chooseLeader` |
| `beatsCard(candidate, target, trump)` | Checks strict single-card dominance for valid deck cards |
| `beatsSet(candidate, target, trump)` | Checks allowed matching size, no repeated IDs, joker restriction and complete matching |
| `isLeadStructure(cards)` | Checks count, pairs and joker restrictions, independently of state eligibility |
| `canLeadThree(state)` | Checks active phase, empty table and all eight hands at least three, independently of reserve and selected-card structure |
| `canLeadFive(state)` | Checks active phase, empty table, empty reserve and every hand size; does not check the selected cards |
| `applyAction(state, action)` | Returns a new complete state and ordered internal events, or throws `RuleError` |
| `prepareNextRound(state, deck, expectedRevision)` | Redeals after a round win, then waits for the winning team’s choice |
| `startNextRound(state, deck, leader, expectedRevision)` | Low-level compatibility initializer; interactive games use `prepareNextRound` and `chooseLeader` |
| `viewForPlayer(state, player)` | Returns that player's hand, public table and counts, with other hands and reserve identities omitted |

`State.table.highest` describes the final play already included in `State.table.pile`; it is not an additional physical location. Conservation counts hands + reserve + pile + sleeping, never highest twice. `State.sleeping` is internal inventory; `viewForPlayer` deliberately omits sleeping card identities.

All actions carry `expectedRevision`. A legal transition increases revision exactly once, regardless of how many cards it draws. Revision continues across round resets and increases when an opener is confirmed. Confirming twice, choosing an opponent, or changing the opener after play begins is rejected. Invalid actions leave the input untouched. The host must serialize commits per game; revision alone is not a database lock.

Normal event order is `played → refilled → turn-changed`, omitting `refilled` when no card is drawn. A winning play instead emits `played → round-won`, followed by `match-won` when appropriate. Pickup emits `picked-up → turn-changed`. On the eighth play, insert `table-slept` after optional refill and before the win/turn event. It reports the actor and removed card count, without a browsable list of sleeping cards. A subsequent `turn-changed` can name the same actor, granting a fresh lead. Events describe a transition that has already completed.
