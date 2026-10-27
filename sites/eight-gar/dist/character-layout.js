// Public presentation coordinates shared by the artwork, badges and live card fans.
export const CHARACTER_NAMES = ['temu','bataa','sarnai','anu','bold','naraa','oyu'];
export function seatLayout(width, seat, availableHeight) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(seat) || seat < 1 || seat > 7) throw new RangeError('Invalid seat layout');
  if (availableHeight !== undefined) {
    if (!Number.isFinite(availableHeight) || availableHeight <= 0) throw new RangeError('Invalid portrait band height');
    const i = seat - 1, slot = width / 7, near = Math.abs(i - 3) / 3;
    const labelHeight = width <= 700 ? 34 : 40;
    // Bring the end seats forward and lift the center seats along the oval's far rail.
    const arc = Math.min(32, availableHeight * .16), curve = near * near;
    const height = Math.max(12, Math.min(availableHeight - labelHeight - arc - 4, slot * 1.28)) * (1 - .08 * (1 - near));
    const top = availableHeight - arc * (1 - curve) - height;
    const x = (i + .5) * slot;
    return { x, top, width: height * .75, height, labelTop: 2 + arc * curve, handX: x, handY: top + height * .84,
      fanScale: Math.min(1, height / 305, slot / 150), z: near };
  }
  const i = seat - 1, mobile = width <= 700;
  const scale = mobile ? Math.min(width / 390, 1.4) : Math.min(width / 1440, 1.22);
  const x = (mobile ? [.12,.15,.33,.50,.67,.85,.88] : [.07,.22,.36,.50,.64,.78,.93])[i] * width;
  const top = mobile ? [390,215,140,130,140,215,390][i] * scale : [200,162,140,132,140,162,200][i] * Math.max(.86,scale);
  const height = (mobile ? [170,155,140,140,140,155,170] : [346,300,262,259,262,300,346])[i] * scale;
  const fanScale = Math.min(mobile ? .64 : 1.15, height / 305);
  return { x, top, width:height*.75, height, labelTop:top-(mobile?29:36), handX:x+height*(i===0?.055:i===5?.035:0), handY:top+height*.835, fanScale, z:Math.abs(3-i) };
}
// Small, bounded movements preserve photographic anatomy and never affect game state.
export function poseFor({seat, time=0, status=null, active=false, won=false, still=false, reaction=0, reactionType=null}) {
  if(still)return {breath:0,head:0,lean:0,reach:0};
  return {
    breath:Math.sin(time*1.35+seat*.93)*.0022,
    head:Math.sin(time*.55+seat*1.7)*.008+(active?.009:0)+reaction*(reactionType==='surprise'?.022:-.014),
    lean:(status==='pickup'?.018:status==='play'?.012:status==='refill'?.009:won?-.008:active?.004:0)-reaction*.008,
    reach:status==='pickup'?1:status==='play'?.8:status==='refill'?.45:0,
  };
}
