import {scoreStyle} from './score-color.js';
import {apiFetch} from './api-fetch.js';
import {ref,onMounted,onBeforeUnmount,watch} from 'vue';
import ModuleHelp from './module-help.js';
import {problemLink} from './submission-display.js';

export default{
 components:{ModuleHelp},
 props:{initialTag:{type:String,default:''},refreshKey:Number},
 emits:['close'],
 setup(props){
  const tag=ref(props.initialTag),options=ref([]);
  const manual=ref(''),appliedTarget=ref('');
  const result=ref(null),loading=ref(false),error=ref('');
  let request;
  async function load(page=1){
   request?.abort();
   const current=new AbortController();
   request=current;loading.value=true;error.value='';
   const params=new URLSearchParams({mode:'recommend',tag:tag.value,page:String(page)});
   if(appliedTarget.value!=='')params.set('target',String(appliedTarget.value));
   try{
    const response=await apiFetch('/api/practice?'+params,{signal:current.signal});
    const body=await response.json();
    if(!response.ok)throw new Error(body.message);
    if(current.signal.aborted)return;
    result.value=body;options.value=body.options;tag.value=body.selected||'';
   }catch(e){if(!current.signal.aborted)error.value=e.message||'题单加载失败。';}
   finally{if(request===current)loading.value=false;}
  }
  function selectTag(){manual.value='';appliedTarget.value='';load();}
  function applyTarget(){appliedTarget.value=manual.value;load();}
  watch(()=>props.refreshKey,()=>load());
  onMounted(()=>load());
  onBeforeUnmount(()=>request?.abort());
  return {scoreStyle,tag,options,manual,result,loading,error,load,selectTag,applyTarget,problemLink};
 },
 template:`
 <article class="panel practice-panel" aria-label="练习题单">
  <div class="panel-head"><h2>推荐练习</h2><button type="button" @click="$emit('close')">收起推荐</button></div>
  <form class="trend-controls practice-filters" @submit.prevent="applyTarget">
   <label>题型<select v-model="tag" @change="selectTag" :disabled="!options.length">
    <option v-if="!tag" value="" disabled>选择题型</option>
    <option v-for="option in options" :key="option.key" :value="option.key">{{option.name}}</option>
   </select></label>
    <label>目标难度（可选）<input v-model.number="manual" type="number" min="800" max="4000" step="1" placeholder="默认按题型能力"></label>
    <button :disabled="!options.length||loading">应用难度</button>
  </form>
  <p v-if="result" class="footnote">
   <template v-if="result.ability!==null">推荐难度基准 <span :class="{'score-chip':scoreStyle(result.ability)}" :style="scoreStyle(result.ability)">{{result.ability}}</span> 分 · 取 {{result.sampleCount}} 道实际入选题的平均难度。</template>
   <template v-if="result.target!==null">推荐目标 <span :class="{'score-chip':scoreStyle(result.target)}" :style="scoreStyle(result.target)">{{result.target}}</span> 分，范围 ±{{result.radius}} 分，排除本地已有记录的题目。</template>
   <template v-else>该题型暂无可计分样本，可以手动填写目标难度。</template>
  </p>
  <LoadingNotice v-if="loading" :skeleton="!result">正在读取题单…</LoadingNotice>
  <p v-if="!loading&&(error||result?.sourceError)" class="error" role="alert">{{error||result.sourceError}} <button @click="load()">重试</button></p>
  <template v-if="result&&!result.sourceError">
   <div v-if="result.items.length" class="table-wrap content-ready">
    <table><thead><tr><th>题目</th><th>平台</th><th>CF 题目难度</th><th>推荐理由</th></tr></thead>
     <tbody><tr v-for="row in result.items" :key="row.problem_id">
      <td class="submission-problem"><a v-if="problemLink(row)" :href="problemLink(row)" class="problem" target="_blank" rel="noopener noreferrer">{{row.problem_name}} ↗</a><span v-else>{{row.problem_name}}</span></td>
      <td>Codeforces</td>
      <td><span :class="{'score-chip':scoreStyle(row.rating)}" :style="scoreStyle(row.rating)">{{row.rating}}</span></td>
      <td>{{row.distance?'距目标 '+Math.round(row.distance*10)/10+' 分':'与目标难度相同'}}</td>
     </tr></tbody>
    </table>
   </div>
   <p v-else class="muted">{{result.target===null?'填写目标难度后可查看题单。':'该题型在当前难度范围内暂无匹配的新题。'}}</p>
   <nav v-if="result.total" class="submission-pagination" aria-label="练习题单分页">
    <button :disabled="loading||result.page<=1" @click="load(result.page-1)">上一页</button>
    <span aria-live="polite">第 {{result.page}} / {{result.pages}} 页 · 共 {{result.total}} 道</span>
    <button :disabled="loading||result.page>=result.pages" @click="load(result.page+1)">下一页</button>
   </nav>
  </template>
  <ModuleHelp>
  <h4>推荐范围</h4><p>从 Codeforces 题库挑选带有所选算法标签和官方难度的题目，排除本机已有提交记录的题。</p>
  <h4>目标难度</h4><p>默认使用实际入选能力样本的平均难度，也可手动填写目标。结果优先展示难度最接近目标的题目。</p>
  <h4>使用方法</h4><p>选择题型和难度后查看题单。推荐理由显示题目与目标难度的分差，点击题名可打开原题。</p>
  </ModuleHelp>
 </article>`
};
