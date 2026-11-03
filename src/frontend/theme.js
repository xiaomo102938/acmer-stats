import {ref,watch,onMounted,onBeforeUnmount} from 'vue';
const key='acmer-theme';
const valid=value=>['light','dark','system'].includes(value)?value:'system';
export function useTheme(onChange){
 const media=window.matchMedia('(prefers-color-scheme: dark)');
 let saved='system';
 try{saved=valid(localStorage.getItem(key));}catch{}
 const theme=ref(saved),isDark=ref(false);
 function apply(){
  isDark.value=theme.value==='dark'||(theme.value==='system'&&media.matches);
  document.documentElement.dataset.theme=isDark.value?'dark':'light';
  document.documentElement.style.colorScheme=isDark.value?'dark':'light';
 }
 function systemChanged(){if(theme.value==='system')apply();}
 function storageChanged(event){if(event.key===key||event.key===null)theme.value=valid(event.newValue);}
 apply();
 watch(theme,value=>{try{localStorage.setItem(key,value);}catch{}apply();});
 watch(isDark,()=>onChange?.(),{flush:'post'});
 onMounted(()=>{media.addEventListener('change',systemChanged);window.addEventListener('storage',storageChanged);});
 onBeforeUnmount(()=>{media.removeEventListener('change',systemChanged);window.removeEventListener('storage',storageChanged);});
 return {theme,isDark};
}
