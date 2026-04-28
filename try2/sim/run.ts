import * as fs from 'fs';
import * as path from 'path';
import { GridShape } from '../hexgrid';
import { createInitialState } from './game';
import { randomAgent, greedyAgent, lookaheadAgent } from './agents';
import { runMany, Stats } from './simulator';

const shape = GridShape.rectangular(3, 3);
const layout = { topRows: 2, bottomRows: 2 };
const factory = () => createInitialState(shape, layout);

function fmt(stats: Stats): string {
    const total = stats.orangeWins + stats.blueWins + stats.draws;
    const pct = (n: number) => (total > 0 ? (100 * n / total).toFixed(1) : '0.0');
    const reasons = Object.entries(stats.reasonCounts).map(([k, v]) => `${k} ${v}`).join(', ');
    const sd = stats.shortestDecisive;
    const sdLine = sd
        ? `  Shortest decisive game: ${sd.moveCount} moves, ${sd.winner} won`
        : `  Shortest decisive game: (none)`;
    return [
        `  Games: ${stats.games}`,
        `  Wins: orange ${stats.orangeWins} (${pct(stats.orangeWins)}%), blue ${stats.blueWins} (${pct(stats.blueWins)}%), draws ${stats.draws}`,
        `  Reasons: ${reasons}`,
        `  Moves: mean ${stats.moveCounts.mean.toFixed(1)}, median ${stats.moveCounts.median}, min ${stats.moveCounts.min}, max ${stats.moveCounts.max}`,
        `  Per game: destroyed ${stats.avgDestroyed.toFixed(2)}, converted ${stats.avgConverted.toFixed(2)}`,
        `  Moves triggering rules: destruction ${stats.avgMovesWithDestruction.toFixed(2)}, conversion ${stats.avgMovesWithConversion.toFixed(2)}, both ${stats.avgMovesWithBoth.toFixed(2)}`,
        sdLine,
    ].join('\n');
}

const allStats: Array<{ name: string; stats: Stats }> = [];

function section(name: string, fn: () => Stats) {
    const t0 = Date.now();
    const stats = fn();
    const dt = Date.now() - t0;
    console.log(`\n${name}  (${dt} ms)`);
    console.log(fmt(stats));
    allStats.push({ name, stats });
}

section('Random vs Random (2000 games)',
    () => runMany(2000, factory, randomAgent(), randomAgent()));

section('Greedy(orange) vs Random(blue) (500 games)',
    () => runMany(500, factory, greedyAgent(), randomAgent()));

section('Random(orange) vs Greedy(blue) (500 games)',
    () => runMany(500, factory, randomAgent(), greedyAgent()));

section('Greedy vs Greedy (500 games)',
    () => runMany(500, factory, greedyAgent(), greedyAgent()));

section('Lookahead-2(orange) vs Greedy(blue) (100 games)',
    () => runMany(100, factory, lookaheadAgent(2), greedyAgent()));

section('Lookahead-3(orange) vs Greedy(blue) (50 games)',
    () => runMany(50, factory, lookaheadAgent(3), greedyAgent()));

section('Lookahead-3 vs Lookahead-2 (50 games)',
    () => runMany(50, factory, lookaheadAgent(3), lookaheadAgent(2)));

// Prefer the shortest decisive game from a lookahead-vs-greedy matchup —
// that's the most interesting watch (clear strategic depth + visible
// counter-play). Fall back to any non-Random matchup if no lookahead-vs-
// -greedy game decided.
const isPreferred = (name: string) => /Lookahead/i.test(name) && /Greedy/i.test(name) && !/Lookahead.*Lookahead/i.test(name);
let bestName = '';
let best: NonNullable<Stats['shortestDecisive']> | null = null;
for (const { name, stats } of allStats) {
    if (!isPreferred(name)) continue;
    const sd = stats.shortestDecisive;
    if (sd && (best === null || sd.moveCount < best.moveCount)) {
        best = sd;
        bestName = name;
    }
}
if (best === null) {
    for (const { name, stats } of allStats) {
        if (/Random/.test(name)) continue;
        const sd = stats.shortestDecisive;
        if (sd && (best === null || sd.moveCount < best.moveCount)) {
            best = sd;
            bestName = name;
        }
    }
}

if (best !== null) {
    const out = {
        sourceMatchup: bestName,
        moveCount: best.moveCount,
        winner: best.winner,
        layout: { mUnits: 3, nUnits: 3, topRows: layout.topRows, bottomRows: layout.bottomRows },
        history: best.history,
    };
    const outPath = path.resolve(__dirname, 'shortest-game.json');
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`\nShortest decisive game across all matchups: ${best.moveCount} moves (${best.winner} won, from "${bestName}")`);
    console.log(`Saved to ${outPath}`);
} else {
    console.log('\nNo decisive games found in any matchup.');
}
