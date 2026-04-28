// One-off script to find and save the shortest decisive game from a single
// matchup (faster than re-running the full sim suite). Used to refresh
// shortest-game.json with a strategically interesting matchup.

import * as fs from 'fs';
import * as path from 'path';
import { GridShape } from '../hexgrid';
import { createInitialState } from './game';
import { lookaheadAgent, greedyAgent } from './agents';
import { runMany } from './simulator';

const shape = GridShape.rectangular(3, 3);
const layout = { topRows: 2, bottomRows: 2 };
const factory = () => createInitialState(shape, layout);

const matchup = 'Lookahead-2(orange) vs Greedy(blue)';
const games = 100;

console.log(`Running ${games} games of ${matchup}...`);
const t0 = Date.now();
const stats = runMany(games, factory, lookaheadAgent(2), greedyAgent());
const dt = Date.now() - t0;
console.log(`Done in ${dt} ms.`);
console.log(`Wins: orange ${stats.orangeWins}, blue ${stats.blueWins}, draws ${stats.draws}`);

const sd = stats.shortestDecisive;
if (sd) {
    const out = {
        sourceMatchup: matchup,
        moveCount: sd.moveCount,
        winner: sd.winner,
        layout: { mUnits: 3, nUnits: 3, ...layout },
        history: sd.history,
    };
    const outPath = path.resolve(__dirname, 'shortest-game.json');
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`Saved ${sd.moveCount}-move game (${sd.winner} won) to ${outPath}`);
} else {
    console.log('No decisive games found in this run.');
}
