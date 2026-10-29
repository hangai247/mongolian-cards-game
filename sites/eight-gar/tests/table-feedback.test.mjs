import test from 'node:test';
import assert from 'node:assert/strict';
import { createSleepNotice, hostName, voiceCaption } from '../dist/table-feedback.js';
import { seatName } from '../dist/locale-mn.js';

test('sleep remains visible for 2.5 seconds; resets and new events cancel the old expiry', () => {
  const pending = new Map(); let id = 0, refreshes = 0;
  const notice = createSleepNotice(() => refreshes++, {
    setTimer(fn, ms) { assert.equal(ms, 2500); pending.set(++id, fn); return id; },
    clearTimer(key) { pending.delete(key); },
  });
  notice.show(); assert.equal(notice.active, true);
  notice.show(); assert.equal(pending.size, 1);
  pending.get(id)(); assert.equal(notice.active, false); assert.equal(refreshes, 1);
  notice.show(); notice.clear();
  assert.equal(notice.active, false); assert.equal(pending.size, 0);
});

test('reserved computer seats preserve human names without the English server suffix', () => {
  assert.equal(seatName({kind:'bot',seat:1,name:'Oyu (computer)',reservedForName:'Oyu'}), 'Oyu');
  assert.equal(seatName({kind:'human',seat:1,name:'Oyu'}), 'Oyu');
  assert.match(seatName({kind:'bot',seat:1,name:'Computer 2'}), /\(компьютер\)$/);
});

test('host identification follows the current role rather than the creator or viewer', () => {
  assert.equal(hostName({seats:[{name:'Original',isHost:false},{name:'Current',isHost:true}]}), 'Current');
  assert.equal(hostName({seats:[{name:'Oyu (computer)',reservedForName:'Oyu',isHost:true}]}), 'Oyu');
});

test('voice captions distinguish mute, permission, connection failure and blocked playback', () => {
  assert.equal(voiceCaption({state:'on',micOn:false}), 'Хаалттай');
  assert.equal(voiceCaption({state:'on',micOn:true}), 'Асаалттай');
  assert.equal(voiceCaption({state:'on',micBlocked:true}), 'Зөвшөөрөл');
  assert.equal(voiceCaption({state:'error',micBlocked:true}), 'Тасарсан');
  assert.equal(voiceCaption({state:'connecting'}), 'Холбож байна');
  assert.equal(voiceCaption({state:'on',audioBlocked:true}), 'Сонсох');
});
