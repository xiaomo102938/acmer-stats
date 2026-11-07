import {qojMedalLabels} from '../shared/qoj-medal-labels.js';
import {scoreStyle} from './score-color.js';
import {apiFetch} from './api-fetch.js';
import {ref,computed,onMounted,onBeforeUnmount,watch} from 'vue';
import ProblemTypeHelp from './problem-type-help.js';
import {submissionLabel as label,problemType,problemTypes,problemLink as link} from './submission-display.js';
export default{
 components:{ProblemTypeHelp},
 props:{refreshKey:Number,routeQuery:String,scope:{type:String,default:'personal'}},
 setup(props){
  const loaded=ref(false);
  const items=ref([]),page=ref(1),pageSize=ref(25),pages=ref(1),total=ref(0),loading=ref(false),error=ref(''),jump=ref(1);let request,serial=0;
  const q=ref(''),search=ref(''),status=ref('all'),sort=ref('time'),platform=ref(''),tag=ref(''),type=ref(''),from=ref(''),to=ref(''),unique=ref(false);
  const platforms=ref([]),tags=ref([]),medal=ref('');
  const scope=props.scope;
  const cfMin=ref(''),cfMax=ref('');
  const verdictLegend=[["AC","通过","绿色"],["WA","答案错误","红色"],["TLE","超时","黄色"],["MLE","超内存","蓝色"],["RE","运行错误","紫色"],["CE","编译错误","橙色"],["PARTIAL","部分得分","青绿色"],["OLE","超输出限制","琥珀色"],["ILE","空闲超时","琥珀色"],["PE","格式错误","粉色"],["SE","评测异常","玫红色"],["FAIL","评测失败","玫红色"],["SV","违反安全限制","玫红色"],["HACKED","被成功攻击","玫红色"],["RJ","拒绝评测","玫红色"],["SKIP","跳过评测","灰色"],["非 AC","旧记录缺少具体判定","灰色"]];
const statusOptions={all:'全部判定',ac:'只看 AC',failed:'非 AC',first:'首次 AC',retry:'待攻克',
   WA:'WA',TLE:'TLE',MLE:'MLE',RE:'RE',CE:'CE',PARTIAL:'PARTIAL'};
  const editing=ref(null),draft=ref(''),saving=ref(false),noteError=ref('');
  const noteLength=computed(()=>[...draft.value.trim()].length);
  function editNote(row){editing.value=row.submission_id;draft.value=row.note||'';noteError.value='';}
  async function saveNote(row){
   saving.value=true;noteError.value='';
   try{
    const response=await apiFetch('/api/submissions/notes/'+encodeURIComponent(row.problem_id),{
     method:'PUT',headers:{'Content-Type':'application/json','X-Acmer-Request':'1'},body:JSON.stringify({note:draft.value})});
    const body=await response.json();if(!response.ok)throw new Error(body.message);
    for(const item of items.value)if(item.problem_id===row.problem_id)item.note=body.note;
    editing.value=null;
    if(search.value)await load();
   }catch(e){noteError.value=e.message||'备注保存失败。';}
   finally{saving.value=false;}
  }
  function applySearch(){search.value=q.value.trim();load(1);}
  function applyRoute(){
   const params=new URLSearchParams(props.routeQuery);
   const requestedStatus=params.get('status');
   q.value=search.value='';
   status.value=Object.hasOwn(statusOptions,requestedStatus)?requestedStatus:'all';
   platform.value=scope==='qoj'?'QOJ':params.get('platform')||'';
   cfMin.value=scope==='personal'?params.get('cfMin')||'':'';
   cfMax.value=scope==='personal'?params.get('cfMax')||'':'';
   tag.value=params.get('tag')||'';
   const requestedType=params.get('type');
   type.value=Object.hasOwn(problemTypes,requestedType)?requestedType:'';
   from.value=params.get('from')||'';
   to.value=params.get('to')||'';
   unique.value=params.get('unique')==='1';
   const requestedMedal=params.get('medal');
   medal.value=Object.hasOwn(qojMedalLabels,requestedMedal)?requestedMedal:'';
   sort.value='time';
   load(1);
  }
  const buttons=computed(()=>[...new Set([1,...Array.from({length:5},(_,i)=>page.value-2+i).filter(n=>n>1&&n<pages.value),pages.value])].sort((a,b)=>a-b));
  async function load(target=page.value){
   request?.abort();request=new AbortController();const id=++serial;loading.value=true;error.value='';
   editing.value=null;
   if(platform.value!=='QOJ'||status.value!=='ac'||!unique.value)medal.value='';
   const params=new URLSearchParams({scope:scope,medal:scope==='qoj'?medal.value:'',cfMin:cfMin.value,cfMax:cfMax.value,page:String(target),pageSize:String(pageSize.value),q:search.value,status:status.value,sort:sort.value,platform:platform.value,tag:tag.value,type:type.value,from:from.value,to:to.value,unique:unique.value?'1':'0'});
   try{const r=await apiFetch('/api/submissions?'+params,{signal:request.signal});const body=await r.json();if(!r.ok)throw new Error(body.message);
    if(id!==serial)return;items.value=body.items;loaded.value=true;page.value=body.page;pages.value=body.pages;total.value=body.total;jump.value=body.page;platforms.value=body.platforms;tags.value=body.tags;
   }catch(e){if(id===serial&&e.name!=='AbortError')error.value=e.message||'读取提交记录失败';}finally{if(id===serial)loading.value=false;}
  }
  const go=()=>{if(Number.isInteger(Number(jump.value))&&jump.value>=1&&jump.value<=pages.value)load(Number(jump.value));};
  watch(()=>props.refreshKey,()=>load());watch(()=>props.routeQuery,value=>{if(value!==undefined)applyRoute();});onMounted(applyRoute);onBeforeUnmount(()=>{serial++;request?.abort();});
  return {scope,cfMin,cfMax,medal,qojMedalLabels,scoreStyle,loaded,q,status,sort,platform,tag,type,from,to,unique,platforms,tags,statusOptions,verdictLegend,editing,draft,saving,noteError,noteLength,editNote,saveNote,applySearch,items,page,pageSize,pages,total,loading,error,jump,buttons,load,label,problemType,problemTypes,link,go};
 },
 template:`<article class="panel recent" aria-label="提交记录列表">
  <div class="panel-head"><h2>{{scope==='qoj'?'QOJ 提交':'个人提交'}}</h2><span>共 {{total}} {{status==='retry'||unique?'道题':'条提交'}}</span></div>
  <form class="trend-controls submission-filters" @submit.prevent="applySearch">
   <label>搜索<input v-model="q" type="search" maxlength="200" placeholder="题名、题号或备注"></label>
   <button type="submit">搜索</button>
   <button v-if="q" type="button" @click="q='';applySearch()">清空搜索</button>
  </form>
  <div class="trend-controls submission-filters">
   <label>判定<select v-model="status" @change="load(1)"><option v-for="(name,key) in statusOptions" :key="key" :value="key">{{name}}</option></select></label>
   <label v-if="scope==='personal'">平台<select v-model="platform" @change="load(1)"><option value="">全部平台</option><option v-for="p in platforms" :key="p">{{p}}</option></select></label>
   <label>标签<select v-model="tag" @change="load(1)"><option value="">全部标签</option><option v-for="t in tags" :key="t.key" :value="t.key">{{t.name}}</option></select></label>
   <label>题型<select v-model="type" @change="load(1)"><option value="">全部题型</option><option v-for="kind in problemTypes" :key="kind.id" :value="kind.id">{{kind.name}}</option></select></label>
   <label v-if="scope==='qoj'">QOJ 尺度<select v-model="medal" @change="load(1)"><option value="">全部档位</option><option v-for="(name,tier) in qojMedalLabels" :key="tier" :value="tier">{{name}}</option></select></label>
   <label v-if="scope==='personal'">CF 尺度下限<input v-model="cfMin" type="number" step="1" placeholder="不限" @change="load(1)"></label>
   <label v-if="scope==='personal'">CF 尺度上限<input v-model="cfMax" type="number" step="1" placeholder="不限" @change="load(1)"></label>
   <label>开始日期<input v-model="from" type="date" :max="to||undefined" @change="load(1)"></label>
   <label>结束日期<input v-model="to" type="date" :min="from||undefined" @change="load(1)"></label>
   <label v-if="scope==='personal'">排序<select v-model="sort" @change="load(1)"><option value="time">时间从新到旧</option><option value="hard">难度从高到低</option><option value="easy">难度从低到高</option></select></label>
   <label v-if="status!=='retry'" class="submission-unique"><input v-model="unique" type="checkbox" @change="load(1)">按题去重</label>
  </div>
  <div class="submission-controls"><label>每页 <select v-model.number="pageSize" @change="load(1)" aria-label="每页提交数量"><option :value="10">10 条</option><option :value="25">25 条</option><option :value="50">50 条</option><option :value="100">100 条</option></select></label></div>
  <p v-if="error" class="error" role="alert">{{error}} <button @click="load()">重试</button></p>
  <LoadingNotice v-if="loading" :skeleton="!loaded">正在读取提交记录…</LoadingNotice>
  <div v-if="loaded" class="table-wrap content-ready" :aria-busy="loading"><table><thead><tr><th>提交时间（UTC+8）</th><th>题目</th><th>状态</th><th v-if="scope==='personal'">CF 尺度</th><th v-else>QOJ 尺度</th><th>题目备注</th><th>平台</th><th>账号</th><th>平台提交编号</th></tr></thead><tbody><tr v-for="r in items" :key="r.submission_id"><td class="submission-time"><span>{{r.submitted_at.slice(0,10)}}</span><span>{{r.submitted_at.slice(11)}}</span></td><td class="submission-problem" :data-problem-type="problemType(r).id"><svg class="problem-type-icon" viewBox="0 0 24 24" role="img" :aria-label="problemType(r).name"><title>{{problemType(r).name}}</title><path :d="problemType(r).icon" /></svg><a v-if="link(r)" class="problem" :href="link(r)" target="_blank" rel="noopener noreferrer">{{r.problem_name}} ↗</a><span v-else>{{r.problem_name}}</span></td><td><span class="badge submission-verdict" :data-verdict="label(r)">{{label(r)}}</span></td><td v-if="scope==='personal'"><span :class="{'score-chip':scoreStyle(r.rating)}" :style="scoreStyle(r.rating)">{{r.rating==null?'—':(r.estimated?'≈ ':'')+r.rating}}</span><small v-if="r.platform_name==='牛客' && r.difficulty_source==='nowcoder' && r.native_difficulty!=null" class="footnote"> · 牛客 {{r.native_difficulty}}</small></td><td v-else>{{qojMedalLabels[r.qoj_tier]||qojMedalLabels.unrated}}</td><td class="submission-note">
   <form v-if="editing===r.submission_id" @submit.prevent="saveNote(r)"><input v-model="draft" aria-label="题目备注" placeholder="最多 30 个字符" :disabled="saving"><span>{{noteLength}} / 30</span><button :disabled="saving||noteLength>30">保存</button><button type="button" :disabled="saving" @click="editing=null">取消</button><p v-if="noteError" class="muted" role="alert">{{noteError}}</p></form>
   <button v-else type="button" class="submission-note-button" :disabled="saving" @click="editNote(r)">{{r.note||'添加备注'}}</button>
   </td><td>{{r.platform_name}}</td><td>{{r.account_login}}</td><td>{{r.source_id}}</td></tr></tbody></table><p v-if="!loading&&!error&&!items.length" class="muted">没有符合当前条件的提交记录。</p></div>
  <nav class="submission-pagination" aria-label="提交记录分页"><button :disabled="loading||page<=1" @click="load(page-1)">上一页</button><template v-for="(n,i) in buttons" :key="n"><span v-if="i&&n>buttons[i-1]+1">…</span><button :disabled="loading" :aria-current="n===page?'page':undefined" @click="load(n)">{{n}}</button></template><button :disabled="loading||page>=pages" @click="load(page+1)">下一页</button><span aria-live="polite">第 {{page}} / {{pages}} 页</span><form @submit.prevent="go"><label>跳至 <input v-model.number="jump" type="number" min="1" :max="pages" required aria-label="跳转页码"> 页</label><button :disabled="loading">跳转</button></form></nav>
  <ModuleHelp><p class="footnote problem-type-legend"><span v-for="type in problemTypes" :key="type.id" :data-problem-type="type.id"><svg class="problem-type-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="type.icon" /></svg>{{type.name}}</span> 白色问号表示题型未知。</p><p class="footnote">判定状态</p><div class="footnote problem-type-legend"><span v-for="([code,meaning,color]) in verdictLegend" :key="code"><span class="badge submission-verdict" :data-verdict="code">{{code}}</span> {{meaning}}（{{color}}）</span></div><ProblemTypeHelp /><p class="footnote">同一平台的同一道题共用一条备注，清空后保存即可删除。首次 AC 按完整已同步历史判定。待攻克只显示没有已知 AC 的题，每题取最近一次非 AC。CF 尺度范围含上下限，启用范围筛选时只显示有评分的题。QOJ 尺度按比赛榜单的题目档位筛选。未评级放在难度排序末尾。牛客同时显示题库原分和减 300 后的 CF 估分，难度排序采用估分。仅含已同步数据：CF、AT 和 QOJ 可包含非 AC；牛客、力扣和洛谷的明细当前主要提供 AC，手工汇总没有逐次提交信息，不在此虚构记录。旧数据若未保存具体判定，仅标记“非 AC”，后续重新同步可补充。时间相同时使用固定编号排序。</p></ModuleHelp>
 </article>`
};
