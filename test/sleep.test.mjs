import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, createMatch, RANKS, startNextRound, viewForPlayer, canLeadThree } from '../dist/engine.js';
import { s, d, b, h, j, fixture, play, pickup, rejects, freeze, assertConservation } from './helpers.mjs';

function chain(start = 0, size = 1) {
  const groups = RANKS.slice(0, 8).map(rank => size === 1 ? [s(rank)] : [s(rank), d(rank), b(rank)]);
  const hands = Array.from({length:8}, () => []);
  groups.forEach((cards, i) => { hands[(start+i)%8] = [...cards, h(RANKS[i])]; });
  const used = new Set(hands.flat().map(c => c.id));
  hands[start].push(...createDeck().filter(c => !used.has(c.id)));
  return {state:{...createMatch(createDeck(), start), hands, reserve:[]}, groups};
}
for (let start = 0; start < 8; start++) test(`one lead + seven beats sleeps the pile; final actor leads again (start seat ${start})`, () => {
  let {state, groups} = chain(start);
  for (let i=0;i<8;i++) {
    const before=freeze(state), result=play(before, groups[i]);
    state=result.state;
    assert.equal(state.revision, before.revision+1);
    if(i<7){ assert.equal(state.sleeping.length,0); assert.equal(state.table.pile.length,i+1); assert.equal(state.turn,(start+i+1)%8); }
    else {
      assert.deepEqual(state.table,{pile:[],highest:[]}); assert.deepEqual(state.sleeping,groups.flat());
      assert.equal(state.turn,(start+7)%8); assert.equal(state.phase,'playing');
      assert.deepEqual(result.events.map(e=>e.type),['played','table-slept','turn-changed']);
      assert.deepEqual(result.events[1],{type:'table-slept',player:state.turn,count:8});
      rejects(()=>pickup(state),'NOTHING_TO_PICK_UP');
      rejects(()=>play(state,[state.hands[state.turn][0]],{player:(state.turn+1)%8}),'WRONG_TURN');
      rejects(()=>play(state,groups[7]),'INVALID_CARDS');
      const next=play(state,[state.hands[state.turn][0]]);
      assert.equal(next.events[0].lead,true); assert.equal(next.state.sleeping.length,8);
    }
  }
});
test('three-card chains sleep after eight plays (24 cards), not after eight cards',()=>{
  let {state,groups}=chain(0,3);
  for(let i=0;i<8;i++) {state=play(state,groups[i]).state;if(i<7)assert.equal(state.sleeping.length,0);}
  assert.equal(state.sleeping.length,24); assert.equal(state.turn,7); assert.equal(canLeadThree(state),false);
});
const seven = () => RANKS.slice(0,7).map(s);
test('pickup by the eighth player breaks the chain, keeps all cards playable and passes the lead',()=>{
  const state=fixture({turn:7,hands:{7:[s('3'),h('A')]},pile:seven(),highest:[s('K')],size:1});
  const result=pickup(state); assert.equal(result.state.turn,0); assert.equal(result.state.sleeping.length,0);
  assert.equal(result.state.hands[7].length,9);
  const next=play(result.state,[result.state.hands[0][0]]).state;
  assert.equal(next.table.pile.length,1); assert.equal(next.sleeping.length,0);
});
test('eighth play refills before sleep and same-player lead; empty hand is not a win while reserve remains',()=>{
  const state=fixture({turn:4,hands:{4:[s('3')]},reserve:[j('red')],pile:seven(),highest:[s('K')],size:1});
  const result=play(state,[s('3')]);
  assert.deepEqual(result.events.map(e=>e.type),['played','refilled','table-slept','turn-changed']);
  assert.deepEqual(result.state.hands[4],[j('red')]); assert.equal(result.state.turn,4);
  assert.equal(result.state.phase,'playing'); assert.deepEqual(result.state.scores,[0,0]);
});
for(const score of [0,4]) test(`eighth play going out wins immediately, with no additional lead (prior score ${score})`,()=>{
  const state=fixture({turn:3,hands:{3:[s('3')]},scores:[0,score],pile:seven(),highest:[s('K')],size:1});
  const result=play(state,[s('3')]); assert.equal(result.state.sleeping.length,8); assert.equal(result.state.turn,3);
  assert.equal(result.state.phase,score===4?'match-over':'round-over');
  assert.deepEqual(result.events.map(e=>e.type),['played','table-slept','round-won',...(score===4?['match-won']:[])]);
  rejects(()=>pickup(result.state),'ROUND_CLOSED');
  if(score===0){const fresh=startNextRound(result.state,createDeck(),3,result.state.revision);assert.deepEqual(fresh.sleeping,[]);assertConservation(fresh);}
});
test('sleeping identities are absent from public player views and events',()=>{
  let {state,groups}=chain(); for(const group of groups)state=play(state,group).state;
  for(let seat=0;seat<8;seat++){
    const view=viewForPlayer(state,seat);assert.equal('sleeping' in view,false);
    for(const card of state.sleeping) assert(!JSON.stringify(view).includes(JSON.stringify(card.id)));
  }
  const next=play(freeze(state),[state.hands[state.turn][0]]).state;
  next.sleeping[0].id='changed';assert.notEqual(state.sleeping[0].id,'changed');
});
test('failed and stale eighth plays do not sleep or mutate any cards',()=>{
  const state=freeze(fixture({turn:2,hands:{2:[d('A'),s('3'),h('A')]},pile:seven(),highest:[s('K')],size:1}));
  const before=structuredClone(state);
  rejects(()=>play(state,[d('A')]),'INVALID_RESPONSE');
  rejects(()=>play(state,[s('3')],{expectedRevision:state.revision+1}),'STALE_ACTION');
  assert.deepEqual(state,before);
});
test('later sleeping piles accumulate and pickup never recovers sleeping cards',()=>{
  const sleeping=RANKS.slice(0,8).map(b);
  const state=fixture({turn:5,hands:{5:[s('3'),h('A'),h('2')]},sleeping,pile:seven(),highest:[s('K')],size:1});
  const next=play(state,[s('3')]).state; assert.equal(next.sleeping.length,16);
  const led=play(next,[h('A')]).state;
  const collected=pickup(led).state; assert.equal(collected.sleeping.length,16);
  assert.deepEqual(collected.sleeping,next.sleeping); assert.deepEqual(collected.table,{pile:[],highest:[]});
});
