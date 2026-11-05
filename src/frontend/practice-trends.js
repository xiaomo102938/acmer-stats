import {ref,computed,onMounted,onBeforeUnmount,nextTick,watch} from 'vue';
import * as echarts from 'echarts/core';
import {BarChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,DataZoomComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
echarts.use([BarChart,GridComponent,TooltipComponent,DataZoomComponent,CanvasRenderer]);
const choices={month:['day','week'],year:['day','week','month','quarter'],life:['day','week','month','quarter','year','threeYear']};
const labels={day:'日',week:'周',month:'月',quarter:'季',year:'年',threeYear:'3 年'};
const metrics={submission_count:'提交次数',accepted_count:'AC 提交次数',first_ac_count:'首次 AC 题数'};
export default{
 props:{refreshKey:Number},
 setup(props){
  const mode=ref('year'),month=ref(''),year=ref(''),grain=ref('month'),platform=ref('all'),metric=ref('first_ac_count'),data=ref(null),loading=ref(false),error=ref(''),chartEl=ref(null);
  let chart,request,serial=0,resize,observer;
  const available=computed(()=>choices[mode.value]);
  const total=computed(()=>data.value?.buckets.reduce((sum,b)=>sum+Number(b[metric.value]),0)||0);
  function draw(){
   if(!data.value||!chartEl.value)return;if(!chart)chart=echarts.init(chartEl.value);
   const css=getComputedStyle(document.documentElement),token=n=>css.getPropertyValue(n).trim(),b=data.value.buckets;
   const zoom=grain.value==='day'&&b.length>90;
   chart.setOption({animation:false,color:[token('--green')],tooltip:{trigger:'axis',backgroundColor:token('--panel'),borderColor:token('--border'),textStyle:{color:token('--text')},formatter:params=>{const p=params[0],row=b[p.dataIndex];return row.start+' — '+row.end+'<br/>'+metrics[metric.value]+'：'+row[metric.value];}},
    grid:{left:48,right:18,top:25,bottom:zoom?85:45},
    xAxis:{type:'category',data:b.map(r=>r.label),axisLabel:{color:token('--muted'),hideOverlap:true},axisLine:{lineStyle:{color:token('--border')}}},
    yAxis:{type:'value',minInterval:1,axisLabel:{color:token('--muted')},splitLine:{lineStyle:{color:token('--rowBorder')}}},
    dataZoom:zoom?[{type:'slider',startValue:Math.max(0,b.length-90),endValue:b.length-1,bottom:10,height:22,filterMode:'filter',textStyle:{color:token('--muted')},borderColor:token('--border'),backgroundColor:token('--track')},{type:'inside',startValue:Math.max(0,b.length-90),endValue:b.length-1}]:[],
    series:[{name:metrics[metric.value],type:'bar',barMaxWidth:34,itemStyle:{borderRadius:[4,4,0,0]},data:b.map(r=>r[metric.value])}]},true);
  }
  async function load(){
   request?.abort();request=new AbortController();const id=++serial;loading.value=true;error.value='';
   const params=new URLSearchParams({mode:mode.value,grain:grain.value,platform:platform.value});
   if(mode.value==='month'&&month.value)params.set('month',month.value);if(mode.value==='year'&&year.value)params.set('year',year.value);
   try{const r=await fetch('/api/trends?'+params,{signal:request.signal});const body=await r.json();if(!r.ok)throw new Error(body.message);if(id!==serial)return;
    data.value=body;if(!month.value)month.value=body.serverDate.slice(0,7);if(!year.value)year.value=body.serverDate.slice(0,4);await nextTick();draw();
   }catch(e){if(id===serial&&e.name!=='AbortError')error.value=e.message||'趋势读取失败';}finally{if(id===serial)loading.value=false;}
  }
  function changeMode(){grain.value=mode.value==='month'?'day':'month';load();}
  watch(()=>props.refreshKey,()=>load());
  onMounted(()=>{load();resize=new ResizeObserver(()=>chart?.resize());resize.observe(chartEl.value);observer=new MutationObserver(draw);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});});
  onBeforeUnmount(()=>{serial++;request?.abort();resize?.disconnect();observer?.disconnect();chart?.dispose();});
  return {mode,month,year,grain,platform,metric,data,loading,error,chartEl,available,labels,metrics,total,load,changeMode,draw};
 },
 template:`<article class="panel practice-trends" aria-label="练习趋势">
  <div class="panel-head"><h2>练习趋势</h2><span>按真实提交统计</span></div>
  <div class="trend-controls">
   <label>统计范围<select v-model="mode" @change="changeMode" aria-label="趋势统计范围"><option value="month">按月</option><option value="year">按年</option><option value="life">生涯</option></select></label>
   <label v-if="mode==='month'">月份<input v-model="month" type="month" min="1970-01" :max="data?.serverDate.slice(0,7)" @change="load" aria-label="趋势月份"></label>
   <label v-if="mode==='year'">年份<select v-model="year" @change="load" aria-label="趋势年份"><option v-for="y in data?.years||[]" :value="String(y)">{{y}} 年</option></select></label>
   <label>粒度<select v-model="grain" @change="load" aria-label="趋势粒度"><option v-for="g in available" :value="g">{{labels[g]}}</option></select></label>
   <label>平台<select v-model="platform" @change="load" aria-label="趋势平台"><option value="all">全部平台</option><option v-for="p in data?.platforms||[]" :value="p">{{p}}</option></select></label>
   <label>指标<select v-model="metric" @change="draw" aria-label="趋势指标"><option v-for="(label,key) in metrics" :value="key">{{label}}</option></select></label>
   <button @click="load" :disabled="loading">{{loading?'读取中…':'刷新趋势'}}</button>
  </div>
  <p v-if="error" class="error" role="alert">{{error}}</p>
  <p v-if="data" class="trend-summary" aria-live="polite">{{data.start}} — {{data.end}} · {{metrics[metric]}}：{{total}} · {{data.buckets.length}} 个分组</p>
  <div ref="chartEl" class="chart trend-chart" role="img" :aria-label="'按'+labels[grain]+'统计的'+metrics[metric]" :aria-busy="loading"></div>
  <p v-if="grain==='day'&&(data?.buckets.length||0)>90" class="footnote">初始显示最后 90 天，可拖动底部缩放条查看其他日期，也可在图内缩放。</p>
  <ModuleHelp><p class="footnote">周一至周日为一周，季度按自然季度；3 年分组从所选平台生涯首条已同步记录所在年份起算。边缘分组仅计入所选日期，当前月／年截至今天。首次 AC 按完整已同步历史中每题的首次通过计算，同题重复 AC 不重复计新题。仅统计已同步提交，历史缺失及仅提供 AC 的平台会影响结果；洛谷清单和手工汇总不推算逐题时间。</p></ModuleHelp>
 </article>`
};
