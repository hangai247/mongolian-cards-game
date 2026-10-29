import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeck} from '../dist/rules/engine.js';
import {makePlayingCard} from '../dist/card-system.js';
function element(tag){
 const el={tag,className:'',dataset:{},attrs:{},style:{},children:[],textContent:'',append(...nodes){this.children.push(...nodes)},setAttribute(k,v){this.attrs[k]=v}};
 el.classList={add(...names){el.className+=' '+names.join(' ')},toggle(name,on){if(on)this.add(name)}};return el;
}
const doc={createElement:element},walk=el=>[el,...el.children.flatMap(walk)];
test('every card in the real 43-card deck retains both identity corners and its exact pip count',()=>{
 const deck=createDeck();assert.equal(deck.length,43);
 for(const card of deck){
  const el=makePlayingCard(card,true,doc),nodes=walk(el);
  assert.equal(el.type,'button');assert.equal(el.dataset.cardId,card.id);assert(el.attrs['aria-label']);
  assert.equal(nodes.filter(n=>n.className.includes('card-corner')).length,2);
  const expected=card.kind==='ordinary'&&Number.isFinite(Number(card.rank))?Number(card.rank):0;
  assert.equal(nodes.filter(n=>n.tag==='i').length,expected);
  assert.equal(el.children[0].attrs['aria-hidden'],'true');
  if(['J','Q','K'].includes(card.rank))assert(nodes.some(n=>n.className==='mongol-court-art'));
 }
});
test('opponent backs do not inspect any face information',()=>{
 const card={id:'back:1',kind:'back'};
 for(const key of ['rank','suit','color'])Object.defineProperty(card,key,{get(){throw Error('Hidden card read')}});
 const el=makePlayingCard(card,false,doc);
 assert.equal(el.dataset.rank,undefined);assert.equal(el.attrs['aria-label'],'Далд хөзөр');
 assert.equal(walk(el).filter(n=>n.className==='back-symbol').length,1);
});
