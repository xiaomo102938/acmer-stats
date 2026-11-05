import {apiFetch} from './api-fetch.js';
import {ref,onMounted,onBeforeUnmount,watch} from 'vue';
import {problemLink} from './submission-display.js';

export default{
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
   request=current;loading.value=true;error.value='';result.value=null;
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
  return {tag,options,manual,result,loading,error,load,selectTag,applyTarget,problemLink};
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
   <template v-if="result.ability!==null">题型参考 {{result.ability}} 分 · {{result.sampleCount}} / 25 道计分题{{result.sampleCount<25?'（暂定）':''}}。</template>
   <template v-if="result.target!==null">推荐目标 {{result.target}} 分，范围 ±{{result.radius}} 分，排除本地已有记录的题目。</template>
   <template v-else>该题型暂无可计分样本，可以手动填写目标难度。</template>
  </p>
  <p v-if="loading" role="status" class="muted">正在读取题单…</p>
  <p v-else-if="error||result?.sourceError" class="error" role="alert">{{error||result.sourceError}} <button @click="load()">重试</button></p>
  <template v-else-if="result">
   <div v-if="result.items.length" class="table-wrap">
    <table><thead><tr><th>题目</th><th>平台</th><th>CF 题目难度</th><th>推荐理由</th></tr></thead>
     <tbody><tr v-for="row in result.items" :key="row.problem_id">
      <td class="submission-problem"><a v-if="problemLink(row)" :href="problemLink(row)" class="problem" target="_blank" rel="noopener noreferrer">{{row.problem_name}} ↗</a><span v-else>{{row.problem_name}}</span></td>
      <td>Codeforces</td>
      <td>{{row.rating}}</td>
      <td>{{row.distance?'距目标 '+Math.round(row.distance*10)/10+' 分':'与目标难度相同'}}</td>
     </tr></tbody>
    </table>
   </div>
   <p v-else class="muted">{{result.target===null?'填写目标难度后可查看题单。':'该题型在当前难度范围内暂无匹配的新题。'}}</p>
   <nav v-if="result.total" class="submission-pagination" aria-label="练习题单分页">
    <button :disabled="result.page<=1" @click="load(result.page-1)">上一页</button>
    <span aria-live="polite">第 {{result.page}} / {{result.pages}} 页 · 共 {{result.total}} 道</span>
    <button :disabled="result.page>=result.pages" @click="load(result.page+1)">下一页</button>
   </nav>
  </template>
 </article>`
};
