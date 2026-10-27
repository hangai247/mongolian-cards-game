/** Public presentation data only: no hand identities or private strategy. */
export function chainProgress(table, motion = null) {
  if (motion?.type === 'sleep') return 8;
  const size = table?.highest?.length ?? 0;
  return size ? Math.min(8, Math.max(0, Math.floor(table.pile.length / size))) : 0;
}

export function teamSummary(handCounts, viewer = 0) {
  return [0, 2, 4, 6].map(offset => {
    const seat = (viewer + offset) % 8;
    return { seat, count: handCounts[seat], lastCard: handCounts[seat] === 1 };
  });
}

export function turnGuidance({ phase, turn, table }, motion = null) {
  if (phase !== 'playing' || turn < 0) return { current: null, next: null, currentLabel: '', nextLabel: '', note: '' };
  const current = motion?.player ?? turn;
  if (motion) return { current, next: null, currentLabel: 'Playing', nextLabel: '', note: '' };
  const nearSleep = chainProgress(table) === 7;
  return { current, next: (current + 1) % 8,
    currentLabel: nearSleep ? 'Beat → lead again' : 'Playing',
    nextLabel: nearSleep ? 'After pickup' : 'Next',
    note: nearSleep ? 'Beat → lead again; pickup → next seat, unless the round ends.' : 'Next seat acts if the round continues.' };
}

export function defenseMessage(analysis, selectedCount, targetCount) {
  const covered = analysis.assignments.length;
  if (analysis.reason === 'jokers-must-play-alone') return 'Jokers play alone. Remove jokers from a multi-card defense.';
  if (analysis.valid) return 'Every card covered — ready to play.';
  if (selectedCount > targetCount) return `Remove ${selectedCount - targetCount} extra card${selectedCount - targetCount === 1 ? '' : 's'}. ${covered} of ${targetCount} covered.`;
  if (selectedCount < targetCount) return `${covered} of ${targetCount} covered — select ${targetCount - selectedCount} more card${targetCount - selectedCount === 1 ? '' : 's'}${covered < selectedCount ? ' and replace unused cards' : ''}.`;
  return `${covered} of ${targetCount} covered — replace unused cards to cover every target.`;
}
