import {readFileSync} from 'node:fs';

// Compact anonymous score distributions derived from algoux/srk-collection,
// revision 82f077de6246a4d0e474ebe52c099d83d562506c. No upstream request on page load.
const boards = JSON.parse(readFileSync(new URL('./qoj-vp-original-boards.json', import.meta.url), 'utf8'));
const tiers = ['gold', 'silver', 'bronze'];

export function originalBoard(contest) {
 const board = boards[contest];
 return board ? {name:board.title,url:'https://rl.algoux.cn/ranklist/'+board.source} : null;
}

function countBelow(values, target) {
 let lo = 0, hi = values.length;
 while (lo < hi) {
  const mid = (lo + hi) >>> 1;
  if (values[mid] < target) lo = mid + 1;
  else hi = mid;
 }
 return lo;
}

export function estimateVpMedal(contest, {items,solved}, completeRoster) {
 const board = boards[contest];
 if (!board?.scores || !completeRoster) return {tier:board?.noAward?'noAward':'unknown'};

 // Apply the original board's time precision before comparing scores.
 let time = items.reduce((sum, item) => {
  if (item.acSeconds == null) return sum;
  const elapsed = board.minute && !board.roundTotal ? Math.floor(item.acSeconds / 60) * 60 : item.acSeconds;
  return sum + elapsed + item.wrong * 1200;
 }, 0);
 if (board.minute) time = Math[board.rounding](time / 60) * 60;

 let ahead = countBelow(board.scores[solved] ?? [], time);
 for (const [value, times] of Object.entries(board.scores)) {
  if (Number(value) > solved) ahead += times.length;
 }

 if (board.noAward) return {tier:'noAward',place:ahead+1,total:board.total};

 const cutoff = board.cutoffs.findIndex(line => line &&
  (solved > line[0] || solved === line[0] && time <= line[1]));
 // A virtual team has no official row order to resolve a tie at a forced cutoff.
 const tied = cutoff >= 0 && board.noTied &&
  solved === board.cutoffs[cutoff][0] && time === board.cutoffs[cutoff][1];
 return {tier:tied?'unknown':tiers[cutoff]??'below',place:ahead+1,total:board.total};
}
