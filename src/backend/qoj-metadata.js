import {load} from 'cheerio';
import {setTimeout as pause} from 'node:timers/promises';

const statementOrigin='https://huang.lt';
const types=[
 ['communication',/^(?:本[题題](?:[为為是]|屬於)(?:一道)?\s*(?:通信|通讯|通訊)[题題]|this is a communication (?:problem|task))(?=\s|[。.!！:：]|$)/i],
 ['interactive',/^(?:本[题題](?:[为為是]|屬於)(?:一道)?\s*交互[题題]|this is an interactive (?:problem|task))(?=\s|[。.!！:：]|$)/i],
 ['spj',/^(?:本[题題](?:采用|使用)\s*(?:SPJ|Special Judge|特殊[评評][测測]|[特][别別][评評][测測])|this (?:problem|task) uses a special judge)(?=\s|[。.!！:：]|$)/i],
 ['threaded',/^(?:本[题題](?:[为為是]|屬於)(?:一道)?\s*多[线線]程[题題]|this is a (?:multi-threaded|multithreaded) (?:problem|task))(?=\s|[。.!！:：]|$)/i]
];

export function parseQojStatement(html,key){
 const $=load(html);
 if($('h1.page-header').text().trim().split('.')[0]!=='#'+key)return null;
 const statement=$('#tab-statement');
 const article=statement.find('article.uoj-article');
 if(!article.text().trim()){
  if(!statement.find('#statements-pdf').length)return null;
  const chinese=$('a[href="/problem/'+key+'/statement/zh_cn"]').length>0;
  return {type:null,tryChinese:chinese};
 }
 const blocks=article.find('p,h2,h3,h4,li');
 for(const block of blocks){
  const line=$(block).text().replace(/\s+/g,' ').trim();
  const match=types.find(([,pattern])=>pattern.test(line));
  if(match)return {type:match[0],tryChinese:false};
 }
 return {type:null,tryChinese:false};
}

function isNetworkError(error){
 return ['TimeoutError','AbortError'].includes(error.name)||
  (error instanceof TypeError&&error.message==='fetch failed');
}

async function readStatement(key,locale){
 try{
  return await requestStatement(key,locale);
 }catch(error){
  if(!isNetworkError(error))throw error;
  return requestStatement(key,locale);
 }
}

async function requestStatement(key,locale){
 await pause(4000);
 // Public statements only. Fetch does not load the resources linked by the HTML.
 const response=await fetch(statementOrigin+'/problem/'+key+'/statement/'+locale,{
  redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'text/html'}
 });
 if(!response.ok){
  await response.body?.cancel();
  if(response.status===404)return null;
  throw new Error('QOJ statement HTTP '+response.status);
 }
 const result=parseQojStatement(await response.text(),key);
 if(!result)throw new Error('Unexpected QOJ statement page');
 return result;
}

export function qojTypeWorker(pool){
 let running=false,pending=false;
 return async function queueQojTypes(){
  pending=true;
  if(running)return;
  running=true;
  try{
   while(pending){
    pending=false;
    // QOJ uses this timestamp only for the public statement check.
    const [rows]=await pool.query("SELECT pr.problem_id,pr.source_key FROM problem pr JOIN platform p USING(platform_id) WHERE p.platform_name='QOJ' AND pr.metadata_checked_at IS NULL AND pr.submission_type IS NULL AND pr.source_key REGEXP '^[0-9]+$' AND EXISTS (SELECT 1 FROM synced_submission s WHERE s.problem_id=pr.problem_id) ORDER BY LENGTH(pr.source_key) DESC, pr.source_key DESC");
    let consecutiveFailures=0;
    for(const row of rows){
     let result;
     try{
      const statement=await readStatement(row.source_key,'default');
      result=statement?.tryChinese?await readStatement(row.source_key,'zh_cn')??statement:statement;
      consecutiveFailures=0;
     }catch(error){
      if(!isNetworkError(error)||++consecutiveFailures>=3)throw error;
      console.warn('QOJ type check deferred:',row.source_key,error.message);
      continue;
     }
     if(!result)continue;
     await pool.execute('UPDATE problem SET submission_type=?,metadata_checked_at=NOW() WHERE problem_id=? AND metadata_checked_at IS NULL AND submission_type IS NULL',[result.type,row.problem_id]);
    }
   }
  }catch(error){
   console.warn('QOJ type check paused:',error.message);
  }finally{
   running=false;
  }
 };
}
