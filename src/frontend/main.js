import {createApp, onMounted, onBeforeUnmount, ref, nextTick} from 'vue';
import * as echarts from 'echarts/core';
import {BarChart, LineChart, PieChart} from 'echarts/charts';
import {GridComponent, TooltipComponent, LegendComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
echarts.use([BarChart,LineChart,PieChart,GridComponent,TooltipComponent,LegendComponent,CanvasRenderer]);
import './style.css';
import Accounts from './accounts.js';

createApp({
 components:{Accounts},
 setup() {
  const data=ref(null), loading=ref(false), error=ref(''), monthlyEl=ref(null), difficultyEl=ref(null);
  let charts=[];
  const colors=['#376c58','#86a895','#c4d5b8','#dfbf82'];
  function draw(){
   charts.forEach(c=>c.dispose()); charts=[];
   if(!data.value) return;
   const monthly=echarts.init(monthlyEl.value), difficulty=echarts.init(difficultyEl.value);
   charts=[monthly,difficulty];
   monthly.setOption({color:colors,tooltip:{trigger:'axis'},legend:{bottom:0},grid:{left:38,right:20,top:18,bottom:55},
    xAxis:{type:'category',data:data.value.monthly.map(x=>x.solve_month),axisLine:{lineStyle:{color:'#d9e0d7'}}},
    yAxis:{type:'value',minInterval:1,splitLine:{lineStyle:{color:'#eef0eb'}}},
    series:[{name:'刷题数',type:'bar',barMaxWidth:38,itemStyle:{borderRadius:[5,5,0,0]},data:data.value.monthly.map(x=>x.total_count)},
    {name:'通过数',type:'line',symbolSize:8,data:data.value.monthly.map(x=>x.passed_count)}]});
   const levels=['入门','普及','提高','省选','未评级'];
   difficulty.setOption({color:colors,tooltip:{trigger:'item'},legend:{bottom:0},series:[{type:'pie',radius:['48%','72%'],center:['50%','43%'],label:{show:false},data:levels.map(name=>({name,value:data.value.difficulty.find(x=>(x.difficulty||'未评级')===name)?.total_count||0}))}]});
  }
  async function load(){
   loading.value=true;error.value='';
   try {const response=await fetch('/api/dashboard'); const body=await response.json();if(!response.ok) throw new Error(body.message);data.value=body;await nextTick();draw();}
   catch(e){error.value=e.message||'加载失败';}finally{loading.value=false;}
  }
  const resize=()=>charts.forEach(c=>c.resize());
  onMounted(()=>{load();window.addEventListener('resize',resize);});
  onBeforeUnmount(()=>{charts.forEach(c=>c.dispose());window.removeEventListener('resize',resize);});
  return {data,loading,error,monthlyEl,difficultyEl,load};
 },
 template:`
 <div class="layout">
  <aside><a class="brand" href="#">◈ <span>刷题手记<small>ACMER / INSIGHT</small></span></a>
   <p class="nav-label">我的练习空间</p>
   <a href="#overview" class="nav active">◫　数据总览</a><a href="#trends" class="nav">↗　练习趋势</a><a href="#tags" class="nav">◇　题型分析</a><a href="#recent" class="nav">≡　最近记录</a><a href="#accounts" class="nav">◎　账号同步</a>
   <div class="aside-note"><span class="dot"></span> 本机数据库<p>每一道题，都留下进步的痕迹。</p></div>
  </aside>
  <main id="overview">
   <header><span class="breadcrumb">个人工作台 / 数据总览</span><button @click="load" :disabled="loading">{{loading?'正在读取…':'↻ 刷新数据'}}</button></header>
   <section class="intro"><p class="eyebrow">YOUR PRACTICE, IN PERSPECTIVE</p><h1>把每一次练习，连成进步。</h1><p>跨平台查看你的刷题积累，找到下一步值得投入的方向。</p></section>
   <div v-if="error" role="alert" class="error">{{error}} <button @click="load">重试</button></div>
   <p v-if="loading && !data" role="status">正在读取数据库…</p>
   <template v-if="data">
    <section class="metrics">
     <article><span>累计刷题</span><strong>{{data.overview?.total_problems??0}}<small> 道</small></strong><p>按用户与题目去重</p></article>
     <article><span>已通过题目</span><strong>{{data.overview?.passed_problems??0}}<small> 道</small></strong><p>持续积累你的解题经验</p></article>
     <article><span>题目通过率</span><strong>{{data.overview?.pass_rate??0}}<small> %</small></strong><p>已通过题目 / 刷题总数</p></article>
     <article><span>覆盖平台</span><strong>{{data.overview?.platform_count??0}}<small> 个</small></strong><p>{{data.overview?.tag_count??0}} 个题型标签</p></article>
    </section>
    <section class="chart-grid" id="trends">
     <article class="panel"><div class="panel-head"><h2>练习的节奏</h2><span>月度题目统计</span></div><div ref="monthlyEl" class="chart" role="img" aria-label="月度刷题数与通过数趋势"></div><p v-if="!data.monthly.length" class="muted">暂无练习记录</p></article>
     <article class="panel"><div class="panel-head"><h2>难度分布</h2><span>原有难度 / 未评级</span></div><div ref="difficultyEl" class="chart" role="img" aria-label="刷题难度分布"></div></article>
    </section>
    <section class="bottom-grid">
     <article class="panel"><div class="panel-head"><h2>平台足迹</h2><span>PLATFORMS</span></div>
      <div class="platform" v-for="p in data.platforms" :key="p.platform_id"><div><b>{{p.platform_name}}</b><span>{{p.passed_count}} / {{p.total_count}} 道通过</span></div><div class="track"><i :style="{width:(p.pass_rate??0)+'%'}"></i></div><em>{{p.total_count ? p.pass_rate+"%" : "暂无记录"}}</em></div>
      <p v-if="!data.platforms.length" class="muted">暂无平台记录</p>
     </article>
     <article class="panel" id="tags"><div class="panel-head"><h2>题型掌握度</h2><span>按刷题数排序</span></div>
      <div class="table-wrap"><table><thead><tr><th>题型</th><th>刷题数</th><th>通过率</th><th>掌握度</th></tr></thead><tbody><tr v-for="t in data.tags" :key="t.tag_id"><td>{{t.tag_name}}</td><td>{{t.total_count}}</td><td>{{t.pass_rate}}%</td><td><span class="badge" :class="{'good':t.mastery==='擅长','weak':t.mastery==='薄弱'}">{{t.mastery}}</span></td></tr></tbody></table></div>
      <p class="footnote">少于 20 道时样本不足，暂不判定掌握度。</p>
     </article>
    </section>
    <article class="panel recent" id="recent"><div class="panel-head"><h2>最近的练习</h2><span>最近 8 条记录</span></div><div class="table-wrap"><table><thead><tr><th>题目</th><th>平台</th><th>难度</th><th>状态</th><th>提交次数</th><th>日期</th></tr></thead><tbody><tr v-for="(r,i) in data.recent" :key="i"><td class="problem">{{r.problem_name}}</td><td>{{r.platform_name}}</td><td>{{r.difficulty||'未评级'}}</td><td><span class="badge" :class="{good:r.passed===1}">{{r.passed===1?'已通过':'待攻克'}}</span></td><td>{{r.submit_count}}</td><td>{{r.solve_date}}</td></tr></tbody></table></div><p v-if="!data.recent.length" class="muted">还没有刷题记录</p></article>
    <Accounts @synced="load" /><footer>刷题手记 · 数据来自本机 MySQL <span>按题目汇总，月度数据使用记录中保存的刷题日期</span></footer>
   </template>
  </main>
 </div>`
}).mount('#app');
