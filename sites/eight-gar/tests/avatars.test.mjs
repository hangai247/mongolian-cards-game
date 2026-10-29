import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATARS, normalizeAvatar, botAvatar } from '../dist/rules/avatars.js';
import { rememberedAvatar, rememberAvatar } from '../dist/avatar-picker.js';
import { readSavedMatch } from '../dist/practice-save.js';
import { roomLayout } from '../dist/room-layout.js';
import { prepareMatch, createDeck } from '../../../dist/engine.js';
import { displaySeat } from '../dist/scene.js';

test('practice avatar survives save restoration independently of remembered browser preference', () => {
  const state = prepareMatch(createDeck(),0);
  const saved = {format:2,state,avatarId:'naraa'};
  assert.equal(readSavedMatch(saved).avatarId,'naraa');
  assert.equal(readSavedMatch({...saved,avatarId:'invalid'}).avatarId,'temu');
  assert.equal(readSavedMatch({format:2,state}).avatarId,'temu');
});
test('preferences are optional and invalid stored artwork cannot become an image URL', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  try {
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('blocked');}});
    assert.equal(rememberedAvatar(),null); assert.doesNotThrow(()=>rememberAvatar('oyu'));
    const map=new Map();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)}});
    rememberAvatar('anu');assert.equal(rememberedAvatar(),'anu');rememberAvatar('invalid');assert.equal(rememberedAvatar(),'anu');
    map.set('gar:avatar','https://example.com/private');assert.equal(rememberedAvatar(),null);
  } finally { if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage; }
});
test('every avatar uses the same seat geometry from each viewer, including duplicates', () => {
  for(const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]) {
    const layout=roomLayout(width,height);assert.equal(layout.actors.length,7);
    for(const actor of layout.actors){assert(actor.height>0&&actor.width>0);assert(actor.y>=0);assert(actor.z<10);}
    for(const avatar of AVATARS)for(let viewer=0;viewer<8;viewer++)for(let real=0;real<8;real++){
      const shown=displaySeat(real,viewer);assert(shown>=0&&shown<8);assert.equal(normalizeAvatar(avatar.id),avatar.id);
      if(shown)assert(layout.actors.find(a=>a.seat===shown));
    }
  }
  assert.equal(new Set(Array.from({length:7},(_,i)=>botAvatar(i+1))).size,7);
  assert.equal(botAvatar(0),'oyu','seat zero keeps its existing bot identity as the player catalog grows');
});
