import {verdictGroups} from '../shared/submission-verdicts.js';

const verdictCodes=new Map(Object.entries(verdictGroups).flatMap(([code,aliases])=>aliases.map(alias=>[alias,code])));
for(const [alias,code] of Object.entries({OL:'OLE',OUTPUT_LIMIT_EXCEEDED:'OLE',IDLENESS_LIMIT_EXCEEDED:'ILE',IL:'ILE',PRESENTATION_ERROR:'PE',SECURITY_VIOLATED:'SV',FAILED:'FAIL',CHALLENGED:'HACKED',SKIPPED:'SKIP',REJECTED:'RJ',CRASHED:'RE',INPUT_PREPARATION_CRASHED:'FAIL'})){
 verdictCodes.set(alias,code);
}
export const submissionLabel=row=>row.passed===1?'AC':(verdictCodes.get(row.verdict)??(row.verdict||'非 AC'));
const standardType={id:'standard',name:'传统／标准题',icon:'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20 M7 12l3 3 6-7'};
export const problemTypes={
 standard:standardType,
 unknown:{id:'unknown',name:'未知题型',icon:'M9 8a3 3 0 1 1 4 2.83c-.72.25-1 1.17-1 2.17 M12 17h.01'},
 spj:{id:'spj',name:'Special Judge',icon:'M9 3h6l1 3 3-1 3 5-2 2 2 2-3 5-3-1-1 3H9l-1-3-3 1-3-5 2-2-2-2 3-5 3 1z M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6'},
 interactive:{id:'interactive',name:'交互题',icon:'M21 11a9 8 0 0 1-13 7l-5 3 1-6a9 8 0 1 1 17-4z M8 11h.1m3.9 0h.1m3.9 0h.1'},
 communication:{id:'communication',name:'通信题',icon:'M4 10a8 8 0 0 1 15-3l2 3m0-5v5h-5 M20 14a8 8 0 0 1-15 3l-2-3m0 5v-5h5'},
 threaded:{id:'threaded',name:'多线程题',icon:'M10 2h4v4h-4z M3 17h4v4H3z M10 17h4v4h-4z M17 17h4v4h-4z M12 6v11 M5 17v-5h14v5'}
};
export const problemType=row=>problemTypes[row.submission_type]||problemTypes.unknown;
export const problemLink=r=>/^https?:\/\//i.test(r.problem_url||'')?r.problem_url:null;
