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

// Keep a small in-memory cache for analytics reads during navigation.
const readCache=new Map();
const maxCachedReads=24;
const readLifetime=30_000;
let readGeneration=0;

export function invalidateApiReads(){
 readGeneration++;
 readCache.clear();
}

export async function cachedApiFetch(url,options){
 options?.signal?.throwIfAborted();
 const existing=readCache.get(url);
 if(existing&&existing.expires>Date.now())return new Response(existing.body,existing.init);
 const generation=readGeneration;
 const response=await apiFetch(url,options);
 if(!response.ok)return response;
 // A cached body must outlive the abort signal of the component that fetched it.
 const body=await response.clone().arrayBuffer();
 if(generation===readGeneration&&!options?.signal?.aborted){
  readCache.delete(url);
  const init={status:response.status,statusText:response.statusText,headers:response.headers};
  readCache.set(url,{body,init,expires:Date.now()+readLifetime});
  if(readCache.size>maxCachedReads)readCache.delete(readCache.keys().next().value);
 }
 return response;
}
