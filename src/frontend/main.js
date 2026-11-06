import ProblemTypeSettings from './problem-type-settings.js';
import {apiFetch} from './api-fetch.js';
import CardOrderEditor from './card-order-editor.js';
import LoadingNotice from './loading-notice.js';
import ModuleHelp from './module-help.js';
import SkillLayoutSettings from './skill-layout-settings.js';
import SkillSettings from './skill-settings.js';
import PlatformAnalysis from './platform-analysis.js';
import PracticeTrends from './practice-trends.js';
import Submissions from './submissions.js';
import Practice from './practice.js';
import SiteStatus from './site-status.js';
import {createApp,onMounted,onBeforeUnmount,ref,shallowRef,computed,watch,nextTick} from 'vue';
import Accounts from './accounts.js';
import TagAnalysis from './tag-analysis.js';
import OverallAbility from './overall-ability.js';
import AbilityTrends from './ability-trends.js';
import Activity from './activity.js';
import {useTheme} from './theme.js';
import {useCardOrder} from './page-card-order.js';
import {useDisplayPreferences} from './display-preferences.js';
import {useDashboardCharts} from './dashboard-charts.js';
import './style.css';
const pages=[
 {id:'overview',icon:'◫',name:'数据简览'},
 {id:'analysis',icon:'↗',name:'详细分析'},
 {id:'records',icon:'≡',name:'提交记录'},
 {id:'settings',icon:'⚙',name:'设置'}
];
const overviewBookmarks=[
 {id:'overview-counts',title:'刷题统计'},
 {id:'activity',title:'刷题热力图'},
 {id:'week',title:'最近 7 天的表现'},
 {id:'overview-difficulty',title:'难度一览'}
];
const aliases={practice:'analysis',trends:'analysis',tags:'analysis',recent:'records',accounts:'settings'};
function recommendationRoute(){
 const [page,query]=location.hash.slice(1).split('?');
 const params=new URLSearchParams(query);
 return {open:page==='practice'||(page==='analysis'&&params.get('recommend')==='1'),tag:params.get('tag')||''};
}
function resolvePage(){
 const key=location.hash.slice(1).split('?')[0];
 return pages.some(p=>p.id===key)?key:aliases[key]||'overview';
}
createApp({
 components:{ProblemTypeSettings,CardOrderEditor,SkillLayoutSettings,SkillSettings,PlatformAnalysis,PracticeTrends,Submissions,Practice,SiteStatus,Accounts,Activity,TagAnalysis,OverallAbility,AbilityTrends},
 setup(){
  const sidebarCollapsed=ref(false),sidebarInteracted=ref(false);
  try { sidebarCollapsed.value=localStorage.getItem('acmer-sidebar-collapsed')==='1'; } catch {}
  function toggleSidebar(){
   sidebarInteracted.value=true;
   sidebarCollapsed.value=!sidebarCollapsed.value;
   try { localStorage.setItem('acmer-sidebar-collapsed',sidebarCollapsed.value?'1':'0'); } catch {}
  }

  const page=ref(resolvePage()),current=computed(()=>pages.find(p=>p.id===page.value));
  const cardOrder=useCardOrder(page);
  const {editingCards}=cardOrder;
  const animateCardSwitch=ref(false);
  function switchCardEditing(event){
   const keyboardFocus=event.target.matches(':focus-visible');
   animateCardSwitch.value=true;
   editingCards.value=event.target.checked;
   if(keyboardFocus)nextTick(()=>document.querySelector('.card-order-toggle input')?.focus({preventScroll:true}));
  }
  const displayPreferences=useDisplayPreferences();
  const recordsQuery=ref(page.value==='records'?location.hash.split('?')[1]||'':'');
  const recommendation=ref(recommendationRoute()),recommendationEl=ref(null);
  const pageData=shallowRef({});
  const data=computed(()=>pageData.value[page.value]??null);
  const loading=ref(false),error=ref(''),dataVersion=ref(0);
  const dashboardCharts=useDashboardCharts(data,editingCards,()=>isDark.value);
  const {draw,disposeCharts,resize,difficultyPlatform}=dashboardCharts;
  const {theme,isDark}=useTheme(draw);
  let requestNumber=0;
  async function load(){
   const view=page.value;
   const request=++requestNumber;
   loading.value=false;error.value='';
   if(view==='settings'){pageData.value={};return;}
   if(view==='records')return;
   loading.value=true;
   try{
    const response=await apiFetch(view==='overview'?'/api/dashboard?view=overview':'/api/dashboard');const body=await response.json();
    if(!response.ok)throw new Error(body.message);
    if(request!==requestNumber||page.value!==view)return;
    pageData.value={...pageData.value,[view]:body};dataVersion.value++;await nextTick();draw();
   }catch(e){if(request===requestNumber)error.value=e.message||'加载失败';}
   finally{if(request===requestNumber)loading.value=false;}
  }
  function hashChanged(){
   const requested=resolvePage();
   const next=editingCards.value&&requested==='overview'?page.value:requested;
   page.value=next;
   const [,query='']=location.hash.slice(1).split('?');
   recordsQuery.value=next==='records'&&requested==='records'?query:'';
   recommendation.value=recommendationRoute();
   if(recommendation.value.open){
    const params=new URLSearchParams({recommend:'1'});
    if(recommendation.value.tag)params.set('tag',recommendation.value.tag);
    history.replaceState(null,'','#analysis?'+params);
    return;
   }
   const hash='#'+next+(recordsQuery.value?'?'+recordsQuery.value:'');
   if(location.hash!==hash)history.replaceState(null,'',hash);
  }
  watch(editingCards,async editing=>{
   if(editing){disposeCharts();window.scrollTo({top:0,behavior:'instant'});}
   else{await nextTick();draw();window.dispatchEvent(new Event('resize'));if(page.value==='analysis'&&!data.value)load();}
  });
  watch(difficultyPlatform,()=>nextTick(draw));
  watch(page,async()=>{
   disposeCharts();await nextTick();draw();
   window.scrollTo({top:0,behavior:'instant'});
   if(page.value==='settings'||editingCards.value){requestNumber++;loading.value=false;error.value='';}
   else load();
  });
  watch([()=>recommendation.value.open,()=>recommendation.value.tag,()=>!!data.value],async()=>{
   if(!recommendation.value.open)return;
   await nextTick();recommendationEl.value?.scrollIntoView({block:'start'});
  },{immediate:true});
  function closeRecommendation(){
   history.replaceState(null,'','#analysis');
   recommendation.value=recommendationRoute();
   nextTick(()=>document.getElementById('tag-analysis')?.scrollIntoView({block:'start'}));
  }
  const bookmarks=computed(()=>{
   if(editingCards.value||(['overview','analysis'].includes(page.value)&&!data.value))return [];
   return page.value==='overview'?overviewBookmarks:cardOrder.editableCards.value;
  });
  const bookmarkMain=ref(null),activeBookmark=ref('');
  let bookmarkFrame=0,bookmarkResize,lastJump='';
  const bookmarkTarget=id=>document.getElementById(({topics:'tag-analysis',accounts:'accounts'})[id]??'bookmark-'+id);
  function updateActiveBookmark(){
   bookmarkFrame=0;
   const viewport=document.scrollingElement;
   const atBottom=viewport.scrollTop>0&&viewport.scrollHeight-viewport.clientHeight-viewport.scrollTop<=2;
   let first='',current='',currentTop=-Infinity;
   for(const {id} of bookmarks.value){
    const target=bookmarkTarget(id);
    if(!target?.getClientRects().length)continue;
    first||=id;
    const top=target.getBoundingClientRect().top;
    const offset=parseFloat(getComputedStyle(target).scrollMarginTop)||0;
    if((top<=offset+2||atBottom)&&(top>currentTop||(top===currentTop&&id===lastJump))){
     current=id;
     currentTop=top;
    }
   }
   activeBookmark.value=current||first;
  }
  function scheduleBookmarkUpdate(){
   if(!bookmarkFrame)bookmarkFrame=requestAnimationFrame(updateActiveBookmark);
  }
  watch([bookmarks,()=>recommendation.value.open],scheduleBookmarkUpdate,{flush:'post'});
  watch(page,()=>{lastJump='';activeBookmark.value='';});
  onMounted(()=>{
   window.addEventListener('scroll',scheduleBookmarkUpdate,{passive:true});
   bookmarkResize=new ResizeObserver(scheduleBookmarkUpdate);
   bookmarkResize.observe(bookmarkMain.value);
   scheduleBookmarkUpdate();
  });
  onBeforeUnmount(()=>{
   window.removeEventListener('scroll',scheduleBookmarkUpdate);
   bookmarkResize?.disconnect();
   cancelAnimationFrame(bookmarkFrame);
  });
  function jumpToCard(id){
   if(id==='recommendation'&&!recommendation.value.open){
    location.hash='#analysis?recommend=1';
    return;
   }
   const target=bookmarkTarget(id);
   if(!target)return;
   lastJump=id;
   target.setAttribute('tabindex','-1');
   target.focus({preventScroll:true});
   target.scrollIntoView({block:'start'});
   scheduleBookmarkUpdate();
  }
  watch(sidebarCollapsed,()=>nextTick(resize));
  onMounted(()=>{hashChanged();load();window.addEventListener('hashchange',hashChanged);window.addEventListener('resize',resize);});
  onBeforeUnmount(()=>{disposeCharts();window.removeEventListener('hashchange',hashChanged);window.removeEventListener('resize',resize);});
  return {
   ...cardOrder,...displayPreferences,...dashboardCharts,
   recordsQuery,recommendation,recommendationEl,closeRecommendation,sidebarCollapsed,sidebarInteracted,toggleSidebar,
   animateCardSwitch,switchCardEditing,bookmarks,bookmarkMain,activeBookmark,jumpToCard,pages,page,current,data,dataVersion,loading,error,load,theme
  };
 },
 template:`
 <div class="layout" :class="{'sidebar-collapsed':sidebarCollapsed,'sidebar-interacted':sidebarInteracted}">
  <aside>
   <div class="sidebar-heading">
    <a class="brand" href="#overview" aria-label="刷题手记首页" title="刷题手记首页">◈ <span>刷题手记<small>ACMER / INSIGHT</small></span></a>
    <button type="button" class="sidebar-toggle" aria-controls="main-navigation" :aria-expanded="!sidebarCollapsed" :aria-label="sidebarCollapsed?'展开侧栏':'折叠侧栏'" :title="sidebarCollapsed?'展开侧栏':'折叠侧栏'" @click="toggleSidebar">{{sidebarCollapsed?'»':'«'}}</button>
   </div>
   <p class="nav-label">我的练习空间</p>
   <nav id="main-navigation" aria-label="主导航"><template v-for="item in pages" :key="item.id"><span v-if="editingCards&&item.id==='overview'" class="nav nav-locked" aria-disabled="true" title="结束卡片位置编辑后可进入"><span aria-hidden="true">{{item.icon}}</span><span class="nav-text">　{{item.name}}</span></span><a v-else :href="'#'+item.id" class="nav" :class="{active:page===item.id}" :aria-current="page===item.id?'page':undefined" :aria-label="item.name" :title="item.name"><span aria-hidden="true">{{item.icon}}</span><span class="nav-text">　{{item.name}}</span></a></template></nav>
   <SiteStatus />
  </aside>
  <main ref="bookmarkMain" :class="{'has-bookmarks':bookmarks.length}">
   <header><h1>{{current.name}}</h1><button v-if="editingCards&&page!=='settings'" @click="editingCards=false">结束卡片编辑</button><button v-else-if="page!=='settings'" @click="load" :aria-busy="loading" :disabled="loading">{{loading?'正在读取…':'↻ 刷新数据'}}</button></header>
   <nav v-if="bookmarks.length" class="page-bookmarks" aria-label="本页模块书签">
    <span class="page-bookmarks-title">本页书签</span>
    <button v-for="card in bookmarks" :key="card.id" type="button" :aria-current="activeBookmark===card.id?'location':undefined" @click="jumpToCard(card.id)">{{card.title}}</button>
   </nav>
   <div v-if="editingCards" class="card-order-info" role="status">拖动标题调整本页卡片顺序，松开后自动保存。模块只能在所属页面内移动。</div>
   <p v-if="cardOrderError" class="error" role="alert">{{cardOrderError}}</p>
   <CardOrderEditor v-if="editingCards" :key="page" :cards="editableCards" @move="moveCard"><label class="card-order-toggle"><input type="checkbox" role="switch" :checked="editingCards" :class="{'switch-animated':animateCardSwitch}" @change="switchCardEditing" @animationend="animateCardSwitch=false">卡片位置编辑模式</label></CardOrderEditor>
   <div v-if="!editingCards&&error&&page!=='settings'" role="alert" class="error">{{error}} <button @click="load">重试</button></div>
   <LoadingNotice v-if="!editingCards&&loading&&!data&&!['settings','records'].includes(page)" class="panel" skeleton>正在读取看板…</LoadingNotice>

   <section v-if="page==='overview'&&data" key="overview" aria-label="数据简览">
    <div id="bookmark-overview-counts" class="metrics content-ready">
     <article><span>累计题数</span><strong>{{data.overview?.total_problems??0}}<small> 道</small></strong><ModuleHelp><p>按题去重，含平台公开累计汇总。洛谷公开练习清单也计入题目总量。</p></ModuleHelp></article>
     <article><span>AC 题数</span><strong>{{data.overview?.passed_problems??0}}<small> 道</small></strong><ModuleHelp><p>同一道题多次通过只计一次。</p></ModuleHelp></article>
    </div>
    <Activity id="bookmark-activity" :refresh-key="dataVersion" />
    <div class="chart-grid">
     <article id="bookmark-week" class="panel">
      <div class="panel-head"><h2>最近 7 天的表现</h2><span>{{days[0]?.day}} — {{days[6]?.day}}</span></div>
      <div class="week-summary"><div><strong>{{week.submissions}}</strong><span>提交次数</span></div><div><strong>{{week.accepted}}</strong><span>AC 次数</span></div><div><strong>{{week.problems}}</strong><span>尝试题目</span></div><div><strong>{{week.activeDays}} / 7</strong><span>活跃天数</span></div></div>
      <div ref="weekEl" class="chart" role="img" aria-label="最近七天提交与 AC 次数趋势"></div>
      <ModuleHelp><p class="footnote">根据已同步的提交明细统计。部分平台仅同步 AC。洛谷公开练习清单、手工记录和示例记录不计入提交趋势。</p></ModuleHelp>
     </article>
     <article id="bookmark-overview-difficulty" class="panel"><div class="panel-head"><h2>难度一览</h2><a class="text-link" href="#analysis">查看分析 →</a></div><label class="difficulty-filter"><span>平台</span><select v-model="difficultyPlatform" aria-label="难度统计平台"><option v-for="p in difficultyPlatforms" :key="p.platform_id" :value="p.platform_name">{{p.platform_name}}</option></select></label><div ref="difficultyEl" class="chart overview-pie" role="img" aria-label="刷题难度分布"></div><ModuleHelp><p class="footnote">{{difficultyNote}}</p></ModuleHelp></article>
    </div>
   </section>

   <section v-else-if="page==='analysis'&&data" v-show="!editingCards" key="analysis" class="ordered-cards" aria-label="详细分析">
    <OverallAbility id="bookmark-overall" class="content-ready" :style="cardStyle('overall')" :profile="data.overallAbility" :refresh-key="dataVersion" />
    <AbilityTrends id="bookmark-ability-trend" :style="cardStyle('ability-trend')" :refresh-key="dataVersion" />
    <PracticeTrends id="bookmark-practice-trend" :style="cardStyle('practice-trend')" :refresh-key="dataVersion" />
    <div id="bookmark-difficulty" class="analysis-difficulty" :style="cardStyle('difficulty')">
     <article class="panel"><div class="panel-head"><h2>难度分布</h2><span>CF 统一尺度</span></div><label class="difficulty-filter"><span>平台</span><select v-model="difficultyPlatform" aria-label="难度统计平台"><option v-for="p in difficultyPlatforms" :key="p.platform_id" :value="p.platform_name">{{p.platform_name}}</option></select></label><div ref="difficultyEl" class="chart" role="img" aria-label="刷题难度分布"></div><ModuleHelp><p class="footnote">{{difficultyNote}}</p></ModuleHelp></article>
    </div>
    <PlatformAnalysis id="bookmark-platforms" :style="cardStyle('platforms')" :platforms="data.platforms" :snapshots="data.platformSnapshots||[]" :refresh-key="dataVersion" />
    <TagAnalysis :style="cardStyle('topics')" :profiles="data.tagAbility||[]" :refresh-key="dataVersion" />
    <div v-if="recommendation.open&&!editingCards" id="bookmark-recommendation" ref="recommendationEl" class="recommendation-section" :style="cardStyle('recommendation')"><Practice :key="recommendation.tag" :initial-tag="recommendation.tag" :refresh-key="dataVersion" @close="closeRecommendation" /></div>
    <TagAnalysis id="bookmark-graph" :style="cardStyle('graph')" :skill-config="data.skillConfig" :skill-counts="data.skillCounts" graph-only :profiles="data.tagAbility||[]" :refresh-key="dataVersion" />
   </section>

   <section v-else-if="page==='records'" v-show="!editingCards" key="records" aria-label="提交记录"><Submissions id="bookmark-submissions" :route-query="recordsQuery" :refresh-key="dataVersion" /></section>

   <section v-else-if="page==='settings'" v-show="!editingCards" key="settings" class="ordered-cards" aria-label="设置">
    <article id="bookmark-appearance" class="panel appearance-panel" :style="cardStyle('appearance')"><div class="panel-head"><h2>外观</h2><span>偏好自动保存</span></div><div class="appearance-row"><label class="theme-switch"><span>页面主题</span><select v-model="theme" aria-label="页面主题"><option value="light">☀ 白色主题</option><option value="dark">☾ 深绿主题</option><option value="black">● 纯黑主题</option><option value="gray">◑ 灰色主题</option><option value="system">◐ 跟随系统</option></select></label><label class="card-order-toggle"><input type="checkbox" role="switch" :checked="editingCards" :class="{'switch-animated':animateCardSwitch}" @change="switchCardEditing" @animationend="animateCardSwitch=false">卡片位置编辑模式</label></div>
     <div class="display-controls">
      <div v-for="control in displayControls" :key="control.key" class="range-control">
       <div><label :for="'display-'+control.key">{{control.label}}</label><output :for="'display-'+control.key">{{display[control.key]}}{{control.unit}}</output></div>
       <input :id="'display-'+control.key" type="range" :min="control.min" :max="control.max" :step="control.step"
        :aria-valuetext="display[control.key]+control.unit" v-model.number="display[control.key]">
      </div>
     </div>
     <ModuleHelp><p class="footnote">主题可手动选择，也可以跟随系统。主题、字号和卡片间距保存在当前浏览器。开启卡片位置编辑模式后，可以拖动标题调整同一页面的卡片顺序，松开后自动保存。</p></ModuleHelp>
    </article>
    <SkillLayoutSettings id="bookmark-layout" :style="cardStyle('layout')" />
    <SkillSettings :card-positions="cardPositions" @saved="load" />
    <ProblemTypeSettings id="bookmark-problem-types" :style="cardStyle('problem-types')" />
    <Accounts :style="cardStyle('accounts')" @synced="load" />
   </section>
   <footer>刷题手记 · 数据来自本机 MySQL</footer>
  </main>
 </div>`
}).component('ModuleHelp',ModuleHelp).component('LoadingNotice',LoadingNotice).mount('#app');
