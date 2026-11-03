import {createApp,onMounted,onBeforeUnmount,ref,computed,watch,nextTick} from 'vue';
import * as echarts from 'echarts/core';
import {BarChart,LineChart,PieChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import Accounts from './accounts.js';
import TagAnalysis from './tag-analysis.js';
import Activity from './activity.js';
import {useTheme} from './theme.js';
import {formatDifficulty,difficultyBuckets} from './difficulty.js';
import './style.css';
echarts.use([BarChart,LineChart,PieChart,GridComponent,TooltipComponent,LegendComponent,CanvasRenderer]);

const pages=[
 {id:'overview',icon:'◫',name:'数据简览',eyebrow:'YOUR PRACTICE, AT A GLANCE',title:'看看最近，又进步了多少。',description:'用几个关键数字，快速回顾你的积累和最近 7 天的练习。'},
 {id:'analysis',icon:'↗',name:'详细分析',eyebrow:'EXPLORE YOUR PRACTICE',title:'从数据里，找到下一步。',description:'结合练习趋势、平台分布和题型能力参考，了解你的训练方向。'},
 {id:'records',icon:'≡',name:'最近记录',eyebrow:'YOUR RECENT PRACTICE',title:'每一次尝试，都有迹可循。',description:'查看最近更新的题目、通过状态和累计提交次数。'},
 {id:'settings',icon:'⚙',name:'设置',eyebrow:'MAKE IT YOURS',title:'把练习空间，调成你的样子。',description:'在这里管理平台账号、同步数据，以及调整页面外观。'}
];
const aliases={trends:'analysis',tags:'analysis',recent:'records',accounts:'settings'};
function resolvePage(){
 const key=location.hash.slice(1);
 return pages.some(p=>p.id===key)?key:aliases[key]||'overview';
}
createApp({
 components:{Accounts,Activity,TagAnalysis},
 setup(){
  const page=ref(resolvePage()),current=computed(()=>pages.find(p=>p.id===page.value));
  const data=ref(null),loading=ref(false),error=ref(''),dataVersion=ref(0);
  const monthlyEl=ref(null),difficultyEl=ref(null),weekEl=ref(null);
  const charts=new Map();
  const difficultyPlatform=ref('Codeforces');
  const difficultyPlatforms=computed(()=>data.value?.platforms.filter(p=>p.total_count>0)||[]);
  const difficultyNote=computed(()=>difficultyPlatform.value==='Codeforces'?'Codeforces 官方题目 rating，按 400 分分段；没有 rating 的题目单列。':difficultyPlatform.value==='AtCoder'?'AtCoder Problems 社区估计难度，按 400 分分段；不是比赛题目的得分，也不与 CF 分数混算。':'当前平台按原有难度分类统计。');
  const {theme,isDark}=useTheme(draw);
  let requestNumber=0;
  const days=computed(()=>{
   const today=data.value?.serverDate;if(!today)return [];
   return Array.from({length:7},(_,i)=>{
    const date=new Date(today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-6+i);
    const day=date.toISOString().slice(0,10);
    return {day,submission_count:0,accepted_count:0,problem_count:0,...data.value.daily?.find(row=>row.day===day)};
   });
  });
  const week=computed(()=>({
   submissions:days.value.reduce((n,d)=>n+Number(d.submission_count),0),
   accepted:days.value.reduce((n,d)=>n+Number(d.accepted_count),0),
   activeDays:days.value.filter(d=>d.submission_count>0).length,
   problems:data.value?.weekProblems??0
  }));
  function disposeCharts(){charts.forEach(c=>c.dispose());charts.clear();}
  function render(element,option){
   if(!element)return;
   let chart=charts.get(element);
   if(!chart){chart=echarts.init(element);charts.set(element,chart);}
   chart.setOption(option,true);
  }
  function draw(){
   charts.forEach((chart,element)=>{if(!element.isConnected){chart.dispose();charts.delete(element);}});
   if(!data.value)return;
   const dark=isDark.value;
   const colors=dark?['#83bc9c','#9faedb','#c4ce93','#d9b77f','#7d9289']:['#376c58','#86a895','#c4d5b8','#dfbf82','#b0b9aa'];
   const text=dark?'#b5c6b9':'#788571',line=dark?'#34483c':'#d9e0d7',gridLine=dark?'#293a30':'#eef0eb';
   const tooltip={backgroundColor:dark?'#24352b':'#ffffff',borderColor:line,textStyle:{color:dark?'#e0eadd':'#25372e'}};
   const base={animation:false,color:colors,tooltip:{...tooltip,trigger:'axis'},legend:{bottom:0,textStyle:{color:text}},
    grid:{left:42,right:20,top:18,bottom:55},
    yAxis:{type:'value',minInterval:1,axisLabel:{color:text},splitLine:{lineStyle:{color:gridLine}}}};
   const axis=labels=>({type:'category',data:labels,axisLabel:{color:text},axisLine:{lineStyle:{color:line}}});
   render(monthlyEl.value,{...base,xAxis:axis(data.value.monthly.map(x=>x.solve_month)),
    series:[{name:'刷题数',type:'bar',barMaxWidth:38,itemStyle:{borderRadius:[5,5,0,0]},data:data.value.monthly.map(x=>x.total_count)},
     {name:'通过数',type:'line',symbolSize:6,data:data.value.monthly.map(x=>x.passed_count)}]});
   render(weekEl.value,{...base,xAxis:axis(days.value.map(x=>x.day.slice(5))),
    series:[{name:'提交次数',type:'bar',barMaxWidth:30,itemStyle:{borderRadius:[5,5,0,0]},data:days.value.map(x=>x.submission_count)},
     {name:'AC 次数',type:'line',symbolSize:6,data:days.value.map(x=>x.accepted_count)}]});
   const buckets=difficultyBuckets(data.value.nativeDifficulty||[],difficultyPlatform.value);
   render(difficultyEl.value,{animation:false,color:colors,tooltip:{...tooltip,trigger:'item'},legend:{bottom:0,textStyle:{color:text}},
    series:[{type:'pie',radius:['43%','65%'],center:['50%','36%'],label:{show:false},
     data:buckets}]});
  }
  async function load(){
   const request=++requestNumber;loading.value=true;error.value='';
   try{
    const response=await fetch('/api/dashboard');const body=await response.json();
    if(!response.ok)throw new Error(body.message);
    if(request!==requestNumber)return;
    data.value=body;dataVersion.value++;await nextTick();draw();
   }catch(e){if(request===requestNumber)error.value=e.message||'加载失败';}
   finally{if(request===requestNumber)loading.value=false;}
  }
  function hashChanged(){
   const next=resolvePage();page.value=next;
   if(location.hash!=='#'+next)history.replaceState(null,'','#'+next);
  }
  watch(difficultyPlatform,()=>nextTick(draw));
  watch(page,async()=>{
   disposeCharts();await nextTick();draw();
   window.scrollTo({top:0,behavior:'instant'});
   if(page.value!=='settings')load();
  });
  const resize=()=>charts.forEach(c=>c.resize());
  onMounted(()=>{hashChanged();load();window.addEventListener('hashchange',hashChanged);window.addEventListener('resize',resize);});
  onBeforeUnmount(()=>{disposeCharts();window.removeEventListener('hashchange',hashChanged);window.removeEventListener('resize',resize);});
  return {pages,page,current,data,dataVersion,loading,error,monthlyEl,difficultyEl,weekEl,load,theme,days,week,difficultyPlatform,difficultyPlatforms,difficultyNote,formatDifficulty};
 },
 template:`
 <div class="layout">
  <aside>
   <a class="brand" href="#overview">◈ <span>刷题手记<small>ACMER / INSIGHT</small></span></a>
   <p class="nav-label">我的练习空间</p>
   <nav aria-label="主导航"><a v-for="item in pages" :key="item.id" :href="'#'+item.id" class="nav" :class="{active:page===item.id}" :aria-current="page===item.id?'page':undefined">{{item.icon}}　{{item.name}}</a></nav>
   <div class="aside-note"><span class="dot"></span> 本机数据库<p>每一道题，都留下进步的痕迹。</p></div>
  </aside>
  <main>
   <header><span class="breadcrumb">个人工作台 / {{current.name}}</span><button v-if="page!=='settings'" @click="load" :disabled="loading">{{loading?'正在读取…':'↻ 刷新数据'}}</button><span v-else class="header-hint">你的账号与偏好</span></header>
   <section class="intro"><p class="eyebrow">{{current.eyebrow}}</p><h1>{{current.title}}</h1><p>{{current.description}}</p></section>
   <div v-if="error&&page!=='settings'" role="alert" class="error">{{error}} <button @click="load">重试</button></div>
   <p v-if="loading&&!data&&page!=='settings'" role="status">正在读取数据库…</p>

   <section v-if="page==='overview'&&data" key="overview" aria-label="数据简览">
    <div class="metrics">
     <article><span>累计刷题</span><strong>{{data.overview?.total_problems??0}}<small> 道</small></strong><p>按用户与题目去重</p></article>
     <article><span>已通过题目</span><strong>{{data.overview?.passed_problems??0}}<small> 道</small></strong><p>每一步积累都算数</p></article>
     <article><span>题目通过率</span><strong>{{data.overview?.pass_rate??0}}<small> %</small></strong><p>针对已记录的题目样本</p></article>
     <article><span>覆盖平台</span><strong>{{data.overview?.platform_count??0}}<small> 个</small></strong><p>{{data.overview?.tag_count??0}} 个题型标签</p></article>
    </div>
    <Activity :refresh-key="dataVersion" />
    <div class="chart-grid">
     <article class="panel">
      <div class="panel-head"><h2>最近 7 天的表现</h2><span>{{days[0]?.day}} — {{days[6]?.day}}</span></div>
      <div class="week-summary"><div><strong>{{week.submissions}}</strong><span>提交次数</span></div><div><strong>{{week.accepted}}</strong><span>AC 次数</span></div><div><strong>{{week.problems}}</strong><span>尝试题目</span></div><div><strong>{{week.activeDays}} / 7</strong><span>活跃天数</span></div></div>
      <div ref="weekEl" class="chart" role="img" aria-label="最近七天提交与 AC 次数趋势"></div>
      <p class="footnote">根据已同步的提交明细统计；部分平台仅有 AC 数据，不包含手工和示例记录。</p>
     </article>
     <article class="panel"><div class="panel-head"><h2>难度一览</h2><a class="text-link" href="#analysis">查看分析 →</a></div><label class="difficulty-filter"><span>平台</span><select v-model="difficultyPlatform" aria-label="难度统计平台"><option v-for="p in difficultyPlatforms" :key="p.platform_id" :value="p.platform_name">{{p.platform_name}}</option></select></label><div ref="difficultyEl" class="chart overview-pie" role="img" aria-label="刷题难度分布"></div><p class="footnote">{{difficultyNote}}</p></article>
    </div>
    <article class="panel next-step"><div><h2>想再多了解一点？</h2><p>查看月度节奏、平台分布和题型掌握度，规划下一次练习。</p></div><a class="page-button" href="#analysis">进入详细分析 →</a></article>
   </section>

   <section v-else-if="page==='analysis'&&data" key="analysis" aria-label="详细分析">
    <div class="chart-grid">
     <article class="panel"><div class="panel-head"><h2>月度练习趋势</h2><span>按题目汇总</span></div><div ref="monthlyEl" class="chart" role="img" aria-label="月度刷题数与通过数趋势"></div><p class="footnote">使用每道题记录中保存的刷题日期，并非逐次提交活动。</p></article>
     <article class="panel"><div class="panel-head"><h2>难度分布</h2><span>按平台独立统计</span></div><label class="difficulty-filter"><span>平台</span><select v-model="difficultyPlatform" aria-label="难度统计平台"><option v-for="p in difficultyPlatforms" :key="p.platform_id" :value="p.platform_name">{{p.platform_name}}</option></select></label><div ref="difficultyEl" class="chart" role="img" aria-label="刷题难度分布"></div><p class="footnote">{{difficultyNote}}</p></article>
    </div>
    <article class="panel platform-analysis"><div class="panel-head"><h2>各平台练习情况</h2><span>已记录题目与通过情况</span></div><div class="platform-grid">
     <div class="platform" v-for="p in data.platforms" :key="p.platform_id"><div><b>{{p.platform_name}}</b><span>{{p.passed_count}} / {{p.total_count}} 道通过</span></div><div class="track"><i :style="{width:(p.pass_rate??0)+'%'}"></i></div><em>{{p.total_count?p.pass_rate+'%':'暂无记录'}}</em></div>
    </div></article>
    <TagAnalysis :profiles="data.tagAbility||[]" :refresh-key="dataVersion" />
   </section>

   <section v-else-if="page==='records'&&data" key="records" aria-label="最近记录">
    <article class="panel recent"><div class="panel-head"><h2>最近更新的题目</h2><span>最近 8 条记录</span></div><div class="table-wrap"><table><thead><tr><th>题目</th><th>平台</th><th>难度</th><th>状态</th><th>提交次数</th><th>日期</th></tr></thead><tbody><tr v-for="(r,i) in data.recent" :key="i"><td class="problem">{{r.problem_name}}</td><td>{{r.platform_name}}</td><td>{{formatDifficulty(r)}}</td><td><span class="badge" :class="{good:r.passed===1}">{{r.passed===1?'已通过':'待攻克'}}</span></td><td>{{r.submit_count}}</td><td>{{r.solve_date}}</td></tr></tbody></table></div><p v-if="!data.recent.length" class="muted">还没有刷题记录</p><p class="footnote">每道题显示一条汇总记录，提交次数是已录入和已同步的记录合计。</p></article>
   </section>

   <section v-else-if="page==='settings'" key="settings" aria-label="设置">
    <article class="panel appearance-panel"><div class="panel-head"><h2>外观主题</h2><span>偏好自动保存</span></div><div class="appearance-row"><div><h3>选择你舒服的阅读方式</h3><p>支持明暗模式与跟随系统，切换时使用轻量渐变。</p></div><label class="theme-switch"><span>页面主题</span><select v-model="theme" aria-label="页面主题"><option value="light">☀ 白天模式</option><option value="dark">☾ 黑夜模式</option><option value="system">◐ 跟随系统</option></select></label></div></article>
    <Accounts @synced="load" />
   </section>
   <footer>刷题手记 · 数据来自本机 MySQL <span>每一次练习，都在积累。</span></footer>
  </main>
 </div>`
}).mount('#app');
