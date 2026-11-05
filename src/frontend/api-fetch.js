export const apiFailureEvent='acmer-api-failure';

export async function apiFetch(url,options){
 try{
  const response=await fetch(url,options);
  if(response.status>=500)window.dispatchEvent(new Event(apiFailureEvent));
  return response;
 }catch(error){
  if(!options?.signal?.aborted)window.dispatchEvent(new Event(apiFailureEvent));
  throw error;
 }
}
