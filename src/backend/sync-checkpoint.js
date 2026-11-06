export function scanCheckpoint(id){
 let seen=false;
 return {
  stopped:false,
  afterPage(rows){
   if(!id)return false;
   // Keep the entire next page to cover late records and recent verdict updates.
   if(seen){this.stopped=true;return true;}
   seen=rows.some(row=>row.id===id);
   return false;
  }
 };
}
