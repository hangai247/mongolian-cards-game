/** Lobby team helpers. Teams are fixed by seat parity (seats 1·3·5·7 vs 2·4·6·8), so "choosing a team"
 *  means moving to an open seat of the other parity. Pure functions over the roster the server sends. */

/** A seat a player may move into: empty, or a bot nobody is reclaiming. */
export const isOpenSeat = info => info.kind === 'empty' || (info.kind === 'bot' && !info.reservedForName);

/** The roster split into the viewer's team first, then the opposing team. */
export function teamGroups(seats, me) {
  const mine = seats[me]?.team ?? 0;
  const group = team => ({ team, ours: team === mine, seats: seats.filter(info => info.team === team) });
  return [group(mine), group(mine === 0 ? 1 : 0)];
}

/** The seat a "switch team" request should target, or null when the other team has no open seat. */
export function switchTeamTarget(seats, me) {
  const mine = seats[me]?.team ?? 0;
  return seats.find(info => info.team !== mine && isOpenSeat(info))?.seat ?? null;
}
