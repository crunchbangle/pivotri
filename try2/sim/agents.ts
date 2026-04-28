import { GameState, Move, Player, applyMove, legalMoves, score, hasConnection, connectionDistance } from './game';

export type Agent = (state: GameState) => Move | null;

function pickRandom<T>(arr: T[], rng: () => number): T {
    return arr[Math.floor(rng() * arr.length)];
}

// Heuristic value of a state from `me`'s perspective.
//   Wins/losses dominate everything.
//   Otherwise: connection-distance differential (heavily weighted) +
//   piece-count tiebreaker.
function evaluate(state: GameState, me: Player): number {
    const opp: Player = me === 'orange' ? 'blue' : 'orange';
    if (hasConnection(state, me))  return 1e9;
    if (hasConnection(state, opp)) return -1e9;

    const myDist = connectionDistance(state, me);
    const oppDist = connectionDistance(state, opp);
    if (myDist === Infinity && oppDist === Infinity) return 0;
    if (myDist === Infinity)  return -5e8; // I can't connect through any path
    if (oppDist === Infinity) return  5e8; // Opponent can't connect

    const s = score(state);
    const pieceDiff = me === 'orange' ? s.orange - s.blue : s.blue - s.orange;
    // 100x weight on distance differential keeps it dominant over piece diff.
    return (oppDist - myDist) * 100 + pieceDiff;
}

export function randomAgent(rng: () => number = Math.random): Agent {
    return (state) => {
        const moves = legalMoves(state);
        if (moves.length === 0) return null;
        return pickRandom(moves, rng);
    };
}

// Greedy: pick the move that maximises my evaluate() one step ahead.
export function greedyAgent(rng: () => number = Math.random): Agent {
    return (state) => {
        const moves = legalMoves(state);
        if (moves.length === 0) return null;
        const me = state.turn;
        let best = -Infinity;
        let candidates: Move[] = [];
        for (const m of moves) {
            const r = applyMove(state, m);
            const v = evaluate(r.state, me);
            if (v > best) { best = v; candidates = [m]; }
            else if (v === best) candidates.push(m);
        }
        return pickRandom(candidates, rng);
    };
}

// Minimax to `plies` ply, no pruning. Plies = 1 is greedy.
export function lookaheadAgent(plies: number, rng: () => number = Math.random): Agent {
    function valueOf(state: GameState, depth: number, me: Player): number {
        if (depth === 0) return evaluate(state, me);
        if (hasConnection(state, me))  return 1e9;
        const opp: Player = me === 'orange' ? 'blue' : 'orange';
        if (hasConnection(state, opp)) return -1e9;
        const moves = legalMoves(state);
        if (moves.length === 0) return state.turn === me ? -1e9 : 1e9;
        const isMyTurn = state.turn === me;
        let best = isMyTurn ? -Infinity : Infinity;
        for (const m of moves) {
            const r = applyMove(state, m);
            const v = valueOf(r.state, depth - 1, me);
            if (isMyTurn) { if (v > best) best = v; }
            else { if (v < best) best = v; }
        }
        return best;
    }
    return (state) => {
        const moves = legalMoves(state);
        if (moves.length === 0) return null;
        const me = state.turn;
        let best = -Infinity;
        let candidates: Move[] = [];
        for (const m of moves) {
            const r = applyMove(state, m);
            const v = valueOf(r.state, plies - 1, me);
            if (v > best) { best = v; candidates = [m]; }
            else if (v === best) candidates.push(m);
        }
        return pickRandom(candidates, rng);
    };
}
