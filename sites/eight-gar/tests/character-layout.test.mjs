import test from 'node:test';
import assert from 'node:assert/strict';
import {seatLayout,poseFor} from '../dist/character-layout.js';

test('seven seats remain ordered around the table at phone, tablet and desktop sizes',()=>{
  for(const width of [320,390,480,700,701,1024,1440,1920]){
    const seats=Array.from({length:7},(_,i)=>seatLayout(width,i+1));
    for(let i=0;i<seats.length;i++){
      const p=seats[i];assert.ok(p.x>0&&p.x<width);assert.ok(p.labelTop>=75);
      assert.ok(p.handY>p.top+p.height*.7&&p.handY<p.top+p.height);
      assert.ok(p.fanScale>0&&p.fanScale<=1.15);
      if(i)assert.ok(p.x>seats[i-1].x);
    }
    assert.ok(seats[0].height>seats[3].height);assert.ok(seats[0].top>seats[3].top);
  }
});
test('pause and reduced motion neutralize every animated pose, including action gestures',()=>{
  for(const status of [null,'play','pickup','refill','sleep'])assert.deepEqual(poseFor({seat:3,time:12,status,active:true,won:true,still:true}),{breath:0,head:0,lean:0,reach:0});
});
test('public actions produce bounded distinct poses without accepting private card data',()=>{
  const poses=['play','pickup','refill'].map(status=>poseFor({seat:2,time:1,status}));
  assert.ok(poses[1].reach>poses[0].reach&&poses[0].reach>poses[2].reach);
  for(let seat=1;seat<8;seat++)for(let time=0;time<30;time++){
    const p=poseFor({seat,time,active:true});assert.ok(Math.abs(p.breath)<=.0022);assert.ok(Math.abs(p.head)<=.01701);
    assert.ok(Object.values(p).every(Number.isFinite));
  }
});

test('brief reaction envelopes are bounded and disabled by still mode',()=>{
  for(const reactionType of ['surprise','win'])for(const reaction of [0,.5,1]){
    const pose=poseFor({seat:2,time:1,reaction,reactionType});assert(Math.abs(pose.head)<.04);assert(Math.abs(pose.lean)<.03);
    assert.deepEqual(poseFor({seat:2,still:true,reaction,reactionType}),{breath:0,head:0,lean:0,reach:0});
  }
});

test('viewport portrait bands keep every face inside the measured space',()=>{
  for(const [width,height] of [[320,88],[390,143],[450,94],[700,146],[1440,252]]){
    let previous=-1;
    for(let seat=1;seat<8;seat++){
      const p=seatLayout(width,seat,height);
      assert(p.x>previous);previous=p.x;
      assert(p.x-p.width/2>=0&&p.x+p.width/2<=width);
      assert(p.top>=30&&p.top+p.height<=height+1);
      assert(p.labelTop>=0&&p.labelTop<p.top);
    }
  }
});
