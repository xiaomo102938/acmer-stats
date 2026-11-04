import {mergeTopology,unmergeTopology} from '../shared/topology-merge.js';
import express from 'express';
import {defaultSkills,skillCatalog,validateSkills,mergeSkillRows,specialtyKeys,resolveTag} from '../shared/skill-settings.js';
import {overallAbility,canonicalProblem} from './ability.js';
export async function readSkillSettings(c){
 const [[u]]=await c.query('SELECT user_id FROM user ORDER BY user_id LIMIT 1');
 const [[row]]=await c.execute('SELECT config,revision,topology_draft,draft_revision FROM user_skill_settings WHERE user_id=?',[u.user_id]);
 const [tags]=await c.query('SELECT tag_name,COALESCE(display_name,tag_name) AS display_name FROM tag ORDER BY tag_name');
 const config=row?(typeof row.config==='string'?JSON.parse(row.config):row.config):defaultSkills();
 for(const t of skillCatalog(tags))if(!config.names[t.key]&&!Object.hasOwn(config.aliases,t.key))config.names[t.key]=t.name;
 return {userId:u.user_id,config,revision:row?.revision||0,topologyDraft:row?.topology_draft?(typeof row.topology_draft==='string'?JSON.parse(row.topology_draft):row.topology_draft):null,draftRevision:row?.draft_revision||0,catalog:skillCatalog(tags)};
}
export function specialtyAbility(problemRows,tagRows,config,scope='specialty'){
 if(scope==='all')return {...overallAbility(problemRows),scope:'all',configured:true};
 const keys=specialtyKeys(config),matches=new Set(tagRows.filter(r=>keys.has(resolveTag(r.tag_name,config))).map(canonicalProblem));
 return {...overallAbility(problemRows.filter(r=>matches.has(canonicalProblem(r)))),scope:'specialty',configured:config.specialties.length>0,specialties:config.specialties,specialtyNames:config.specialties.map(id=>config.names[id]||id),includeDescendants:config.includeDescendants};
}
export {mergeSkillRows};
export function skillSettingsRouter(pool){
 const router=express.Router();
 router.get('/',async(_req,res)=>{const c=await pool.getConnection();try{const {userId,...state}=await readSkillSettings(c);res.set('Cache-Control','no-store').json(state);}finally{c.release();}});
 router.patch('/',async(req,res)=>{const c=await pool.getConnection();try{
  await c.beginTransaction();const state=await readSkillSettings(c);await c.execute('SELECT user_id FROM user WHERE user_id=? FOR UPDATE',[state.userId]);
  const [[row]]=await c.execute('SELECT config,revision,topology_draft,draft_revision FROM user_skill_settings WHERE user_id=? FOR UPDATE',[state.userId]);
  const revision=row?.revision||0,draftRevision=row?.draft_revision||0;
  const activeDraft=row?.topology_draft?(typeof row.topology_draft==='string'?JSON.parse(row.topology_draft):row.topology_draft):null;
  if(req.body.revision!==revision)return res.status(409).json({message:'设置已更新，请重新加载再保存，当前草稿仍保留。'});
  let config=row?(typeof row.config==='string'?JSON.parse(row.config):row.config):state.config;
  const module=req.body.module;
  if(module==='discardDraft'){
   if(req.body.draftRevision!==draftRevision)return res.status(409).json({message:'草稿已更新，请重新加载。'});
   if(row)await c.execute('UPDATE user_skill_settings SET topology_draft=NULL,draft_revision=draft_revision+1 WHERE user_id=?',[state.userId]);
   await c.commit();return res.json({config,revision,draftRevision:row?draftRevision+1:0,topologyDraft:null,message:'已放弃保存的拓扑草稿。'});
  }
  if(module==='draft'){
   if(req.body.draftRevision!==draftRevision)return res.status(409).json({message:'拓扑草稿已在另一窗口修改，请重新加载。'});
   const value={nodes:req.body.value?.nodes,positions:req.body.value?.positions,names:req.body.value?.names};
   validateSkills({...config,...value},state.catalog,{draft:true});
   await c.execute('INSERT INTO user_skill_settings(user_id,config,revision,topology_draft,draft_revision) VALUES(?,?,?,?,1) ON DUPLICATE KEY UPDATE topology_draft=VALUES(topology_draft),draft_revision=draft_revision+1',[state.userId,JSON.stringify(config),revision,JSON.stringify(value)]);
   await c.commit();return res.json({config,revision,draftRevision:draftRevision+1,topologyDraft:value,message:'拓扑草稿已保存，分析页尚未应用。'});
  }
  if(module==='specialty')config={...config,specialties:req.body.value?.specialties,includeDescendants:req.body.value?.includeDescendants};
  else if(module==='topology'){
   if(req.body.draftRevision!==draftRevision)return res.status(409).json({message:'拓扑草稿已更新，请重新加载。'});
   config={...config,nodes:req.body.value?.nodes,positions:req.body.value?.positions,names:req.body.value?.names};
  }else if(module==='merge'){
   const plan=mergeTopology(config,req.body.first,req.body.second,state.catalog,req.body.drop||[]);if(plan.conflict)throw Object.assign(new Error(plan.conflict),{status:400});config=plan.config;
   if(req.body.name!==undefined)config.names[plan.keep]=req.body.name;
   if(row?.topology_draft)return res.status(409).json({message:'已有未应用的拓扑草稿，请先应用或放弃，再归并标签。'});
  }else if(module==='unmerge'){
   if(row?.topology_draft)return res.status(409).json({message:'请先应用或放弃拓扑草稿，再撤销归并。'});
   config=unmergeTopology(config,req.body.source);
  }else throw Object.assign(new Error('未知设置模块。'),{status:400});
  validateSkills(config,state.catalog);
  await c.execute('INSERT INTO user_skill_settings(user_id,config,revision) VALUES(?,?,?) ON DUPLICATE KEY UPDATE config=VALUES(config),revision=VALUES(revision),updated_at=NOW()',[state.userId,JSON.stringify(config),revision+1]);
  if(module==='topology')await c.execute('UPDATE user_skill_settings SET topology_draft=NULL,draft_revision=draft_revision+1 WHERE user_id=?',[state.userId]);
  await c.commit();res.json({config,revision:revision+1,draftRevision:draftRevision+(module==='topology'?1:0),topologyDraft:module==='topology'?null:activeDraft,message:module==='merge'?'标签与图谱已一起归并保存。':'修改已保存并应用。'});
 }catch(e){await c.rollback();throw e;}finally{await c.rollback();c.release();}});
 router.put('/',async(req,res)=>{const c=await pool.getConnection();try{
  await c.beginTransaction();const state=await readSkillSettings(c);await c.execute('SELECT user_id FROM user WHERE user_id=? FOR UPDATE',[state.userId]);
  const [[current]]=await c.execute('SELECT revision FROM user_skill_settings WHERE user_id=? FOR UPDATE',[state.userId]);
  if(!Number.isInteger(req.body.revision)||req.body.revision!==(current?.revision||0))return res.status(409).json({message:'设置已在另一窗口修改，请重新加载后编辑。'});
  if(JSON.stringify(req.body.config?.aliases)!==JSON.stringify(state.config.aliases))throw Object.assign(new Error('请使用标签归并模块预览并保存别名变更。'),{status:400});
  const config=validateSkills(req.body.config,state.catalog),revision=(current?.revision||0)+1;
  await c.execute('INSERT INTO user_skill_settings(user_id,config,revision,updated_at) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE config=VALUES(config),revision=VALUES(revision),updated_at=NOW()',[state.userId,JSON.stringify(config),revision]);await c.commit();res.json({revision,message:'题型与技能图谱设置已保存。'});
 }catch(e){await c.rollback();throw e;}finally{await c.rollback();c.release();}});return router;
}
