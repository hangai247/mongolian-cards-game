/** Pure room transitions. No clocks, randomness or I/O: everything comes in through Ctx. */
import {
  TEAMS, createDeck, shuffleDeck, prepareMatch, prepareNextRound, chooseLeader, applyAction, RuleError,
  type Action, type Event as EngineEvent, type State, type Team,
} from 'mongolian-eight-gar-engine';
import { findPlay, chooseComputerLeader } from 'mongolian-eight-gar-engine/strategy';
import type { Timing } from '../config.js';
import type { Cause, ClientEvent } from '../protocol.js';
import { RoomError, SEAT_COUNT, type GameMeta, type Player, type RoomSnapshot, type SeatSlot } from './model.js';

export type Command =
  | { readonly type: 'join'; readonly playerId: string; readonly name: string }
  | { readonly type: 'leave'; readonly playerId: string }
  | { readonly type: 'connect'; readonly playerId: string }
  | { readonly type: 'disconnect'; readonly playerId: string }
  | { readonly type: 'move'; readonly playerId: string; readonly seat: number }
  | { readonly type: 'set-bot'; readonly playerId: string; readonly seat: number; readonly bot: boolean }
  | { readonly type: 'fill-bots'; readonly playerId: string }
  | { readonly type: 'start'; readonly playerId: string }
  | { readonly type: 'confirm-leader'; readonly playerId: string; readonly leader: number; readonly expectedRevision: number }
  | { readonly type: 'play'; readonly playerId: string; readonly cards: readonly string[]; readonly expectedRevision: number }
  | { readonly type: 'pickup'; readonly playerId: string; readonly expectedRevision: number }
  | { readonly type: 'continue'; readonly playerId: string; readonly expectedRevision: number }
  | { readonly type: 'rematch'; readonly playerId: string }
  /** Fired by the runtime when game.deadline passes. Ignored unless kind and revision still match. */
  | { readonly type: 'timer'; readonly timer: 'leader' | 'turn' | 'round-over'; readonly revision: number }
  /** Fired by the runtime when a player has been offline for botTakeoverMs. */
  | { readonly type: 'bot-takeover'; readonly playerId: string; readonly offlineSince: number };

export interface Ctx {
  readonly now: number;
  readonly random: () => number;
  readonly timing: Timing;
}

export type RoomEvent = Extract<ClientEvent, { type: 'leader-chosen' | 'round-dealt' | 'rematch' }>;

export interface Audit {
  readonly kind: string;
  readonly cause: Cause;
  readonly actorSeat: number | null;
  readonly payload: Record<string, unknown>;
}

export interface Result {
  readonly snapshot: RoomSnapshot;
  /** Raw engine events; the runtime localizes them per seat (refilled cards are private). */
  readonly engineEvents: readonly EngineEvent[];
  readonly roomEvents: readonly RoomEvent[];
  readonly cause: Cause;
  readonly rosterChanged: boolean;
  readonly gameChanged: boolean;
  readonly audit: Audit | null;
}

export interface CreateRoomInput {
  readonly id: string;
  readonly code: string;
  readonly hostPlayerId: string;
  readonly hostName: string;
  readonly now: number;
}

export function createRoom(input: CreateRoomInput): RoomSnapshot {
  const seats: SeatSlot[] = Array.from({ length: SEAT_COUNT }, () => ({ kind: 'empty' }));
  seats[0] = { kind: 'human', playerId: input.hostPlayerId };
  const host: Player = { id: input.hostPlayerId, name: input.hostName, seat: 0, connected: false, offlineSince: input.now, lastSeenAt: input.now };
  return {
    id: input.id, code: input.code, version: 0, status: 'lobby', hostPlayerId: input.hostPlayerId,
    seats, players: { [host.id]: host }, game: null, createdAt: input.now, updatedAt: input.now,
  };
}

function unchanged(snapshot: RoomSnapshot): Result {
  return { snapshot, engineEvents: [], roomEvents: [], cause: 'action', rosterChanged: false, gameChanged: false, audit: null };
}

function requirePlayer(snapshot: RoomSnapshot, playerId: string): Player {
  const player = snapshot.players[playerId];
  if (!player) throw new RoomError('UNAUTHORIZED', 'You are not a member of this room.');
  return player;
}

function requireHost(snapshot: RoomSnapshot, playerId: string): Player {
  const player = requirePlayer(snapshot, playerId);
  if (snapshot.hostPlayerId !== playerId) throw new RoomError('NOT_HOST', 'Only the host can do that.');
  return player;
}

function requireLobby(snapshot: RoomSnapshot): void {
  if (snapshot.status !== 'lobby') throw new RoomError('ROOM_STARTED', 'The match has already started.');
}

function requireGame(snapshot: RoomSnapshot): GameMeta {
  if (!snapshot.game) throw new RoomError('BAD_PHASE', 'No match is in progress.');
  return snapshot.game;
}

function withSeat(seats: readonly SeatSlot[], seat: number, slot: SeatSlot): SeatSlot[] {
  const next = [...seats];
  next[seat] = slot;
  return next;
}

function withPlayer(players: Readonly<Record<string, Player>>, player: Player): Record<string, Player> {
  return { ...players, [player.id]: player };
}

function withoutPlayer(players: Readonly<Record<string, Player>>, playerId: string): Record<string, Player> {
  const next = { ...players };
  delete next[playerId];
  return next;
}

function humansOnTeam(snapshot: RoomSnapshot, team: Team, connectedOnly: boolean): Player[] {
  return Object.values(snapshot.players).filter(player => {
    const slot = snapshot.seats[player.seat];
    return slot?.kind === 'human' && TEAMS[player.seat] === team && (!connectedOnly || player.connected);
  });
}

function chooseHost(snapshot: RoomSnapshot): string {
  const humans = Object.values(snapshot.players)
    .filter(player => snapshot.seats[player.seat]?.kind === 'human')
    .sort((a, b) => Number(b.connected) - Number(a.connected) || a.seat - b.seat);
  return humans[0]?.id ?? snapshot.hostPlayerId;
}

/** Deadlines derive from the phase start so a restart or roster change recomputes them deterministically. */
function computeDeadline(snapshot: RoomSnapshot, game: GameMeta, timing: Timing): { deadline: number | null; timer: GameMeta['timer'] } {
  const { state, phaseSince } = game;
  switch (state.phase) {
    case 'choosing-leader': {
      const team = state.openingTeam ?? 0;
      const humanPresent = humansOnTeam(snapshot, team, true).length > 0;
      return { timer: 'leader', deadline: phaseSince + (humanPresent ? timing.leaderMs : timing.botDelayMs) };
    }
    case 'playing': {
      const slot = snapshot.seats[state.turn];
      const isHuman = slot?.kind === 'human';
      return { timer: 'turn', deadline: phaseSince + (isHuman ? timing.turnMs : timing.botDelayMs) };
    }
    case 'round-over': {
      const winner = state.winner ?? 0;
      const host = snapshot.players[snapshot.hostPlayerId];
      const eligiblePresent = humansOnTeam(snapshot, winner, true).length > 0
        || (host?.connected === true && snapshot.seats[host.seat]?.kind === 'human');
      const wait = eligiblePresent ? timing.roundOverMs : Math.max(timing.roundReviewMs, timing.botDelayMs);
      return { timer: 'round-over', deadline: phaseSince + wait };
    }
    case 'match-over':
      return { timer: null, deadline: null };
  }
}

function refreshGame(snapshot: RoomSnapshot, timing: Timing): RoomSnapshot {
  if (!snapshot.game) return snapshot;
  const { deadline, timer } = computeDeadline(snapshot, snapshot.game, timing);
  if (deadline === snapshot.game.deadline && timer === snapshot.game.timer) return snapshot;
  return { ...snapshot, game: { ...snapshot.game, deadline, timer } };
}

/** Applies a new engine state: resets the phase clock, review window and status. */
function transition(snapshot: RoomSnapshot, state: State, ctx: Ctx, cause: Cause, patch: Partial<GameMeta> = {}): RoomSnapshot {
  const closing = state.phase === 'round-over' || state.phase === 'match-over';
  const game: GameMeta = {
    state, phaseSince: ctx.now, deadline: null, timer: null,
    reviewUntil: closing ? ctx.now + ctx.timing.roundReviewMs : null,
    leaderConfirmedBy: snapshot.game?.leaderConfirmedBy ?? null,
    lastCause: cause,
    ...patch,
  };
  const status = state.phase === 'match-over' ? 'finished' : 'playing';
  return refreshGame({ ...snapshot, status, game }, ctx.timing);
}

function freshDeal(ctx: Ctx): State {
  return prepareMatch(shuffleDeck(createDeck(), ctx.random), ctx.random() < 0.5 ? 0 : 1);
}

function commit(snapshot: RoomSnapshot, ctx: Ctx, partial: Omit<Result, 'snapshot'>): Result {
  return { ...partial, snapshot: { ...snapshot, version: snapshot.version + 1, updatedAt: ctx.now } };
}

function engineAction(snapshot: RoomSnapshot, ctx: Ctx, action: Action, cause: Cause, kind: string): Result {
  const game = requireGame(snapshot);
  const { state, events } = applyAction(game.state, action);
  const next = transition(snapshot, state, ctx, cause);
  const payload: Record<string, unknown> = action.type === 'play' ? { cards: action.cards } : {};
  return commit(next, ctx, {
    engineEvents: events, roomEvents: [], cause, rosterChanged: next.status !== snapshot.status, gameChanged: true,
    audit: { kind, cause, actorSeat: action.player, payload },
  });
}

function dealNextRound(snapshot: RoomSnapshot, ctx: Ctx, expectedRevision: number, cause: Cause): Result {
  const game = requireGame(snapshot);
  const state = prepareNextRound(game.state, shuffleDeck(createDeck(), ctx.random), expectedRevision);
  const next = transition(snapshot, state, ctx, cause, { leaderConfirmedBy: null });
  return commit(next, ctx, {
    engineEvents: [], roomEvents: [{ type: 'round-dealt', round: state.round, trump: state.trump }], cause,
    rosterChanged: false, gameChanged: true, audit: { kind: 'continue', cause, actorSeat: null, payload: { round: state.round } },
  });
}

function takeOverSeat(snapshot: RoomSnapshot, player: Player, ctx: Ctx, kind: string): Result {
  let next: RoomSnapshot = { ...snapshot, seats: withSeat(snapshot.seats, player.seat, { kind: 'bot', reservedFor: player.id }) };
  if (next.hostPlayerId === player.id) next = { ...next, hostPlayerId: chooseHost(next) };
  next = refreshGame(next, ctx.timing);
  return commit(next, ctx, {
    engineEvents: [], roomEvents: [], cause: 'action', rosterChanged: true, gameChanged: false,
    audit: { kind, cause: 'action', actorSeat: player.seat, payload: {} },
  });
}

function removePlayer(snapshot: RoomSnapshot, player: Player, ctx: Ctx, kind: string): Result {
  let next: RoomSnapshot = {
    ...snapshot,
    seats: withSeat(snapshot.seats, player.seat, { kind: 'empty' }),
    players: withoutPlayer(snapshot.players, player.id),
  };
  if (next.hostPlayerId === player.id) next = { ...next, hostPlayerId: chooseHost(next) };
  return commit(next, ctx, {
    engineEvents: [], roomEvents: [], cause: 'action', rosterChanged: true, gameChanged: false,
    audit: { kind, cause: 'action', actorSeat: player.seat, payload: {} },
  });
}

export function applyCommand(snapshot: RoomSnapshot, command: Command, ctx: Ctx): Result {
  switch (command.type) {
    case 'join': {
      if (snapshot.players[command.playerId]) return unchanged(snapshot);
      requireLobby(snapshot);
      const lower = command.name.toLowerCase();
      if (Object.values(snapshot.players).some(player => player.name.toLowerCase() === lower)) {
        throw new RoomError('NAME_TAKEN', 'Someone at this table already uses that name.');
      }
      const seat = snapshot.seats.findIndex(slot => slot.kind === 'empty');
      if (seat < 0) throw new RoomError('ROOM_FULL', 'All eight seats are taken.');
      const player: Player = { id: command.playerId, name: command.name, seat, connected: false, offlineSince: ctx.now, lastSeenAt: ctx.now };
      const next: RoomSnapshot = {
        ...snapshot, seats: withSeat(snapshot.seats, seat, { kind: 'human', playerId: player.id }), players: withPlayer(snapshot.players, player),
      };
      return commit(next, ctx, {
        engineEvents: [], roomEvents: [], cause: 'action', rosterChanged: true, gameChanged: false,
        audit: { kind: 'join', cause: 'action', actorSeat: seat, payload: {} },
      });
    }
    case 'connect': {
      const player = requirePlayer(snapshot, command.playerId);
      const slot = snapshot.seats[player.seat];
      let seats = snapshot.seats;
      let reclaimed = false;
      if (slot?.kind === 'bot' && slot.reservedFor === player.id) {
        seats = withSeat(seats, player.seat, { kind: 'human', playerId: player.id });
        reclaimed = true;
      }
      const updated: Player = { ...player, connected: true, offlineSince: null, lastSeenAt: ctx.now };
      let next: RoomSnapshot = { ...snapshot, seats, players: withPlayer(snapshot.players, updated) };
      // A reclaimed seat on turn gets a full turn again rather than the bot's short fuse.
      if (reclaimed && next.game && next.game.state.phase === 'playing' && next.game.state.turn === player.seat) {
        next = { ...next, game: { ...next.game, phaseSince: ctx.now } };
      }
      next = refreshGame(next, ctx.timing);
      const rosterChanged = !player.connected || reclaimed;
      return commit(next, ctx, {
        engineEvents: [], roomEvents: [], cause: 'action', rosterChanged, gameChanged: false, audit: null,
      });
    }
    case 'disconnect': {
      const player = snapshot.players[command.playerId];
      if (!player || !player.connected) return unchanged(snapshot);
      const updated: Player = { ...player, connected: false, offlineSince: ctx.now, lastSeenAt: ctx.now };
      const next = refreshGame({ ...snapshot, players: withPlayer(snapshot.players, updated) }, ctx.timing);
      return commit(next, ctx, { engineEvents: [], roomEvents: [], cause: 'action', rosterChanged: true, gameChanged: false, audit: null });
    }
    case 'bot-takeover': {
      const player = snapshot.players[command.playerId];
      if (!player || player.connected || player.offlineSince !== command.offlineSince) return unchanged(snapshot);
      if (snapshot.status === 'lobby') return removePlayer(snapshot, player, ctx, 'lobby-timeout');
      if (snapshot.seats[player.seat]?.kind !== 'human') return unchanged(snapshot);
      return takeOverSeat(snapshot, player, ctx, 'bot-takeover');
    }
    case 'leave': {
      const player = snapshot.players[command.playerId];
      if (!player) return unchanged(snapshot);
      if (snapshot.status === 'lobby') return removePlayer(snapshot, player, ctx, 'leave');
      if (snapshot.seats[player.seat]?.kind !== 'human') return unchanged(snapshot);
      const offline: Player = { ...player, connected: false, offlineSince: ctx.now, lastSeenAt: ctx.now };
      return takeOverSeat({ ...snapshot, players: withPlayer(snapshot.players, offline) }, offline, ctx, 'leave');
    }
    case 'move': {
      const player = requirePlayer(snapshot, command.playerId);
      requireLobby(snapshot);
      if (command.seat === player.seat) return unchanged(snapshot);
      const target = snapshot.seats[command.seat];
      if (!target || !(target.kind === 'empty' || (target.kind === 'bot' && target.reservedFor === null))) {
        throw new RoomError('SEAT_TAKEN', 'That seat is taken.');
      }
      const seats = withSeat(withSeat(snapshot.seats, player.seat, { kind: 'empty' }), command.seat, { kind: 'human', playerId: player.id });
      const next: RoomSnapshot = { ...snapshot, seats, players: withPlayer(snapshot.players, { ...player, seat: command.seat }) };
      return commit(next, ctx, {
        engineEvents: [], roomEvents: [], cause: 'action', rosterChanged: true, gameChanged: false,
        audit: { kind: 'move', cause: 'action', actorSeat: command.seat, payload: { from: player.seat } },
      });
    }
    case 'set-bot': {
      requireHost(snapshot, command.playerId);
      requireLobby(snapshot);
      const slot = snapshot.seats[command.seat];
      if (!slot) throw new RoomError('INVALID_PLAYER', 'Unknown seat.');
      if (command.bot) {
        if (slot.kind !== 'empty') throw new RoomError('SEAT_TAKEN', 'Only an empty seat can be given to a computer player.');
      } else if (slot.kind !== 'bot') {
        throw new RoomError('SEAT_TAKEN', 'That seat is not a computer player.');
      }
      const next: RoomSnapshot = { ...snapshot, seats: withSeat(snapshot.seats, command.seat, command.bot ? { kind: 'bot', reservedFor: null } : { kind: 'empty' }) };
      return commit(next, ctx, {
        engineEvents: [], roomEvents: [], cause: 'action', rosterChanged: true, gameChanged: false,
        audit: { kind: 'set-bot', cause: 'action', actorSeat: command.seat, payload: { bot: command.bot } },
      });
    }
    case 'fill-bots': {
      requireHost(snapshot, command.playerId);
      requireLobby(snapshot);
      if (!snapshot.seats.some(slot => slot.kind === 'empty')) return unchanged(snapshot);
      const seats = snapshot.seats.map<SeatSlot>(slot => (slot.kind === 'empty' ? { kind: 'bot', reservedFor: null } : slot));
      return commit({ ...snapshot, seats }, ctx, {
        engineEvents: [], roomEvents: [], cause: 'action', rosterChanged: true, gameChanged: false,
        audit: { kind: 'fill-bots', cause: 'action', actorSeat: null, payload: {} },
      });
    }
    case 'start': {
      requireHost(snapshot, command.playerId);
      requireLobby(snapshot);
      if (snapshot.seats.some(slot => slot.kind === 'empty')) {
        throw new RoomError('SEATS_NOT_FILLED', 'Every seat needs a player or a computer before dealing.');
      }
      const state = freshDeal(ctx);
      const next = transition(snapshot, state, ctx, 'deal', { leaderConfirmedBy: null });
      return commit(next, ctx, {
        engineEvents: [], roomEvents: [{ type: 'round-dealt', round: state.round, trump: state.trump }], cause: 'deal',
        rosterChanged: true, gameChanged: true, audit: { kind: 'start', cause: 'deal', actorSeat: null, payload: { openingTeam: state.openingTeam } },
      });
    }
    case 'confirm-leader': {
      const player = requirePlayer(snapshot, command.playerId);
      const game = requireGame(snapshot);
      if (game.state.phase !== 'choosing-leader') throw new RoomError('BAD_PHASE', 'The opening player has already been chosen.');
      if (snapshot.seats[player.seat]?.kind !== 'human' || TEAMS[player.seat] !== game.state.openingTeam) {
        throw new RoomError('NOT_YOUR_TEAM', 'Only the opening team confirms its opener.');
      }
      const state = chooseLeader(game.state, command.leader, command.expectedRevision);
      const next = transition(snapshot, state, ctx, 'action', { leaderConfirmedBy: { seat: command.leader, playerId: player.id } });
      return commit(next, ctx, {
        engineEvents: [{ type: 'turn-changed', player: state.turn }],
        roomEvents: [{ type: 'leader-chosen', leader: command.leader, bySeat: player.seat }], cause: 'action',
        rosterChanged: false, gameChanged: true, audit: { kind: 'leader', cause: 'action', actorSeat: player.seat, payload: { leader: command.leader } },
      });
    }
    case 'play':
    case 'pickup': {
      const player = requirePlayer(snapshot, command.playerId);
      const game = requireGame(snapshot);
      if (snapshot.seats[player.seat]?.kind !== 'human') throw new RoomError('NOT_SEATED', 'A computer is playing this seat.');
      if (game.state.phase === 'playing' && game.state.turn !== player.seat) throw new RoomError('WRONG_TURN', 'Wait for your turn.');
      const action: Action = command.type === 'play'
        ? { type: 'play', player: player.seat, cards: command.cards, expectedRevision: command.expectedRevision }
        : { type: 'pickup', player: player.seat, expectedRevision: command.expectedRevision };
      return engineAction(snapshot, ctx, action, 'action', command.type);
    }
    case 'continue': {
      const player = requirePlayer(snapshot, command.playerId);
      const game = requireGame(snapshot);
      if (game.state.phase !== 'round-over') throw new RoomError('BAD_PHASE', 'The round is still in play.');
      if (game.reviewUntil !== null && ctx.now < game.reviewUntil) throw new RoomError('REVIEW_IN_PROGRESS', 'Give everyone a moment to review the table.');
      const eligible = snapshot.hostPlayerId === player.id || TEAMS[player.seat] === game.state.winner;
      if (!eligible || snapshot.seats[player.seat]?.kind !== 'human') throw new RoomError('NOT_YOUR_TEAM', 'The winning team deals the next round.');
      return dealNextRound(snapshot, ctx, command.expectedRevision, 'deal');
    }
    case 'rematch': {
      requireHost(snapshot, command.playerId);
      const game = requireGame(snapshot);
      if (game.state.phase !== 'match-over') throw new RoomError('BAD_PHASE', 'The match is not over yet.');
      if (game.reviewUntil !== null && ctx.now < game.reviewUntil) throw new RoomError('REVIEW_IN_PROGRESS', 'Give everyone a moment to review the result.');
      // Revisions stay monotonic across rematches so a stale client action can never match by accident.
      const state: State = { ...freshDeal(ctx), revision: game.state.revision + 1 };
      const next = transition(snapshot, state, ctx, 'deal', { leaderConfirmedBy: null });
      return commit(next, ctx, {
        engineEvents: [], roomEvents: [{ type: 'rematch' }, { type: 'round-dealt', round: state.round, trump: state.trump }], cause: 'deal',
        rosterChanged: true, gameChanged: true, audit: { kind: 'rematch', cause: 'deal', actorSeat: null, payload: {} },
      });
    }
    case 'timer': {
      const game = snapshot.game;
      if (!game || game.timer !== command.timer || game.state.revision !== command.revision) return unchanged(snapshot);
      const { state } = game;
      if (command.timer === 'leader') {
        const leader = chooseComputerLeader(state);
        if (leader === null) return unchanged(snapshot);
        const chosen = chooseLeader(state, leader, state.revision);
        const cause: Cause = snapshot.seats[leader]?.kind === 'bot' ? 'bot' : 'timeout';
        const next = transition(snapshot, chosen, ctx, cause, { leaderConfirmedBy: { seat: leader, playerId: null } });
        return commit(next, ctx, {
          engineEvents: [{ type: 'turn-changed', player: chosen.turn }],
          roomEvents: [{ type: 'leader-chosen', leader, bySeat: null }], cause,
          rosterChanged: false, gameChanged: true, audit: { kind: 'leader', cause, actorSeat: null, payload: { leader } },
        });
      }
      if (command.timer === 'turn') {
        if (state.phase !== 'playing') return unchanged(snapshot);
        const cause: Cause = snapshot.seats[state.turn]?.kind === 'bot' ? 'bot' : 'timeout';
        const cards = findPlay(state);
        const action: Action = cards
          ? { type: 'play', player: state.turn, cards, expectedRevision: state.revision }
          : { type: 'pickup', player: state.turn, expectedRevision: state.revision };
        return engineAction(snapshot, ctx, action, cause, action.type);
      }
      if (state.phase !== 'round-over') return unchanged(snapshot);
      return dealNextRound(snapshot, ctx, state.revision, 'timeout');
    }
  }
}

export { RuleError };
