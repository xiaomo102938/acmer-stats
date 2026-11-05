import {apiFetch} from './api-fetch.js';
import SkillGraph from './skill-graph.js';
import {searchChoices} from './choice-picker.js';
import {ref,computed,watch,nextTick} from 'vue';
const sortOptions=[
 ['ability_value','历史能力'],['current_value','当前能力'],['passed_count','通过题数'],
 ['rated_count','有效评分题数'],['total_count','尝试题数'],['sample_count','入选题数']
];
const compareNames=(a,b)=>a.display_name.localeCompare(b.display_name,'zh-CN')||String(a.tag_id).localeCompare(String(b.tag_id));

export default{
 components:{SkillGraph},
 props:{skillCounts:{type:Object,default:()=>({})},skillConfig:{type:Object,default:null},graphOnly:{type:Boolean,default:false},profiles:{type:Array,default:()=>[]},refreshKey:{type:Number,default:0}},
 setup(props){
  const detailEl=ref(null),panelEl=ref(null),page=ref(1),pageSize=ref(15);
  const platform=ref('全部平台'),selected=ref(null),problems=ref([]),loading=ref(false),error=ref('');
  const query=ref(''),sortKey=ref('ability_value');
  let serial=0;
  const platforms=computed(()=>[...new Set(props.profiles.map(p=>p.platform_name))]);
  const platformRows=computed(()=>props.profiles.filter(p=>p.platform_name===platform.value));
  const choices=computed(()=>platformRows.value.map(row=>({label:row.display_name,hint:row.tag_name,key:row.tag_id,row})));
  const rows=computed(()=>{
   if(props.graphOnly)return platformRows.value;
   const key=sortKey.value;
   return searchChoices(choices.value,query.value).map(choice=>choice.row)
    .sort((a,b)=>(b[key]??-Infinity)-(a[key]??-Infinity)||compareNames(a,b));
  });
  const pages=computed(()=>Math.max(1,Math.ceil(rows.value.length/pageSize.value)));
  const visible=computed(()=>rows.value.slice((page.value-1)*pageSize.value,page.value*pageSize.value));
  const pageButtons=computed(()=>[...new Set([1,...Array.from({length:5},(_,i)=>page.value-2+i).filter(n=>n>1&&n<pages.value),pages.value])].sort((a,b)=>a-b));
  async function changePage(n){close();page.value=Math.max(1,Math.min(pages.value,n));await nextTick();panelEl.value?.scrollIntoView({behavior:'instant',block:'start'});}
  watch(pages,n=>{if(page.value>n){page.value=n;close();}});
  watch([pageSize,query,sortKey],()=>{page.value=1;close();});
  watch(platforms,list=>{if(list.length&&!list.includes(platform.value))platform.value=list[0];},{immediate:true});
  function close(){serial++;selected.value=null;problems.value=[];error.value='';loading.value=false;}
  watch(platform,()=>{page.value=1;close();});
  watch(()=>props.refreshKey,()=>{page.value=1;close();});
  async function show(row){
   const id=++serial;selected.value=row;loading.value=true;error.value='';problems.value=[];
   try{
    const response=await apiFetch('/api/tags/'+encodeURIComponent(row.tag_id)+'/ability?platform='+encodeURIComponent(platform.value));
    const body=await response.json();if(!response.ok)throw new Error(body.message);
    if(id===serial){problems.value=body.problems;loading.value=false;await nextTick();detailEl.value?.scrollIntoView({behavior:'instant',block:'start'});}
   }catch(e){if(id===serial)error.value=e.message||'题单加载失败';}
   finally{if(id===serial)loading.value=false;}
  }
  const practiceHref=tag=>'#analysis?'+new URLSearchParams({recommend:'1',tag});
  return {query,sortKey,sortOptions,practiceHref,panelEl,page,pageSize,pages,visible,pageButtons,changePage,detailEl,platform,platforms,rows,selected,problems,loading,error,show,close};
 },
 template:`
 <article :id="graphOnly?undefined:'tag-analysis'" ref="panelEl" class="panel tag-analysis" :aria-label="graphOnly?'技能图谱':'题型能力参考'">
  <div class="panel-head"><h2>{{graphOnly?'技能图谱':'题型能力参考'}}</h2><span v-if="graphOnly">节点大小表示去重通过题数</span><a v-else href="#analysis?recommend=1" class="problem">推荐练习 ↗</a></div>
  <label class="difficulty-filter"><span>{{graphOnly?'平台':'能力尺度'}}</span><select v-model="platform" :aria-label="graphOnly?'技能图谱平台':'题型能力平台'"><option v-for="p in platforms" :key="p" :value="p">{{p}} · CF 尺度</option></select></label>
  <template v-if="!graphOnly">
  <div class="trend-controls submission-filters">
   <label>搜索题型<input v-model="query" type="search" placeholder="中文名、英文名或标签"></label>
   <label>排序优先级<select v-model="sortKey"><option v-for="[key,label] in sortOptions" :key="key" :value="key">{{label}}从高到低</option></select></label>
  </div>
  <div class="submission-controls"><label>共 {{rows.length}} 个题型 · 每页 <select v-model.number="pageSize" aria-label="每页题型数量"><option :value="10">10 个</option><option :value="15">15 个</option><option :value="25">25 个</option><option :value="50">50 个</option></select></label></div>
  <div class="table-wrap"><table><thead><tr><th>题型</th><th>历史能力</th><th>当前能力</th><th>入选题数</th><th>样本状态</th><th>入选估分题</th><th>有效评分题</th><th>尝试 / 通过</th><th>入选难度范围</th><th>练习</th></tr></thead>
   <tbody><tr v-for="t in visible" :key="t.tag_id"><td class="tag-name">{{t.display_name}}</td><td><button v-if="t.sample_count>0" class="ability-score" @click="show(t)" :aria-label="'查看'+t.display_name+'的入选题单'">{{t.ability_value}}</button><span v-else class="muted">{{t.ability_value}}</span></td><td>{{t.current_value ?? '暂无 AC 日期'}}<small v-if="t.current_value!=null"> · {{t.current_sample_count}} / {{t.current_sample_limit}} 道</small></td><td>{{t.sample_count}} / {{t.sample_limit}}</td><td><span class="badge" :class="{good:t.sample_count===t.sample_limit}">{{t.sample_status}}</span></td><td>{{t.estimated_count}} / {{t.sample_count}}</td><td>{{t.rated_count}}</td><td>{{t.total_count}} / {{t.passed_count}}</td><td>{{t.sample_count>0?t.min_difficulty+'–'+t.max_difficulty:'—'}}</td><td><a :href="practiceHref(t.tag_id)" class="problem" :aria-label="'练习 '+t.display_name">练习 ↗</a></td></tr></tbody>
  </table></div>
  <nav v-if="rows.length" class="submission-pagination" aria-label="题型能力分页"><button :disabled="page<=1" @click="changePage(page-1)">上一页</button><template v-for="(n,i) in pageButtons" :key="n"><span v-if="i&&n>pageButtons[i-1]+1">…</span><button :aria-current="n===page?'page':undefined" @click="changePage(n)">{{n}}</button></template><button :disabled="page>=pages" @click="changePage(page+1)">下一页</button><span aria-live="polite">第 {{page}} / {{pages}} 页</span></nav>
  <p v-if="!rows.length" class="muted">{{query.trim()?'没有匹配的题型。':'该平台暂无题型记录。'}}</p>
  </template>
  <SkillGraph v-else :config="skillConfig" :counts="skillCounts[platform]" :profiles="rows" @inspect="show" />
  <section v-if="selected" ref="detailEl" class="ability-detail" :aria-label="graphOnly?'图谱入选题单':'能力参考入选题单'">
   <div class="panel-head"><h3>{{selected.display_name}} · {{platform}}</h3><div class="practice-tabs"><a :href="practiceHref(selected.tag_id)" class="problem">练习这个题型 ↗</a><button @click="close">收起题单</button></div></div>
   <p class="footnote">本次入选 {{selected.sample_count}} 道，均值 {{selected.ability_value}}。{{selected.sample_count<selected.sample_limit?selected.sample_status+'。':''}}</p>
   <p v-if="loading" role="status" class="muted">正在加载入选题目…</p><p v-if="error" role="alert" class="error">{{error}}</p>
   <div v-if="!loading&&!error" class="table-wrap"><table><thead><tr><th>题目</th><th>平台</th><th>CF 尺度</th><th>原始难度</th><th>评分依据</th><th>记录日期</th></tr></thead><tbody><tr v-for="p in problems" :key="p.problem_id"><td><a v-if="p.problem_url" :href="p.problem_url" target="_blank" rel="noopener noreferrer">{{p.problem_name}} ↗</a><span v-else>{{p.problem_name}}</span></td><td>{{p.platform_name}}</td><td>{{p.estimated?'≈ ':''}}{{p.rating}}</td><td>{{p.native_difficulty ?? '—'}}</td><td>{{p.method}} · {{p.confidence}}</td><td>{{p.solve_date || '未提供逐题日期'}}</td></tr></tbody></table></div>
  </section>
  <ModuleHelp v-if="!graphOnly">
  <p v-if="!graphOnly" class="ability-description">将所选平台同一题型已通过且有评分依据的题目换算到 CF 尺度，合并可识别的同源题目后去重，取难度最高的 15%（向上取整），至少 20 道，缺额按零分计入。</p>
  <p v-if="!graphOnly" class="footnote">当前分只使用有 AC 日期的题，最近一次 AC 后前 20 天不扣分，第 21 天起开始扣分，之后每 365 天，距离扣满 250 分的差额减半，最低为 800 分。调整后按同样规则选题，再按最近一次 AC 加权平均，并按实际题数占目标题数的比例折算。AC 日期每早 183 天，权重减半。点击历史分查看入选题单、平台、原始难度及评分依据。CF 使用官方题目 rating；AT 换算和洛谷档位映射均为低置信估计。QOJ、牛客、力扣缺少可靠换算依据的题目暂不计分。此值不是个人 CF rating。</p>
  <h3>换算规则与来源</h3><p>版本 acmer-cf-v1。AT：round100(clamp(3900 × (AT难度 + 940) / 5155, 800, 3900))。这是将选手 rating 相关关系用于题目尺度的实验性外推，尚未经过题目配对校准。</p><p>洛谷八档由低到高：800 / 1000 / 1400 / 1800 / 2000 / 2200 / 2700 / 3200。新增“提高”档 2000 为本项目插值，其余参考旧七档社区映射，全部属于粗估；未评定不计分。</p><p><a href="https://silverfoxxxy.github.io/rating-converter" target="_blank" rel="noopener noreferrer">AT–CF Rating Converter</a> · <a href="https://github.com/EndeavourChiu/Luogu-Rating-Predictor" target="_blank" rel="noopener noreferrer">洛谷映射参考</a></p>
  </ModuleHelp>
 </article>`
};
