import {families,extraRelations} from './skill-defaults.js';
export function defaultSkills(){return {aliases:{},names:{},nodes:families.flatMap(f=>[{id:f.id,parent:null,secondary:[]},...f.children.map(([id])=>({id,parent:f.id,secondary:extraRelations.filter(e=>e[1]===id&&e[0]!==f.id).map(e=>e[0])}))]),specialties:[],includeDescendants:true};}
export const resolveTag=(key,config)=>Object.hasOwn(config.aliases,key)?config.aliases[key]:key;
export function skillCatalog(tags=[]){const map=new Map(families.flatMap(f=>[[f.id,{key:f.id,name:f.name}],...f.children.map(([key,name])=>[key,{key,name}])]));for(const t of tags)map.set(t.tag_name,{key:t.tag_name,name:t.display_name||t.tag_name});return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));}
export function validateSkills(c,catalog){
 const fail=m=>{throw Object.assign(new Error(m),{status:400});};
 if(!c||typeof c!=='object'||!c.aliases||!c.names||!Array.isArray(c.nodes)||!Array.isArray(c.specialties)||typeof c.includeDescendants!=='boolean')fail('配置格式不正确。');
 const known=new Set(catalog.map(t=>t.key));
 if(c.nodes.length>400||Object.keys(c.aliases).length>1000||c.specialties.length>400)fail('配置数量超过上限。');
 for(const [a,b]of Object.entries(c.aliases)){if(!known.has(a)||!known.has(b)||a===b||Object.hasOwn(c.aliases,b))fail('归并必须指向现有标准题型，不能指向自身或形成归并链。');}
 const valid=id=>known.has(id)&&!Object.hasOwn(c.aliases,id);
 for(const [id,name]of Object.entries(c.names))if(!valid(id)||typeof name!=='string'||!name.trim()||name.length>100)fail('题型名称须为 1～100 个字符，并属于标准题型。');
 const ids=new Set();for(const n of c.nodes){if(!n||!valid(n.id)||ids.has(n.id)||!Array.isArray(n.secondary))fail('图谱节点不存在、重复或已被归并。');ids.add(n.id);}
 const edges=new Map([...ids].map(id=>[id,[]]));
 for(const n of c.nodes){
  if(n.parent!==null&&(typeof n.parent!=='string'||!ids.has(n.parent)))fail('主前驱必须是图谱中的节点，根节点请选择“根节点”。');
  if(n.parent===null&&n.secondary.length)fail('根节点不能有副前驱。');
  const parents=[...(n.parent===null?[]:[n.parent]),...n.secondary];
  if(new Set(parents).size!==parents.length||parents.some(id=>!ids.has(id)||id===n.id))fail('不能指向自身、重复前驱或使用不存在的前驱。');
  for(const id of parents)edges.get(id).push(n.id);
 }
 const done=new Set(),active=new Set();function visit(id){if(active.has(id))fail('拓扑关系存在环（实线和虚线合并检查），请修改前驱。');if(done.has(id))return;active.add(id);for(const to of edges.get(id))visit(to);active.delete(id);done.add(id);}for(const id of ids)visit(id);
 if(new Set(c.specialties).size!==c.specialties.length||c.specialties.some(id=>!valid(id)))fail('专职题型无效或重复。');
 return c;
}
export function specialtyKeys(config){const selected=new Set(config.specialties);if(config.includeDescendants){let changed=true;while(changed){changed=false;for(const n of config.nodes)if(n.parent&&selected.has(n.parent)&&!selected.has(n.id)){selected.add(n.id);changed=true;}}}return selected;}
export function mergeSkillRows(rows,config){const names=new Map(rows.map(r=>[r.tag_name,r.display_name]));return rows.map(r=>{const key=resolveTag(r.tag_name,config);return {...r,tag_id:key,tag_name:key,display_name:config.names[key]||names.get(key)||key};});}
export function mergeDraft(config,source,target){
 if(source===target)throw new Error('请选择不同题型。');
 const copy=structuredClone(config);
 // Never erase relationships silently: the UI asks the user to resolve conflicts first.
 const s=copy.nodes.find(n=>n.id===source),t=copy.nodes.find(n=>n.id===target);
 if(s&&(s.parent!==null||s.secondary.length||copy.nodes.some(n=>n.parent===source||n.secondary.includes(source))))throw new Error('待归并题型仍有连线，请先在拓扑编辑中将其设为独立根节点，并移走它的下级／关联。');
 if(s&&!t)copy.nodes.push({id:target,parent:null,secondary:[]});
 copy.nodes=copy.nodes.filter(n=>n.id!==source);
 for(const a of Object.keys(copy.aliases))if(copy.aliases[a]===source)copy.aliases[a]=target;
 copy.aliases[source]=target;delete copy.names[source];copy.specialties=[...new Set(copy.specialties.map(id=>id===source?target:id))];return copy;
}
