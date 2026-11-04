import {ref,computed,watch} from 'vue';
export default{
 props:{profile:{type:Object,default:()=>({})},refreshKey:{type:Number,default:0}},
 setup(props){
  const open=ref(false),loading=ref(false),error=ref(''),problems=ref([]),page=ref(1);let serial=0;
  const pages=computed(()=>Math.max(1,Math.ceil(problems.value.length/25)));
  const visible=computed(()=>problems.value.slice((page.value-1)*25,page.value*25));
  watch(()=>props.refreshKey,()=>{serial++;open.value=false;loading.value=false;error.value='';problems.value=[];page.value=1;});
  async function toggle(){
   if(open.value){serial++;open.value=false;loading.value=false;return;}
   open.value=true;loading.value=true;error.value='';page.value=1;const id=++serial;
   try{const response=await fetch('/api/ability/overall');const body=await response.json();if(!response.ok)throw new Error(body.message);
    if(id===serial)problems.value=body.problems;
   }catch(e){if(id===serial)error.value=e.message||'题单读取失败';}
   finally{if(id===serial)loading.value=false;}
  }
  return {open,loading,error,problems,page,pages,visible,toggle};
 },
 template:`<article class="panel overall-ability" aria-label="综合能力参考">
  <div class="panel-head"><h2>综合能力参考</h2><span>全部平台 · 最高难度 150 题均值</span></div>
  <div class="week-summary"><div><strong>{{profile.ability_value ?? '—'}}</strong><span>CF 尺度参考值</span></div><div><strong>{{profile.sample_count||0}} / 150</strong><span>{{profile.sample_status}}</span></div><div><strong>{{profile.estimated_count||0}}</strong><span>入选估分题</span></div><div><strong>{{profile.rated_count||0}}</strong><span>有效评分通过题</span></div></div>
  <p class="ability-description">不区分题型，从全部已通过且有评分依据的题目中选最高 150 道求平均；一题有多个标签也只算一次，可识别的跨平台同源题合并。{{profile.sample_count<150?'当前不足 150 道，仅作暂定参考。':''}}</p>
  <p class="footnote">{{profile.sample_count?'入选难度 '+profile.min_difficulty+'–'+profile.max_difficulty+'。':''}}已通过题中 {{(profile.passed_count||0)-(profile.rated_count||0)}} 道暂无评分依据，未计分。CF 为官方题目分，AT 和洛谷为低置信估分；这不是个人 CF rating。</p>
  <button v-if="profile.sample_count>0" @click="toggle" :aria-expanded="open" aria-controls="overall-problems">{{open?'收起入选题单':'查看前 150 题入选题单'}}</button>
  <section v-if="open" id="overall-problems" class="ability-detail" aria-label="综合能力入选题单">
   <p v-if="loading" role="status">正在读取入选题单…</p><p v-else-if="error" role="alert" class="error">{{error}}</p>
   <template v-else><p class="footnote">共 {{problems.length}} 道，每页 25 道。题目按 CF 尺度降序排列。</p>
    <div class="table-wrap"><table><thead><tr><th>排名</th><th>题目</th><th>平台</th><th>CF 尺度</th><th>原始难度</th><th>评分依据</th></tr></thead><tbody><tr v-for="(p,i) in visible" :key="p.canonical_key"><td>{{(page-1)*25+i+1}}</td><td><a v-if="p.problem_url" :href="p.problem_url" target="_blank" rel="noopener noreferrer">{{p.problem_name}} ↗</a><span v-else>{{p.problem_name}}</span></td><td>{{p.platform_name}}</td><td>{{p.estimated?'≈ ':''}}{{p.rating}}</td><td>{{p.native_difficulty??'—'}}</td><td>{{p.method}} · {{p.confidence}}</td></tr></tbody></table></div>
    <div class="overall-pagination"><button :disabled="page<=1" @click="page--">上一页</button><span aria-live="polite">第 {{page}} / {{pages}} 页</span><button :disabled="page>=pages" @click="page++">下一页</button></div>
   </template>
  </section>
 </article>`
};
