const rect = node => {
  const r=node?.getBoundingClientRect();
  return r&&r.width&&r.height?{x:r.left,y:r.top,width:r.width,height:r.height}:null;
};
// Measure the face, not its rotated bounding box, so a landing matches the
// resting card without changing size or straightening at the final render.
function pose(node) {
  const bounds=rect(node);
  if(!bounds)return null;
  const matrix=new DOMMatrixReadOnly(getComputedStyle(node).transform);
  const angle=Math.atan2(matrix.b,matrix.a),c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
  const divisor=c*c-s*s;
  if(Math.abs(divisor)<.01)return {...bounds,angle:0};
  const width=(bounds.width*c-bounds.height*s)/divisor;
  const height=(bounds.height*c-bounds.width*s)/divisor;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return {...bounds,angle:0};
  return {x:bounds.x+(bounds.width-width)/2,y:bounds.y+(bounds.height-height)/2,width,height,angle:angle*180/Math.PI};
}
const transform = (box,angle=box.angle||0) => `translate3d(${box.x+(box.width-93)/2}px,${box.y+(box.height-136)/2}px,0) rotate(${angle}deg) scale(${box.width/93},${box.height/136})`;
const between = (a,b,lift=0) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2-lift,width:(a.width+b.width)/2,height:(a.height+b.height)/2});
const publicCard=id=>document.querySelector(`#highest [data-public-id="${CSS.escape(id)}"]`);
const ownCard=id=>document.querySelector(`#hand [data-card-id="${CSS.escape(id)}"]`);
const backs=player=>[...document.querySelectorAll(`.seat-${player} .hand-back`)];
const fallback=()=>rect(document.querySelector('#highest'))||{x:innerWidth/2,y:innerHeight/2,width:50,height:75};
function source(step,i){
  if(step.type==='pickup'||step.type==='sleep')return publicCard(step.cards[i].id);
  if(step.type==='refill')return document.querySelector('.tiny-deck');
  return step.player===0?ownCard(step.cards[i].id):backs(step.player).at(-1-i);
}
function destination(step,i){
  if(step.type==='play')return publicCard(step.cards[i].id);
  if(step.player===0)return ownCard(step.cards[i].id);
  return backs(step.player)[step.before.hands[step.player].length+i];
}
export async function animateStep(step,{render,cardElement,signal,motionEnabled=true}) {
  if(signal.aborted)return;
  if(!motionEnabled||matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden){render(step.after,null);return;}
  const sources=step.cards.map((_,i)=>pose(source(step,i))||(step.type==='play'?rect(document.querySelector(`.seat-${step.player}`)):null)||fallback());
  const pile=sources.length?{
    x:sources.reduce((sum,p)=>sum+p.x+p.width/2,0)/sources.length-sources.at(-1).width/2,
    y:sources.reduce((sum,p)=>sum+p.y+p.height/2,0)/sources.length-sources.at(-1).height/2,
    width:sources.at(-1).width,height:sources.at(-1).height
  }:fallback();
  render(step.after,{type:step.type,player:step.player,beforeCounts:step.before.hands.map(h=>h.length)});
  const targets=step.cards.map((_,i)=>step.type==='sleep'?null:destination(step,i));
  const destinations=targets.map((target,i)=>{
    const from=sources[i];
    let to=step.type==='sleep'?{...from,x:innerWidth-45,y:Math.min(innerHeight-50,from.y+110),width:15,height:22}:pose(target)||rect(document.querySelector(`.seat-${step.player}`))||fallback();
    // Keep an offscreen hand destination at its visible edge; scrolling stays user-controlled.
    if(step.player===0 && step.type!=='play' && step.type!=='sleep'){
      const hand=rect(document.getElementById('hand'));
      if(hand)to={...to,x:Math.min(Math.max(to.x,hand.x+10),hand.x+hand.width-to.width-10)};
    }
    return to;
  });
  const pickupDestination=destinations.length?{
    ...pile,
    x:destinations.reduce((sum,p)=>sum+p.x+p.width/2,0)/destinations.length-pile.width/2,
    y:destinations.reduce((sum,p)=>sum+p.y+p.height/2,0)/destinations.length-pile.height/2
  }:pile;
  targets.forEach(n=>{if(n)n.style.visibility='hidden';});
  const layer=document.getElementById('card-motion');layer.dataset.motion=step.type;
  const animations=[],shells=[];
  const cancel=()=>animations.forEach(a=>a.cancel());
  signal.addEventListener('abort',cancel,{once:true});
  try {
    step.cards.forEach((card,i)=>{
      const from=sources[i],to=destinations[i];
      const shell=document.createElement('div');shell.className='flying-card';shell.setAttribute('aria-hidden','true');
      shell.style.width='93px';shell.style.height='136px';
      const lift=document.createElement('div');lift.className='flying-lift';
      const turn=document.createElement('div');turn.className='flying-turn';
      const privateDraw=step.type==='refill' && step.player!==0;
      const front=privateDraw?document.createElement('div'):cardElement(card),back=document.createElement('div');
      if(privateDraw) front.className='anonymous-flight';
      front.classList.add('flight-front');back.className='flight-back';turn.append(front,back);lift.append(turn);shell.append(lift);layer.append(shell);shells.push(shell);
      const beginBack=step.type==='refill'||(step.type==='play'&&step.player!==0);
      const endBack=step.type==='sleep'||(step.type!=='play'&&step.player!==0);
      const pickup=step.type==='pickup',play=step.type==='play';
      const duration=step.type==='sleep'?650:pickup?1000:step.type==='refill'?650:760;
      const delay=pickup?0:i*Math.min(48,250/Math.max(1,step.cards.length-1));
      const easing='cubic-bezier(.25,.05,.25,1)';
      const frame=(box,offset,angle=box.angle||0)=>({transform:transform(box,angle),offset,opacity:1,easing});
      const end=frame(to,1);end.opacity=step.type==='sleep'?0:1;
      let path;
      if(pickup){
        // All cards gather on the felt on the same clock, then leave as a stack.
        // Bound the stack thickness even for the largest possible pickup.
        const edge=i*Math.min(.55,9/Math.max(1,step.cards.length-1));
        const stack={...pile,x:pile.x+edge*.3,y:pile.y-edge};
        const travel=between(pile,pickupDestination,55);
        travel.x+=edge*.3;travel.y-=edge;
        // Maintain one stack size until the final approach into the hand fan.
        travel.width=pile.width;travel.height=pile.height;
        path=[frame(from,0),frame(stack,.27,-1),frame({...stack,y:stack.y-6},.36,-2),frame(travel,.68,-5),end];
      }else{
        const apex=between(from,to,Math.min(85,Math.abs(from.y-to.y)*.22+30));
        path=[frame(from,0),frame(apex,.48,play?4:6)];
        if(play)path.push(frame({...to,y:to.y-1},.86,(to.angle||0)+1.2));
        path.push(end);
      }
      const movement=shell.animate(path,{duration,delay,fill:'both'});
      const contact='0 3px 3px #0003,1px 6px 9px #0004';
      const raised='2px 15px 22px #0004,0 5px 9px #0002';
      const tilt=(offset,x,y,shadow)=>({offset,transform:`perspective(700px) rotateX(${x}deg) rotateY(${y}deg)`,boxShadow:shadow,easing});
      const liftFrames=[tilt(0,0,0,contact)];
      if(pickup)liftFrames.push(tilt(.27,0,0,contact));
      liftFrames.push(tilt(pickup ? .68 : .48,play?7:5,pickup?-5:4,raised));
      if(play)liftFrames.push(tilt(.86,-1,0,contact));
      liftFrames.push(tilt(1,0,0,contact));
      const elevation=lift.animate(liftFrames,{duration,delay,fill:'both'});
      const flip=turn.animate([{transform:`rotateY(${beginBack?180:0}deg)`},{transform:`rotateY(${endBack?180:0}deg)`}],{duration:duration*(pickup ? .5 : .7),delay:delay+duration*(pickup ? .4 : .15),easing:'ease-in-out',fill:'both'});
      animations.push(movement,elevation,flip);
    });
    if(signal.aborted)cancel();
    await Promise.allSettled(animations.map(a=>a.finished));
  } finally {
    signal.removeEventListener('abort',cancel);animations.forEach(a=>a.cancel());shells.forEach(n=>n.remove());
    targets.forEach(n=>{if(n)n.style.visibility='';});delete layer.dataset.motion;
    if (!signal.aborted) render(step.after,null);
  }
}
