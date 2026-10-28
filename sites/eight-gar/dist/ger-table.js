// Shared presentation chrome. Existing game controls keep their handlers and state.
const $ = id => document.getElementById(id);
import { controlIcon, setActionButton } from './control-icons.js';
import { mountScreenWakeLock } from './screen-wake-lock.js';
const icons = Object.fromEntries(['settings','sound','muted','copy'].map(name=>[name,controlIcon(name)]));
const brand=document.querySelector('.brand-mark');
brand.innerHTML='<svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round" aria-hidden="true"><path d="m28 3 8 8-8 8-8-8ZM28 37l8 8-8 8-8-8ZM3 28l8-8 8 8-8 8Zm34 0 8-8 8 8-8 8ZM28 14l14 14-14 14-14-14Z"/><path d="m16 16 24 24M16 40l24-24M23 23h10v10H23Z"/></svg>';
document.querySelector('.brand small').textContent='Найзуудын ширээ';
// A single score capsule, with round and trump still visible below it.
const score=document.querySelector('.scoreboard');
const scoreNumbers=document.createElement('div');scoreNumbers.className='score-numbers';
scoreNumbers.append($('score-us'),document.createTextNode(' : '),$('score-them'));
score.insertBefore(scoreNumbers,document.querySelector('.round-meta'));
const hud=document.createElement('div');hud.className='turn-hud';
const ring=document.createElement('span');ring.className='turn-ring';ring.setAttribute('aria-hidden','true');
const text=document.createElement('div');text.className='turn-hud-copy';
text.append($('turn-label'));if($('turn-timer'))text.append($('turn-timer'));
const guidance=$('guidance');text.append(guidance);hud.append(ring,text);$('felt').append(hud);
const utility=document.createElement('div');utility.className='table-utility';
const selection=document.createElement('span');selection.id='selection-count';selection.setAttribute('aria-live','polite');
// Keep set declarations in the main controls so they are discoverable on phones.
const signalSlot=document.createElement('div');signalSlot.className='signal-slot';
utility.append(signalSlot,selection,$('sort'));
let explainButton;
const defensePanel=$('defense-preview');
if(defensePanel){
 const explain=document.createElement('button');explain.type='button';explain.className='icon-button defense-toggle';explain.innerHTML=controlIcon('help')+'<span>Дарах хөзрийн тайлбар</span>';explainButton=explain;explain.setAttribute('aria-label','Дарах хөзрийн тайлбар');explain.title='Дарах хөзрийн тайлбар';explain.setAttribute('aria-controls','defense-preview');explain.setAttribute('aria-expanded','false');
 explain.onclick=()=>{const open=document.body.classList.toggle('defense-open');explain.setAttribute('aria-expanded',String(open));};
 const sync=()=>{explain.disabled=defensePanel.hidden;if(defensePanel.hidden){document.body.classList.remove('defense-open');explain.setAttribute('aria-expanded','false');}};
 new MutationObserver(sync).observe(defensePanel,{attributes:true,attributeFilter:['hidden']});sync();
}

const voice=document.querySelector('.voice-dock');if(voice)utility.prepend(voice);
document.querySelector('.hand-zone').append(utility);
$('sort').setAttribute('aria-label','Хөзрөө эрэмбэлэх');
setActionButton($('sort'),'Эрэмбэлэх','sort');
// Settings is a real dialog: rules and existing new-match/leave controls remain reachable.
const settings=document.createElement('dialog');settings.id='table-settings';settings.setAttribute('aria-labelledby','settings-title');
settings.innerHTML='<div class="dialog-top"><span class="eyebrow">8 ГАР · ШИРЭЭ</span><button class="close-button" aria-label="Хаах">×</button></div><h2 id="settings-title">Ширээний тохиргоо</h2><div class="settings-actions"></div>';
settings.querySelector('.close-button').onclick=()=>settings.close();settings.addEventListener('click',e=>{if(e.target===settings){const b=settings.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)settings.close();}});
for(const id of ['rules-open','new-match']){const b=$(id);settings.querySelector('.settings-actions').append(b);b.addEventListener('click',()=>settings.close());}
if(explainButton){settings.querySelector('.settings-actions').append(explainButton);explainButton.addEventListener('click',()=>settings.close());}
mountScreenWakeLock(settings.querySelector('.settings-actions'));
const head=document.querySelector('.header-right');
const settingsButton=document.createElement('button');settingsButton.className='icon-button';settingsButton.innerHTML=icons.settings;settingsButton.title='Тохиргоо';settingsButton.setAttribute('aria-label','Тохиргоо');settingsButton.onclick=()=>settings.showModal();head.append(settingsButton);document.body.append(settings);
// Practice audio is local. Online audio uses the existing voice control instead.
if(document.body.classList.contains('practice-table')){
 const sound=document.createElement('button');sound.id='sound-toggle';sound.className='icon-button';let enabled=true;try{enabled=localStorage.getItem('eight-gar-sound')!=='off';}catch{}
 const update=()=>{sound.innerHTML=enabled?icons.sound:icons.muted;sound.title=enabled?'Дуу хаах':'Дуу асаах';sound.setAttribute('aria-label',sound.title);sound.setAttribute('aria-pressed',String(enabled));};update();
 sound.onclick=()=>{enabled=!enabled;try{localStorage.setItem('eight-gar-sound',enabled?'on':'off');}catch{}document.dispatchEvent(new CustomEvent('table-sound-change',{detail:enabled}));update();};utility.prepend(sound);
}
if($('copy-link')){$('copy-link').innerHTML=icons.copy;$('copy-link').setAttribute('aria-label','Ширээний холбоос хуулах');$('copy-link').title='Ширээний холбоос хуулах';}
if($('room-badge')){
 const invite=document.createElement('button');invite.id='invite-friend';invite.className='icon-button';invite.innerHTML=controlIcon('invite');invite.setAttribute('aria-label','Найз урих');invite.title='Найз урих · ширээний холбоос хуулах';
 invite.onclick=()=>$('copy-link').click();head.insertBefore(invite,settingsButton);
 const syncInvite=()=>{invite.hidden=$('room-badge').hidden;};new MutationObserver(syncInvite).observe($('room-badge'),{attributes:true,attributeFilter:['hidden']});syncInvite();
}
function updateSelection(){const count=Number(document.body.dataset.selection||0);const value=count?`${count} хөзөр сонгосон`:`${$('hand').children.length} хөзөр`;if(selection.textContent!==value)selection.textContent=value;}
new MutationObserver(updateSelection).observe(document.body,{attributes:true,attributeFilter:['data-selection']});
new MutationObserver(updateSelection).observe($('hand'),{childList:true});updateSelection();
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.body.classList.remove('defense-open');document.querySelector('.defense-toggle')?.setAttribute('aria-expanded','false');}});
