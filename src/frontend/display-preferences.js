import {computed,ref,watch} from 'vue';

const displayDefaults={fontSize:100,cardGap:22};
const displayControls=[
 {key:'fontSize',label:'字体大小',min:85,max:125,step:5,unit:'%'},
 {key:'cardGap',label:'卡片间距',min:8,max:40,step:1,unit:' px'}
];
const displayStorageKey='acmer-display-preferences';

export function useDisplayPreferences(){
  const display=ref({...displayDefaults});
  try {
   const saved=JSON.parse(localStorage.getItem(displayStorageKey));
   for(const {key,min,max,step} of displayControls){
    const value=saved?.[key];
    if(Number.isInteger(value)&&value>=min&&value<=max&&(value-min)%step===0)display.value[key]=value;
   }
  } catch {}
  function applyDisplay(){
   const style=document.documentElement.style;
   style.setProperty('--font-scale',display.value.fontSize/100);
   style.setProperty('--card-gap',display.value.cardGap+'px');
  }
  applyDisplay();
  watch(display,()=>{
   applyDisplay();
   try {localStorage.setItem(displayStorageKey,JSON.stringify(display.value));} catch {}
  },{deep:true});
  const displayIsDefault=computed(()=>displayControls.every(({key})=>display.value[key]===displayDefaults[key]));
  const resetDisplay=()=>{display.value={...displayDefaults};};
  return {display,displayControls,displayIsDefault,resetDisplay};
}
