import { cardLabel, JOKER_LABELS } from './locale-mn.js';

export const SUIT_SYMBOLS = Object.freeze({ hearts:'♥︎',diamonds:'♦︎',spades:'♠︎',clubs:'♣︎' });
// Positions are relative to the card, with a protected rail for the corner indices.
const pipPositions = {
  2:[[50,27],[50,73]],3:[[50,24],[50,50],[50,76]],
  7:[[35,24],[65,24],[35,50],[65,50],[35,76],[65,76],[50,37]],
  8:[[35,24],[65,24],[35,50],[65,50],[35,76],[65,76],[50,37],[50,63]],
  9:[[35,21],[65,21],[35,40],[65,40],[35,60],[65,60],[35,79],[65,79],[50,50]],
  10:[[35,21],[65,21],[35,40],[65,40],[35,60],[65,60],[35,79],[65,79],[50,30.5],[50,69.5]],
};
function node(doc,tag,className,text) {
  const el=doc.createElement(tag);
  el.className=className;
  if(text!==undefined)el.textContent=text;
  return el;
}
export function makePlayingCard(card,interactive=false,doc=globalThis.document) {
  const el=node(doc,interactive?'button':'div','card mongol-card');
  if(interactive){el.type='button';el.dataset.cardId=card.id;}else el.dataset.publicId=card.id;
  const face=node(doc,'span','mongol-face');
  face.setAttribute('aria-hidden','true');el.append(face);
  // A hidden card never reads suit, rank or color, including during flight.
  if(card.kind==='back'){
    el.classList.add('mongol-back');el.setAttribute('aria-label','Далд хөзөр');
    face.append(node(doc,'span','back-symbol'));return el;
  }
  el.setAttribute('aria-label',cardLabel(card));
  const joker=card.kind==='joker',symbol=joker?'':SUIT_SYMBOLS[card.suit];
  el.classList.toggle('red',joker?card.color==='red':['hearts','diamonds'].includes(card.suit));
  if(joker)el.classList.add('joker',card.color);
  else {el.dataset.rank=card.rank;el.dataset.suit=card.suit;}
  for(const bottom of [false,true]){
    const corner=node(doc,'span',`card-corner${bottom?' card-bottom':''}`,joker?'★':card.rank);
    corner.append(node(doc,'small','',joker?{gray:'III',black:'II',red:'I'}[card.color]:symbol));
    face.append(corner);
  }
  if(joker){
    face.append(node(doc,'span','mongol-joker-art'));
    const label=node(doc,'span','mongol-joker-name',JOKER_LABELS[card.color]);
    label.append(node(doc,'small','','ЖОКЕР'));face.append(label);
  }else if(pipPositions[Number(card.rank)]){
    const pips=node(doc,'span','mongol-pips');
    for(const [x,y] of pipPositions[Number(card.rank)]){
      const pip=node(doc,'i','mongol-pip',symbol);
      pip.style.left=`${x}%`;pip.style.top=`${y}%`;
      if(y>50)pip.classList.add('inverted');pips.append(pip);
    }
    face.append(pips);
  }else if(['J','Q','K'].includes(card.rank)){
    el.classList.add('mongol-court');
    face.append(node(doc,'span','mongol-court-art'));
    face.append(node(doc,'span','mongol-court-suit',symbol));
  }else{
    el.classList.add('mongol-ace');
    face.append(node(doc,'span','mongol-ace-emblem',symbol));
    face.append(node(doc,'span','mongol-edition','НАЙМАН ГАР'));
  }
  return el;
}
