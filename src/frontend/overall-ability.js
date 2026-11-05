import {apiFetch} from './api-fetch.js';
import {ref,computed,watch} from 'vue';
export default{
 props:{profile:{type:Object,default:()=>({})},refreshKey:{type:Number,default:0}},
 setup(props){
  const scope=ref('specialty'),alternate=ref(null);
  const effective=computed(()=>scope.value==='specialty'?props.profile:(alternate.value||{}));
  const limit=computed(()=>effective.value.sample_limit??(scope.value==='specialty'?125:250));
  async function changeScope(){const id=++serial;open.value=false;problems.value=[];error.value='';loading.value=false;if(scope.value==='all'){loading.value=true;try{const r=await apiFetch('/api/ability/overall?scope=all');const b=await r.json();if(!r.ok)throw Error(b.message);if(id===serial)alternate.value=b;}catch(e){if(id===serial)error.value=e.message;}finally{if(id===serial)loading.value=false;}}}
  const open=ref(false),loading=ref(false),error=ref(''),problems=ref([]),page=ref(1);let serial=0;
  const pages=computed(()=>Math.max(1,Math.ceil(problems.value.length/25)));
  const visible=computed(()=>problems.value.slice((page.value-1)*25,page.value*25));
  watch(()=>props.refreshKey,()=>{serial++;scope.value='specialty';alternate.value=null;open.value=false;loading.value=false;error.value='';problems.value=[];page.value=1;});
  async function toggle(){
   if(open.value){serial++;open.value=false;loading.value=false;return;}
   open.value=true;loading.value=true;error.value='';page.value=1;const id=++serial;
   try{const response=await apiFetch('/api/ability/overall?scope='+scope.value);const body=await response.json();if(!response.ok)throw new Error(body.message);
    if(id===serial)problems.value=body.problems;
   }catch(e){if(id===serial)error.value=e.message||'题单读取失败';}
   finally{if(id===serial)loading.value=false;}
  }
  return {scope,effective,limit,changeScope,open,loading,error,problems,page,pages,visible,toggle};
 },
 template:`<article class="panel overall-ability" aria-label="综合能力参考">
  <div class="panel-head"><h2>{{scope==='specialty'?'专职综合能力参考':'全部题目综合参考'}}</h2><span>全部平台 · 最高难度 {{limit}} 题</span></div>
  <label>参考范围<select v-model="scope" @change="changeScope" aria-label="综合能力参考范围"><option value="specialty">专职题型</option><option value="all">全部题目参考</option></select></label>
  <p v-if="scope==='specialty'&&!effective.configured" class="footnote">尚未配置专职题型，请前往 <a href="#settings">设置 · 题型与技能图谱</a> 选择。</p>
  <p v-if="error" class="error" role="alert">{{error}}</p>
  <LoadingNotice v-if="loading&&!open">正在读取综合能力…</LoadingNotice>
  <template v-if="scope==='specialty'?effective.configured:effective.sample_limit"><p v-if="scope==='specialty'" class="footnote">专职：{{effective.specialtyNames?.join('、')}}{{effective.includeDescendants?'（含实线下级分支）':'（仅所选题型）'}}</p><div class="week-summary"><div><strong>{{effective.ability_value ?? '—'}}</strong><span>历史能力参考</span></div><div><strong>{{effective.current_value ?? '—'}}</strong><span>当前能力参考 · {{effective.current_value==null?'暂无 AC 日期':(effective.current_sample_count||0)+' / '+(effective.current_sample_limit??limit)+' 道'}}</span></div><div><strong>{{effective.sample_count||0}} / {{limit}}</strong><span>{{effective.sample_status}}</span></div><div><strong>{{effective.estimated_count||0}}</strong><span>入选估分题</span></div><div><strong>{{effective.rated_count||0}}</strong><span>有效评分通过题</span></div></div>
  <button v-if="effective.sample_count>0" @click="toggle" :aria-expanded="open" aria-controls="overall-problems">{{open?'收起入选题单':'查看前 '+limit+' 题入选题单'}}</button>
  </template>
  <section v-if="open" id="overall-problems" class="ability-detail" aria-label="综合能力入选题单">
   <LoadingNotice v-if="loading" skeleton>正在读取入选题单…</LoadingNotice><p v-else-if="error" role="alert" class="error">{{error}}</p>
   <template v-else><p class="footnote">共 {{problems.length}} 道，每页 25 道。题目按 CF 尺度降序排列。</p>
    <div class="table-wrap content-ready"><table><thead><tr><th>排名</th><th>题目</th><th>平台</th><th>CF 尺度</th><th>原始难度</th><th>评分依据</th></tr></thead><tbody><tr v-for="(p,i) in visible" :key="p.canonical_key"><td>{{(page-1)*25+i+1}}</td><td><a v-if="p.problem_url" :href="p.problem_url" target="_blank" rel="noopener noreferrer">{{p.problem_name}} ↗</a><span v-else>{{p.problem_name}}</span></td><td>{{p.platform_name}}</td><td>{{p.estimated?'≈ ':''}}{{p.rating}}</td><td>{{p.native_difficulty??'—'}}</td><td>{{p.method}} · {{p.confidence}}</td></tr></tbody></table></div>
    <div class="overall-pagination"><button :disabled="page<=1" @click="page--">上一页</button><span aria-live="polite">第 {{page}} / {{pages}} 页</span><button :disabled="page>=pages" @click="page++">下一页</button></div>
   </template>
  </section>
  <ModuleHelp><p v-if="scope==='specialty'" class="footnote">专职参考仅统计已同步且有题型标签的题目，主页累计汇总不推算为题单。</p><p class="footnote">{{effective.current_dated_count||0}} / {{effective.rated_count||0}} 道有效评分题有 AC 日期。仅按有日期的题计算，扣分前的计分均值为 {{effective.current_unadjusted_value ?? '—'}}。当前分按最近一次 AC 调整，前 20 天不扣分，第 21 天起开始扣分，之后每 365 天，距离扣满 250 分的差额减半，最低为 800 分。调整后重新选入选题，再按最近一次 AC 加权平均。AC 日期每早 183 天，权重减半。当前分按实际入选题占目标题数的比例折算，缺额计零。入选题等权计分为 {{effective.current_equal_weight_value ?? '—'}}。</p><p class="ability-description">{{scope==='specialty'?'从专职题型范围':'从全部题目'}}内已通过且有评分依据的题目中，取最高 15%（向上取整），专职至少 125 道，全部题目至少 250 道；一题有多个标签也只算一次，可识别的跨平台同源题合并。{{effective.sample_count<limit?'不足的 '+(limit-effective.sample_count)+' 道按零分计入。':''}}</p>
  <p class="footnote">{{effective.sample_count?'入选难度 '+effective.min_difficulty+'–'+effective.max_difficulty+'。':''}}已通过题中 {{(effective.passed_count||0)-(effective.rated_count||0)}} 道暂无评分依据，未计分。CF 为官方题目分，AT 和洛谷为低置信估分；这不是个人 CF rating。</p></ModuleHelp>
 </article>`
};
