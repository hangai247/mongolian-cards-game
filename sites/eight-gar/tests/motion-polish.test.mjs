import test from 'node:test';
import assert from 'node:assert/strict';
import { springStep, bezierPoses } from '../dist/motion-math.js';
import { dealStep } from '../dist/presentation.js';
import { prepareMatch, createDeck } from '../../../dist/engine.js';

test('spring follows the same physical trajectory at 30, 60 and 144 Hz', () => {
  const sample = fps => {
    let value = 0, velocity = 0;
    for (let i = 0; i < fps / 2; i++) ({ value, velocity } = springStep(value, velocity, 9, 1 / fps));
    return { value, velocity };
  };
  const reference = sample(60);
  for (const fps of [30, 144]) {
    const result = sample(fps);
    assert(Math.abs(result.value - reference.value) < 1e-10);
    assert(Math.abs(result.velocity - reference.velocity) < 1e-10);
  }
  const first = springStep(0, 0, 9, 1 / 60);
  assert(first.value > 0 && first.value < 9, 'hover approaches instead of snapping');
  let value = 9, velocity = 0;
  for (let i = 0; i < 144; i++) ({ value, velocity } = springStep(value, velocity, 0, 1 / 144));
  assert(Math.abs(value) < .001 && Math.abs(velocity) < .001, 'release returns to rest');
});

test('cubic flight has exact endpoints and a spatial arc, including upward and sideways draws', () => {
  for (const end of [{x:400,y:100}, {x:20,y:600}, {x:800,y:200}]) {
    const from = {x:20,y:200,width:38,height:58,angle:-5};
    const to = {...end,width:93,height:136,angle:7};
    const curve = bezierPoses(from,to,80);
    assert.deepEqual(curve[0], {...from,offset:0});
    assert.deepEqual(curve.at(-1), {...to,offset:1});
    assert(Math.abs(curve[24].y - ((from.y+to.y)/2 - 60)) < 1e-8);
    assert(curve.every(p=>Object.values(p).every(Number.isFinite)));
    assert(curve.every((p,i)=>i===0||p.offset>curve[i-1].offset));
  }
});

test('deal presents 40 cards in five passes, preserves committed state, and hides every opponent face', () => {
  const scene = prepareMatch(createDeck(),0), original = JSON.stringify(scene);
  const step = dealStep(scene);
  assert.equal(step.cards.length,40);
  assert.equal(step.after,scene);
  assert.equal(JSON.stringify(scene),original);
  assert.deepEqual(step.before.hands.map(h=>h.length), Array(8).fill(0));
  assert.equal(step.after.reserve.length,3);
  for (let i=0;i<40;i++) {
    const {player,index}=step.recipients[i];
    assert.equal(player,i%8); assert.equal(index,Math.floor(i/8));
    if(player===0) assert.deepEqual(step.cards[i],scene.hands[0][index]);
    else { assert.equal(step.cards[i].kind,'back'); assert(!('rank' in step.cards[i])); }
  }
});

test('deal layout readiness releases locks on abort, rejection or stalled scene loading', async () => {
  const { waitForDealLayout } = await import('../dist/motion.js');
  const ready = new AbortController();
  assert.equal(await waitForDealLayout(Promise.resolve(),ready.signal),true);
  assert.equal(await waitForDealLayout(Promise.reject(Error('art unavailable')),ready.signal),false);
  const controller = new AbortController(), pending = new Promise(()=>{});
  const wait = waitForDealLayout(pending,controller.signal);
  controller.abort(); assert.equal(await wait,false);
  assert.equal(await waitForDealLayout(pending,new AbortController().signal,5),false);
});
