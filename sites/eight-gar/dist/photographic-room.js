import { layoutTablePile } from './viewport-table.js';
import { roomLayout } from './room-layout.js';

/** A coherent generated room with live public seat labels and card fans. No WebGL is required. */
export class CharacterRoom {
  constructor(host) {
    this.host=host; this.snapshot=null; this.animations=[];
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
    this.stage=document.createElement('div');this.stage.className='room-scene';
    this.image=new Image();this.image.alt='';this.image.className='room-photo';this.image.decoding='async';
    this.stage.append(this.image);host.replaceChildren(this.stage);host.dataset.renderer='photographic-scene';
    this.image.addEventListener('error',()=>{host.dataset.renderer='fallback';this.stage.classList.add('art-unavailable');});
    this.image.addEventListener('load',()=>{host.dataset.renderer='photographic-scene';this.image.style.visibility='';this.stage.classList.remove('art-unavailable');});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
    host.closest('.felt').addEventListener('pilechange',()=>this.resize());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clearReaction();});
    this.reduced.addEventListener('change',()=>this.clearReaction());
    this.resize();
  }
  resize() {
    const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;
    this.layout=roomLayout(width,height);const p=this.layout;
    Object.assign(this.stage.style,{left:`${p.x}px`,top:`${p.y}px`,width:`${p.width}px`,height:`${p.height}px`});
    Object.assign(this.image.style,{top:`${p.imageTop}px`,height:`${p.imageHeight}px`});
    if(this.image.getAttribute('src')!==p.image){this.image.style.visibility='hidden';this.image.src=p.image;}
    const felt=this.host.closest('.felt');felt.classList.toggle('portrait-scene',p.portrait);
    felt.style.setProperty('--room-image',`url('${p.image}')`);
    const center=felt.querySelector('.table-center');
    const pile=felt.querySelector('#highest');
    const count=pile.querySelectorAll('.table-play').length;
    if(count>1){
      const top=p.seats[4].y+28;
      p.play.height=Math.max(p.play.height,Math.min(240,height-top-6));
      p.play.y=Math.max(top,Math.min(p.play.y,height-p.play.height-6));
      p.play.height=Math.min(p.play.height,height-p.play.y-6);
    }
    // Short landscape needs the far-seat labels above the pile, not across its layers.
    if(count>3 && height<280 && innerWidth>innerHeight){
      for(const seat of p.seats)if(seat.seat>=2&&seat.seat<=6)seat.y=Math.min(seat.y,34);
      p.play.y=64;p.play.height=Math.max(1,height-70);
    }
    Object.assign(center.style,{left:`${p.play.x}px`,top:`${p.play.y}px`,width:`${p.play.width}px`,height:`${p.play.height}px`});
    this.layoutSeats();
    layoutTablePile(pile);
  }
  layoutSeats() {
    if(!this.layout)return;
    for(const p of this.layout.seats){
      const node=document.querySelector(`.seat-${p.seat}`);if(!node)continue;
      Object.assign(node.style,{left:`${p.x}px`,top:`${p.y}px`,width:`${p.width}px`});
      const fan=node.querySelector('.opponent-hand');
      if(fan)Object.assign(fan.style,{left:`calc(50% + ${p.handX-p.x}px)`,top:`${p.handY-p.y-82+node.getBoundingClientRect().height/2}px`,transform:`translateX(-50%) scale(${p.fanScale})`});
    }
  }
  update(snapshot,motion=null) {
    this.snapshot=snapshot;this.motion=motion;
    if(snapshot.paused||snapshot.motionEnabled===false)this.clearReaction();
    this.resize();
  }
  clearReaction() { for(const animation of this.animations)animation.cancel();this.animations=[]; }
  react(event) {
    if(document.hidden||this.reduced.matches||this.snapshot?.paused||this.snapshot?.motionEnabled===false)return;
    this.clearReaction();
    for(const p of this.layout?.seats ?? []){
      if(event.type==='win'?p.seat%2!==event.team:p.seat!==event.player)continue;
      const node=document.querySelector(`.seat-${p.seat}`);if(!node?.animate)continue;
      this.animations.push(node.animate([{filter:'brightness(1)'},{filter:'brightness(1.65)'},{filter:'brightness(1)'}],{duration:1000}));
    }
  }
}
