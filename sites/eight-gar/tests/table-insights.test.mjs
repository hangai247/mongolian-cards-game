import test from 'node:test';
import assert from 'node:assert/strict';
import { chainProgress, teamSummary, turnGuidance, defenseMessage } from '../dist/table-insights.js';
import { createDeck, createMatch, applyAction, RANKS } from '../../../dist/engine.js';
import { transitionSteps } from '../dist/presentation.js';
import { sceneFromView } from '../dist/scene.js';
import { viewForPlayer } from '../../../dist/engine.js';
import { fixture, s, h, j } from '../../../test/helpers.mjs';

test('team summary starts at every viewer and includes only teammates and public counts',()=>{
  const counts=[2,8,4,3,1,9,6,5];
  for(let viewer=0;viewer<8;viewer++){
    const result=teamSummary(counts,viewer);
    assert.deepEqual(result.map(e=>e.seat),[0,2,4,6].map(n=>(viewer+n)%8));
    for(const entry of result){assert.equal(entry.count,counts[entry.seat]);assert.equal(entry.lastCard,entry.count===1);}
    const state=createMatch(createDeck(),viewer),scene=sceneFromView(viewForPlayer(state,viewer));
    assert.deepEqual(teamSummary(scene.hands.map(h=>h.length)).map(e=>e.seat),[0,2,4,6]);
  }
});
test('meter counts plays, not cards, for all legal group sizes and resets on empty table',()=>{
  assert.equal(chainProgress({pile:[],highest:[]}),0);
  for(const size of [1,3,5])for(let n=1;n<=7;n++)assert.equal(chainProgress({pile:Array(size*n),highest:Array(size)}),n);
  assert.equal(chainProgress({pile:[],highest:[]},{type:'sleep'}),8);
});
test('next player wraps around and the seventh play explains the conditional turn',()=>{
  const base={phase:'playing',turn:7,table:{pile:[],highest:[]}};
  assert.equal(turnGuidance(base).next,0);
  const seventh={...base,table:{pile:Array(7),highest:[{}]}};
  assert.equal(turnGuidance(seventh).currentLabel,'Beat → lead again');assert.equal(turnGuidance(seventh).nextLabel,'After pickup');
  assert.match(turnGuidance(seventh).note,/unless the round ends/);
  assert.equal(turnGuidance(seventh,{type:'sleep',player:7}).next,null);
  for(const phase of ['choosing-leader','round-over','match-over'])assert.equal(turnGuidance({...base,phase}).next,null);
});
test('eighth-play presentation preserves progress through refill, then same actor leads or wins',()=>{
  for(const reserve of [[],[j('red')]]){
    const pile=RANKS.slice(0,7).map(s);
    const before=fixture({hands:{0:[s('3')]},reserve,pile,highest:pile.slice(-1),size:1});
    const result=applyAction(before,{type:'play',player:0,cards:[s('3').id],expectedRevision:before.revision});
    for(const step of transitionSteps(before,result.events))assert.equal(chainProgress(step.after.table,{type:step.type}),8);
    assert.equal(chainProgress(result.state.table),0);
    assert.equal(turnGuidance(result.state).current,reserve.length?0:null);
  }
});
test('pickup at seven resets progress and hands lead to the next seat',()=>{
  const pile=RANKS.slice(0,7).map(s),before=fixture({turn:7,hands:{7:[h('A')]},pile,highest:pile.slice(-1),size:1});
  const result=applyAction(before,{type:'pickup',player:7,expectedRevision:before.revision});
  assert.equal(chainProgress(result.state.table),0);assert.equal(turnGuidance(result.state).current,0);
});
test('coverage copy distinguishes count problems, invalid combinations and success',()=>{
  assert.match(defenseMessage({assignments:[{},{}]},2,3),/select 1 more card/);
  assert.match(defenseMessage({assignments:[{},{}]},3,3),/replace unused/);
  assert.match(defenseMessage({assignments:[{}, {},{}]},4,3),/Remove 1 extra card/);
  assert.match(defenseMessage({assignments:[],reason:'jokers-must-play-alone'},1,3),/Jokers play alone/);
  assert.match(defenseMessage({assignments:[{}],valid:true},1,1),/ready to play/);
});
