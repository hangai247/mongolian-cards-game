import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, createMatch, applyAction, RANKS } from '../dist/engine.js';
import { readSavedMatch } from '../dist/persistence.js';
function sleptState() {
  const deck=createDeck(), cards=RANKS.slice(0,8).map(rank=>deck.find(c=>c.kind==='ordinary' && c.suit==='spades' && c.rank===rank));
  const pool=deck.filter(c=>!cards.some(s=>s.id===c.id));
  const hands=cards.map(c=>[c,...pool.splice(0,3)]); hands[0].push(...pool);
  let state={...createMatch(deck,0),hands,reserve:[]};
  for(const c of cards)state=applyAction(state,{type:'play',cards:[c.id],player:state.turn,expectedRevision:state.revision}).state;
  return state;
}
test('a sleeping pile reloads with all 43 cards conserved and the eighth actor still leading',()=>{
  const state=sleptState(); const saved=readSavedMatch(JSON.parse(JSON.stringify({format:2,state,byRank:true})));
  assert(saved); assert.equal(saved.state.turn,7); assert.equal(saved.state.sleeping.length,8);
  assert.deepEqual(saved.state.table,{pile:[],highest:[]}); assert.equal(saved.byRank,true); assert.deepEqual(saved.state,state);
});
test('compatible old saves gain an empty sleeping pile and drop historical notes',()=>{
  const state=createMatch(createDeck(),3); delete state.sleeping;
  const saved=readSavedMatch({format:1,state,notes:['old history']});
  assert(saved); assert.equal(saved.format,2); assert.deepEqual(saved.state.sleeping,[]);assert(!('notes' in saved));
});
test('legacy eight-play pile is rejected rather than guessing how later turns should have worked',()=>{
  const state=sleptState();state.table={pile:state.sleeping,highest:state.sleeping.slice(-1)};delete state.sleeping;
  assert.equal(readSavedMatch({format:1,state}),null);
});
test('missing, duplicated or recoverable sleeping cards fail save validation',()=>{
  const state=sleptState();
  for(const edit of [s=>delete s.sleeping,s=>s.sleeping.pop(),s=>s.hands[0].push(s.sleeping[0]),s=>s.table={pile:s.sleeping,highest:s.sleeping.slice(-1)}]){
    const bad=structuredClone(state);edit(bad);assert.equal(readSavedMatch({format:2,state:bad}),null);
  }
});
