import test from 'node:test';
import assert from 'node:assert/strict';
import {roomLayout} from '../dist/room-layout.js';

test('real room maps all eight seats and the play area inside phone and desktop scenes',()=>{
  for(const [width,height] of [[320,218],[390,302],[390,446],[700,550],[304,244],[450,314],[1024,254],[1440,472]]){
    const layout=roomLayout(width,height);
    assert.equal(layout.seats.length,8);
    assert(layout.x>=0&&layout.y>=0&&layout.x+layout.width<=width+1&&layout.y+layout.height<=height+1);
    for(const seat of layout.seats){
      assert(seat.x-seat.width/2>=0&&seat.x+seat.width/2<=width);
      assert(seat.y>=16&&seat.y<=height-16);
      assert(seat.handX>=0&&seat.handX<=width&&seat.handY>=0&&seat.handY<=height);
    }
    assert(layout.seats[1].y>layout.seats[2].y&&layout.seats[2].y>layout.seats[3].y);
    assert(layout.seats[7].y>layout.seats[6].y&&layout.seats[6].y>layout.seats[5].y);
    assert(layout.seats[0].y>layout.seats[4].y);
    assert(layout.play.width>100&&layout.play.height>50);
    assert(layout.play.x>=0&&layout.play.y>=0&&layout.play.x+layout.play.width<=width&&layout.play.y+layout.play.height<=height);
  }
});
test('the photo has one scale in both directions and changes composition for tall screens',()=>{
  const wide=roomLayout(1440,472),portrait=roomLayout(390,446);
  assert(!wide.portrait);assert(portrait.portrait);
  assert.equal(wide.width/wide.imageHeight,1672/941);
  assert.equal(portrait.width/portrait.imageHeight,934/1684);
  assert.throws(()=>roomLayout(0,100),RangeError);
});
