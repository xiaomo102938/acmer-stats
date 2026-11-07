import {computed,onMounted,ref,watch} from 'vue';
import {apiFetch} from './api-fetch.js';
import {qojMedalLabels} from '../shared/qoj-medal-labels.js';

export default {
 setup(){
  const sessions=ref([]),selected=ref(''),detail=ref(null),loading=ref(false),syncing=ref(false);
  const error=ref(''),syncMessage=ref(''),boardError=ref(''),comparing=ref(false),rank=ref(null);
  const key=s=>[s.account_id,s.contest_key,s.starts_at].join('|');
  const session=computed(()=>sessions.value.find(s=>key(s)===selected.value));
  let detailRequest=0,boardRequest=0;
  async function json(url,options){
   const r=await apiFetch('/api/qoj-vp'+url,options);
   if(!r.ok){const body=await r.json().catch(()=>({}));throw new Error(body.message||'暂时无法读取 QOJ VP 数据。');}
   return r.json();
  }
  async function refresh(){
   try{
    sessions.value=(await json('')).sessions;
    if(!session.value)selected.value=sessions.value.length?key(sessions.value[0]):'';
    else await loadDetail();
   }catch(e){error.value=e.message;}
  }
  async function sync(){
   syncing.value=true;syncMessage.value='';error.value='';
   try{
    const r=await json('/sync',{method:'POST',headers:{'X-Acmer-Request':'1'}});
    syncMessage.value='已读取 '+r.count+' 条 VP 记录。'+(r.failed.length?' 部分账号暂时无法读取。':'');
    await refresh();
   }catch(e){syncMessage.value=e.message;}finally{syncing.value=false;}
  }
  async function loadDetail(){
   const id=++detailRequest;
   boardRequest++;rank.value=null;comparing.value=false;boardError.value='';
   detail.value=null;error.value='';
   const s=session.value;
   loading.value=Boolean(s);
   if(!s)return;
   try{
    const params=new URLSearchParams({account:s.account_id,contest:s.contest_key,start:s.starts_at});
    const result=await json('/detail?'+params);
    if(id===detailRequest)detail.value=result;
   }catch(e){if(id===detailRequest)error.value=e.message;}
   finally{if(id===detailRequest)loading.value=false;}
  }
  async function compare(){
   const id=++boardRequest,s=session.value,score=detail.value;
   comparing.value=true;boardError.value='';
   try{
    const data=await json('/standings/'+s.contest_key+'?'+new URLSearchParams({login:s.login_name}));
    if(id!==boardRequest)return;
    const ahead=data.entries.filter(row=>row.solved>score.solved||row.solved===score.solved&&row.seconds<score.penalty*60).length;
    rank.value={place:ahead+1,total:data.entries.length+1};
   }catch(e){if(id===boardRequest)boardError.value=e.message;}
   finally{if(id===boardRequest)comparing.value=false;}
  }
  function elapsed(seconds){
   return Math.floor(seconds/3600)+':'+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  }
  const problemHref=p=>p.url&&/^https:\/\/qoj\.ac\/(?:contest\/\d+\/)?problem\/\d+(?:[/?#]|$)/.test(p.url)?p.url:'https://qoj.ac/problem/'+encodeURIComponent(p.key);
  watch(selected,loadDetail);
  onMounted(refresh);
  return {sessions,selected,session,detail,loading,syncing,error,syncMessage,boardError,comparing,rank,key,sync,compare,elapsed,problemHref,qojMedalLabels};
 },
 template:`
 <article class="panel" aria-label="团队赛场次分析">
  <div class="panel-head"><h2>团队赛场次分析</h2><button type="button" :disabled="syncing" @click="sync">{{syncing?'正在同步…':'同步 QOJ VP 记录'}}</button></div>
  <p v-if="syncMessage" role="status" class="footnote">{{syncMessage}}</p>
  <p v-if="error" role="alert" class="error">{{error}}</p>
  <p v-if="!sessions.length&&!error" class="footnote">同步 QOJ VP 记录后可按场复盘。</p>
  <label v-if="sessions.length" class="difficulty-filter">模拟赛场次
   <select v-model="selected" aria-label="选择 QOJ 模拟赛场次" style="max-width:100%">
    <option v-for="s in sessions" :key="key(s)" :value="key(s)">{{s.starts_at.slice(0,10)}} · {{s.contest_name}} · {{s.login_name}}</option>
   </select>
  </label>
  <p v-if="session" class="footnote">北京时间 {{session.starts_at}} 开赛 · 按 5 小时回算 · 账号 {{session.login_name}} · <a :href="'https://qoj.ac/contest/'+session.contest_key+'/standings'" target="_blank" rel="noopener noreferrer">查看 QOJ 榜单 ↗</a></p>
  <LoadingNotice v-if="loading">正在读取场次成绩…</LoadingNotice>
  <template v-if="detail">
   <p>赛内通过 <strong>{{detail.solved}}</strong> 道 · 总罚时 <strong>{{detail.penalty}}</strong> 分钟 · 赛后补题 <strong>{{detail.upsolved}}</strong> 道</p>
   <button type="button" :disabled="comparing" @click="compare">{{comparing?'正在读取榜单…':'比较 QOJ 榜单'}}</button>
   <p v-if="rank" role="status">参考名次 {{rank.place}} / {{rank.total}} · 模拟奖牌暂无已核实的原榜奖牌线</p>
   <p v-if="boardError" role="alert" class="footnote">{{boardError}}</p>
   <p v-if="!detail.completeRoster" class="footnote">本地暂无整场题单，仅显示能关联到该场的提交。</p>
   <div class="table-wrap"><table><thead><tr><th>题目</th><th>档位</th><th>赛内状态</th><th>首次 AC 用时</th><th>计罚次数</th><th>单题罚时</th><th>赛后首次 AC</th></tr></thead><tbody>
    <tr v-for="p in detail.items" :key="p.key"><td><a class="problem" :href="problemHref(p)" target="_blank" rel="noopener noreferrer">{{p.index?p.index+' · ':''}}{{p.name}} ↗</a></td><td>{{qojMedalLabels[p.tier]||'未分档'}}</td><td>{{p.acSeconds!=null?'AC':p.attempts?'尝试未 AC':'无赛内记录'}}</td><td>{{p.acSeconds!=null?elapsed(p.acSeconds):'—'}}</td><td>{{p.acSeconds!=null?p.wrong:'—'}}</td><td>{{p.penalty!=null?p.penalty+' 分钟':'—'}}</td><td>{{p.acSeconds==null?p.afterAc||'—':'—'}}</td></tr>
   </tbody></table></div>
  </template>
  <ModuleHelp><p class="footnote">按该场 VP 的开赛时间和所选账号已同步的提交回算。首次 AC 的整分钟用时，加上此前每次计罚提交的 20 分钟。编译错误、评测异常和未通过的题不计入总罚时。只覆盖该账号的已同步记录。参考名次按过题数和总罚时与当前 QOJ 榜单比较，榜单可能包含其他 VP。</p></ModuleHelp>
 </article>`
};
