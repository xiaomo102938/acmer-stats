import {load} from 'cheerio';
import {requestWithStatementRetry} from './statement-retry.js';

const origin='https://ac.nowcoder.com';

export function parseNowcoderType(html){
 const $=load(html);
 const metadata=$('.question-intr .subject-item-wrap').first();
 const text=metadata.text();
 if(!text.includes('时间限制')||!text.includes('空间限制'))return undefined;
 return metadata.find('span').toArray().some(span=>/^Special Judge(?:\s*,|$)/i.test($(span).text().trim()))?'spj':null;
}

export async function readNowcoderType({problem_url:url}){
 const path=url?.match(/^https:\/\/ac\.nowcoder\.com(\/acm\/(?:problem\/\d+|contest\/\d+\/[a-z0-9]+))\/?(?:[?#].*)?$/i)?.[1];
 if(!path)return null;
 return requestWithStatementRetry(async()=>{
  const response=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(!response.ok){
   await response.body?.cancel();
   if(response.status===404||response.status<400)return null;
   throw Object.assign(new Error('HTTP '+response.status),{status:response.status,retryAfter:response.headers.get('retry-after')});
  }
  return parseNowcoderType(await response.text())??null;
 });
}
