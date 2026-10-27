import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeck,createMatch,applyAction,RANKS} from '../../../dist/engine.js';
import {transitionSteps,fanLayout} from '../dist/presentation.js';
function conserved(s){const cards=[...s.hands.flat(),...s.reserve,...s.table.pile,...s.sleeping];assert.equal(cards.length,43);assert.equal(new Set(cards.map(c=>c.id)).size,43);}
function verify(before,action){const frozen=JSON.stringify(before);const result=applyAction(before,{...action,player:before.turn,expectedRevision:before.revision});const steps=transitionSteps(before,result.events);assert.equal(JSON.stringify(before),frozen);for(const step of steps){conserved(step.before);conserved(step.after);}for(const key of ['hands','reserve','table','sleeping'])assert.deepEqual(steps.at(-1).after[key],result.state[key]);return {steps,result};}
test('a lead and automatic draw animate in engine order without losing or duplicating cards',()=>{
  const before=createMatch(createDeck(),0);const {steps}=verify(before,{type:'play',cards:[before.hands[0][0].id]});
  assert.deepEqual(steps.map(s=>s.type),['play','refill']);assert.equal(steps[0].after.hands[0].length,4);assert.equal(steps[1].after.hands[0].length,5);
});
function pilePosition(actor=1,lastOnly=false){const deck=createDeck(),pile=RANKS.slice(0,7).map(rank=>deck.find(c=>c.kind==='ordinary'&&c.suit==='spades'&&c.rank===rank));const winner=deck.find(c=>c.kind==='ordinary'&&c.suit==='spades'&&c.rank==='3');const pool=deck.filter(c=>!pile.includes(c)&&c!==winner);const hands=Array.from({length:8},()=>[]);hands[actor]=[winner,...(lastOnly?[]:pool.splice(0,2))];for(let i=0;i<8;i++)if(i!==actor)hands[i]=pool.splice(0,3);hands[(actor+1)%8].push(...pool);return {...createMatch(deck,actor),hands,reserve:[],table:{pile,highest:pile.slice(-1)}};}
for(const actor of [0,1,7])test(`pickup moves every table card into actor ${actor}'s hand exactly once`,()=>{
  const before=pilePosition(actor);const {steps}=verify(before,{type:'pickup'});assert.equal(steps.length,1);assert.equal(steps[0].cards.length,7);assert.equal(steps[0].after.hands[actor].length,before.hands[actor].length+7);assert.equal(steps[0].after.table.pile.length,0);
});
test('eighth play appears before the complete pile sleeps; same-player lead remains an engine decision',()=>{
  const before=pilePosition(4);const {steps,result}=verify(before,{type:'play',cards:[before.hands[4][0].id]});assert.deepEqual(steps.map(s=>s.type),['play','sleep']);assert.equal(steps[0].after.table.pile.length,8);assert.equal(steps[1].cards.length,8);assert.equal(result.state.turn,4);assert.equal(result.state.sleeping.length,8);
});
test('winning eighth play still completes its play and sleep visuals without inventing another turn',()=>{
  const before=pilePosition(7,true);const {steps,result}=verify(before,{type:'play',cards:[before.hands[7][0].id]});assert.deepEqual(steps.map(s=>s.type),['play','sleep']);assert.equal(result.state.phase,'round-over');assert.equal(result.state.hands[7].length,0);
});
test('fan counts are exact from empty to 43, bounded in width, and contain no hidden card identities',()=>{
  for(let count=0;count<=43;count++){const fan=fanLayout(count);assert.equal(fan.length,count);for(const entry of fan){assert.deepEqual(Object.keys(entry),['index','x','angle']);assert(Math.abs(entry.x)<=43);assert(Math.abs(entry.angle)<=24);}assert.equal(new Set(fan.map(c=>c.index)).size,count);}
  for(const count of [-1,44,1.5,NaN])assert.throws(()=>fanLayout(count),RangeError);
});

for(const mode of ['reduced-motion','hidden-tab','already-cancelled'])test(`${mode} settles without creating animated card elements`,async()=>{
  const {animateStep}=await import('../dist/motion.js');
  const oldDocument=globalThis.document,oldMatchMedia=globalThis.matchMedia;
  try{
    globalThis.document={hidden:mode==='hidden-tab'};
    globalThis.matchMedia=()=>({matches:mode==='reduced-motion'});
    const controller=new AbortController();if(mode==='already-cancelled')controller.abort();
    const renders=[];const after={marker:'committed'};
    await animateStep({after},{signal:controller.signal,render:s=>renders.push(s),cardElement:()=>{throw new Error('Must not create flight cards');}});
    assert.deepEqual(renders,mode==='already-cancelled'?[]:[after]);
  }finally{globalThis.document=oldDocument;globalThis.matchMedia=oldMatchMedia;}
});
