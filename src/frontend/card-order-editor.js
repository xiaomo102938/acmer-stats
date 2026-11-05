import {ref} from 'vue';

export default {
 props:{cards:{type:Array,required:true}},
 emits:['move'],
 setup(props,{emit}){
  const dragged=ref(null),target=ref(null);
  function start(event,id){
   dragged.value=id;
   event.dataTransfer.effectAllowed='move';
   event.dataTransfer.setData('text/plain',id);
  }
  function hover(event,id){
   if(!dragged.value||dragged.value===id)return;
   event.preventDefault();
   event.dataTransfer.dropEffect='move';
   target.value=id;
  }
  function clear(){dragged.value=null;target.value=null;}
  function drop(event,id){
   if(dragged.value&&dragged.value!==id){
    event.preventDefault();
    emit('move',dragged.value,id);
   }
   clear();
  }
  return {dragged,target,start,hover,clear,drop};
 },
 template:`<div class="card-order-editor" aria-label="当前页面卡片顺序">
  <article v-for="card in cards" :key="card.id" class="panel card-order-row"
   :class="{'card-order-dragged':dragged===card.id,'card-order-target':target===card.id}"
   @dragover="hover($event,card.id)" @drop="drop($event,card.id)">
   <h2 :draggable="cards.length>1" @dragstart="start($event,card.id)" @dragend="clear">
    <span v-if="cards.length>1" aria-hidden="true">⠿</span> {{card.title}}
   </h2>
   <slot v-if="card.id==='appearance'" />
  </article>
 </div>`
};
