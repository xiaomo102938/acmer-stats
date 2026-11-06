import {setTimeout as pause} from 'node:timers/promises';

export function isRetryableStatementError(error){
 return ['TimeoutError','AbortError'].includes(error.name)||
  (error instanceof TypeError&&error.message==='fetch failed')||
  [500,502,503,504].includes(error.status);
}

export async function requestWithStatementRetry(request,wait=pause){
 for(const delay of [4000,8000,16000]){
  await wait(delay);
  try{
   return await request();
  }catch(error){
   if(delay===16000||!isRetryableStatementError(error))throw error;
  }
 }
}
