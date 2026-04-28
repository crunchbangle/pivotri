import { GridShape } from '../hexgrid';

// ---- types ------------------------------------------------------------------

export type Player = 'orange' | 'blue';
export type Colour = Player | 'neutral';
export type SlotKey = string; // "col,row"

export interface Move {
    node: SlotKey;
    direction: 1 | -1; // +1 = clockwise (+60°), -1 = counter-clockwise (-60°)
}

export interface GameState {
    shape: GridShape;
    triangles: ReadonlyMap<SlotKey, Colour>;
    turn: Player;
    // The single most recent move, regardless of who made it. The current
    // player can't reverse this on their turn (no-undo of opponent's move).
    lastMove: Move | null;
    moveCount: number;
}

export interface InitialLayout {
    topRows: number;     // top triangle-rows are 'blue' (sky)
    bottomRows: number;  // bottom triangle-rows are 'orange' (earth)
}

export interface MoveResult {
    state: GameState;
    destroyed: number;
    converted: number;
}

export type Reason = 'connection' | 'no-moves' | 'stalemate';

export interface Score {
    orange: number;
    blue: number;
    neutral: number;
}

export interface GameOutcome {
    winner: Player | null;
    reason: Reason;
    finalScore: Score;
    moveCount: number;
}

// ---- rule toggles -----------------------------------------------------------

// CONVERSION_ENABLED: set false to disable conversion entirely.
// DESTRUCTION_ENABLED: set false to disable destruction entirely.
// STRICT_ISOLATION: when true, only triangles with all 3 edge-neighbours
// in-grid are vulnerable (boundary triangles are immune). When false, any
// triangle whose in-grid edge-neighbours are all opposite gets destroyed.
export const CONVERSION_ENABLED = true;
export const DESTRUCTION_ENABLED = true;
export const STRICT_ISOLATION = true;

// ---- helpers ----------------------------------------------------------------

export const opponent = (p: Player): Player => (p === 'orange' ? 'blue' : 'orange');
export const slotKey = (col: number, row: number): SlotKey => `${col},${row}`;
const parseKey = (k: SlotKey): [number, number] => {
    const [c, r] = k.split(',');
    return [Number(c), Number(r)];
};

// 6 surrounding triangle slots, listed clockwise from top-left.
export function surroundingKeys(node: SlotKey): SlotKey[] {
    const [c, r] = parseKey(node);
    return [
        slotKey(c - 1, r),
        slotKey(c, r),
        slotKey(c + 1, r),
        slotKey(c + 1, r + 1),
        slotKey(c, r + 1),
        slotKey(c - 1, r + 1),
    ];
}

// Edge-adjacent triangles in the lattice. Up- and down-triangles have
// different neighbour patterns:
//   up   (col,row): (col-1,row), (col+1,row), (col,row+1)
//   down (col,row): (col-1,row), (col+1,row), (col,row-1)
function edgeNeighbours(key: SlotKey): SlotKey[] {
    const [c, r] = parseKey(key);
    const isUp = (c + r) % 2 === 0;
    return isUp
        ? [slotKey(c - 1, r), slotKey(c + 1, r), slotKey(c, r + 1)]
        : [slotKey(c - 1, r), slotKey(c + 1, r), slotKey(c, r - 1)];
}

// ---- state construction -----------------------------------------------------

export function createInitialState(shape: GridShape, layout: InitialLayout): GameState {
    const triangles = new Map<SlotKey, Colour>();
    const totalRows = shape.totalMUnits * 2;
    for (const t of shape.triangles()) {
        let colour: Colour = 'neutral';
        if (t.row < layout.topRows) colour = 'blue';
        else if (t.row >= totalRows - layout.bottomRows) colour = 'orange';
        triangles.set(slotKey(t.col, t.row), colour);
    }
    return {
        shape,
        triangles,
        turn: 'orange',  // earth moves first
        lastMove: null,
        moveCount: 0,
    };
}

// ---- move enumeration -------------------------------------------------------

export function legalMoves(state: GameState): Move[] {
    const moves: Move[] = [];
    const player = state.turn;
    const lm = state.lastMove;
    for (const node of state.shape.nodes()) {
        const nodeKey = slotKey(node.col, node.row);
        const surrounding = surroundingKeys(nodeKey);
        // Anchoring: at least one of player's colour around the node
        const anchored = surrounding.some(k => state.triangles.get(k) === player);
        if (!anchored) continue;
        // Null-move prevention: rotating a hex where all 6 are your colour
        // is a no-op (no rearrangement, no rule trigger). Disallow.
        const allMine = surrounding.every(k => state.triangles.get(k) === player);
        if (allMine) continue;
        for (const direction of [1, -1] as const) {
            // No-undo: can't immediately reverse own previous move
            if (lm && lm.node === nodeKey && lm.direction === -direction) continue;
            moves.push({ node: nodeKey, direction });
        }
    }
    return moves;
}

// ---- move application -------------------------------------------------------

export function applyMove(state: GameState, move: Move): MoveResult {
    const surrounding = surroundingKeys(move.node);
    const newTriangles = new Map(state.triangles);
    const oldColours = surrounding.map(k => state.triangles.get(k)!);

    // Rotation. CW: new[i] = old[(i + 5) % 6].  CCW: new[i] = old[(i + 1) % 6].
    if (move.direction === 1) {
        for (let i = 0; i < 6; i++) newTriangles.set(surrounding[i], oldColours[(i + 5) % 6]);
    } else {
        for (let i = 0; i < 6; i++) newTriangles.set(surrounding[i], oldColours[(i + 1) % 6]);
    }

    // Single-hex effects, no propagation. Conversion runs first, then
    // destruction. Both impartial (fire based on configuration around the
    // rotated hex, not on who moved).
    const sur = surrounding;
    let totalConverted = 0;
    let totalDestroyed = 0;

    // Conversion at the rotated hex.
    if (CONVERSION_ENABLED) {
        let colours = sur.map(k => newTriangles.get(k)!);
        for (const p of ['orange', 'blue'] as const) {
            const ownsEvens = colours[0] === p && colours[2] === p && colours[4] === p;
            const ownsOdds  = colours[1] === p && colours[3] === p && colours[5] === p;
            if (ownsEvens || ownsOdds) {
                for (let i = 0; i < 6; i++) {
                    if (colours[i] === 'neutral') {
                        newTriangles.set(sur[i], p);
                        totalConverted++;
                    }
                }
                colours = sur.map(k => newTriangles.get(k)!);
            }
        }
    }

    // Isolation-based destruction: any triangle whose in-grid edge-neighbours
    // are all the opposite colour becomes neutral. We check the 6 around the
    // rotated hex (their colours just changed) and their edge-neighbours
    // (their neighbour-set changed). Snapshot-based — no destruction triggers
    // another destruction.
    if (DESTRUCTION_ENABLED) {
        const snapshot = new Map(newTriangles);
        const checkSet = new Set<SlotKey>();
        for (let i = 0; i < 6; i++) {
            checkSet.add(sur[i]);
            for (const n of edgeNeighbours(sur[i])) {
                if (snapshot.has(n)) checkSet.add(n);
            }
        }
        const toDestroy: SlotKey[] = [];
        for (const triKey of checkSet) {
            const colour = snapshot.get(triKey);
            if (colour === undefined || colour === 'neutral') continue;
            const opp = opponent(colour);
            const ngs = edgeNeighbours(triKey).filter(n => snapshot.has(n));
            if (ngs.length === 0) continue;
            if (STRICT_ISOLATION && ngs.length < 3) continue;
            if (ngs.every(n => snapshot.get(n) === opp)) {
                toDestroy.push(triKey);
            }
        }
        for (const triKey of toDestroy) {
            newTriangles.set(triKey, 'neutral');
            totalDestroyed++;
        }
    }

    const player = state.turn;

    return {
        state: {
            shape: state.shape,
            triangles: newTriangles,
            turn: opponent(player),
            lastMove: move,
            moveCount: state.moveCount + 1,
        },
        destroyed: totalDestroyed,
        converted: totalConverted,
    };
}

// ---- scoring ----------------------------------------------------------------

export function score(state: GameState): Score {
    let orange = 0, blue = 0, neutral = 0;
    for (const c of state.triangles.values()) {
        if (c === 'orange') orange++;
        else if (c === 'blue') blue++;
        else neutral++;
    }
    return { orange, blue, neutral };
}

// ---- connection win condition ----------------------------------------------

// True iff `player` has an edge-connected chain of their colour from row 0
// to the last triangle row.
export function hasConnection(state: GameState, player: Player): boolean {
    const totalRows = state.shape.totalMUnits * 2;
    const bottomRow = totalRows - 1;
    const visited = new Set<SlotKey>();
    const queue: SlotKey[] = [];
    for (const t of state.shape.triangles()) {
        if (t.row !== 0) continue;
        const key = slotKey(t.col, t.row);
        if (state.triangles.get(key) === player) {
            queue.push(key);
            visited.add(key);
        }
    }
    while (queue.length > 0) {
        const k = queue.shift()!;
        const [, r] = parseKey(k);
        if (r === bottomRow) return true;
        for (const n of edgeNeighbours(k)) {
            if (visited.has(n)) continue;
            if (state.triangles.get(n) !== player) continue;
            visited.add(n);
            queue.push(n);
        }
    }
    return false;
}

// Cheapest path (in neutral-tile count) from row 0 to the last row through
// `player`-coloured or neutral tiles. Returns Infinity if no such path exists.
// Own tiles cost 0, neutrals cost 1, opponent tiles are blocked. Implemented
// as 0-1 BFS with a deque.
export function connectionDistance(state: GameState, player: Player): number {
    const opp = opponent(player);
    const totalRows = state.shape.totalMUnits * 2;
    const bottomRow = totalRows - 1;

    const dist = new Map<SlotKey, number>();
    // Manual deque using two ends of an array; we treat unshift/push appropriately.
    const deque: Array<[SlotKey, number]> = [];

    for (const t of state.shape.triangles()) {
        if (t.row !== 0) continue;
        const key = slotKey(t.col, t.row);
        const c = state.triangles.get(key);
        if (c === opp) continue;
        const cost = c === player ? 0 : 1;
        if (cost < (dist.get(key) ?? Infinity)) {
            dist.set(key, cost);
            if (cost === 0) deque.unshift([key, cost]);
            else deque.push([key, cost]);
        }
    }

    let best = Infinity;
    while (deque.length > 0) {
        const [key, d] = deque.shift()!;
        if (d > (dist.get(key) ?? Infinity)) continue;
        const [, r] = parseKey(key);
        if (r === bottomRow && d < best) best = d;
        for (const n of edgeNeighbours(key)) {
            if (!state.triangles.has(n)) continue;
            const c = state.triangles.get(n);
            if (c === opp) continue;
            const stepCost = c === player ? 0 : 1;
            const nd = d + stepCost;
            if (nd < (dist.get(n) ?? Infinity)) {
                dist.set(n, nd);
                if (stepCost === 0) deque.unshift([n, nd]);
                else deque.push([n, nd]);
            }
        }
    }
    return best;
}

// ---- terminal check --------------------------------------------------------

export function checkOutcome(state: GameState): GameOutcome | null {
    const s = score(state);
    // Connection check for both players (a move can rearrange opponent pieces too).
    if (hasConnection(state, 'orange')) return { winner: 'orange', reason: 'connection', finalScore: s, moveCount: state.moveCount };
    if (hasConnection(state, 'blue'))   return { winner: 'blue',   reason: 'connection', finalScore: s, moveCount: state.moveCount };
    // No-legal-moves loss (only check for the player whose turn it is now).
    if (legalMoves(state).length === 0) {
        return { winner: opponent(state.turn), reason: 'no-moves', finalScore: s, moveCount: state.moveCount };
    }
    return null;
}
