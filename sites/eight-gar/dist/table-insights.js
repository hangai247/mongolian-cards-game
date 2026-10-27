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
  if (motion) return { current, next: null, currentLabel: 'Тоглож байна', nextLabel: '', note: '' };
  const nearSleep = chainProgress(table) === 7;
  return { current, next: (current + 1) % 8,
    currentLabel: nearSleep ? 'Дарвал → дахин эхэлнэ' : 'Тоглож байна',
    nextLabel: nearSleep ? 'Авбал дараагийнх' : 'Дараагийнх',
    note: nearSleep ? 'Үе дуусаагүй бол: дарвал → дахин эхэлнэ; авбал → дараагийн тоглогч эхэлнэ.' : 'Үргэлжилбэл дараагийн тоглогч нүүнэ.' };
}

export function defenseMessage(analysis, selectedCount, targetCount) {
  const covered = analysis.assignments.length;
  if (analysis.reason === 'jokers-must-play-alone') return 'Жокерийг дангаар нь тавина. Олон хөзрөөр дарах бол жокерийг хасна уу.';
  if (analysis.valid) return 'Бүх хөзрийг дарлаа — тавихад бэлэн.';
  if (selectedCount > targetCount) return `Илүү ${selectedCount - targetCount} хөзрийг хасна уу. ${targetCount} хөзрөөс ${covered}-ийг дарлаа.`;
  if (selectedCount < targetCount) return `${targetCount} хөзрөөс ${covered}-ийг дарлаа — дахиад ${targetCount - selectedCount} хөзөр сонгоно уу${covered < selectedCount ? ', мөн дарахгүй байгаа хөзрөө солино уу' : ''}.`;
  return `${targetCount} хөзрөөс ${covered}-ийг дарлаа — бүгдийг дарахын тулд дарахгүй байгаа хөзрөө солино уу.`;
}
