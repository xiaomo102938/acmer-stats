import {qojMedalColors} from '../shared/qoj-medal-labels.js';

export const vpMedals = {
 gold: {label:'金牌', color:qojMedalColors.gold},
 silver: {label:'银牌', color:qojMedalColors.silver},
 bronze: {label:'铜牌', color:qojMedalColors.bronze},
 below: {label:'铁牌', color:qojMedalColors.iron},
 noAward: {label:'原赛不设奖', color:'#7c85a5'},
 unknown: {label:'待核实', color:'#62646a'}
};

export const vpMedal = result => vpMedals[result?.tier] ?? vpMedals.unknown;
export const vpMedalStyle = result => ({'--vp-result-color':vpMedal(result).color});
