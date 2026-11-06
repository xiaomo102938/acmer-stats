export const typeTags={
 threaded:['multithreading','multithreaded','multi-threading','concurrency','多线程','多线程题'],
 communication:['communication','communication problem','通信','通信题'],
 interactive:['interactive','交互','交互题'],
 spj:['special judge','spj','special judge problem']
};

export function submissionTypeFromTags(tags){
 const names=new Set(tags.map(tag=>String(tag??'').trim().toLowerCase()));
 for(const [type,aliases] of Object.entries(typeTags)){
  if(aliases.some(alias=>names.has(alias)))return type;
 }
 return null;
}
