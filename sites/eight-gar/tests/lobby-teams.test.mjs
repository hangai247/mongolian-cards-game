import test from 'node:test';
import assert from 'node:assert/strict';
import { isOpenSeat, teamGroups, switchTeamTarget } from '../dist/lobby-teams.js';

const seat = (i, kind = 'empty', extra = {}) => ({ seat: i, team: i % 2, kind, reservedForName: null, ...extra });
const roster = kinds => kinds.map((kind, i) => typeof kind === 'string' ? seat(i, kind) : seat(i, kind.kind, kind));

test('open seats are empty seats and unreserved bots', () => {
  assert.equal(isOpenSeat(seat(0)), true);
  assert.equal(isOpenSeat(seat(1, 'bot')), true);
  assert.equal(isOpenSeat(seat(2, 'bot', { reservedForName: 'Bat' })), false);
  assert.equal(isOpenSeat(seat(3, 'human')), false);
});

test('groups list the viewer team first and keep seat order', () => {
  const seats = roster(['human', 'human', 'empty', 'empty', 'bot', 'empty', 'empty', 'empty']);
  const [ours, theirs] = teamGroups(seats, 1);
  assert.equal(ours.team, 1); assert.equal(ours.ours, true);
  assert.deepEqual(ours.seats.map(s => s.seat), [1, 3, 5, 7]);
  assert.equal(theirs.team, 0); assert.equal(theirs.ours, false);
  assert.deepEqual(theirs.seats.map(s => s.seat), [0, 2, 4, 6]);
});

test('switching targets the first open seat on the other team', () => {
  const seats = roster(['human', 'human', 'human', { kind: 'bot', reservedForName: 'Bat' }, 'bot', 'empty', 'empty', 'empty']);
  assert.equal(switchTeamTarget(seats, 0), 5, 'seat 1 is taken and the bot at 3 is reserved, so the first open seat is 5');
  assert.equal(switchTeamTarget(seats, 1), 4, 'unreserved bot seats count as open');
});

test('switching is impossible when the other team is full', () => {
  const seats = roster(['human', 'human', 'human', 'human', 'human', 'human', 'human', 'empty']);
  assert.equal(switchTeamTarget(seats, 7), null);
  assert.equal(switchTeamTarget(seats, 0), 7);
});
