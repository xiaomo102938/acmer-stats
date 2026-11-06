import {verdictGroups} from '../shared/submission-verdicts.js';

const verdictCodes=new Map(Object.entries(verdictGroups).flatMap(([code,aliases])=>aliases.map(alias=>[alias,code])));
for(const [alias,code] of Object.entries({OL:'OLE',OUTPUT_LIMIT_EXCEEDED:'OLE',IDLENESS_LIMIT_EXCEEDED:'ILE',IL:'ILE',PRESENTATION_ERROR:'PE',SECURITY_VIOLATED:'SV',FAILED:'FAIL',CHALLENGED:'HACKED',SKIPPED:'SKIP',REJECTED:'RJ',CRASHED:'RE',INPUT_PREPARATION_CRASHED:'FAIL'})){
 verdictCodes.set(alias,code);
}
export const submissionLabel=row=>row.passed===1?'AC':(verdictCodes.get(row.verdict)??(row.verdict||'非 AC'));
export const problemLink=r=>/^https?:\/\//i.test(r.problem_url||'')?r.problem_url:null;
