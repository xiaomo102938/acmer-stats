import {scoreStyle} from './score-color.js';
import {apiFetch} from './api-fetch.js';
import {ref,onMounted,watch} from 'vue';
export default{
 props:{platforms:{type:Array,default:()=>[]},snapshots:{type:Array,default:()=>[]},refreshKey:Number},
 setup(props){
  const ratingsReady=ref(false),ratings=ref([]),loading=ref(false),message=ref(''),error=ref('');
  async function load(){try{const r=await apiFetch('/api/ratings');const b=await r.json();if(!r.ok)throw new Error(b.message);ratings.value=b.ratings;ratingsReady.value=true;}catch(e){error.value=e.message||'Rating 缓存读取失败';}}
  async function refresh(){loading.value=true;error.value='';message.value='';try{const r=await apiFetch('/api/ratings/refresh',{method:'POST',headers:{'X-Acmer-Request':'1','Content-Type':'application/json'},body:'{}'});const b=await r.json();if(!r.ok)throw new Error(b.message);message.value=b.message;await load();}catch(e){error.value=e.message||'Rating 更新失败';}finally{loading.value=false;}}
  const own=name=>ratings.value.filter(r=>r.platform_name===name);
  const label=r=>r.rating!=null?Number(r.rating).toLocaleString('zh-CN',{maximumFractionDigits:2}):({not_synced:'尚未同步',unrated:'暂无评级',unavailable:'暂无公开分数',unsupported:'暂未接入',error:'暂时无法获取'})[r.status]||'暂无数据';
  onMounted(load);watch(()=>props.refreshKey,load);
  return {scoreStyle,ratingsReady,ratings,loading,message,error,refresh,own,label};
 },
 template:`<article class="panel platform-analysis" aria-label="平台练习统计"><div class="panel-head"><h2>平台练习统计</h2><button @click="refresh" :aria-busy="loading" :disabled="loading">{{loading?'正在更新 Rating…':'更新 Rating'}}</button></div>
  <p v-if="error" class="error" role="alert">{{error}}</p><p v-if="message" class="footnote" role="status">{{message}}</p>
  <LoadingNotice v-if="!ratingsReady&&!error">正在读取平台 Rating…</LoadingNotice>
  <div class="platform-grid"><section v-for="p in platforms" :key="p.platform_id" class="platform-card" :aria-label="p.platform_name+'练习情况'"><h3>{{p.platform_name}}</h3><div class="platform-counts"><div><strong>{{p.passed_count}}</strong><span>通过题数</span></div><div><strong>{{p.total_count}}</strong><span>尝试题数</span></div></div>
   <p v-if="p.count_source" class="footnote">{{p.count_source}}</p><div v-if="ratingsReady" class="platform-ratings content-ready"><div v-for="r in own(p.platform_name)" :key="r.account_id" class="platform-rating"><div><span>{{r.login_name}}</span><strong><span :class="{'score-chip':scoreStyle(r.rating)}" :style="scoreStyle(r.rating)">{{label(r)}}</span><small v-if="r.rating!=null&&r.status==='error'"> 缓存</small></strong></div><p>{{r.scale||'个人竞赛 Rating'}}<template v-if="r.fetched_at"> · 更新于 {{r.fetched_at}}</template></p><p v-if="r.status!=='ok'">{{r.message||'点击“更新 Rating”获取个人竞赛分数。'}}</p><a v-if="r.source_url" :href="r.source_url" target="_blank" rel="noopener noreferrer" class="text-link">分数来源 ↗</a></div><p v-if="!own(p.platform_name).length" class="footnote">未绑定账号，暂无个人 Rating。</p></div>
  </section></div>
  <ModuleHelp><p class="footnote">题数按用户与题目去重；力扣单账号使用主页累计汇总替代不完整记录数量。尝试题数包含已通过题目，不代表提交次数。Rating 使用各平台自己的竞赛尺度，不能直接横向比较。颜色按显示的原始数值映射；多账号分别展示。分数读取本机缓存，点击更新或账号同步时获取；失败保留旧值，不用题目估分或洛谷估值替代个人 Rating。</p>
  <p v-for="s in snapshots.filter(s=>s.platform_name!=='LeetCode')" :key="s.platform_name+s.login_name" class="footnote">{{s.platform_name}} 公开清单：通过 {{s.passed_count}} 题，尝试 {{s.attempted_count}} 题；主页报告通过 {{s.profile_passed_count??'—'}} 题，尝试 {{s.profile_attempted_count??'—'}} 题。汇总保留原有示例，可能多于公开清单。</p></ModuleHelp>
 </article>`
};
