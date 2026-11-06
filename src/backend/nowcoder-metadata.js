import {load} from 'cheerio';
import {requestWithStatementRetry} from './statement-retry.js';

const origin='https://ac.nowcoder.com';

export function parseNowcoderType(html){
 const $=load(html);
 const metadata=$('.question-intr .subject-item-wrap').first();
 const text=metadata.text();
 if(!text.includes('时间限制')||!text.includes('空间限制'))return undefined;
 return metadata.find('span').toArray().some(span=>/^Special Judge(?:\s*,|$)/i.test($(span).text().trim()))?'spj':'standard';
}

export async function readNowcoderType({problem_url:url},loadCookies=async()=>[]){
 const path=url?.match(/^https:\/\/ac\.nowcoder\.com(\/acm\/(?:problem\/\d+|contest\/\d+\/[a-z0-9]+))\/?(?:[?#].*)?$/i)?.[1];
 if(!path)return null;
 const read=cookie=>requestWithStatementRetry(async()=>{
  const response=await fetch(origin+path,{
   redirect:'manual',signal:AbortSignal.timeout(12000),headers:cookie?{Cookie:cookie}:{}
  });
  if(!response.ok){
   await response.body?.cancel();
   if(response.status===401||response.status===403)return {restricted:true};
   if(response.status===404||response.status<400)return {};
   throw Object.assign(new Error('HTTP '+response.status),{status:response.status,retryAfter:response.headers.get('retry-after')});
  }
  const html=await response.text();
  return {type:parseNowcoderType(html),restricted:html.includes('没有查看题目的权限')};
 });
 const publicResult=await read();
 if(publicResult.type||!publicResult.restricted)return publicResult.type??null;
 for(const cookie of await loadCookies()){
  const result=await read(cookie);
  if(result.type)return result.type;
 }
 return null;
}
