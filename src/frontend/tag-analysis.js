import {ref,computed,watch,nextTick} from 'vue';
export default{
 props:{profiles:{type:Array,default:()=>[]},refreshKey:{type:Number,default:0}},
 setup(props){
  const detailEl=ref(null);
  const platform=ref('Codeforces'),selected=ref(null),problems=ref([]),loading=ref(false),error=ref('');
  let serial=0;
  const platforms=computed(()=>[...new Set(props.profiles.map(p=>p.platform_name))]);
  const rows=computed(()=>props.profiles.filter(p=>p.platform_name===platform.value));
  watch(platforms,list=>{if(list.length&&!list.includes(platform.value))platform.value=list[0];},{immediate:true});
  function close(){serial++;selected.value=null;problems.value=[];error.value='';loading.value=false;}
  watch(platform,close);
  watch(()=>props.refreshKey,close);
  async function show(row){
   const id=++serial;selected.value=row;loading.value=true;error.value='';problems.value=[];
   try{
    const response=await fetch('/api/tags/'+encodeURIComponent(row.tag_id)+'/ability?platform='+encodeURIComponent(platform.value));
    const body=await response.json();if(!response.ok)throw new Error(body.message);
    if(id===serial){problems.value=body.problems;loading.value=false;await nextTick();detailEl.value?.scrollIntoView({behavior:'instant',block:'start'});}
   }catch(e){if(id===serial)error.value=e.message||'题单加载失败';}
   finally{if(id===serial)loading.value=false;}
  }
  return {detailEl,platform,platforms,rows,selected,problems,loading,error,show,close};
 },
 template:`
 <article class="panel tag-analysis" aria-label="题型能力参考">
  <div class="panel-head"><h2>题型能力参考</h2><span>已通过 · 最高难度 25 题均值</span></div>
  <label class="difficulty-filter"><span>能力尺度</span><select v-model="platform" aria-label="题型能力平台"><option v-for="p in platforms" :key="p" :value="p">{{p}}{{p==='AtCoder'?' · 社区估计难度':''}}</option></select></label>
  <p class="ability-description">将同一题型已通过且有有效评分的题目去重，按难度从高到低选最多 25 道，取算术平均。满 25 道后作为较稳定的参考；不足 25 道的均值仅作暂定展示，不与满样本直接排名。</p>
  <div class="table-wrap"><table><thead><tr><th>题型</th><th>能力参考值</th><th>入选题数</th><th>样本状态</th><th>有效评分题</th><th>尝试 / 通过</th><th>入选难度范围</th></tr></thead>
   <tbody><tr v-for="t in rows" :key="t.tag_id"><td class="tag-name">{{t.display_name}}</td><td><button v-if="t.sample_count>0" class="ability-score" @click="show(t)" :aria-label="'查看'+t.display_name+'的入选题单'">{{t.ability_value}}<small v-if="t.sample_count<25"> 暂定</small></button><span v-else class="muted">—</span></td><td>{{t.sample_count}} / 25</td><td><span class="badge" :class="{good:t.sample_count===25}">{{t.sample_status}}</span></td><td>{{t.rated_count}}</td><td>{{t.total_count}} / {{t.passed_count}}</td><td>{{t.sample_count>0?t.min_difficulty+'–'+t.max_difficulty:'—'}}</td></tr></tbody>
  </table></div>
  <p v-if="!rows.length" class="muted">该平台暂无题型记录。</p>
  <p class="footnote">点击分数查看入选题单。满样本优先排列；缺少评分或未通过的题目不计分。CF 与 AT 分别计算，AT 使用社区估计值；该值是已完成题目难度的参考，不是官方 rating。</p>
  <section v-if="selected" ref="detailEl" class="ability-detail" aria-label="能力参考入选题单">
   <div class="panel-head"><h3>{{selected.display_name}} · {{platform}}</h3><button @click="close">收起题单</button></div>
   <p class="footnote">本次入选 {{selected.sample_count}} 道，均值 {{selected.ability_value}}。{{selected.sample_count<25?'样本未满 25 道，当前值仅作暂定参考。':''}}</p>
   <p v-if="loading" role="status" class="muted">正在加载入选题目…</p><p v-if="error" role="alert" class="error">{{error}}</p>
   <div v-if="!loading&&!error" class="table-wrap"><table><thead><tr><th>题目</th><th>难度</th><th>记录日期</th></tr></thead><tbody><tr v-for="p in problems" :key="p.problem_id"><td><a v-if="p.problem_url" :href="p.problem_url" target="_blank" rel="noopener noreferrer">{{p.problem_name}} ↗</a><span v-else>{{p.problem_name}}</span></td><td>{{p.rating}}</td><td>{{p.solve_date}}</td></tr></tbody></table></div>
  </section>
 </article>`
};
