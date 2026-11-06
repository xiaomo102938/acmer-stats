import {load} from 'cheerio';
import {requestWithStatementRetry} from './statement-retry.js';

async function requestMetadata(url, options){
 return requestWithStatementRetry(async()=>{
  const response=await fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(response.ok)return options?response.json():response.text();
  await response.body?.cancel();
  if(response.status===404||response.status<400)return null;
  throw Object.assign(new Error('HTTP '+response.status),{status:response.status,retryAfter:response.headers.get('retry-after')});
 });
}

async function readAtcoderContest(contest){
 const base='https://atcoder.jp/contests/'+contest;
 const list=await requestMetadata(base+'/tasks?lang=en');
 if(!list)return new Map();
 const $list=load(list);
 const ids=new Map();
 $list('td:first-child a').each((_index,link)=>{
  const href=$list(link).attr('href')||'';
  const prefix='/contests/'+contest+'/tasks/';
  if(href.startsWith(prefix))ids.set($list(link).text().trim(),href.slice(prefix.length));
 });
 if(!ids.size)return new Map();

 const html=await requestMetadata(base+'/tasks_print?lang=en');
 const $=load(html||'');
 const types=new Map();
 $('[id="task-statement"]').each((_index,element)=>{
  const title=$(element).parent().children('span.h2').first().text().trim();
  const key=ids.get(title.split(/\s+-\s+/)[0]);
  if(!key)return;
  const interactive=/\b(?:this (?:is an|problem is) interactive(?: problem)?|interactive (?:task|problem))\b|インタラクティブな問題|対話型の問題/i;
  const sections=$(element).find('h3').toArray().map(heading=>$(heading).text().trim());
  if(interactive.test($(element).text())||sections.some(title=>/^(interaction|対話|インタラクション)$/i.test(title))){
   types.set(key,'interactive');
  }else if(sections.some(title=>/^(input|入力)$/i.test(title))&&sections.some(title=>/^(output|出力)$/i.test(title))){
   types.set(key,'standard');
  }
 });
 return types;
}

export function atcoderTypeReader(){
 const contests=new Map();
 return async row=>{
  const contest=row.problem_url?.match(/^https:\/\/atcoder\.jp\/contests\/([\w-]+)\/tasks\/[\w-]+\/?(?:[?#].*)?$/)?.[1];
  if(!contest)return null;
  if(!contests.has(contest)){
   // Share successful results and skip the remaining tasks of an unavailable contest.
   try{
    contests.set(contest,await readAtcoderContest(contest));
   }catch(error){
    contests.set(contest,new Map());
    throw error;
   }
  }
  return contests.get(contest).get(row.source_key)??null;
 };
}

async function readLeetcodeTags(slugs){
 const fields=slugs.map((slug,index)=>'p'+index+':question(titleSlug:'+JSON.stringify(slug)+'){titleSlug topicTags{slug}}');
 const body=await requestMetadata('https://leetcode.cn/graphql/',{
  method:'POST',headers:{'Content-Type':'application/json',Referer:'https://leetcode.cn/'},
  body:JSON.stringify({query:'{'+fields.join(' ')+'}'})
 });
 if(!body?.data)throw new Error('力扣未返回题目标签');
 const types=new Map();
 slugs.forEach((slug,index)=>{
  const item=body.data['p'+index];
  if(item?.titleSlug===slug&&Array.isArray(item.topicTags)){
   types.set(slug,item.topicTags.some(tag=>['interactive','communication'].includes(tag?.slug))?'interactive':'standard');
  }
 });
 return types;
}

export function leetcodeTypeReader(rows){
 const slugs=[...new Set(rows.filter(row=>row.platform_name==='LeetCode'&&/^[a-z0-9-]+$/.test(row.source_key)).map(row=>row.source_key))];
 const batchSize=15;
 const batches=new Map(slugs.map((slug,index)=>[slug,Math.floor(index/batchSize)*batchSize]));
 const results=new Map();
 return async row=>{
  const start=batches.get(row.source_key);
  if(start===undefined)return null;
  if(!results.has(start)){
   try{
    results.set(start,await readLeetcodeTags(slugs.slice(start,start+batchSize)));
   }catch(error){
    results.set(start,new Map());
    throw error;
   }
  }
  return results.get(start).get(row.source_key)??null;
 };
}
