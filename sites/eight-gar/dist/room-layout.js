// Artwork and live overlays use the same source coordinates, without image distortion.
const wide = {
  image: 'assets/ger-table-wide-v4.jpg', width: 1672, height: 941,
  labels: [[155,820],[137,434],[348,337],[580,305],[855,280],[1130,314],[1375,375],[1575,450]],
  hands: [null,[145,505],[370,396],[580,361],[835,340],[1130,370],[1330,440],[1550,515]],
  play: [560,440,550,195],
};
const tall = {
  image: 'assets/ger-table-portrait-v4.jpg', width: 934, height: 1684,
  labels: [[467,1000],[110,675],[226,510],[310,430],[467,407],[625,437],[724,531],[823,675]],
  hands: [null,[102,756],[220,575],[320,495],[470,470],[630,500],[750,602],[842,756]],
  play: [230,668,474,300],
};
export function roomLayout(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new RangeError('Invalid room size');
  const source = height / width > .82 ? tall : wide;
  const scale = Math.min(width / source.width, height / source.height);
  const x = (width - source.width * scale) / 2, y = source === tall ? 0 : (height - source.height * scale) / 2;
  const point = ([px,py]) => ({x:x+px*scale,y:y+py*scale});
  const labelWidth = Math.min(source===tall?132:156, Math.max(44, source.width*scale*(source===tall?.18:.105)));
  const [px,py,pw,ph] = source.play;
  return {
    portrait:source===tall,image:source.image,x,y,width:source.width*scale,height:source.height*scale,
    imageTop:0,imageHeight:source.height*scale,
    play:{...point([px,py]),x:Math.max(0,point([px,py]).x-(Math.max(110,pw*scale)-pw*scale)/2),width:Math.max(110,pw*scale),height:Math.max(52,ph*scale)},
    seats:source.labels.map((label,seat)=>{
      const pos=point(label),hand=source.hands[seat]&&point(source.hands[seat]);
      return {...pos,x:Math.max(seat===0?64:labelWidth/2,Math.min(width-(seat===0?64:labelWidth/2),pos.x)),y:Math.max(24,Math.min(height-24,pos.y)),width:labelWidth,handX:hand?.x??pos.x,handY:hand?Math.min(height,hand.y+16*scale):pos.y,
        fanScale:Math.max(.15,Math.min(1,scale*1.12)),seat};
    }),
  };
}
