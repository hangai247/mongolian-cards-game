const rect = node => {
  const r=node?.getBoundingClientRect();
  return r&&r.width&&r.height?{x:r.left,y:r.top,width:r.width,height:r.height}:null;
};
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
  const sources=step.cards.map((_,i)=>rect(source(step,i))||fallback());
  render(step.after,{type:step.type,player:step.player,beforeCounts:step.before.hands.map(h=>h.length)});
  const targets=step.cards.map((_,i)=>step.type==='sleep'?null:destination(step,i));
  targets.forEach(n=>{if(n)n.style.visibility='hidden';});
  const layer=document.getElementById('card-motion');layer.dataset.motion=step.type;
  const animations=[],shells=[];
  const cancel=()=>animations.forEach(a=>a.cancel());
  signal.addEventListener('abort',cancel,{once:true});
  try {
    step.cards.forEach((card,i)=>{
      const from=sources[i];let to=step.type==='sleep'?{...from,x:innerWidth-45,y:Math.min(innerHeight-50,from.y+110),width:15,height:22}:rect(targets[i])||rect(document.querySelector(`.seat-${step.player}`))||fallback();
      // Keep an offscreen hand destination at its visible edge; horizontal hand scroll remains user-controlled.
      if(step.player===0 && step.type!=='play' && step.type!=='sleep'){
        const hand=rect(document.getElementById('hand'));
        if(hand)to={...to,x:Math.min(Math.max(to.x,hand.x+10),hand.x+hand.width-to.width-10)};
      }
      const shell=document.createElement('div');shell.className='flying-card';shell.setAttribute('aria-hidden','true');
      shell.style.width='93px';shell.style.height='136px';
      const turn=document.createElement('div');turn.className='flying-turn';
      const privateDraw=step.type==='refill' && step.player!==0;
      const front=privateDraw?document.createElement('div'):cardElement(card),back=document.createElement('div');
      if(privateDraw) front.className='anonymous-flight';
      front.classList.add('flight-front');back.className='flight-back';turn.append(front,back);shell.append(turn);layer.append(shell);shells.push(shell);
      const beginBack=step.type==='refill'||(step.type==='play'&&step.player!==0);
      const endBack=step.type==='sleep'||(step.type!=='play'&&step.player!==0);
      const duration=step.type==='sleep'?650:step.type==='pickup'?900:step.type==='refill'?650:700;
      const delay=i*Math.min(48,250/Math.max(1,step.cards.length-1));
      const startX=from.width/93,startY=from.height/136;
      const start=`translate3d(${from.x}px,${from.y}px,0) scale(${startX},${startY}) rotate(0deg)`;
      const sx=to.width/93,sy=to.height/136;
      const midX=(from.x+to.x)/2,midY=(from.y+to.y)/2-Math.min(95,Math.abs(from.y-to.y)*.25+35);
      const movement=shell.animate([{transform:start,opacity:1},{transform:`translate3d(${midX}px,${midY}px,0) scale(${(startX+sx)/2},${(startY+sy)/2}) rotate(${step.type==='pickup'?-9:6}deg)`,offset:.5,opacity:1},{transform:`translate3d(${to.x}px,${to.y}px,0) scale(${sx},${sy}) rotate(0deg)`,opacity:step.type==='sleep'?0:1}],{duration,delay,easing:'cubic-bezier(.3,.05,.2,1)',fill:'both'});
      const flip=turn.animate([{transform:`rotateY(${beginBack?180:0}deg)`},{transform:`rotateY(${endBack?180:0}deg)`}],{duration:duration*.7,delay:delay+duration*.15,easing:'ease-in-out',fill:'both'});
      animations.push(movement,flip);
    });
    if(signal.aborted)cancel();
    await Promise.allSettled(animations.map(a=>a.finished));
  } finally {
    signal.removeEventListener('abort',cancel);animations.forEach(a=>a.cancel());shells.forEach(n=>n.remove());
    targets.forEach(n=>{if(n)n.style.visibility='';});delete layer.dataset.motion;
    if (!signal.aborted) render(step.after,null);
  }
}
