import {load} from 'cheerio';
import {setTimeout as pause} from 'node:timers/promises';

const origin='https://ac.nowcoder.com';

export function parseNowcoderType(html){
 const $=load(html);
 const metadata=$('.question-intr .subject-item-wrap').first();
 const text=metadata.text();
 if(!text.includes('时间限制')||!text.includes('空间限制'))return undefined;
 return metadata.find('span').toArray().some(span=>/^Special Judge(?:\s*,|$)/i.test($(span).text().trim()))?'spj':null;
}

export function nowcoderTypeWorker(pool){
 let running=false,pending=false;
 return async function queueNowcoderTypes(){
  pending=true;
  if(running)return;
  running=true;
  try{
   while(pending){
    pending=false;
    const [rows]=await pool.query("SELECT pr.problem_id,pr.problem_url FROM problem pr JOIN platform p USING(platform_id) WHERE p.platform_name='牛客' AND pr.metadata_checked_at IS NULL AND pr.submission_type IS NULL AND EXISTS (SELECT 1 FROM synced_submission s WHERE s.problem_id=pr.problem_id) ORDER BY (SELECT MAX(s.submitted_at) FROM synced_submission s WHERE s.problem_id=pr.problem_id) DESC");
    for(const {problem_id,problem_url} of rows){
     const path=problem_url?.match(/^https:\/\/ac\.nowcoder\.com(\/acm\/(?:problem\/\d+|contest\/\d+\/[a-z0-9]+))\/?(?:[?#].*)?$/i)?.[1];
     if(!path)continue;
     await pause(4000);
     const response=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(12000)});
     if(!response.ok){
      await response.body?.cancel();
      if(response.status===404||response.status<400)continue;
      throw new Error('HTTP '+response.status);
     }
     const type=parseNowcoderType(await response.text());
     if(type===undefined)continue;
     await pool.execute('UPDATE problem SET submission_type=?,metadata_checked_at=NOW() WHERE problem_id=? AND submission_type IS NULL AND metadata_checked_at IS NULL',[type,problem_id]);
    }
   }
  }catch(error){
   console.warn('Nowcoder type check paused:',error.message);
  }finally{
   running=false;
  }
 };
}
