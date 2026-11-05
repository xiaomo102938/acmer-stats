import {onMounted,onBeforeUnmount,ref} from 'vue';
import {apiFailureEvent} from './api-fetch.js';

const labels={unknown:'未检查',ok:'正常',database:'数据库异常',offline:'服务不可达'};
const details={
 unknown:'等待检查本机服务和数据库。',
 ok:'本机服务可访问，MySQL 查询成功。',
 database:'本机服务可访问，MySQL 检查失败。',
 offline:'暂时无法访问本机后端，请检查网站服务。'
};

export default{
 setup(){
  const status=ref('unknown'),checking=ref(false),checkedAt=ref(null);
  let request;
  async function check(){
   if(request)return;
   const current=new AbortController();request=current;checking.value=true;
   const timeout=setTimeout(()=>current.abort(),5000);
   try{
    const response=await fetch('/api/health',{cache:'no-store',signal:current.signal});
    const result=await response.json();
    status.value=result.database==='ok'&&response.ok?'ok':result.database==='error'?'database':'offline';
   }catch{status.value='offline';}
   finally{
    clearTimeout(timeout);
    if(request===current){request=null;checking.value=false;checkedAt.value=new Date();}
   }
  }
  function onVisible(){if(document.visibilityState==='visible')check();}
  function onFailure(){if(!checkedAt.value||Date.now()-checkedAt.value.getTime()>5000)check();}
  onMounted(()=>{
   check();
   document.addEventListener('visibilitychange',onVisible);
   window.addEventListener(apiFailureEvent,onFailure);
  });
  onBeforeUnmount(()=>{
   document.removeEventListener('visibilitychange',onVisible);
   window.removeEventListener(apiFailureEvent,onFailure);
   request?.abort();request=null;
  });
  return {status,checking,checkedAt,labels,details,check};
 },
 template:`<details class="site-status">
  <summary :title="'网站状态 · '+labels[status]" :aria-label="'网站状态 · '+labels[status]"><span :class="['status-dot',status,{'loading-dot':checking}]" aria-hidden="true"></span><span class="site-status-label">网站状态 · {{checking?'检查中…':labels[status]}}</span></summary>
  <div class="site-status-detail">
   <p role="status">{{details[status]}}</p>
   <p class="muted">上次检查 {{checkedAt?.toLocaleTimeString('zh-CN',{hour12:false})||'—'}}</p>
   <button type="button" :disabled="checking" :aria-busy="checking" @click="check">{{checking?'检查中…':'重新检查'}}</button>
  </div>
 </details>`
};
