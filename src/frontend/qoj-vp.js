import {vpMedal,vpMedalStyle} from './qoj-vp-medals.js';
import {computed,onMounted,ref,watch} from 'vue';
import {apiFetch} from './api-fetch.js';
import {qojMedalColors,qojMedalLabels} from '../shared/qoj-medal-labels.js';
import {problemType,submissionLabel} from './submission-display.js';

export default {
 props:{requestedSession:String,medals:Object},
 emits:['synced'],
 setup(props,{emit}){
  const sessions=ref([]),selected=ref(''),detail=ref(null),loading=ref(false),syncing=ref(false);
  const error=ref(''),syncMessage=ref(''),boardError=ref(''),comparing=ref(false),rank=ref(null);
  const key=s=>[s.account_id,s.contest_key,s.starts_at].join('|');
  const optionLabel=s=>[s.starts_at.slice(0,10),s.originalBoard?.name||s.contest_name,s.login_name,
   props.medals?.[key(s)]?vpMedal(props.medals[key(s)]).label:null].filter(Boolean).join(' · ');
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
    emit('synced');
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
  function penaltyBreakdown(problem){
   const minutes=Math.floor(problem.acSeconds/60);
   return minutes+'+'+(problem.penalty-minutes);
  }
  function elapsed(seconds){
   return Math.floor(seconds/3600)+':'+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  }
  const problemHref=p=>p.url&&/^https:\/\/qoj\.ac\/(?:contest\/\d+\/)?problem\/\d+(?:[/?#]|$)/.test(p.url)?p.url:'https://qoj.ac/problem/'+encodeURIComponent(p.key);
  const verdict=problem=>problem.attempts?submissionLabel({passed:problem.acSeconds!=null?1:0,verdict:problem.lastVerdict}):'无赛内记录';
  watch(()=>props.requestedSession,value=>{if(value)selected.value=value;});
  watch(selected,loadDetail);
  onMounted(refresh);
  return {sessions,selected,session,detail,loading,syncing,error,syncMessage,boardError,comparing,rank,key,sync,compare,elapsed,penaltyBreakdown,problemHref,problemType,qojMedalColors,qojMedalLabels,verdict,vpMedal,vpMedalStyle,optionLabel};
 },
 template:`
 <article class="panel" aria-label="团队赛场次分析">
  <div class="panel-head"><h2>团队赛场次分析</h2><button type="button" :disabled="syncing" @click="sync">{{syncing?'正在同步…':'同步 QOJ VP 记录'}}</button></div>
  <p v-if="syncMessage" role="status" class="footnote">{{syncMessage}}</p>
  <p v-if="error" role="alert" class="error">{{error}}</p>
  <p v-if="!sessions.length&&!error" class="footnote">同步 QOJ VP 记录后可按场复盘。</p>
  <label v-if="sessions.length" class="difficulty-filter">模拟赛场次
   <select v-model="selected" aria-label="选择 QOJ 模拟赛场次" style="max-width:100%" :class="{ 'vp-medal-name':detail }" :style="detail?vpMedalStyle(detail.medal):null">
    <option v-for="s in sessions" :key="key(s)" :value="key(s)" class="vp-medal-name" :style="vpMedalStyle(medals?.[key(s)])">{{optionLabel(s)}}</option>
   </select>
  </label>
  <p v-if="session" class="footnote">北京时间 {{session.starts_at}} 开赛 · 按 5 小时回算 · 账号 {{session.login_name}} · <a :href="'https://qoj.ac/contest/'+session.contest_key+'/standings'" target="_blank" rel="noopener noreferrer">查看 QOJ 榜单 ↗</a></p>
  <LoadingNotice v-if="loading">正在读取场次成绩…</LoadingNotice>
  <template v-if="detail">
   <h3 class="vp-medal-name" :style="vpMedalStyle(detail.medal)">{{session.originalBoard?.name||session.contest_name}} <span class="badge vp-medal-name">{{vpMedal(detail.medal).label}}</span></h3>
   <p v-if="session.originalBoard" class="footnote"><a :href="session.originalBoard.url" target="_blank" rel="noopener noreferrer">查看 RankLand 原赛榜单 ↗</a><template v-if="detail.medal?.place"> · 原赛参考第 {{detail.medal.place}} / {{detail.medal.total}} 名</template></p>
   <p>赛内通过 <strong>{{detail.solved}}</strong> 道 · 总罚时 <strong>{{detail.penalty}}</strong> · 赛后补题 <strong>{{detail.upsolved}}</strong> 道</p>
   <button type="button" :disabled="comparing" @click="compare">{{comparing?'正在读取榜单…':'比较 QOJ 榜单'}}</button>
   <p v-if="rank" role="status">QOJ 榜单参考名次 {{rank.place}} / {{rank.total}}</p>
   <p v-if="boardError" role="alert" class="footnote">{{boardError}}</p>
   <p v-if="!detail.completeRoster" class="footnote">本地暂无整场题单，仅显示能关联到该场的提交。</p>
   <div class="table-wrap qoj-vp-table"><table><thead><tr><th>题目</th><th>档位</th><th>赛内状态</th><th>首次 AC 用时</th><th>计罚次数</th><th>单题罚时</th><th>赛后首次 AC</th></tr></thead><tbody>
    <tr v-for="p in detail.items" :key="p.key" :style="qojMedalColors[p.tier]?{'--vp-medal-color':qojMedalColors[p.tier]}:undefined"><td class="submission-problem" :data-problem-type="problemType(p).id"><svg class="problem-type-icon" viewBox="0 0 24 24" role="img" :aria-label="problemType(p).name"><title>{{problemType(p).name}}</title><path :d="problemType(p).icon" /></svg><a class="problem" :href="problemHref(p)" target="_blank" rel="noopener noreferrer">{{p.index?p.index+' · ':''}}{{p.name}} ↗</a></td><td>{{qojMedalLabels[p.tier]||'未分档'}}</td><td><span class="badge submission-verdict" :data-verdict="verdict(p)" :title="p.attempts&&p.acSeconds==null?'最后一次赛内提交的判定':undefined">{{verdict(p)}}</span></td><td>{{p.acSeconds!=null?elapsed(p.acSeconds):'—'}}</td><td>{{p.acSeconds!=null?p.wrong:'—'}}</td><td>{{p.penalty!=null?penaltyBreakdown(p):'—'}}</td><td>{{p.acSeconds==null?p.afterAc||'—':'—'}}</td></tr>
   </tbody></table></div>
  </template>
  <ModuleHelp>
  <h4>复盘范围</h4><p>按该场 VP 的开赛时间和所选账号已同步的提交回算。结果覆盖该账号的已同步记录。</p>
  <h4>罚时规则</h4><p>总罚时和单题罚时均以分钟计。每道通过题的罚时为首次 AC 用时向下取整到分钟，再加上此前计罚提交的次数乘以 20。编译错误和评测异常不计罚，未通过题不计入总罚时。</p>
  <h4>参考名次</h4><p>QOJ 参考名次按过题数和总罚时与当前榜单比较，榜单可能包含其他 VP。模拟奖牌使用场次总览所说明的原赛奖牌线。</p>
  </ModuleHelp>
 </article>`
};
