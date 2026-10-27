// Source-image coordinates keep every public label and card fan attached to its seat.
// The image is cropped only through room decoration; all seven people stay visible.
const wide = {
  image: 'assets/table-room-v2.jpg', width: 1536, height: 1024, cropTop: 180, cropHeight: 820,
  labels: [[768,955],[205,800],[295,600],[520,530],[768,500],[1015,535],[1240,610],[1350,815]],
  hands: [null,[190,590],[335,510],[490,460],[755,450],[1050,470],[1280,535],[1410,625]],
  play: [400,590,736,310],
};
const tall = {
  image: 'assets/table-room-mobile-v2.jpg', width: 1024, height: 1536, cropTop: 265, cropHeight: 1150,
  labels: [[512,1350],[170,970],[245,745],[340,570],[510,550],[680,585],[800,765],[880,1000]],
  hands: [null,[160,810],[235,615],[335,520],[505,510],[715,535],[850,670],[915,865]],
  play: [265,770,490,490],
};
export function roomLayout(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new RangeError('Invalid room size');
  const source = height / width > .82 ? tall : wide;
  const scale = Math.min(width / source.width, height / source.cropHeight);
  const x = (width - source.width * scale) / 2, y = (height - source.cropHeight * scale) / 2;
  const point = ([px,py]) => ({ x: x + px * scale, y: y + (py - source.cropTop) * scale });
  const labelWidth = Math.min(112, Math.max(44, source.width * scale * (source === tall ? .14 : .115)));
  const [px,py,pw,ph] = source.play;
  const playPoint = point([px,py]);
  const playHeight = Math.min(height - 12, Math.max(110, ph * scale));
  return {
    portrait: source === tall, image: source.image, x, y, width: source.width * scale, height: source.cropHeight * scale,
    imageTop: -source.cropTop * scale, imageHeight: source.height * scale,
    play: { ...playPoint, y: Math.min(playPoint.y, height - playHeight - 6), width: pw * scale, height: playHeight },
    seats: source.labels.map((label,seat) => {
      const pos=point(label), hand=source.hands[seat] && point(source.hands[seat]);
      return { ...pos, y: Math.max(24, Math.min(height-24,pos.y)), width: labelWidth, handX: hand?.x ?? pos.x, handY: hand?.y ?? pos.y,
        fanScale: Math.max(.15, Math.min(.72, scale * .9)), seat };
    }),
  };
}
