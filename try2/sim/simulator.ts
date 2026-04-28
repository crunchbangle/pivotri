import { GameState, GameOutcome, Move, applyMove, checkOutcome, score, opponent } from './game';
import { Agent } from './agents';

export interface SimResult {
    outcome: GameOutcome;
    history: Move[];
    totalDestroyed: number;
    totalConverted: number;
    movesWithDestruction: number;
    movesWithConversion: number;
    movesWithBoth: number;
}

const MAX_MOVES = 200;

export function playGame(initial: GameState, agentOrange: Agent, agentBlue: Agent): SimResult {
    let state = initial;
    const history: Move[] = [];
    let totalDestroyed = 0, totalConverted = 0;
    let movesWithDestruction = 0, movesWithConversion = 0, movesWithBoth = 0;

    let outcome = checkOutcome(state);
    while (outcome === null) {
        if (state.moveCount >= MAX_MOVES) {
            return {
                outcome: { winner: null, reason: 'stalemate', finalScore: score(state), moveCount: state.moveCount },
                history,
                totalDestroyed, totalConverted,
                movesWithDestruction, movesWithConversion, movesWithBoth,
            };
        }
        const agent = state.turn === 'orange' ? agentOrange : agentBlue;
        const move = agent(state);
        if (move === null) {
            return {
                outcome: { winner: opponent(state.turn), reason: 'no-moves', finalScore: score(state), moveCount: state.moveCount },
                history,
                totalDestroyed, totalConverted,
                movesWithDestruction, movesWithConversion, movesWithBoth,
            };
        }
        history.push(move);
        const r = applyMove(state, move);
        state = r.state;
        totalDestroyed += r.destroyed;
        totalConverted += r.converted;
        if (r.destroyed > 0) movesWithDestruction++;
        if (r.converted > 0) movesWithConversion++;
        if (r.destroyed > 0 && r.converted > 0) movesWithBoth++;
        outcome = checkOutcome(state);
    }

    return {
        outcome,
        history,
        totalDestroyed, totalConverted,
        movesWithDestruction, movesWithConversion, movesWithBoth,
    };
}

export interface Stats {
    games: number;
    orangeWins: number;
    blueWins: number;
    draws: number;
    reasonCounts: Record<string, number>;
    moveCounts: { mean: number; median: number; min: number; max: number };
    avgDestroyed: number;
    avgConverted: number;
    avgMovesWithDestruction: number;
    avgMovesWithConversion: number;
    avgMovesWithBoth: number;
    shortestDecisive: { moveCount: number; winner: 'orange' | 'blue'; history: Move[] } | null;
}

export function runMany(
    n: number,
    initialStateFactory: () => GameState,
    agentOrange: Agent,
    agentBlue: Agent
): Stats {
    let orangeWins = 0, blueWins = 0, draws = 0;
    const reasonCounts: Record<string, number> = { connection: 0, 'no-moves': 0, stalemate: 0 };
    const moves: number[] = [];
    let totalDestroyed = 0, totalConverted = 0;
    let totalMovesDestruction = 0, totalMovesConversion = 0, totalMovesBoth = 0;
    let shortestDecisive: Stats['shortestDecisive'] = null;

    for (let i = 0; i < n; i++) {
        const r = playGame(initialStateFactory(), agentOrange, agentBlue);
        if (r.outcome.winner === 'orange') orangeWins++;
        else if (r.outcome.winner === 'blue') blueWins++;
        else draws++;
        reasonCounts[r.outcome.reason] = (reasonCounts[r.outcome.reason] ?? 0) + 1;
        moves.push(r.outcome.moveCount);
        totalDestroyed += r.totalDestroyed;
        totalConverted += r.totalConverted;
        totalMovesDestruction += r.movesWithDestruction;
        totalMovesConversion += r.movesWithConversion;
        totalMovesBoth += r.movesWithBoth;

        if (r.outcome.winner !== null) {
            if (shortestDecisive === null || r.outcome.moveCount < shortestDecisive.moveCount) {
                shortestDecisive = {
                    moveCount: r.outcome.moveCount,
                    winner: r.outcome.winner,
                    history: r.history,
                };
            }
        }
    }

    moves.sort((a, b) => a - b);
    return {
        games: n,
        orangeWins, blueWins, draws,
        reasonCounts,
        moveCounts: {
            mean: moves.reduce((s, v) => s + v, 0) / moves.length,
            median: moves[Math.floor(moves.length / 2)],
            min: moves[0],
            max: moves[moves.length - 1],
        },
        avgDestroyed: totalDestroyed / n,
        avgConverted: totalConverted / n,
        avgMovesWithDestruction: totalMovesDestruction / n,
        avgMovesWithConversion: totalMovesConversion / n,
        avgMovesWithBoth: totalMovesBoth / n,
        shortestDecisive,
    };
}
