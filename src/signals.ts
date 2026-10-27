/** Private declarations of set possession, separate from engine actions and revisions. */
import { RuleError, TEAMS, type Card, type State } from './engine.js';
export type SetSize = 3 | 5;
export interface SetSignal { readonly seat: number; readonly size: SetSize }
export type Signals = readonly SetSignal[];

/** Lead structure only; turn, table, reserve and other players' hands do not affect possession. */
export function availableSetSizes(hand: readonly Card[]): SetSize[] {
  const ranks = new Map<string, number>();
  const seen = new Set<string>();
  let ordinary = 0;
  for (const card of hand) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    if (card.kind !== 'ordinary') continue;
    ordinary++;
    ranks.set(card.rank, (ranks.get(card.rank) ?? 0) + 1);
  }
  const pairs = [...ranks.values()].reduce((sum, count) => sum + Math.floor(count / 2), 0);
  const sizes: SetSize[] = [];
  if (ordinary >= 3 && pairs >= 1) sizes.push(3);
  if (ordinary >= 5 && pairs >= 2) sizes.push(5);
  return sizes;
}
function active(state: State): boolean {
  return state.phase === 'choosing-leader' || state.phase === 'playing';
}
/** Validate saved data without inferring a human declaration from their hand. */
export function reconcileSignals(state: State, saved: unknown): SetSignal[] {
  if (!active(state) || !Array.isArray(saved)) return [];
  const result: SetSignal[] = [];
  for (const item of saved) {
    if (!item || typeof item !== 'object') continue;
    const { seat, size } = item as SetSignal;
    if (!Number.isInteger(seat) || seat < 0 || seat >= TEAMS.length || (size !== 3 && size !== 5)) continue;
    if (!availableSetSizes(state.hands[seat] ?? []).includes(size)) continue;
    if (!result.some(signal => signal.seat === seat && signal.size === size)) result.push({ seat, size });
  }
  return result.sort((a, b) => a.seat - b.seat || a.size - b.size);
}
/** Reconcile the final engine result, after automatic refill and victory determination. */
export function advanceSignals(previous: State | null, state: State, saved: unknown, botSeats: readonly number[]): SetSignal[] {
  const fresh = !previous || previous.round !== state.round || !active(previous);
  let signals = reconcileSignals(state, fresh ? [] : saved);
  if (!active(state)) return signals;
  for (const seat of botSeats) {
    const hand = state.hands[seat];
    if (!hand) continue;
    const before = previous?.hands[seat];
    const changed = fresh || !before || before.length !== hand.length || before.some((card, i) => card.id !== hand[i]?.id);
    if (!changed) continue;
    signals = signals.filter(signal => signal.seat !== seat);
    signals.push(...availableSetSizes(hand).map(size => ({ seat, size })));
  }
  return reconcileSignals(state, signals);
}
export function setSignal(state: State, saved: unknown, seat: number, size: SetSize, enabled: boolean, expectedRevision: number): SetSignal[] {
  if (!Number.isInteger(seat) || seat < 0 || seat >= TEAMS.length) throw new RuleError('INVALID_PLAYER', 'Unknown seat.');
  if ((size !== 3 && size !== 5) || typeof enabled !== 'boolean') throw new RuleError('INVALID_ACTION', 'Choose a 3-card or 5-card signal.');
  if (state.revision !== expectedRevision) throw new RuleError('STALE_ACTION', 'The hand changed. Please try again.');
  if (!active(state)) throw new RuleError('ROUND_CLOSED', 'Signals are available during discussion and play.');
  if (enabled && !availableSetSizes(state.hands[seat] ?? []).includes(size)) throw new RuleError('INVALID_CARDS', `Your hand does not contain a ${size}-card set.`);
  const signals = reconcileSignals(state, saved).filter(signal => signal.seat !== seat || signal.size !== size);
  if (enabled) signals.push({ seat, size });
  return reconcileSignals(state, signals);
}
/** Player-facing projection: only set sizes and seats on the viewer's team. */
export function signalsForPlayer(signals: Signals, seat: number): SetSignal[] {
  if (!Number.isInteger(seat) || seat < 0 || seat >= TEAMS.length) return [];
  return signals.filter(signal => TEAMS[signal.seat] === TEAMS[seat]).map(({ seat, size }) => ({ seat, size }));
}
