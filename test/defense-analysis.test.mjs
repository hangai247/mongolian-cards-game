import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDefense, beatsSet, beatsCard, createDeck, shuffleDeck } from '../dist/engine.js';
import { h, s, d, b, j, fixture, play, random } from './helpers.mjs';
const mapping = (cards, targets) => analyzeDefense(cards, targets, 'hearts').assignments.map(({candidateIndex,targetIndex}) => [targets[targetIndex].id,cards[candidateIndex].id]);

function permutations(cards) {
  return cards.length ? cards.flatMap((card, index) => permutations(cards.filter((_, i) => i !== index)).map(rest => [card, ...rest])) : [[]];
}
for (const size of [3, 5]) test(`${size}-card plays commit the preview pairing regardless of selection order`, () => {
  const targets = [s('7'), h('7'), b('7'), s('8'), d('7')].slice(0, size);
  const cards = [h('8'), s('9'), b('8'), s('10'), d('8')].slice(0, size);
  const expected = analyzeDefense(cards, targets, 'hearts').assignments.map(({candidateIndex}) => cards[candidateIndex]);
  const before = fixture({hands: {0: [...cards, d('A')]}, pile: targets, highest: targets, size: 1});
  const snapshot = JSON.stringify(before);
  for (const selection of permutations(cards)) {
    const originalSelection = [...selection];
    const {state, events} = play(before, selection);
    assert.deepEqual(state.table.highest, expected);
    assert.deepEqual(state.table.pile, [...targets, ...expected]);
    assert.deepEqual(events.find(event => event.type === 'played').cards, expected);
    assert(expected.every((card, index) => beatsCard(card, targets[index], before.trump)));
    assert.deepEqual(selection, originalSelection);
  }
  assert.equal(JSON.stringify(before), snapshot);
});

test('successive defenses stay in the same target columns', () => {
  const targets = [s('7'), h('7'), b('7')];
  const first = [h('8'), b('8'), s('8')], second = [b('9'), s('9'), h('9')];
  const before = fixture({hands: {0: [...first, d('A')], 1: [...second, d('K')]}, pile: targets, highest: targets, size: 1});
  const next = play(play(before, first).state, second).state;
  assert.deepEqual(next.table.pile, [...targets, s('8'), h('8'), b('8'), s('9'), h('9'), b('9')]);
});

test('defense preview finds the complete matching when the first trump choice would fail', () => {
  const cards=[h('8'),s('8'),b('8')], targets=[s('7'),h('7'),b('7')];
  const result=analyzeDefense(cards,targets,'hearts');
  assert(result.valid); assert.deepEqual(mapping(cards,targets),[[s('7').id,s('8').id],[h('7').id,h('8').id],[b('7').id,b('8').id]]);
});
test('partial coverage never reuses a card and prefers earlier targets', () => {
  const result=analyzeDefense([h('A')],[s('8'),s('9'),s('10')],'hearts');
  assert.equal(result.valid,false); assert.deepEqual(result.assignments,[{candidateIndex:0,targetIndex:0}]);
  assert.deepEqual(result.unmatchedTargetIndices,[1,2]);
});
test('equally good assignments are stable across selection order', () => {
  const targets=[s('7'),d('7'),b('7')], cards=[h('9'),h('8'),h('10')];
  assert.deepEqual(mapping(cards,targets),mapping([...cards].reverse(),targets));
});
test('extra and unhelpful selected cards remain explicit; oversized plays are invalid', () => {
  const result=analyzeDefense([s('8'),d('8'),b('8'),d('9')],[s('7'),d('7'),b('7')],'hearts');
  assert.equal(result.assignments.length,3); assert.equal(result.unmatchedCandidateIndices.length,1); assert.equal(result.reason,'wrong-count');
  assert.equal(analyzeDefense([d('7')],[s('8')],'hearts').reason,'uncovered-targets');
});
test('single jokers work, multi-card jokers cannot contribute, and duplicates are rejected', () => {
  assert(analyzeDefense([j('red')],[j('black')],'hearts').valid);
  assert(!analyzeDefense([j('black')],[j('red')],'hearts').valid);
  const result=analyzeDefense([j('red'),s('8'),d('8')],[s('7'),d('7'),b('7')],'hearts');
  assert.equal(result.reason,'jokers-must-play-alone');assert.equal(result.assignments.length,2);assert(result.unmatchedCandidateIndices.includes(0));
  assert.equal(analyzeDefense([h('A'),h('A')],[s('7')],'hearts').reason,'duplicate-cards');
  assert.equal(analyzeDefense([],[],'hearts').reason,'invalid-target');
});
test('preview legality remains independent of lead restrictions for three and five defenses', () => {
  for(const targets of [[s('7'),d('7'),b('7')],[s('7'),d('7'),b('7'),s('8'),d('8')]]){
    const cards=targets.map(c=>({...c,rank:'A'})).map(c=>createDeck().find(x=>x.suit===c.suit&&x.rank===c.rank));
    // Five distinct trumps are a legal defense without requiring pairs.
    const selected=targets.length===5?['9','10','J','Q','K'].map(h):cards;
    const state=fixture({hands:{0:selected,2:[b('2')]},pile:targets,highest:targets,size:1});
    assert(analyzeDefense(selected,targets,'hearts').valid);assert.doesNotThrow(()=>play(state,selected));
  }
});
test('boolean legality agrees with an independent exhaustive matcher across seeded selections', () => {
  function reference(cards,targets,trump){
    if(![1,3,5].includes(cards.length)||cards.length!==targets.length)return false;
    if(cards.length>1&&[...cards,...targets].some(c=>c.kind==='joker'))return false;
    function search(t,remaining){return t===targets.length||remaining.some((c,i)=>beatsCard(c,targets[t],trump)&&search(t+1,remaining.filter((_,n)=>n!==i)));}
    return search(0,cards);
  }
  const rng=random(1729);
  for(let n=0;n<1000;n++){
    const deck=shuffleDeck(createDeck(),rng), size=[1,3,5][n%3],cards=deck.slice(0,size),targets=deck.slice(size,2*size);
    assert.equal(beatsSet(cards,targets,'hearts'),reference(cards,targets,'hearts'));
    assert.equal(analyzeDefense(cards,targets,'hearts').valid,reference(cards,targets,'hearts'));
  }
});
test('large selections stay bounded and cannot mutate inputs', () => {
  const deck=createDeck(), cards=Object.freeze(deck.slice(0,38)), targets=Object.freeze(deck.slice(38));
  const result=analyzeDefense(cards,targets,'hearts');
  assert(!result.valid);assert(result.assignments.length<=5);assert.equal(cards.length,38);
});
