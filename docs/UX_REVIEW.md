# End-to-end player experience review — 29 October 2026

Reviewed the working tree, including pre-existing uncommitted presentation changes. Those changes were preserved. This review covers the engine, bot strategy, online/practice controllers, transport, room runtime, voice, presentation, card layout, dialogs, save restoration, settings, and existing tests. Findings below distinguish reproduced defects from product recommendations and lifecycle risks.

The current experience is a fixed 43-card Mongolian eight-player team game. Its live renderer is `photographic-room.js`: DOM image layers, CSS depth, and Web Animations. `characters.js` contains an older Three.js renderer, but neither live controller imports it. Deck selection, mana, attack targets, and Draw/Main/Combat phases would misrepresent this game's rules. The appropriate flow is entrance → seating → deal → team opener discussion → lead/defend/pickup → round review → next deal → first-to-five match results.

## Findings ranked by player impact

| Priority | Finding and player consequence | Action taken or recommended |
|---|---|---|
| P1 | A persistence failure on an automatic game timer or bot takeover consumes the timeout while leaving its bookkeeping unchanged. The deadline can remain expired indefinitely. | **Fixed:** delayed retry of failed server operations, guarded by the original timer identity. Reconnect/newer transitions cancel obsolete retries; closed rooms cannot rearm. |
| P1 | Settings → New Match during practice round/match results leaves the old result dialog open. It displays stale scores, hides play controls, and `anyDialog()` suppresses subsequent bot turns. | **Fixed:** close results before preparing a new match; reject Continue outside end states. |
| P1 | Online pile inspection freezes the opening pile while the server continues playing. After pickup/sleep it can display cards that no longer belong to the public table, including cards the rules prohibit inspecting. | **Fixed:** compare the inspector with every accepted authoritative pile; close and clear it on change, with a localized notification. Unchanged roster syncs leave it open. |
| P2 | Round/match review can shrink table cards to about 8×8 pixels. A hidden turn HUD yields a zero rectangle and collapses the available pile area. Existing browser tests checked card existence and button access, not readable dimensions. | **Fixed:** use room-space fallback when the HUD is hidden and remeasure when results open. Added minimum card-size assertions. |
| P2 | Every room creates a voice sink that was never removed. Pending connection/microphone/audio operations could publish obsolete state after leaving, potentially overwriting the next room's UI. | **Fixed:** explicit voice destruction, listener/sink cleanup, and current-room checks after async work. Tested with delayed fake SDK operations. Real microphone/SFU behavior remains a device integration check. |
| P2 | The first legal turn has little instruction until a player makes an invalid selection. Online play lacks the practice defense-pairing panel. | Add short contextual lead/defense/pickup guidance and reuse the shared defense analysis online; see acceptance criteria below. |
| P2 | A live online clock keeps running behind Settings and Rules. This differs from practice, where dialogs stop bots. | State “Online play continues” and show the live deadline inside online dialogs. Provide an immediate Return to Table action when the player's turn begins. Do not pause the authoritative match locally. |
| P2 | Hand cards have no dedicated readable inspect view, particularly off turn on touch/keyboard devices. Disabled card buttons cannot receive keyboard focus. | Add a separate Inspect Hand action that works off turn, without selecting or playing cards. |
| P2 | There is one last-move message, but no browsable recent activity log. A full identity-bearing replay would violate the sleeping-card rule. | Add a bounded count-only activity log, described below. Keep ordinary multiplayer undo unavailable. |
| P2 | Practice has sound effects, but online play has voice only; there is no game-sound control or turn-arrival cue. | Share the gesture-unlocked effect controller with online play, separate game volume from voice, and deduplicate on committed revisions. |
| P3 | At 320px, the local-avatar label slightly overlaps the room-code badge. | **Fixed:** show the portrait without the redundant visible “You” label at the narrowest online breakpoint. Its accessible label remains. |
| P3 | Team identity relies heavily on turquoise/gold seat outlines; the existing shield/ring marks are hidden by the final theme. Small captions and busy artwork add reading effort. | Restore a small shape marker and offer a high-contrast/card-size setting; validate with touch, keyboard, zoom, and a color-vision simulation. |
| P3 | Active renderer/chrome observers have no explicit teardown; the old Three.js renderer lacks complete disposal. | Maintenance risk rather than a demonstrated per-match GPU leak: current controllers instantiate one photographic room per page. Add teardown before supporting scene remounts or reactivating Three.js. |

P1 means a progression failure or violation of the intended information rules; P2 substantially affects comprehension or reliability; P3 is polish or future lifecycle work.

## 1. Macro UI/UX and game flow

The entrance already supports create/join, invitation links, avatar selection, validation, a waiting room, team switching, bots, and host-controlled dealing. There is also a separate practice entry. Guided rules contain illustrated lessons. Round results are deliberately nonmodal so the final pile remains inspectable; online play has a review window, automatic next deal, and host rematch. Practice has an explicit pause/resume control and restores saved active games paused. These features are present, not missing menus to rebuild.

The HUD names the actor, shows the round/trump, team scores, hand counts, reserve count, online timer, sleep-cycle count, and last move. Automatic refill is part of one atomic turn, so it should be explained as an action transition, not exposed as a separate player-controlled Draw phase.

The losing match headline is the friendly “Сайхан тоглолт боллоо.” (“That was a good game”), while the win headline explicitly names victory. Make the loss equally explicit: the opposing team won, with the final score and rematch/leave options immediately adjacent. Keep the friendly line as supporting copy.

The first-turn gap is concrete in `renderActions()` in both controllers: legal selections generally leave guidance empty. A new player must discover that cards are selected first and committed with Play, that the leading sizes are conditional, and that Pickup is a legitimate alternative. Practice can explain defense coverage, but its detailed panel is tucked into Settings; online only shows a generic rejection.

Recommended next addition: use one shared function that derives guidance from phase, table count, legal lead sizes, selected cards, and `analyzeDefense()`. Show “Choose cards, then Play” on the first turn; show “Beat these N cards or pick up M” when defending. Make the instructional layer dismissible and retain it through sorting/reconnect without changing rules. Acceptance: a first-time player can identify the current actor, objective, legal action types, and reason for rejection without opening the full rulebook. No automatic move suggestion is needed.

## 2. Tactile feedback and game feel

Existing effects include hand hover lift/tilt, selection springs, card travel/flip, coordinated pickups, reserve refills, and sleep removal. Motion cancellation restores committed state and removes flight nodes. Reduced-motion preferences skip flights. Practice synthesizes play/refill/pickup/sleep/win sounds and can highlight a seat after a large pickup or win.

Online `presentUpdate()` invokes card motion but does not use `TableAtmosphere`; voice audio is independent. Add a subtle arrival-of-your-turn cue and reuse committed-action sound hooks. Do not play a new cue for a full reconnect snapshot or an animation skipped while hidden. Use separate effect mute/volume and voice controls. Short table/seat emphasis for a winning play fits this game better than a camera zoom that moves all eight players' reference points. Screen shake and particles are optional polish, not release blockers.

Interaction currently uses click/tap selection plus an explicit commit button. It has no drag handlers or ghost preview. That is a valid model for one-, three-, and five-card sets and remains the safer default on phones. Improve selected-count/legality feedback before adding drag. If drag is introduced, lift the whole selected group, highlight one legal table drop zone, cancel on pointer cancellation/resize, and submit through the same guarded commit path. Keyboard/tap play must remain fully usable. There are no individual enemy targets to highlight.

## 3. Rules, game design and edge cases

The engine checks revision, phase, actor, ownership, uniqueness, lead structure, three/five-card restrictions, one-to-one defense, and pickup availability. Refill, sleep, victory, and turn advancement happen synchronously before returning. Server commands are serialized; persistence precedes broadcast; action IDs are deduplicated; socket inputs are validated/rate-limited. Player snapshots omit opponents' cards and reserve identities, and refills are filtered by viewer. Client input locks add usability protection but are not the authoritative rule boundary.

Existing tests cover complete matches over sockets, duplicate submissions, reconnect, wrong/stale actions, team-signal privacy, sleep/refill/win ordering, and conservation. The browser runner also verifies rapid double-play commits once and resize does not corrupt the 43-card inventory. These results support the current guards; they do not establish absence of every race.

No match history UI exists. `liveMove` only retains one message, and presentation coalescing may omit intermediate narration. A useful compatible log would record `{revision, round, actor, kind, count, cause}` from each accepted update before presentation queuing, capped at roughly 50 entries. Include pickup/refill/sleep/timeout/win markers, without card identities or private draws. On a snapshot gap, insert a “reconnected; some actions unavailable” marker rather than inventing history. The specification explicitly forbids inspecting sleeping cards for the rest of the round. Any richer replay needs an explicit rules/product decision.

Undo in live multiplayer would reverse information already revealed to seven other players and interact with timers/refills. Keep it unavailable. A future practice learning mode could support a clearly labelled retry, separate from a normal match.

Bot strategy prefers the lowest-cost legal set, with larger legal leads first. It is not a team-aware tactical opponent. Consider difficulty options using public hand counts, teammate turn order, and pickup consequences; retain the privacy boundary and conservation tests. An adjustable practice bot delay would also reduce the fixed five-second wait between every computer move.

## 4. Quality of life

Settings already exposes rules, new-match/leave, wake lock, and practice defense coaching; practice also has a persistent sound toggle. Pile enlargement and hand sorting exist. Missing high-value additions are off-turn hand inspection, online sound settings, independent reduced-motion/card-size preferences, contextual explanations for “trump”, “sleep”, and the set declarations, and the count-only activity log.

The online Leave action is not a team concession. A surrender feature needs an explicit team policy, such as a team vote, and a server command that produces an ordinary match result. Do not let one player silently concede for three teammates. Label the present Leave action clearly about bot replacement and rejoining.

Practice dialogs suppress bots; online dialogs do not stop clocks. Present this distinction inside online Settings/Rules, especially on small screens where the modal makes the turn capsule inaccessible. Keep explanations scrollable with a visible close/return control.

## 5. Stability, lifecycle and scaling

The fixed timeout bug had deterministic failing tests before the patch. The new tests establish no broadcast on failed persistence, delayed recovery, takeover recovery, reconnect cancellation, and no remaining timers after room closure. Retries use a one-second delay. A prolonged production database outage still needs operational monitoring; this is recovery from transient failures, not a substitute for storage availability.

Voice tests establish that leaving during connection, microphone permission, or audio resume cannot emit late controller state; retired room listeners and sink nodes are removed. They do not test real permission prompts, autoplay, audio-device interruptions, or LiveKit reconnection over a real network.

The active photographic renderer owns a ResizeObserver and several page/media-query listeners without a `dispose()` method. Because it is instantiated once and reused, new matches do not allocate another renderer. Before remounting it, add an AbortController for event listeners, disconnect its observer, cancel reactions, and remove its stage. The dormant Three.js implementation additionally needs `setAnimationLoop(null)`, geometry/material/map disposal, renderer disposal, and guards on late texture-load callbacks. Do not describe that dormant path as a verified production GPU leak.

The final CSS is layered across several generations. This makes apparently harmless changes affect card geometry or touch targets. The strengthened review checks now assert actual card dimensions, and the online runner catches header collisions. Consolidating ownership of table/hand/dialog geometry would make these regressions less likely. The root README also still calls this a headless starter with no interface/server; update it to point to the current site and server documentation.

## Verification and limits

- `npm run test:all`: **244 passed, 1 skipped** — 129 engine, 81 client, 34 server passed. The PostgreSQL-specific test is skipped without a test database.
- Both TypeScript checks passed; `git diff --check` passed.
- Expanded round-review browser runner: round and match results at 320×568, 390×844, 568×320, 844×390, 820×1180, and 1440×900; readable final cards, pile inspection, accessible continuation, and Settings restart from both end states passed.
- Online viewport runner: local server create/fill/deal flow, six viewport sizes, room/header geometry, signal and simulated microphone touch targets passed after the narrow-header fix. This is not a real voice test.
- Presentation browser runner: 5/20-card hands, node/focus retention, sorting/scroll preservation, rapid double-play, 43-card conservation, and resize cleanup passed.
- On a live local online table, opening pile inspection then allowing a subsequent authoritative action closed the dialog and removed all retained inspector cards.
- UI checks used disposable local origins and test matches. No deployment or production mutation was performed. Physical iOS/Android input, native screen readers, actual LiveKit audio, and long-duration memory profiling remain unverified.

Patched code: `server/src/room/runtime.ts`, `sites/eight-gar/dist/{app.js,practice-app.js,photographic-room.js,voice.js,pile-inspection.js,avatars.css,index.html}`. Added/expanded regressions: `server/test/runtime.test.mjs`, `sites/eight-gar/tests/{voice-lifecycle.test.mjs,pile-inspection.test.mjs,round-review-qa.html}`. Existing unrelated working-tree edits remain in place.
