import {computed,ref,watch} from 'vue';
import {apiFetch} from './api-fetch.js';
import {qojMedalLabels} from '../shared/qoj-medal-labels.js';

export default {
 props:{refreshKey:Number},
 emits:['inspect'],
 setup(props){
  const sessions=ref([]),scope=ref('all'),error=ref(''),loading=ref(false);
  let request=0;
  async function load(){
   const id=++request;
   loading.value=true;error.value='';
   try{
    const response=await apiFetch('/api/qoj-vp/summary');
    if(!response.ok)throw Error('暂时无法读取场次总览。');
    const result=await response.json();
    if(id===request)sessions.value=result.sessions;
   }catch(e){if(id===request)error.value=e.message;}
   finally{if(id===request)loading.value=false;}
  }
  watch(()=>props.refreshKey,load,{immediate:true});
  const visible=computed(()=>scope.value==='recent'?sessions.value.slice(0,10):sessions.value);
  const trend=computed(()=>[...visible.value].reverse());
  const average=field=>visible.value.length?(visible.value.reduce((sum,row)=>sum+row[field],0)/visible.value.length).toFixed(1):'—';
  const maxSolved=computed(()=>Math.max(1,...visible.value.map(row=>row.solved)));
  const coverage=computed(()=>visible.value.filter(row=>row.completeRoster).length);
  const tiers=computed(()=>Object.entries(qojMedalLabels).map(([tier,label])=>{
   const counts={total:0,solved:0,upsolved:0};
   for(const session of visible.value){
    const row=session.byTier[tier];
    if(row)for(const field of Object.keys(counts))counts[field]+=row[field];
   }
   return {tier,label,...counts};
  }));
  const key=s=>[s.account_id,s.contest_key,s.starts_at].join('|');
  return {sessions,scope,error,loading,visible,trend,average,maxSolved,coverage,tiers,key,load};
 },
 template:`
 <article class="panel" aria-label="场次总览">
  <div class="panel-head"><h2>场次总览</h2>
   <label>范围 <select v-model="scope" aria-label="场次总览范围"><option value="all">全部场次</option><option value="recent">最近 10 场</option></select></label>
  </div>
  <LoadingNotice v-if="loading">正在读取场次总览…</LoadingNotice>
  <p v-if="error" role="alert" class="error">{{error}} <button @click="load">重试</button></p>
  <p v-else-if="!loading&&!sessions.length" class="footnote">同步 QOJ VP 记录后可查看场次总览。</p>
  <template v-if="visible.length">
   <p>场次 <strong>{{visible.length}}</strong> · 场均赛内通过 <strong>{{average('solved')}}</strong> 道 · 场均赛后补题 <strong>{{average('upsolved')}}</strong> 道</p>
   <h3>场次趋势</h3>
   <p class="footnote">柱高表示赛内过题数。悬停查看成绩，点击打开复盘。</p>
   <div class="vp-summary-trend" aria-label="按日期排列的 QOJ 场次趋势">
    <button v-for="s in trend" :key="key(s)" type="button"
     :title="s.contest_name+' · '+s.starts_at+' · 赛内通过 '+s.solved+' 道 · 总罚时 '+s.penalty+' · 赛后补题 '+s.upsolved+' 道'"
     :aria-label="s.contest_name+'，'+s.starts_at+'，赛内通过 '+s.solved+' 道，总罚时 '+s.penalty+'，赛后补题 '+s.upsolved+' 道，查看复盘'"
     @click="$emit('inspect',key(s))">
     <span class="vp-summary-bar" :style="{height:(s.solved/maxSolved*80)+'px'}">{{s.solved}}</span>
     <small>{{s.starts_at.slice(5,10)}}</small>
    </button>
   </div>
   <h3>各档位表现</h3>
   <p class="footnote">题单覆盖 {{coverage}} / {{visible.length}} 场。每次 VP 的题目分别计数。</p>
   <div v-if="coverage" class="table-wrap"><table><thead><tr><th>档位</th><th>出题数</th><th>赛内通过</th><th>赛后补题</th></tr></thead>
    <tbody><tr v-for="row in tiers" :key="row.tier"><td>{{row.label}}</td><td>{{row.total}}</td><td>{{row.solved}}</td><td>{{row.upsolved}}</td></tr></tbody>
   </table></div>
  </template>
 </article>`
};
