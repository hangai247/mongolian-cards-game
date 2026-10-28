import { layoutTablePile } from './viewport-table.js?v=ger3';
import { roomLayout } from './room-layout.js?v=avatars1';
import { AVATARS, normalizeAvatar } from './rules/avatars.js';
import { avatarImage } from './avatar-picker.js';

/** Still character cutouts over a people-free room. Only public avatar IDs enter this renderer. */
export class CharacterRoom {
  constructor(host) {
    this.host=host; host.classList.add('ready'); this.snapshot=null; this.animations=[];
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
    this.stage=document.createElement('div');this.stage.className='room-scene';
    this.image=new Image();this.image.alt='';this.image.className='room-photo';this.image.decoding='async';
    this.actors=Array.from({length:7},(_,index)=>{
      const img=new Image();img.alt='';img.className='room-actor';img.dataset.seat=index+1;img.hidden=true;img.decoding='async';
      img.addEventListener('error',()=>{img.hidden=true;img.dataset.failed='true';this.layoutSeats();});
      img.addEventListener('load',()=>{delete img.dataset.failed;img.hidden=!this.snapshot?.avatars?.[index+1];this.layoutSeats();});
      return img;
    });
    this.tableMask=new Image();this.tableMask.alt='';this.tableMask.className='room-table-mask';
    this.tableMask.addEventListener('error',()=>{this.tableMask.hidden=true;});
    this.tableMask.addEventListener('load',()=>{this.tableMask.hidden=false;});
    this.stage.append(this.image,...this.actors,this.tableMask);host.replaceChildren(this.stage);host.dataset.renderer='photographic-scene';
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
    if(this.image.getAttribute('src')!==p.image){this.image.style.visibility='hidden';this.image.src=p.image;this.tableMask.hidden=true;this.tableMask.src=p.image;}
    this.tableMask.style.clipPath=p.tableMask;
    for(const actor of p.actors){
      const img=this.actors[actor.seat-1];
      Object.assign(img.style,{left:`${actor.x}px`,top:`${actor.y}px`,width:`${actor.width}px`,height:`${actor.height}px`,zIndex:actor.z});
    }
    const felt=this.host.closest('.felt');felt.classList.toggle('portrait-scene',p.portrait);
    felt.style.setProperty('--room-image',`url('${p.image}')`);
    const center=felt.querySelector('.table-center');
    const pile=felt.querySelector('#highest');
    const count=pile.querySelectorAll('.table-play').length;
    const hud = felt.querySelector('.turn-hud');
    const hudTop = hud ? hud.getBoundingClientRect().top - felt.getBoundingClientRect().top : height * .63;
    if (count <= 1 && !(height < 500 && width > height)) {
      p.play.y = Math.max(p.seats[4].y + 48, Math.min(p.play.y, hudTop - p.play.height - 12));
      p.play.height = Math.max(52, Math.min(p.play.height, hudTop - p.play.y - 12));
    }
    if (count > 1) {
      p.play.y = p.seats[4].y + 38;
      p.play.width = Math.min(width * .70, 650);
      p.play.x = (width - p.play.width) / 2;
      p.play.height = Math.max(52, Math.min(200, hudTop - p.play.y - 12));
      if (height < 500 && width > height) {
        p.play.y = p.seats[4].y + 22;
        p.play.width = width * .48; p.play.x = width * .26;
        p.play.height = Math.max(80, height * .73 - p.play.y - 8);
      }
    }
    Object.assign(center.style,{left:`${p.play.x}px`,top:`${p.play.y}px`,width:`${p.play.width}px`,height:`${p.play.height}px`});
    this.layoutSeats();
    layoutTablePile(pile);
  }
  layoutSeats() {
    if(!this.layout)return;
    const placed=[];
    const ordered=this.layout.compactLabels?[4,3,5,2,6,1,7,0].map(seat=>this.layout.seats[seat]):this.layout.seats;
    for(const p of ordered){
      const node=document.querySelector(`.seat-${p.seat}`);if(!node)continue;
      if(p.seat>0){
        const failed=this.actors[p.seat-1].dataset.failed==='true'&&!!this.snapshot?.avatars?.[p.seat];
        const avatar=node.querySelector('.avatar');
        if(avatar){avatar.classList.toggle('avatar-fallback',failed);if(failed&&!avatar.querySelector('.avatar-portrait'))avatar.replaceChildren(avatarImage(this.snapshot.avatars[p.seat]));}
      }
      Object.assign(node.style,{left:`${p.x}px`,top:`${p.y}px`,width:`${p.width}px`});
      if(this.layout.compactLabels&&p.seat!==0){
        const height=node.getBoundingClientRect().height;
        for(const other of placed){
          if(Math.abs(p.x-other.x)<(p.width+other.width)/2+4&&Math.abs(p.y-other.y)<(height+other.height)/2+6){
            p.y=other.y+(height+other.height)/2+6;
          }
        }
        node.style.top=`${p.y}px`;
        placed.push({...p,height});
      }
      const fan=node.querySelector('.opponent-hand');
      if(fan){
        const fanTop=p.handY-p.y-82+node.getBoundingClientRect().height/2;
        Object.assign(fan.style,{left:`calc(50% + ${p.handX-p.x}px)`,top:`${fanTop}px`,transform:`translateX(-50%) scale(${p.fanScale})`});
        // Measure the rotated cards, since the fan container includes empty space.
        // Lift the label while keeping the cards anchored to the character's hands.
        const cards=[...fan.querySelectorAll('.hand-back')].filter(card=>card.getClientRects().length);
        if(cards.length){
          const cardTop=Math.min(...cards.map(card=>card.getBoundingClientRect().top));
          const lift=Math.max(0,node.getBoundingClientRect().bottom+8-cardTop);
          node.style.top=`${p.y-lift}px`;
          fan.style.top=`${fanTop+lift}px`;
        }
      }
    }
  }
  update(snapshot,motion=null) {
    this.snapshot=snapshot;this.motion=motion;
    this.actors.forEach((img,index)=>{
      const id=snapshot.avatars?.[index+1];
      img.hidden=!id||img.dataset.failed==='true';
      if(id&&img.dataset.avatarId!==normalizeAvatar(id)){
        img.dataset.avatarId=normalizeAvatar(id);delete img.dataset.failed;
        img.src=AVATARS.find(avatar=>avatar.id===normalizeAvatar(id)).image;img.hidden=false;
      }
    });
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
