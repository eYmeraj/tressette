/**
 * Writes the suit-relabelling index maps (see suitPermutationMaps) for ml/train.py, so the Python side never has
 * to know the feature layout.
 *
 * Usage: npm run -s export-perms -- --players 2 > ml/perms-2p.json
 */
import { featureCount, suitPermutationMaps, suitPermutations } from '../src/engine/ml/encode';

const i = process.argv.indexOf('--players');
const players = Number(i >= 0 ? process.argv[i + 1] : '2') as 2 | 4;
const maps = suitPermutations().map((perm) => {
  const { features, actions } = suitPermutationMaps(players, perm);
  return { perm, features: [...features], actions: [...actions] };
});
console.log(JSON.stringify({ players, features: featureCount(players), maps }));
