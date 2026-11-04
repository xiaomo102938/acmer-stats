import express from 'express';
import {defaultSkills,skillCatalog,validateSkills,mergeSkillRows,specialtyKeys,resolveTag} from '../shared/skill-settings.js';
import {overallAbility,canonicalProblem} from './ability.js';
export async function readSkillSettings(c){
 const [[u]]=await c.query('SELECT user_id FROM user ORDER BY user_id LIMIT 1');
 const [[row]]=await c.execute('SELECT config,revision FROM user_skill_settings WHERE user_id=?',[u.user_id]);
 const [tags]=await c.query('SELECT tag_name,COALESCE(display_name,tag_name) AS display_name FROM tag ORDER BY tag_name');
 const config=row?(typeof row.config==='string'?JSON.parse(row.config):row.config):defaultSkills();
 for(const t of skillCatalog(tags))if(!config.names[t.key]&&!Object.hasOwn(config.aliases,t.key))config.names[t.key]=t.name;
 return {userId:u.user_id,config,revision:row?.revision||0,catalog:skillCatalog(tags)};
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
 router.put('/',async(req,res)=>{const c=await pool.getConnection();try{
  await c.beginTransaction();const state=await readSkillSettings(c);await c.execute('SELECT user_id FROM user WHERE user_id=? FOR UPDATE',[state.userId]);
  const [[current]]=await c.execute('SELECT revision FROM user_skill_settings WHERE user_id=? FOR UPDATE',[state.userId]);
  if(!Number.isInteger(req.body.revision)||req.body.revision!==(current?.revision||0))return res.status(409).json({message:'设置已在另一窗口修改，请重新加载后编辑。'});
  const config=validateSkills(req.body.config,state.catalog),revision=(current?.revision||0)+1;
  await c.execute('INSERT INTO user_skill_settings(user_id,config,revision,updated_at) VALUES(?,?,?,NOW()) ON DUPLICATE KEY UPDATE config=VALUES(config),revision=VALUES(revision),updated_at=NOW()',[state.userId,JSON.stringify(config),revision]);await c.commit();res.json({revision,message:'题型与技能图谱设置已保存。'});
 }catch(e){await c.rollback();throw e;}finally{await c.rollback();c.release();}});return router;
}
