import * as THREE from './vendor/three.module.min.js';
import { CHARACTER_NAMES, seatLayout, poseFor } from './character-layout.js';

// Photographic 2.5D actors on independently deformable meshes. No hidden cards enter this renderer.
export class CharacterRoom {
  constructor(host) {
    this.host=host; this.rigs=[]; this.snapshot=null; this.motion=null; this.lastTime=0; this.dirty=true;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)'); this.visible=!document.hidden;
    this.loader=new THREE.TextureLoader();
    // The same individual artwork is a static fallback during loading or if WebGL is unavailable.
    this.fallback=document.createElement('div');this.fallback.className='character-fallback';
    CHARACTER_NAMES.forEach((name,i)=>{const img=new Image();img.src=`assets/characters/${name}.webp`;img.alt='';img.dataset.actor=i+1;this.fallback.append(img);});
    host.append(this.fallback);
    try {
      this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.setClearColor(0,0);
      this.renderer.domElement.setAttribute('aria-hidden','true');host.append(this.renderer.domElement);
      this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,2000);this.camera.position.z=1000;
      for(let seat=1;seat<8;seat++)this.makeActor(seat);
      this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;host.classList.remove('ready');this.renderer.setAnimationLoop(null);});
      this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.contextLost=false;if(this.rigs.every(r=>r.loaded))host.classList.add('ready');this.dirty=true;this.syncLoop();this.frame(performance.now(),true);});
      this.renderer.setAnimationLoop(t=>this.frame(t));
    } catch {this.renderer?.dispose();this.renderer=null;host.dataset.renderer='fallback';}
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);
    document.addEventListener('visibilitychange',()=>{this.visible=!document.hidden;this.clearReaction();this.syncLoop();});
    this.reduced.addEventListener('change',()=>{this.clearReaction();this.syncLoop();this.frame(performance.now(),true);});
    this.resize();
  }
  makeActor(seat){
    const geometry=new THREE.PlaneGeometry(.75,1,28,36);geometry.translate(0,.5,0);
    const original=new Float32Array(geometry.attributes.position.array);
    const material=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,opacity:0});
    // Fade only the lap below the wrists into the tabletop; face and hands keep their full detail.
    material.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n #ifdef USE_MAP\n diffuseColor.a *= smoothstep(0.015, 0.11, vMapUv.y);\n #endif');
    };
    const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;this.scene.add(mesh);
    const rig={seat,mesh,geometry,original,loaded:false,pose:{breath:0,head:0,lean:0,reach:0}};this.rigs.push(rig);
    this.loader.load(`assets/characters/${CHARACTER_NAMES[seat-1]}.webp`,texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
      material.map=texture;material.opacity=1;material.needsUpdate=true;rig.loaded=true;
      if(this.rigs.every(r=>r.loaded)){this.host.classList.add('ready');this.host.dataset.renderer='photographic-mesh';}
      this.dirty=true;this.renderOnce();
    },undefined,()=>{this.host.dataset.renderer='fallback';});
  }
  resize(){
    const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;
    this.width=width;this.height=height;
    if(this.renderer){this.renderer.setSize(width,height,false);Object.assign(this.camera,{left:-width/2,right:width/2,top:height/2,bottom:-height/2});this.camera.updateProjectionMatrix();}
    for(const r of this.rigs){const p=seatLayout(width,r.seat,height);r.layout=p;r.mesh.scale.setScalar(p.height);r.mesh.position.set(p.x-width/2,height/2-p.top-p.height,p.z);r.mesh.renderOrder=p.z;}
    for(const img of this.fallback.children){const p=seatLayout(width,Number(img.dataset.actor),height);Object.assign(img.style,{left:`${p.x-p.width/2}px`,top:`${p.top}px`,width:`${p.width}px`,height:`${p.height}px`,zIndex:Math.round(p.z*3)});}
    this.layoutCards();this.dirty=true;this.renderOnce();
  }
  layoutCards(){
    if(!this.width||this.snapshot?.focused)return;
    for(let seat=1;seat<8;seat++){
      const node=document.querySelector(`.seat-${seat}`);if(!node)continue;
      const p=seatLayout(this.width,seat,this.height),fan=node.querySelector('.opponent-hand');
      Object.assign(node.style,{left:`${p.x}px`,top:`${p.labelTop}px`});
      if(fan){const count=this.snapshot?.handCounts[seat]||0;const compression=count>12?.78:count>7?.88:1;
        Object.assign(fan.style,{left:`calc(50% + ${p.handX-p.x}px)`,top:`${p.handY-p.labelTop-82}px`,transform:`translateX(-50%) scale(${p.fanScale*compression})`});}
    }
  }
  syncLoop(){
    const running=!this.contextLost&&this.visible&&!this.snapshot?.focused&&!this.snapshot?.paused&&!this.reduced.matches&&this.snapshot?.motionEnabled!==false;
    this.renderer?.setAnimationLoop(running?t=>this.frame(t):null);
  }
  clearReaction(){this.reaction=null;this.dirty=true;}
  react(event){
    if(!this.visible||this.snapshot?.focused||this.snapshot?.paused||this.reduced.matches||this.snapshot?.motionEnabled===false)return;
    this.reaction={...event,started:performance.now()};this.dirty=true;
  }
  update(snapshot,motion=null){
    const wasFocused=this.snapshot?.focused;
    this.snapshot=snapshot;this.motion=motion;this.dirty=true;
    if(snapshot.focused||snapshot.paused||this.reduced.matches||snapshot.motionEnabled===false)this.clearReaction();
    if(wasFocused&&!snapshot.focused)this.resize();
    this.layoutCards();this.syncLoop();
    if(snapshot.paused||this.reduced.matches||snapshot.motionEnabled===false)this.frame(performance.now(),true);
  }
  renderOnce(){if(this.renderer&&this.scene&&!this.snapshot?.focused&&this.visible)this.renderer.render(this.scene,this.camera);}
  frame(ms,force=false){
    if(!this.visible||!this.snapshot||this.snapshot.focused||(!force&&ms-this.lastTime<33))return;
    this.lastTime=ms;const still=this.reduced.matches||this.snapshot.paused||this.snapshot.motionEnabled===false;
    if(this.reaction&&ms-this.reaction.started>=1200)this.reaction=null;
    if(still&&!this.dirty&&!force)return;this.dirty=false;
    for(const r of this.rigs){
      const status=this.motion?.player===r.seat?this.motion.type:null;
      const reacts=this.reaction&&(this.reaction.type==='win'?this.reaction.team===r.seat%2:this.reaction.player===r.seat);
      const reaction=reacts?Math.sin(Math.PI*Math.max(0,ms-this.reaction.started)/1200):0;
      const target=poseFor({seat:r.seat,time:ms/1000,status,active:this.snapshot.phase==='playing'&&this.snapshot.turn===r.seat,won:this.snapshot.motionEnabled===undefined&&['round-over','match-over'].includes(this.snapshot.phase)&&this.snapshot.winner===r.seat%2,still,reaction,reactionType:this.reaction?.type});
      for(const key of Object.keys(target))r.pose[key]=still?0:r.pose[key]+(target[key]-r.pose[key])*.12;
      const a=r.geometry.attributes.position,o=r.original,p=r.pose;
      for(let i=0;i<a.count;i++){
        const x=o[i*3],y=o[i*3+1];
        const upper=THREE.MathUtils.smoothstep(y,.47,.73),torso=THREE.MathUtils.smoothstep(y,.2,.6);
        // Neck-centred head tilt; gentle shoulder breath. Anatomical bounds avoid a rubbery face.
        const hx=x*Math.cos(p.head)-(y-.60)*Math.sin(p.head),hy=x*Math.sin(p.head)+(y-.60)*Math.cos(p.head)+.60;
        // Forearm reach is weighted away from the face and fixed at the elbow.
        const arm=Math.exp(-(((y-.23)/.12)**2))*THREE.MathUtils.smoothstep(Math.abs(x),.04,.20);
        const side=r.seat<4?1:-1;
        a.setXYZ(i,x+(hx-x)*upper+p.lean*side*torso+p.reach*.017*side*arm,y+(hy-y)*upper+p.breath*torso-p.reach*.012*arm,0);
      }
      a.needsUpdate=true;
    }
    this.renderOnce();
  }
}
