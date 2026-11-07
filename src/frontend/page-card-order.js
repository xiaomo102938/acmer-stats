import {computed,ref} from 'vue';

const cardOrderKey='acmer-page-card-order';
const cardCatalog={
 analysis:[
  {id:'overall',title:'综合能力参考'},{id:'ability-trend',title:'能力变化趋势'},
  {id:'practice-trend',title:'练习趋势'},{id:'difficulty',title:'难度分布'},
  {id:'platforms',title:'各平台练习情况'},{id:'topics',title:'题型能力参考'},
  {id:'recommendation',title:'推荐练习'},{id:'graph',title:'技能图谱'}
 ],
 team:[{id:'qoj-summary',title:'场次总览'},{id:'qoj-medals',title:'QOJ 奖牌题'},{id:'qoj-vp',title:'团队赛场次分析'}],
 records:[{id:'submissions',title:'提交记录'}],
 settings:[
  {id:'appearance',title:'外观'},{id:'layout',title:'技能图谱布局偏好'},
  {id:'specialty',title:'专职题型'},{id:'aliases',title:'标签类型归并'},
  {id:'topology',title:'技能图谱客制化'},{id:'accounts',title:'平台账号与同步'},{id:'problem-types',title:'题型管理'}
 ]
};
function readCardOrder(){
 let saved;
 try{saved=JSON.parse(localStorage.getItem(cardOrderKey));}catch{}
 return Object.fromEntries(Object.entries(cardCatalog).map(([page,cards])=>{
  const defaults=cards.map(card=>card.id);
  const savedOrder=saved?.[page]??(page==='team'?saved?.analysis:undefined);
  const previous=Array.isArray(savedOrder)?savedOrder.filter(id=>defaults.includes(id)):[];
  if(page==='team'&&!previous.includes('qoj-summary'))previous.unshift('qoj-summary');
  return [page,[...new Set([...previous,...defaults])]];
 }));
}

export function useCardOrder(page){
  const editingCards=ref(false),cardOrder=ref(readCardOrder()),cardOrderError=ref('');
  const cardPositions=computed(()=>Object.fromEntries((cardOrder.value[page.value]??[]).map((id,index)=>[id,index])));
  const editableCards=computed(()=>(cardOrder.value[page.value]??[]).map(id=>cardCatalog[page.value].find(card=>card.id===id)));
  const cardStyle=id=>({order:cardPositions.value[id]});
  function moveCard(from,to){
   const order=cardOrder.value[page.value];
   if(!editingCards.value||!order?.includes(from)||!order.includes(to)||from===to)return;
   const next=order.filter(id=>id!==from);
   next.splice(order.indexOf(to),0,from);
   const updated={...cardOrder.value,[page.value]:next};
   cardOrder.value=updated;
   try{localStorage.setItem(cardOrderKey,JSON.stringify(updated));cardOrderError.value='';}
   catch{cardOrderError.value='当前浏览器无法保存卡片顺序。';}
  }
  return {editingCards,editableCards,cardPositions,cardStyle,moveCard,cardOrderError};
}
