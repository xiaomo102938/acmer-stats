export const typeTags={
 communication:['communication','communication problem','通信','通信题'],
 interactive:['interactive','交互','交互题'],
 spj:['special judge','spj','special judge problem','特殊评测','特殊判题']
};

export function submissionTypeFromTags(tags){
 const names=new Set(tags.map(tag=>String(tag??'').trim().toLowerCase()));
 for(const [type,aliases] of Object.entries(typeTags)){
  if(aliases.some(alias=>names.has(alias)))return type;
 }
 return null;
}
