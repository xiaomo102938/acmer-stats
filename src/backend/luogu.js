import {scanCheckpoint} from './sync-checkpoint.js';
import {load} from 'cheerio';
export class LuoguError extends Error{}
export function parseLuoguPayload(text){
 try{return JSON.parse(text);}catch{}
 const $=load(text);
 const json=$('script#lentille-context').text()||$('script[type="application/json"]').first().text();
 if(json){try{return JSON.parse(json);}catch{}}
 const encoded=text.match(/decodeURIComponent\(("(?:[^"\\]|\\.)*")\)/);
 if(encoded){try{return JSON.parse(decodeURIComponent(JSON.parse(encoded[1])));}catch{}}
 throw new LuoguError('洛谷返回了验证页面或不可识别的数据，请稍后重试或更新登录 Cookie。');
}
function dataOf(payload){
 if(payload.status&&payload.status!==200)throw new LuoguError('洛谷未返回可访问的用户数据。');
 return payload.data||payload.currentData||payload;
}
export function normalizeLuogu(profilePayload,practicePayload,today){
 const profile=dataOf(profilePayload),practice=dataOf(practicePayload);
 if(!profile.user?.uid)throw new LuoguError('未找到可访问的洛谷用户。');
 if(practice.user?.uid&&String(practice.user.uid)!==String(profile.user.uid))throw new LuoguError('洛谷返回的用户不一致，未导入。');
 if(!Array.isArray(practice.passed)||!Array.isArray(practice.submitted))throw new LuoguError('洛谷未返回完整的可见练习清单，旧数据已保留。');
 const inventory=new Map();
 for(const [passed,list]of [[1,practice.passed],[0,practice.submitted]]){
  for(const raw of list){
   const p=typeof raw==='string'?{pid:raw}:raw,key=String(p.pid||'').toUpperCase();
   if(!/^[A-Z0-9_]+$/.test(key))throw new LuoguError('洛谷题目编号格式异常，未导入。');
   const old=inventory.get(key);
   const difficulty=Number(p.difficulty);
   inventory.set(key,{key,title:'洛谷 '+key+(p.name?' '+p.name:''),passed:Math.max(old?.passed||0,passed),
    native:p.difficulty!=null&&Number.isInteger(difficulty)&&difficulty>=0&&difficulty<=8?String(difficulty):old?.native??null,
    url:'https://www.luogu.com.cn/problem/'+key});
  }
 }
 const activity=[];
 if(profile.dailyCounts&&typeof profile.dailyCounts==='object'){
  for(const [day,raw]of Object.entries(profile.dailyCounts)){
   const count=Array.isArray(raw)?raw[0]:typeof raw==='object'?raw.count??raw.value:raw;
   const date=new Date(day+'T00:00:00Z');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day||day>today)continue;
   if(Number.isInteger(count)&&count>=0)activity.push({day,count});
  }
 }
 return {uid:String(profile.user.uid),name:profile.user.name||String(profile.user.uid),inventory:[...inventory.values()],activity,
  passedCount:[...inventory.values()].filter(p=>p.passed===1).length,attemptedCount:inventory.size,hasActivity:!!profile.dailyCounts,reportedPassed:profile.user.passedProblemCount??null,reportedAttempted:profile.user.submittedProblemCount??null};
}
const origin='https://www.luogu.com.cn';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function getLuogu(path,secret){
 const response=await fetch(origin+path,{
  signal:AbortSignal.timeout(20000),redirect:'manual',
  headers:{'x-lentille-request':'content-only',Referer:origin+'/','User-Agent':'acmer-stats/1.0 personal coursework',...(secret?{Cookie:secret}:{})}});
 if(response.status===401)throw new LuoguError('洛谷评测记录需要登录，请更新 Cookie。');
 if(!response.ok)throw new LuoguError('洛谷返回 HTTP '+response.status+'，请检查 UID、访问限制或登录会话。');
 return parseLuoguPayload(await response.text());
}

export function normalizeLuoguAccepted(payload,uid,now=Date.now()/1000){
 const records=dataOf(payload).records;
 if(!Array.isArray(records?.result)||!Number.isSafeInteger(records.count)||records.count<0||
    !Number.isSafeInteger(records.perPage)||records.perPage<1||records.result.length>records.perPage){
  throw new LuoguError('洛谷评测列表格式异常。');
 }
 const items=[];
 for(const row of records.result){
  if(String(row.user?.uid)!==uid)throw new LuoguError('洛谷评测记录的用户与请求不一致。');
  if(row.status!==12)continue;
  const problem=row.problem,key=String(problem?.pid??'').toUpperCase();
  if(!problem)continue; // Hidden problems have no importable identity.
  if(!/^[A-Z0-9_]+$/.test(key)||!Number.isSafeInteger(row.id)||row.id<=0||
     !Number.isSafeInteger(row.submitTime)||row.submitTime<=0||row.submitTime>now+300){
   throw new LuoguError('洛谷 AC 记录缺少有效题号、编号或提交时间。');
  }
  items.push({id:String(row.id),key,title:'洛谷 '+key+(problem.name?' '+problem.name:''),
   time:row.submitTime,passed:1,verdict:'AC',url:origin+'/problem/'+key,
   native:Number.isInteger(problem.difficulty)&&problem.difficulty>=0&&problem.difficulty<=8?String(problem.difficulty):null,
   nativeSource:'luogu',tags:[]});
 }
 return {items,count:records.count,perPage:records.perPage,length:records.result.length};
}

export async function collectLuoguAccepted(uid,secret,checkpointId=null){
 const checkpoint=scanCheckpoint(checkpointId);
 const items=new Map();
 const pageLimit=50;
 let pageCount=1;
 for(let page=1;page<=Math.min(pageCount,pageLimit);page++){
  if(page>1)await pause(1200);
  const query=new URLSearchParams({user:uid,page:String(page)});
  let payload;
  try{payload=await getLuogu('/record/list?'+query,secret);}
  catch(error){
   if(error instanceof LuoguError)throw error;
   throw new LuoguError('洛谷评测列表请求失败，请检查网络后重试。');
  }
  const result=normalizeLuoguAccepted(payload,uid);
  if(page===1)pageCount=Math.ceil(result.count/result.perPage);
  if(!result.length&&page<pageCount)throw new LuoguError('洛谷评测列表分页不完整，请稍后重试。');
  for(const item of result.items)items.set(item.id,item);
  if(checkpoint.afterPage(result.items))break;
 }
 return {items:[...items.values()],cursor:0,note:'已读取 '+items.size+' 条有题号和时间的洛谷 AC 记录。'+
  (checkpoint.stopped?' 已读到上次同步位置并额外复查一页。':pageCount>pageLimit?'本次最多读取最近 '+pageLimit+' 页评测记录。':'')};
}

export async function collectLuogu(uid,secret=''){
 if(!/^\d{1,12}$/.test(uid))throw new LuoguError('洛谷需要个人主页地址中的数字 UID。');
 const path='/user/'+uid;
 const profile=await getLuogu(path,secret);
 await pause(1200);
 const practice=await getLuogu(path+'/practice',secret);
 const snapshot=normalizeLuogu(profile,practice,new Date(Date.now()+8*3600000).toISOString().slice(0,10));
 if(snapshot.uid!==uid)throw new LuoguError('洛谷返回的 UID 与请求不一致，未导入。');
 return snapshot;
}
