import {typeTags} from '../shared/problem-submission-type.js';

export function problemTypeExpression(){
 const args=[];
 const cases=Object.entries(typeTags).map(([type,aliases])=>{
  args.push(...aliases,type);
  return 'WHEN EXISTS (SELECT 1 FROM problem_tag pt JOIN tag t ON t.tag_id=pt.tag_id '+
   'WHERE pt.problem_id=pr.problem_id AND LOWER(TRIM(t.tag_name)) IN ('+aliases.map(()=>'?').join(',')+')) THEN ?';
 });
 return {sql:"COALESCE(pr.manual_submission_type,pr.submission_type, CASE "+cases.join(' ')+" ELSE 'unknown' END)",args};
}

export const knownProblemType=type=>typeof type==='string'&&(['standard','threaded'].includes(type)||Object.hasOwn(typeTags,type));
