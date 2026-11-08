import {apiFetch} from './api-fetch.js';
import {ref,computed,onMounted,watch} from 'vue';
import {buildCalendar,buildRollingCalendar} from './activity-calendar.js';
export default{
 props:{refreshKey:{type:Number,default:0}},
 setup(props){
  const result=ref(null),year=ref('rolling'),platform=ref('all'),metric=ref('accepted_problem_count'),loading=ref(false),error=ref(''),selected=ref(null),focusDay=ref(null);
  let serial=0;
  async function load(){
   const id=++serial;loading.value=true;error.value='';
   try{
    const response=await apiFetch('/api/activity'+(year.value!=='rolling'?'?year='+year.value:''));
    const body=await response.json();if(!response.ok)throw new Error(body.message);
    if(id!==serial)return;
    result.value=body;selected.value=null;focusDay.value=body.mode==='rolling'||String(body.year)===body.serverDate.slice(0,4)?body.serverDate:body.year+'-01-01';
   }catch(e){if(id===serial)error.value=e.message||'热力图读取失败';}
   finally{if(id===serial)loading.value=false;}
  }
  const rows=computed(()=>result.value?.days.filter(r=>platform.value==='all'||r.platform_name===platform.value)||[]);
  const calendar=computed(()=>result.value?(year.value==='rolling'?buildRollingCalendar(rows.value,result.value.serverDate,metric.value):buildCalendar(result.value.year,rows.value,result.value.serverDate,metric.value)):{cells:[],months:[],columns:53});
  const summary=computed(()=>{
   const cells=calendar.value.cells.filter(d=>d.inside&&!d.future);
   return {submissions:cells.reduce((n,d)=>n+d.submission_count,0),activities:cells.reduce((n,d)=>n+d.activity_count,0),acProblems:cells.reduce((n,d)=>n+d.accepted_problem_count,0),activeDays:cells.filter(d=>d.value>0).length};
  });
  function openSubmissions(day){
   location.hash='#records?'+new URLSearchParams({scope:'all',from:day,to:day});
  }
  function navigate(event,day){
   const delta={ArrowLeft:-7,ArrowRight:7,ArrowUp:-1,ArrowDown:1}[event.key];if(!delta)return;
   const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+delta);
   const next=date.toISOString().slice(0,10);
   const target=event.currentTarget.closest('.activity-grid').querySelector('[data-day="'+next+'"]');
   if(target){event.preventDefault();target.focus();}
  }
  const metricLabel=computed(()=>({accepted_problem_count:'AC 题目',submission_count:'提交次数',problem_count:'尝试题目',activity_count:'站点活动'})[metric.value]);
  function choose(event){year.value=event.target.value==='rolling'?'rolling':Number(event.target.value);load();}
  watch(()=>props.refreshKey,()=>load());
  watch(platform,()=>{
   selected.value=null;
   const own=rows.value;
   if(platform.value!=='all'&&own.some(r=>r.has_activity_data)&&!own.some(r=>r.has_submission_data))metric.value='activity_count';
   else if(platform.value!=='all'&&metric.value==='activity_count'&&!own.some(r=>r.has_activity_data))metric.value='accepted_problem_count';
  });
  watch(metric,()=>{selected.value=null;});
  onMounted(load);
  return {result,year,platform,metric,loading,error,selected,rows,calendar,summary,metricLabel,choose,load,focusDay,navigate,openSubmissions};
 },
 template:`
 <article class="panel activity-panel" aria-label="刷题热力图">
  <div class="panel-head"><h2>热力图</h2></div>
  <div class="activity-controls">
   <label>时间范围<select :value="year" @change="choose" aria-label="热力图年份" :disabled="loading"><option value="rolling">最近 365 天</option><option v-for="y in result?.years||[]" :key="y" :value="y">{{y}} 年</option></select></label>
   <label>平台<select v-model="platform" aria-label="热力图平台"><option value="all">全部平台</option><option v-for="p in result?.platforms||[]" :key="p" :value="p">{{p}}</option></select></label>
   <label>指标<select v-model="metric" aria-label="热力图指标"><option value="accepted_problem_count">AC 题目</option><option value="submission_count">提交次数</option><option value="problem_count">尝试题目</option><option value="activity_count">站点活动（洛谷）</option></select></label>
  </div>
  <p v-if="error" role="alert" class="error">{{error}} <button @click="load">重试</button></p>
  <LoadingNotice v-if="loading" :skeleton="!result">正在读取每日记录…</LoadingNotice>
  <template v-if="result">
   <p class="footnote">{{calendar.rangeStart}} — {{calendar.rangeEnd}}{{year==='rolling'?' · 最近 365 天':''}}</p>
   <div class="activity-summary"><span><strong>{{summary.activeDays}}</strong> 个活跃日</span><span v-if="metric==='activity_count'"><strong>{{summary.activities}}</strong> 次站点活动</span><template v-else><span><strong>{{summary.submissions}}</strong> 次提交</span><span><strong>{{summary.acProblems}}</strong> 道 AC 题目<span class="muted">（按天去重合计）</span></span></template></div>
   <div class="activity-layout content-ready">
    <div class="weekday-labels" aria-hidden="true"><span>一</span><span>三</span><span>五</span></div>
    <div class="activity-scroll" tabindex="0" aria-label="年度活动日历，可横向滚动">
     <div class="activity-months" :style="{'--weeks':calendar.columns}" aria-hidden="true"><span v-for="m in calendar.months" :key="m.key" :style="{gridColumn:m.column}">{{m.name}}</span></div>
     <div class="activity-grid" :style="{'--weeks':calendar.columns}" role="group" :aria-label="(year==='rolling'?'最近365天':year+'年')+'每日'+metricLabel">
      <template v-for="d in calendar.cells" :key="d.day"><button v-if="d.inside&&!d.future" type="button" class="activity-cell" :class="'level-'+d.level" :title="d.label" :aria-label="d.label" :data-day="d.day" :tabindex="focusDay===d.day?0:-1" @focus="focusDay=d.day;selected=d" @keydown="navigate($event,d.day)" @click="openSubmissions(d.day)"></button><span v-else class="activity-cell activity-placeholder" :class="{future:d.inside}" aria-hidden="true"></span></template>
     </div>
    </div>
   </div>
   <div class="activity-bottom"><p class="activity-selection" role="status">{{selected?selected.label:'点击日期查看当天的提交记录。'}}</p><div class="activity-legend" aria-label="颜色由浅到深表示 0、1 至 2、3 至 5、6 至 9、10 及以上"><span>少</span><i v-for="level in 5" :key="level" class="activity-cell" :class="'level-'+(level-1)"></i><span>多</span></div></div>
  </template>
  <ModuleHelp>
  <h4>日期与颜色</h4><p>默认显示截至今天的近一年，也可按自然年查看。每列是一周，从上到下为周日到周六。颜色深浅表示当日的{{metricLabel}}。</p>
  <h4>统计口径</h4><p>提交次数按已同步提交逐条计算。AC 题目和尝试题目在同一天内按题去重，同一道题在不同日期可以分别计入。</p>
  <h4>数据范围</h4><p>洛谷的站点活动是单独的指标，无法用来推算逐题提交或 AC 日期。热力图使用已同步明细，手工和示例记录不计入。空白日期也可能是历史明细缺失。</p>
  </ModuleHelp>
 </article>`
};
