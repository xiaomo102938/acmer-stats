import {ref,computed,onMounted,onBeforeUnmount,watch} from 'vue';
import {submissionLabel as label,problemLink as link} from './submission-display.js';
export default{
 props:{refreshKey:Number},
 setup(props){
  const items=ref([]),page=ref(1),pageSize=ref(25),pages=ref(1),total=ref(0),loading=ref(false),error=ref(''),jump=ref(1);let request,serial=0;
  const buttons=computed(()=>[...new Set([1,...Array.from({length:5},(_,i)=>page.value-2+i).filter(n=>n>1&&n<pages.value),pages.value])].sort((a,b)=>a-b));
  async function load(target=page.value){
   request?.abort();request=new AbortController();const id=++serial;loading.value=true;error.value='';items.value=[];
   try{const r=await fetch('/api/submissions?'+new URLSearchParams({page:String(target),pageSize:String(pageSize.value)}),{signal:request.signal});const body=await r.json();if(!r.ok)throw new Error(body.message);
    if(id!==serial)return;items.value=body.items;page.value=body.page;pages.value=body.pages;total.value=body.total;jump.value=body.page;
   }catch(e){if(id===serial&&e.name!=='AbortError')error.value=e.message||'读取提交记录失败';}finally{if(id===serial)loading.value=false;}
  }
  const go=()=>{if(Number.isInteger(Number(jump.value))&&jump.value>=1&&jump.value<=pages.value)load(Number(jump.value));};
  watch(()=>props.refreshKey,()=>load());onMounted(()=>load());onBeforeUnmount(()=>{serial++;request?.abort();});
  return {items,page,pageSize,pages,total,loading,error,jump,buttons,load,label,link,go};
 },
 template:`<article class="panel recent" aria-label="提交记录列表">
  <div class="panel-head"><h2>提交记录</h2><span>共 {{total}} 条已同步提交 · 时间由新到旧</span></div>
  <div class="submission-controls"><label>每页 <select v-model.number="pageSize" @change="load(1)" aria-label="每页提交数量"><option :value="10">10 条</option><option :value="25">25 条</option><option :value="50">50 条</option><option :value="100">100 条</option></select></label></div>
  <p v-if="error" class="error" role="alert">{{error}} <button @click="load()">重试</button></p>
  <p v-if="loading" role="status">正在读取当前页…</p>
  <div v-else class="table-wrap"><table><thead><tr><th>提交时间（UTC+8）</th><th>题目</th><th>状态</th><th>平台</th><th>账号</th><th>平台提交编号</th></tr></thead><tbody><tr v-for="r in items" :key="r.submission_id"><td class="submission-time"><span>{{r.submitted_at.slice(0,10)}}</span><span>{{r.submitted_at.slice(11)}}</span></td><td class="submission-problem"><a v-if="link(r)" class="problem" :href="link(r)" target="_blank" rel="noopener noreferrer">{{r.problem_name}} ↗</a><span v-else>{{r.problem_name}}</span></td><td><span class="badge" :class="{good:r.passed===1,weak:r.passed!==1}">{{label(r)}}</span></td><td>{{r.platform_name}}</td><td>{{r.account_login}}</td><td>{{r.source_id}}</td></tr></tbody></table><p v-if="!error&&!items.length" class="muted">暂无已同步的提交记录。</p></div>
  <nav class="submission-pagination" aria-label="提交记录分页"><button :disabled="loading||page<=1" @click="load(page-1)">上一页</button><template v-for="(n,i) in buttons" :key="n"><span v-if="i&&n>buttons[i-1]+1">…</span><button :disabled="loading" :aria-current="n===page?'page':undefined" @click="load(n)">{{n}}</button></template><button :disabled="loading||page>=pages" @click="load(page+1)">下一页</button><span aria-live="polite">第 {{page}} / {{pages}} 页</span><form @submit.prevent="go"><label>跳至 <input v-model.number="jump" type="number" min="1" :max="pages" required aria-label="跳转页码"> 页</label><button :disabled="loading">跳转</button></form></nav>
  <p class="footnote">按真实提交逐条展示，同题多次提交分别保留。仅含已同步数据：CF、AT 和 QOJ 可包含非 AC；牛客、力扣当前主要提供 AC，洛谷清单及手工汇总没有逐次提交信息，不在此虚构记录。旧数据若未保存具体判定，仅标记“非 AC”，后续重新同步可补充。时间相同时使用固定编号排序。</p>
 </article>`
};
