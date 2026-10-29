/** A live table inspector must never become a history of picked-up/sleeping cards. */
export function invalidatePileInspection(dialog, container, pile) {
  if (!dialog.open) return false;
  const shown = [...container.children].map(node => node.dataset.publicId);
  if (shown.length === pile.length && shown.every((id, index) => id === pile[index].id)) return false;
  container.replaceChildren();
  dialog.close();
  return true;
}
