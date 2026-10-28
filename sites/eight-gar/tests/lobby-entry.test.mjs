import test from 'node:test';
import assert from 'node:assert/strict';
import { lobbyViewportState, mountLobbyViewport } from '../dist/lobby-entry.js';

test('keyboard geometry distinguishes keyboard, browser chrome, desktop and pinch zoom', () => {
  const input = { width: 390, height: 480, baseline: 844, focused: true };
  assert.equal(lobbyViewportState(input).keyboard, true);
  for (const change of [{focused:false},{height:780},{scale:2},{width:1440}]) {
    assert.equal(lobbyViewportState({...input,...change}).keyboard, false);
  }
  assert.deepEqual(lobbyViewportState({...input,offsetTop:35}), {height:480,top:35,keyboard:true});
});

function fixture(withViewport = true) {
  const win = new EventTarget();
  const doc = new EventTarget();
  win.innerWidth = 390; win.innerHeight = 844;
  const frames=[]; win.requestAnimationFrame = f => {frames.push(f);return frames.length;};
  if(withViewport) win.visualViewport = Object.assign(new EventTarget(), {height:844,offsetTop:0,scale:1});
  const classes = new Set(['lobby-home']), properties = new Map();
  doc.body = {classList:{contains:v=>classes.has(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)},style:{setProperty:(k,v)=>properties.set(k,v)}};
  const field = {matches:()=>true,getBoundingClientRect:()=>({top:58,bottom:110})};
  const button = {matches:()=>false};
  const entry = Object.assign(new EventTarget(), {contains:e=>e===field||e===button});
  const scroller = {scrollTop:0,getBoundingClientRect:()=>({top:win.visualViewport?.offsetTop||0,bottom:win.visualViewport?.height||win.innerHeight})};
  doc.getElementById = id => id==='lobby-entry'?entry:scroller;
  const flush = () => {while(frames.length)frames.shift()();};
  const resize = h => {if(withViewport){win.visualViewport.height=h;win.visualViewport.dispatchEvent(new Event('resize'));}else{win.innerHeight=h;win.dispatchEvent(new Event('resize'));}flush();};
  const focus = el => {doc.activeElement=el;entry.dispatchEvent(new Event(el===field?'focusin':'focusout'));flush();};
  mountLobbyViewport(win,doc);
  return {win,doc,field,button,entry,scroller,classes,properties,resize,focus,flush};
}

test('button focus cannot expand the lobby beneath an open keyboard; dismissal restores it', () => {
  const f=fixture();f.focus(f.field);f.resize(480);
  assert(f.classes.has('lobby-keyboard'));
  f.focus(f.button);assert(f.classes.has('lobby-keyboard'));
  f.resize(844);assert(!f.classes.has('lobby-keyboard'));
  assert.equal(f.properties.get('--lobby-vv-height'),'844px');
});

test('a panned visual viewport tracks its top and scrolls the active field into view', () => {
  const f=fixture();f.focus(f.field);f.resize(300);
  f.win.visualViewport.offsetTop=40;
  f.field.getBoundingClientRect=()=>({top:370,bottom:422});
  f.win.visualViewport.dispatchEvent(new Event('scroll'));f.flush();
  assert.equal(f.properties.get('--lobby-vv-top'),'40px');
  assert(f.scroller.scrollTop>0);
});

test('room entry clears keyboard presentation even while viewport recovery is pending', () => {
  const f=fixture();f.focus(f.field);f.resize(480);
  f.classes.delete('lobby-home');f.doc.dispatchEvent(new Event('lobby-state-change'));f.flush();
  assert(!f.classes.has('lobby-keyboard'));
});

test('layout viewport resize remains usable without VisualViewport', () => {
  const f=fixture(false);f.focus(f.field);f.resize(360);
  assert(f.classes.has('lobby-keyboard'));
  assert.equal(f.properties.get('--lobby-vv-height'),'360px');
  f.resize(844);assert(!f.classes.has('lobby-keyboard'));
});
