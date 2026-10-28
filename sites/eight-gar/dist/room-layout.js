// Artwork and live overlays use the same source coordinates, without image distortion.
const wide = {
  image: 'assets/ger-room-wide-v5.jpg', width: 1672, height: 941,
  actorHeights: [0, 420, 350, 310, 290, 310, 350, 420],
  tableEdge: [[0,570],[145,550],[370,435],[580,395],[835,375],[1130,405],[1330,480],[1550,560],[1672,600],[1672,941],[0,941]],
  labels: [[155,820],[137,434],[348,337],[580,305],[855,280],[1130,314],[1375,375],[1575,450]],
  hands: [null,[145,505],[370,396],[580,361],[835,340],[1130,370],[1330,440],[1550,515]],
  play: [560,440,550,195],
};
const tall = {
  image: 'assets/ger-room-portrait-v5.jpg', width: 934, height: 1684,
  actorHeights: [0, 400, 340, 310, 300, 310, 340, 400],
  tableEdge: [[0,850],[102,800],[220,620],[320,540],[470,515],[630,545],[750,647],[842,800],[934,850],[934,1684],[0,1684]],
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
  const labelWidth = Math.min(source===tall?132:156, Math.max(68, source.width*scale*(source===tall?.18:.105)));
  const [px,py,pw,ph] = source.play;
  return {
    portrait:source===tall,compactLabels:source===tall&&width<=700,image:source.image,x,y,width:source.width*scale,height:source.height*scale,
    imageTop:0,imageHeight:source.height*scale,
    tableMask: `polygon(${source.tableEdge.map(([x,y]) => `${x/source.width*100}% ${y/source.height*100}%`).join(',')})`,
    actors: source.hands.slice(1).map(([hx,hy], index) => {
      const height = source.actorHeights[index+1], width = height * .75;
      return { seat: index+1, x: (hx-width/2)*scale, y: (hy-height*.81)*scale, width: width*scale, height: height*scale,
        z: Math.abs(4-(index+1))+1 };
    }),
    play:{...point([px,py]),x:Math.max(0,point([px,py]).x-(Math.max(110,pw*scale)-pw*scale)/2),width:Math.max(110,pw*scale),height:Math.max(52,ph*scale)},
    seats:source.labels.map((label,seat)=>{
      const pos=point(label),hand=source.hands[seat]&&point(source.hands[seat]);
      if(source===wide&&width<=700&&seat===6)pos.x=Math.min(pos.x,width-labelWidth*1.5-6);
      if(source===tall&&width<=700){
        if(seat===3)pos.x=width/2-labelWidth-6;
        if(seat===5)pos.x=width/2+labelWidth+6;
        if(seat===1||seat===2)pos.x=labelWidth/2+6;
        if(seat===6||seat===7)pos.x=width-labelWidth/2-6;
      }
      return {...pos,x:Math.max(seat===0?64:labelWidth/2,Math.min(width-(seat===0?64:labelWidth/2),pos.x)),y:Math.max(24,Math.min(height-24,pos.y)),width:labelWidth,handX:hand?.x??pos.x,handY:hand?Math.min(height,hand.y+16*scale):pos.y,
        fanScale:Math.max(.15,Math.min(1,scale*1.12)),seat};
    }),
  };
}
