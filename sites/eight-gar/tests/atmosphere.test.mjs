import test from 'node:test';
import assert from 'node:assert/strict';
import {TableAtmosphere} from '../dist/atmosphere.js';
function audio(){
  const sources=[],param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=()=>({connect(){},disconnect(){},gain:param(),frequency:param()});
  const source=()=>{const s={...node(),starts:0,stops:0,start(){this.starts++},stop(){this.stops++}};sources.push(s);return s;};
  const context={state:'running',currentTime:1,sampleRate:1000,destination:{},createGain:node,createOscillator:source,createBufferSource:source,createBiquadFilter:node,createBuffer:(_,n)=>({getChannelData:()=>new Float32Array(n)})};
  return {sources,context};
}
test('sound remains silent before a gesture, deduplicates cues, and bounds pickup sources',async()=>{
  const fake=audio(),a=new TableAtmosphere({createContext:()=>fake.context,hidden:()=>false});
  a.cue('play','before');assert.equal(fake.sources.length,0);
  await a.unlock();a.cue('pickup','move:1');assert.equal(fake.sources.length,1);
  a.cue('pickup','move:1');assert.equal(fake.sources.length,1);
  a.cue('sleep','move:2');assert.equal(fake.sources.length,3);assert(fake.sources[0].stops>1);
  a.cue('win','move:3');assert.equal(a.sources.size,3);
  a.stop();assert.equal(a.sources.size,0);
});
test('mute, zero volume, and tab hiding suppress effects without replaying stale cues',async()=>{
  const fake=audio();let hidden=false;
  const a=new TableAtmosphere({createContext:()=>fake.context,hidden:()=>hidden});await a.unlock();
  a.cue('play','1');a.configure({sound:false,volume:.25});assert.equal(a.sources.size,0);
  a.cue('play','2');a.configure({sound:true,volume:0});a.cue('play','3');
  hidden=true;a.configure({sound:true,volume:.25});a.cue('play','4');assert.equal(fake.sources.length,1);
  hidden=false;a.cue('play','4');assert.equal(fake.sources.length,1);
});
test('missing or blocked audio cannot interrupt gameplay',async()=>{
  const a=new TableAtmosphere({createContext:()=>{throw new Error('not supported')},hidden:()=>false});
  await assert.doesNotReject(()=>a.unlock());assert.doesNotThrow(()=>a.cue('win','1'));
  const fake=audio();fake.context.state='suspended';fake.context.resume=async()=>{throw new Error('gesture required')};
  const blocked=new TableAtmosphere({createContext:()=>fake.context,hidden:()=>false});await blocked.unlock();blocked.cue('play','1');assert.equal(fake.sources.length,0);
});
test('a pending audio unlock cannot resurrect effects after cancellation',async()=>{
  const fake=audio();let resolve;fake.context.state='suspended';
  fake.context.resume=()=>new Promise(done=>{resolve=()=>{fake.context.state='running';done();};});
  const a=new TableAtmosphere({createContext:()=>fake.context,hidden:()=>false});
  const pending=a.unlock();a.stop();resolve();await pending;a.cue('play','cancelled');assert.equal(fake.sources.length,0);
});
