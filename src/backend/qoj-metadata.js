import {load} from 'cheerio';
import {setTimeout as pause} from 'node:timers/promises';

const statementOrigin='https://huang.lt';
const types=[
 ['communication',/^(?:本[题題](?:[为為是]|屬於)(?:一道)?\s*(?:通信|通讯|通訊)[题題]|this is a communication (?:problem|task))(?=\s|[。.!！:：]|$)/i],
 ['interactive',/^(?:本[题題](?:[为為是]|屬於)(?:一道)?\s*交互[题題]|this is an interactive (?:problem|task))(?=\s|[。.!！:：]|$)/i],
 ['spj',/^(?:本[题題](?:采用|使用)\s*(?:SPJ|Special Judge|特殊[评評][测測]|[特][别別][评評][测測])|this (?:problem|task) uses a special judge)(?=\s|[。.!！:：]|$)/i],
 ['threaded',/^(?:本[题題](?:[为為是]|屬於)(?:一道)?\s*多[线線]程[题題]|this is a (?:multi-threaded|multithreaded) (?:problem|task))(?=\s|[。.!！:：]|$)/i]
];

function inferStatementType(lines){
 const instructions=lines.join('\n');
 const runsTwice=/(?:程[序式][^\n。]{0,35}(?:运行|運行|執行)[^\n。]{0,8}(?:两|兩|二|2)次|(?:your|the) program[^\n.!]{0,40}(?:run|executed)[^\n.!]{0,12}(?:twice|two times))/i;
 const transfersData=/(?:(?:第一|第二)次[^\n。]{0,90}(?:传递|傳遞|傳送|收到|接收)|(?:first|second) run[^\n.!]{0,90}(?:receives?|passes?|transmits?|outputs?)|(?:交互器|interactor)[^\n。!]{0,80}(?:传递|傳遞|transfer|pass))/i;
 if(runsTwice.test(instructions)&&transfersData.test(instructions))return 'communication';

 const flushAfterOutput=/(?:(?:每次|每[一]?行|每[个個]查询)[^\n。]{0,50}(?:输出|輸出|查询|查詢)[^\n。]{0,45}(?:刷新|清空|flush|endl)|(?:flush|endl)[^\n.!]{0,80}after (?:each|every) (?:output|query|line)|after (?:each|every) (?:output|query|line)[^\n.!]{0,80}(?:flush|endl))/i;
 if(flushAfterOutput.test(instructions))return 'interactive';

 const anyValidAnswer=/(?:(?:多解|多[种種](?:合法|可行)?(?:答案|方案|解))[^\n。]{0,30}(?:任意|任选|任選|隨意|随意)[^\n。]{0,22}(?:输出|輸出|一种|一種|一个|一個)|(?:output|print) any (?:one (?:of (?:them|the solutions)|valid (?:answer|solution))|valid (?:answer|solution)|(?:of the )?possible solutions?))/i;
 const outputTolerance=/(?:(?:绝对|絕對|相对|相對)(?:或相[对對])?误差[^\n。]{0,65}(?:不超过|不超過|小于|小於|以内|以內)|(?:absolute|relative) (?:or relative )?error[^\n.!]{0,80}(?:at most|less than|does not exceed|within))/i;
 return anyValidAnswer.test(instructions)||outputTolerance.test(instructions)?'spj':null;
}

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
 const lines=article.find('p,h2,h3,h4,li').toArray().map(block=>
  $(block).text().replace(/\s+/g,' ').trim());
 for(const line of lines){
  const match=types.find(([,pattern])=>pattern.test(line));
  if(match)return {type:match[0],tryChinese:false};
 }
 return {type:inferStatementType(lines),tryChinese:false};
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
