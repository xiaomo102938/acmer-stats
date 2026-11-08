import {computed,ref} from 'vue';
import * as echarts from 'echarts/core';
import {BarChart,LineChart,PieChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import {scoreColor} from './score-color.js';
import {cfDifficultyBuckets} from './difficulty.js';

import {qojMedalColors,qojMedalLabels} from '../shared/qoj-medal-labels.js';

const qojMedalHref=medal=>'#records?'+new URLSearchParams({scope:'qoj',platform:'QOJ',status:'ac',unique:'1',medal});
const chartTiers=['iron','bronze','silver','gold'];

echarts.use([BarChart,LineChart,PieChart,GridComponent,TooltipComponent,LegendComponent,CanvasRenderer]);

export function useDashboardCharts(data,editingCards,isDark){
  const difficultyEl=ref(null),weekEl=ref(null),qojMedalsEl=ref(null);
  const charts=new Map();
  const difficultyPlatform=ref('全部平台');
  const difficultyPlatforms=computed(()=>[{platform_name:'全部平台'},...(data.value?.platforms?.filter(p=>p.total_count>0&&p.platform_name!=='QOJ')||[])]);
  const difficultyScale=computed(()=>difficultyPlatform.value==='牛客'?'牛客题库原始分':'CF 统一尺度');
  const difficultyNote=computed(()=>difficultyPlatform.value==='牛客'?'展示牛客题库公布的原始难度，每 400 分一档。题库缺分的题单列。汇总 CF 难度分布时，牛客采用原分减 300 的经验估分。':'QOJ 单独按奖牌档位统计。此图按 CF 尺度分段，排除 QOJ。CF 为官方题目 rating；AT、洛谷和牛客为低置信估分，每个区间按中点着色，暂无估分的题目用中性色单列。原始难度保留在入选题单中。');
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
   return chart;
  }
  function draw(){
   charts.forEach((chart,element)=>{if(!element.isConnected){chart.dispose();charts.delete(element);}});
   if(!data.value||editingCards.value)return;
   const dark=isDark();
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
   const medals=data.value.qojMedals;
   if(qojMedalsEl.value&&medals){
    const chart=render(qojMedalsEl.value,{...base,grid:{...base.grid,bottom:35},
     xAxis:axis(chartTiers.map(tier=>qojMedalLabels[tier])),
     series:[{name:'AC 题数',type:'bar',barMaxWidth:56,label:{show:true,position:'top',color:text},
      data:chartTiers.map(tier=>({value:medals.counts[tier],tier,
       itemStyle:{color:qojMedalColors[tier],borderRadius:[4,4,0,0]}}))}]});
    chart.off('click');
    chart.on('click','series.bar',event=>{
     if(event.data?.tier)location.hash=qojMedalHref(event.data.tier);
    });
   }
   const native=difficultyPlatform.value==='牛客';
   const source=native?(data.value.nowcoderDifficulty||[]).map(row=>({...row,platform_name:'牛客',cf_rating:row.score})):(data.value.unifiedDifficulty||[]).filter(row=>row.platform_name!=='QOJ');
   const buckets=cfDifficultyBuckets(source,difficultyPlatform.value);
   if(native)for(const bucket of buckets)if(bucket.midpoint===null)bucket.name='暂无原始分';
   render(difficultyEl.value,{animation:false,color:colors,tooltip:{...tooltip,trigger:'item',formatter:'{b}　{c}（{d}%）'},legend:{bottom:0,textStyle:{color:text}},
    series:[{type:'pie',radius:['43%','65%'],center:['50%','36%'],label:{show:false},
     itemStyle:{borderColor:text,borderWidth:1},data:buckets.map(bucket=>({...bucket,itemStyle:{color:native&&bucket.midpoint!==null?undefined:scoreColor(bucket.midpoint)}}))}]});
  }
  const resize=()=>charts.forEach(chart=>chart.resize());
  return {qojMedalHref,qojMedalLabels,difficultyEl,weekEl,qojMedalsEl,difficultyPlatform,difficultyPlatforms,difficultyScale,difficultyNote,days,week,draw,disposeCharts,resize};
}
