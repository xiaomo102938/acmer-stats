import {ref,watch,onMounted,onBeforeUnmount} from 'vue';
const key='acmer-theme';
const valid=value=>['light','dark','system'].includes(value)?value:'system';
export function useTheme(onChange){
 const media=window.matchMedia('(prefers-color-scheme: dark)');
 let saved='system';
 try{saved=valid(localStorage.getItem(key));}catch{}
 const theme=ref(saved),isDark=ref(false);
 let transitionTimer;
 const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
 function apply(animate=false){
  const nextDark=theme.value==='dark'||(theme.value==='system'&&media.matches);
  if(animate&&nextDark!==isDark.value&&!reducedMotion.matches){
   clearTimeout(transitionTimer);
   document.documentElement.classList.add('theme-changing');
   transitionTimer=setTimeout(()=>document.documentElement.classList.remove('theme-changing'),240);
  }
  isDark.value=theme.value==='dark'||(theme.value==='system'&&media.matches);
  document.documentElement.dataset.theme=isDark.value?'dark':'light';
  document.documentElement.style.colorScheme=isDark.value?'dark':'light';
 }
 function systemChanged(){if(theme.value==='system')apply(true);}
 function storageChanged(event){if(event.key===key||event.key===null)theme.value=valid(event.newValue);}
 apply();
 watch(theme,value=>{try{localStorage.setItem(key,value);}catch{}apply(true);});
 watch(isDark,()=>onChange?.(),{flush:'post'});
 onMounted(()=>{media.addEventListener('change',systemChanged);window.addEventListener('storage',storageChanged);});
 onBeforeUnmount(()=>{clearTimeout(transitionTimer);document.documentElement.classList.remove('theme-changing');media.removeEventListener('change',systemChanged);window.removeEventListener('storage',storageChanged);});
 return {theme,isDark};
}
