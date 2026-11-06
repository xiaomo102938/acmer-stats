export function scanCheckpoint(id){
 return {
  stopped:false,
  matches(sourceId){
   if(id==null||String(sourceId)!==id)return false;
   this.stopped=true;
   return true;
  }
 };
}
