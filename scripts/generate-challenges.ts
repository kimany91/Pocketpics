/**
 * Table de difficulté des défis du jour (npx tsx scripts/generate-challenges.ts).
 *
 * Pour chaque niveau de l'aventure, on simule des combats d'un joueur qui vise
 * bien (habileté 7 sur 10, comme dans tests/levels.test.ts) avec une équipe
 * bridée : de 1 à 4 cartes, toutes de la même rareté (de Commune à Divine).
 * Le pourcentage de victoires de chaque contrainte est écrit dans
 * src/game/challengeTable.ts ; le jeu y pioche des défis durs mais gagnables.
 *
 * À relancer si l'équilibre des niveaux ou des cartes change.
 */
import { writeFileSync } from 'node:fs';

import { botAction, botReplacement } from '../src/battle/bot';
import { type FighterInput, act, createBattle, replace } from '../src/battle/engine';
import { TOTAL_LEVELS, getLevel, levelFighters } from '../src/battle/levels';
import { generateStats } from '../src/battle/stats';
import { RARITIES } from '../src/game/rarity';

const SKILL = 7;
const GAMES = Number(process.argv[2] ?? 200);
/** Rangs de Commune (0) à Divine (7). */
const CAPS = 8;
const rarityOf = (rank: number) => RARITIES.find((r) => r.rank === rank)!.id;

let seq = 0;
const team = (count: number, rank: number): FighterInput[] =>
  Array.from({ length: count }, () => {
    const ref = `defi${seq++}`;
    return { ref, name: ref, rarity: rarityOf(rank), battle: generateStats(ref, rank) };
  });

function winRate(n: number, count: number, rank: number): number {
  const level = getLevel(n)!;
  let won = 0;
  for (let g = 0; g < GAMES; g++) {
    let b = createBattle(team(count, rank), levelFighters(level), { catchUp: 1 });
    if (g % 2) b = { ...b, turn: 1 };
    while (b.winner === null) {
      const side = b.mustReplace ?? b.turn;
      const skill = side === 0 ? SKILL : level.botLevel;
      b = b.mustReplace !== null ? replace(b, b.mustReplace, botReplacement(b, b.mustReplace, skill)).battle : act(b, botAction(b, b.turn, skill)).battle;
    }
    if (b.winner === 0) won++;
  }
  return Math.round((won / GAMES) * 100);
}

const rows: string[] = [];
for (let n = 1; n <= TOTAL_LEVELS; n++) {
  const cells: number[] = [];
  for (let count = 1; count <= 4; count++) {
    // Plus la rareté est haute, plus on gagne : dès qu'on ne perd plus jamais,
    // les raretés au-dessus valent 100 ; dès qu'on ne gagne plus, celles en
    // dessous valent 0. Ça évite des milliers de combats inutiles.
    const row = new Array<number>(CAPS).fill(-1);
    for (let rank = CAPS - 1; rank >= 0; rank--) {
      if (row[rank + 1] === 0) {
        row[rank] = 0;
        continue;
      }
      row[rank] = winRate(n, count, rank);
    }
    for (let rank = 0; rank < CAPS; rank++) if (rank > 0 && row[rank - 1] >= 100) row[rank] = 100;
    cells.push(...row);
  }
  rows.push(`  '${cells.map((x) => String.fromCharCode(65 + Math.round(x / 4))).join('')}',`);
  process.stdout.write(`niveau ${n}/${TOTAL_LEVELS}\r`);
}

writeFileSync(
  'src/game/challengeTable.ts',
  `/**
 * Généré par scripts/generate-challenges.ts — ne pas modifier à la main.
 *
 * Une ligne par niveau (index 0 = niveau 1), 32 caractères : pour 1, 2, 3 puis
 * 4 cartes, les 8 raretés de Commune à Divine. Chaque caractère code le
 * pourcentage de victoires d'un joueur qui vise bien : de A (0 %) à Z (100 %),
 * par pas de 4 %.
 */
export const CHALLENGE_TABLE: readonly string[] = [
${rows.join('\n')}
];
`,
);
console.log(`\nÉcrit : ${TOTAL_LEVELS} niveaux, ${GAMES} combats par case.`);
