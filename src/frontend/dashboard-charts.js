import {computed,ref} from 'vue';
import * as echarts from 'echarts/core';
import {BarChart,LineChart,PieChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import {scoreColor} from './score-color.js';
import {cfDifficultyBuckets} from './difficulty.js';

echarts.use([BarChart,LineChart,PieChart,GridComponent,TooltipComponent,LegendComponent,CanvasRenderer]);

export function useDashboardCharts(data,editingCards,isDark){
  const difficultyEl=ref(null),weekEl=ref(null);
  const charts=new Map();
  const difficultyPlatform=ref('全部平台');
  const difficultyPlatforms=computed(()=>[{platform_name:'全部平台'},...(data.value?.platforms.filter(p=>p.total_count>0)||[])]);
  const difficultyNote=computed(()=>'统一按 CF 尺度分段。CF 为官方题目 rating；AT、洛谷和牛客为低置信估分，每个区间按中点着色，暂无估分的题目用中性色单列。原始难度保留在入选题单中。');
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
   const buckets=cfDifficultyBuckets(data.value.unifiedDifficulty||[],difficultyPlatform.value);
   render(difficultyEl.value,{animation:false,color:colors,tooltip:{...tooltip,trigger:'item'},legend:{bottom:0,textStyle:{color:text}},
    series:[{type:'pie',radius:['43%','65%'],center:['50%','36%'],label:{show:false},
     itemStyle:{borderColor:text,borderWidth:1},data:buckets.map(bucket=>({...bucket,itemStyle:{color:scoreColor(bucket.midpoint)}}))}]});
  }
  const resize=()=>charts.forEach(chart=>chart.resize());
  return {difficultyEl,weekEl,difficultyPlatform,difficultyPlatforms,difficultyNote,days,week,draw,disposeCharts,resize};
}
