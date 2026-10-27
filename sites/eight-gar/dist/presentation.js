/** Ordered visual steps. The engine's complete result is committed/saved before these run. */
export function transitionSteps(before, events) {
  let scene=before;
  const steps=[];
  for(const event of events){
    const previous=scene;
    const hands=scene.hands.map(h=>[...h]);
    if(event.type==='played'){
      const ids=new Set(event.cards.map(c=>c.id));hands[event.player]=hands[event.player].filter(c=>!ids.has(c.id));
      scene={...scene,hands,table:{pile:[...scene.table.pile,...event.cards],highest:[...event.cards]}};
      steps.push({type:'play',player:event.player,cards:event.cards,before:previous,after:scene});
    }else if(event.type==='picked-up'){
      hands[event.player].push(...event.cards);scene={...scene,hands,table:{pile:[],highest:[]}};
      steps.push({type:'pickup',player:event.player,cards:event.cards,before:previous,after:scene});
    }else if(event.type==='refilled'){
      hands[event.player].push(...event.cards);scene={...scene,hands,reserve:scene.reserve.slice(event.cards.length)};
      steps.push({type:'refill',player:event.player,cards:event.cards,before:previous,after:scene});
    }else if(event.type==='table-slept'){
      scene={...scene,sleeping:[...scene.sleeping,...scene.table.pile],table:{pile:[],highest:[]}};
      steps.push({type:'sleep',player:event.player,cards:previous.table.pile,before:previous,after:scene});
    }
  }
  return steps;
}
/** Only a count reaches the opponent card-fan renderer, never hidden card identities. */
export function fanLayout(count) {
  if(!Number.isInteger(count)||count<0||count>43)throw new RangeError('Invalid hand size');
  const step=count>1?Math.min(8,86/(count-1)):0;
  const angle=count>1?Math.min(6,48/(count-1)):0;
  return Array.from({length:count},(_,index)=>({index,x:(index-(count-1)/2)*step,angle:(index-(count-1)/2)*angle}));
}
