import SkillLayoutSettings from './skill-layout-settings.js';
import SkillSettings from './skill-settings.js';
import PlatformAnalysis from './platform-analysis.js';
import PracticeTrends from './practice-trends.js';
import Submissions from './submissions.js';
import {createApp,onMounted,onBeforeUnmount,ref,computed,watch,nextTick} from 'vue';
import * as echarts from 'echarts/core';
import {BarChart,LineChart,PieChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import Accounts from './accounts.js';
import TagAnalysis from './tag-analysis.js';
import OverallAbility from './overall-ability.js';
import Activity from './activity.js';
import {useTheme} from './theme.js';
import {formatDifficulty,cfDifficultyBuckets} from './difficulty.js';
import './style.css';
echarts.use([BarChart,LineChart,PieChart,GridComponent,TooltipComponent,LegendComponent,CanvasRenderer]);

const pages=[
 {id:'overview',icon:'◫',name:'数据简览',eyebrow:'YOUR PRACTICE, AT A GLANCE',title:'看看最近，又进步了多少。',description:'用几个关键数字，快速回顾你的积累和最近 7 天的练习。'},
 {id:'analysis',icon:'↗',name:'详细分析',eyebrow:'EXPLORE YOUR PRACTICE',title:'从数据里，找到下一步。',description:'结合练习趋势、平台分布和题型能力参考，了解你的训练方向。'},
 {id:'records',icon:'≡',name:'提交记录',eyebrow:'YOUR SUBMISSION HISTORY',title:'每一次尝试，都有迹可循。',description:'按时间查看已同步的每次提交，包括通过与未通过记录。'},
 {id:'settings',icon:'⚙',name:'设置',eyebrow:'MAKE IT YOURS',title:'把练习空间，调成你的样子。',description:'在这里管理平台账号、同步数据，以及调整页面外观。'}
];
const aliases={trends:'analysis',tags:'analysis',recent:'records',accounts:'settings'};
function resolvePage(){
 const key=location.hash.slice(1);
 return pages.some(p=>p.id===key)?key:aliases[key]||'overview';
}
createApp({
 components:{SkillLayoutSettings,SkillSettings,PlatformAnalysis,PracticeTrends,Submissions,Accounts,Activity,TagAnalysis,OverallAbility},
 setup(){
  const sidebarCollapsed=ref(false);
  try { sidebarCollapsed.value=localStorage.getItem('acmer-sidebar-collapsed')==='1'; } catch {}
  function toggleSidebar(){
   sidebarCollapsed.value=!sidebarCollapsed.value;
   try { localStorage.setItem('acmer-sidebar-collapsed',sidebarCollapsed.value?'1':'0'); } catch {}
  }

  const page=ref(resolvePage()),current=computed(()=>pages.find(p=>p.id===page.value));
  const data=ref(null),loading=ref(false),error=ref(''),dataVersion=ref(0);
  const difficultyEl=ref(null),weekEl=ref(null);
  const charts=new Map();
  const difficultyPlatform=ref('全部平台');
  const difficultyPlatforms=computed(()=>[{platform_name:'全部平台'},...(data.value?.platforms.filter(p=>p.total_count>0)||[])]);
  const difficultyNote=computed(()=>'统一按 CF 尺度分段。CF 为官方题目 rating；AT 和洛谷为低置信估分，缺少依据的题目单列。原始难度保留在入选题单中。');
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
   const css=getComputedStyle(document.documentElement),token=name=>css.getPropertyValue(name).trim();
   const text=token('--muted'),line=token('--border'),gridLine=token('--rowBorder');
   const tooltip={backgroundColor:token('--panel'),borderColor:line,textStyle:{color:token('--text')}};
   const base={animation:false,color:colors,tooltip:{...tooltip,trigger:'axis'},legend:{bottom:0,textStyle:{color:text}},
    grid:{left:42,right:20,top:18,bottom:55},
    yAxis:{type:'value',minInterval:1,axisLabel:{color:text},splitLine:{lineStyle:{color:gridLine}}}};
   const axis=labels=>({type:'category',data:labels,axisLabel:{color:text},axisLine:{lineStyle:{color:line}}});
   render(weekEl.value,{...base,xAxis:axis(days.value.map(x=>x.day.slice(5))),
    series:[{name:'提交次数',type:'bar',barMaxWidth:30,itemStyle:{borderRadius:[5,5,0,0]},data:days.value.map(x=>x.submission_count)},
     {name:'AC 次数',type:'line',symbolSize:6,data:days.value.map(x=>x.accepted_count)}]});
   const buckets=cfDifficultyBuckets(data.value.unifiedDifficulty||[],difficultyPlatform.value);
   render(difficultyEl.value,{animation:false,color:colors,tooltip:{...tooltip,trigger:'item'},legend:{bottom:0,textStyle:{color:text}},
    series:[{type:'pie',radius:['43%','65%'],center:['50%','36%'],label:{show:false},
     data:buckets}]});
  }
  async function load(){
   if(page.value==='records'){dataVersion.value++;return;}
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
  watch(sidebarCollapsed,()=>nextTick(resize));
  onMounted(()=>{hashChanged();load();window.addEventListener('hashchange',hashChanged);window.addEventListener('resize',resize);});
  onBeforeUnmount(()=>{disposeCharts();window.removeEventListener('hashchange',hashChanged);window.removeEventListener('resize',resize);});
  return {sidebarCollapsed,toggleSidebar,pages,page,current,data,dataVersion,loading,error,difficultyEl,weekEl,load,theme,days,week,difficultyPlatform,difficultyPlatforms,difficultyNote,formatDifficulty};
 },
 template:`
 <div class="layout" :class="{'sidebar-collapsed':sidebarCollapsed}">
  <aside>
   <div class="sidebar-heading">
    <a class="brand" href="#overview" aria-label="刷题手记首页" title="刷题手记首页">◈ <span>刷题手记<small>ACMER / INSIGHT</small></span></a>
    <button type="button" class="sidebar-toggle" aria-controls="main-navigation" :aria-expanded="!sidebarCollapsed" :aria-label="sidebarCollapsed?'展开侧栏':'折叠侧栏'" :title="sidebarCollapsed?'展开侧栏':'折叠侧栏'" @click="toggleSidebar">{{sidebarCollapsed?'»':'«'}}</button>
   </div>
   <p class="nav-label">我的练习空间</p>
   <nav id="main-navigation" aria-label="主导航"><a v-for="item in pages" :key="item.id" :href="'#'+item.id" class="nav" :class="{active:page===item.id}" :aria-current="page===item.id?'page':undefined" :aria-label="item.name" :title="item.name"><span aria-hidden="true">{{item.icon}}</span><span class="nav-text">　{{item.name}}</span></a></nav>
   <div class="aside-note"><span class="dot"></span> 本机数据库<p>每一道题，都留下进步的痕迹。</p></div>
  </aside>
  <main>
   <header><span class="breadcrumb">个人工作台 / {{current.name}}</span><button v-if="page!=='settings'" @click="load" :disabled="loading">{{loading?'正在读取…':'↻ 刷新数据'}}</button><span v-else class="header-hint">你的账号与偏好</span></header>
   <section class="intro"><p class="eyebrow">{{current.eyebrow}}</p><h1>{{current.title}}</h1><p>{{current.description}}</p></section>
   <div v-if="error&&page!=='settings'" role="alert" class="error">{{error}} <button @click="load">重试</button></div>
   <p v-if="loading&&!data&&page!=='settings'&&page!=='records'" role="status">正在读取数据库…</p>

   <section v-if="page==='overview'&&data" key="overview" aria-label="数据简览">
    <div class="metrics">
     <article><span>累计题数</span><strong>{{data.overview?.total_problems??0}}<small> 道</small></strong><p>按题去重，含平台公开累计汇总</p></article>
     <article><span>AC 题数</span><strong>{{data.overview?.passed_problems??0}}<small> 道</small></strong><p>每一步积累都算数</p></article>
    </div>
    <Activity :refresh-key="dataVersion" /><p v-if="data.platformSnapshots?.length" class="footnote inventory-note">洛谷公开练习清单已计入题目总量；因没有逐题日期，不计入提交趋势。洛谷每日活动请在热力图选择“站点活动”。原有示例记录仍保留。</p>
    <div class="chart-grid">
     <article class="panel">
      <div class="panel-head"><h2>最近 7 天的表现</h2><span>{{days[0]?.day}} — {{days[6]?.day}}</span></div>
      <div class="week-summary"><div><strong>{{week.submissions}}</strong><span>提交次数</span></div><div><strong>{{week.accepted}}</strong><span>AC 次数</span></div><div><strong>{{week.problems}}</strong><span>尝试题目</span></div><div><strong>{{week.activeDays}} / 7</strong><span>活跃天数</span></div></div>
      <div ref="weekEl" class="chart" role="img" aria-label="最近七天提交与 AC 次数趋势"></div>
      <p class="footnote">根据已同步的提交明细统计；部分平台仅有 AC 数据，不包含手工和示例记录。</p>
     </article>
     <article class="panel"><div class="panel-head"><h2>难度一览</h2><a class="text-link" href="#analysis">查看分析 →</a></div><label class="difficulty-filter"><span>平台</span><select v-model="difficultyPlatform" aria-label="难度统计平台"><option v-for="p in difficultyPlatforms" :key="p.platform_id" :value="p.platform_name">{{p.platform_name}}</option></select></label><div ref="difficultyEl" class="chart overview-pie" role="img" aria-label="刷题难度分布"></div><p class="footnote">{{difficultyNote}}</p></article>
    </div>
   </section>

   <section v-else-if="page==='analysis'&&data" key="analysis" aria-label="详细分析">
    <OverallAbility :profile="data.overallAbility" :refresh-key="dataVersion" />
    <PracticeTrends :refresh-key="dataVersion" />
    <div class="analysis-difficulty">
     <article class="panel"><div class="panel-head"><h2>难度分布</h2><span>CF 统一尺度</span></div><label class="difficulty-filter"><span>平台</span><select v-model="difficultyPlatform" aria-label="难度统计平台"><option v-for="p in difficultyPlatforms" :key="p.platform_id" :value="p.platform_name">{{p.platform_name}}</option></select></label><div ref="difficultyEl" class="chart" role="img" aria-label="刷题难度分布"></div><p class="footnote">{{difficultyNote}}</p></article>
    </div>
    <PlatformAnalysis :platforms="data.platforms" :snapshots="data.platformSnapshots||[]" :refresh-key="dataVersion" />
    <TagAnalysis :profiles="data.tagAbility||[]" :refresh-key="dataVersion" />
    <TagAnalysis :skill-config="data.skillConfig" :skill-counts="data.skillCounts" graph-only :profiles="data.tagAbility||[]" :refresh-key="dataVersion" />
   </section>

   <section v-else-if="page==='records'" key="records" aria-label="提交记录"><Submissions :refresh-key="dataVersion" /></section>

   <section v-else-if="page==='settings'" key="settings" aria-label="设置">
    <article class="panel appearance-panel"><div class="panel-head"><h2>外观主题</h2><span>偏好自动保存</span></div><div class="appearance-row"><div><h3>选择你舒服的阅读方式</h3><p>白色、深绿、纯黑与灰色可选，支持跟随系统和轻量渐变。</p></div><label class="theme-switch"><span>页面主题</span><select v-model="theme" aria-label="页面主题"><option value="light">☀ 白色主题</option><option value="dark">☾ 深绿主题</option><option value="black">● 纯黑主题</option><option value="gray">◑ 灰色主题</option><option value="system">◐ 跟随系统</option></select></label></div></article>
    <SkillLayoutSettings />
    <SkillSettings @saved="load" />
    <Accounts @synced="load" />
   </section>
   <footer>刷题手记 · 数据来自本机 MySQL <span>每一次练习，都在积累。</span></footer>
  </main>
 </div>`
}).mount('#app');
