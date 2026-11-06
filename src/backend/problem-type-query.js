import {typeTags} from '../shared/problem-submission-type.js';

export function problemTypeExpression(){
 const args=[];
 const cases=Object.entries(typeTags).map(([type,aliases])=>{
  args.push(...aliases,type);
  return 'WHEN EXISTS (SELECT 1 FROM problem_tag pt JOIN tag t ON t.tag_id=pt.tag_id '+
   'WHERE pt.problem_id=pr.problem_id AND LOWER(TRIM(t.tag_name)) IN ('+aliases.map(()=>'?').join(',')+')) THEN ?';
 });
 const automatic="COALESCE(pr.submission_type, CASE "+cases.join(' ')+" WHEN p.platform_name='Codeforces' THEN 'standard' ELSE 'unknown' END)";
 return {sql:"COALESCE(pr.manual_submission_type, CASE "+automatic+
  " WHEN 'spj' THEN CASE WHEN p.platform_name IN ('Codeforces','LeetCode') THEN 'standard' ELSE 'spj' END"+
  " WHEN 'communication' THEN CASE WHEN p.platform_name='LeetCode' THEN 'interactive' ELSE 'communication' END"+
  " WHEN 'interactive' THEN 'interactive' WHEN 'standard' THEN 'standard' WHEN 'threaded' THEN 'threaded' ELSE 'unknown' END)",args};
}

export const knownProblemType=type=>typeof type==='string'&&(['standard','threaded'].includes(type)||Object.hasOwn(typeTags,type));
