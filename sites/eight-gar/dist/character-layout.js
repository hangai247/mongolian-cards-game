// Public presentation coordinates shared by the artwork, badges and live card fans.
export const CHARACTER_NAMES = ['temu','bataa','sarnai','anu','bold','naraa','oyu'];
export function seatLayout(width, seat) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(seat) || seat < 1 || seat > 7) throw new RangeError('Invalid seat layout');
  const i = seat - 1, mobile = width <= 700;
  const scale = mobile ? Math.min(width / 390, 1.4) : Math.min(width / 1440, 1.22);
  const x = (mobile ? [.12,.15,.33,.50,.67,.85,.88] : [.07,.22,.36,.50,.64,.78,.93])[i] * width;
  const top = mobile ? [390,215,140,130,140,215,390][i] * scale : [200,162,140,132,140,162,200][i] * Math.max(.86,scale);
  const height = (mobile ? [170,155,140,140,140,155,170] : [346,300,262,259,262,300,346])[i] * scale;
  const fanScale = Math.min(mobile ? .64 : 1.15, height / 305);
  return { x, top, width:height*.75, height, labelTop:top-(mobile?29:36), handX:x+height*(i===0?.055:i===5?.035:0), handY:top+height*.835, fanScale, z:Math.abs(3-i) };
}
// Small, bounded movements preserve photographic anatomy and never affect game state.
export function poseFor({seat, time=0, status=null, active=false, won=false, still=false}) {
  if(still)return {breath:0,head:0,lean:0,reach:0};
  return {
    breath:Math.sin(time*1.35+seat*.93)*.0022,
    head:Math.sin(time*.55+seat*1.7)*.008+(active?.009:0),
    lean:status==='pickup'?.018:status==='play'?.012:status==='refill'?.009:won?-.008:active?.004:0,
    reach:status==='pickup'?1:status==='play'?.8:status==='refill'?.45:0,
  };
}
