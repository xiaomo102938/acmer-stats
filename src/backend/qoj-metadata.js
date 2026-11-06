import {setTimeout as pause} from 'node:timers/promises';
import {load} from 'cheerio';
import {requestWithStatementRetry} from './statement-retry.js';
import {submissionTypeFromTags} from '../shared/problem-submission-type.js';

const statementOrigin='https://huang.lt';

export function parseQojHeader(html,key){
 const $=load(html);
 if($('h1.page-header').text().trim().split('.')[0]!=='#'+key)return null;

 const header=$('.uoj-content > .row').filter((_i,row)=>
  $(row).find('.badge-secondary').length>=2).first();
 if(!header.length)return null;
 const tags=header.children('.badge').map((_i,badge)=>$(badge).text().trim()).get();
 const difficultyValue=header.find('#difficulty-badge [aria-valuenow]').attr('aria-valuenow');
 return {
  type:submissionTypeFromTags(tags)??'standard',
  difficulty:difficultyValue===undefined?null:Number(difficultyValue)
 };
}

export async function readQojType({source_key:key},signal){
 if(!/^\d+$/.test(key??''))return null;
 return requestWithStatementRetry(async()=>{
  // Read the HTML header only for classification. Linked statements and PDFs are not fetched.
  const response=await fetch(statementOrigin+'/problem/'+key+'/statement/default',{
   redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000),headers:{Accept:'text/html'}
  });
  if(!response.ok){
   await response.body?.cancel();
   if(response.status===404)return null;
   throw Object.assign(new Error('QOJ statement HTTP '+response.status),{
    status:response.status,retryAfter:response.headers.get('retry-after')
   });
  }
  const header=parseQojHeader(await response.text(),key);
  if(!header)throw new Error('Unexpected QOJ problem page');
  return header.type;
 },signal?delay=>pause(delay,undefined,{signal}):undefined);
}
