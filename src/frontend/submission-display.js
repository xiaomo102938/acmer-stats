const verdicts={AC:'AC · 通过',WA:'WA · 答案错误',WRONG_ANSWER:'WA · 答案错误',TLE:'TLE · 超时',TL:'TLE · 超时',TIME_LIMIT_EXCEEDED:'TLE · 超时',MLE:'MLE · 超内存',ML:'MLE · 超内存',MEMORY_LIMIT_EXCEEDED:'MLE · 超内存',RE:'RE · 运行错误',RTE:'RE · 运行错误',RUNTIME_ERROR:'RE · 运行错误',CE:'CE · 编译错误',COMPILATION_ERROR:'CE · 编译错误',PARTIAL:'部分得分'};
export const submissionLabel=r=>r.passed===1?'AC · 通过':verdicts[r.verdict]||(r.verdict?'非 AC · '+r.verdict:'非 AC · 历史判定未保存');
export const problemLink=r=>/^https?:\/\//i.test(r.problem_url||'')?r.problem_url:null;
