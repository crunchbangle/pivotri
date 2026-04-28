import { GridShape } from '../hexgrid';
import {
    createInitialState,
    legalMoves,
    applyMove,
    score,
    checkOutcome,
    hasConnection,
    surroundingKeys,
    slotKey,
    Move,
    Colour,
} from './game';
import { describe, test, expect } from '@jest/globals';

const make3x3 = () => createInitialState(GridShape.rectangular(3, 3), { topRows: 2, bottomRows: 2 });

describe('createInitialState', () => {
    test('3x3 with topRows=2 / bottomRows=2 yields 10 blue, 10 orange, 10 neutral', () => {
        const s = score(make3x3());
        expect(s.blue).toBe(10);
        expect(s.orange).toBe(10);
        expect(s.neutral).toBe(10);
    });

    test('blue is on top, orange on bottom', () => {
        const state = make3x3();
        // Top-left triangle (col=0, row=0) is blue
        expect(state.triangles.get('0,0')).toBe('blue');
        // Bottom-left triangle (col=0, row=5) is orange
        expect(state.triangles.get('0,5')).toBe('orange');
    });
});

describe('legalMoves', () => {
    test('orange moves first; only row=3 nodes are legal (row=4 is null-move-blocked)', () => {
        // initial layout: rows 0-1 blue, rows 2-3 neutral, rows 4-5 orange.
        //   row=3 node: surrounds rows 3,4 → 3 neutral + 3 orange → anchored ✓
        //   row=4 node: surrounds rows 4,5 → 6 orange → all mine → null move, blocked
        //   row=2 node: surrounds rows 2,3 → all neutral → not anchored
        //   row=1 node: surrounds rows 1,2 → 3 blue + 3 neutral → not anchored for orange
        const state = make3x3();
        expect(state.turn).toBe('orange');
        const moves = legalMoves(state);
        for (const m of moves) {
            const r = Number(m.node.split(',')[1]);
            expect(r).toBe(3);
        }
        // row=3 has only col=2 in a 3x3 (1 node) × 2 directions = 2 moves
        expect(moves).toHaveLength(2);
    });

    test('null-move prevention: rotating a hex where all 6 are mine is illegal', () => {
        const shape = GridShape.rectangular(3, 3);
        // Build a state where every triangle is orange, then orange's turn.
        const tri = new Map<string, Colour>();
        for (const t of shape.triangles()) tri.set(slotKey(t.col, t.row), 'orange');
        const state = {
            shape,
            triangles: tri,
            turn: 'orange' as const,
            lastMove: new Map(),
            moveCount: 0,
        };
        // Every node is anchored (orange surrounds it) AND all-mine, so no moves at all.
        expect(legalMoves(state)).toHaveLength(0);
    });

    test('no-undo prevents an immediately-reversed rotation', () => {
        let state = make3x3();
        const move: Move = { node: '2,3', direction: 1 };
        // Make sure that move is currently legal
        expect(legalMoves(state).some(m => m.node === move.node && m.direction === move.direction)).toBe(true);
        const afterOrange = applyMove(state, move).state;
        // Blue moves something arbitrary
        const blueMoves = legalMoves(afterOrange);
        const blueMove = blueMoves[0]; // some legal blue move
        const afterBlue = applyMove(afterOrange, blueMove).state;
        // Now it's orange's turn again. The reverse rotation of '2,3' should NOT be legal.
        const orangeAgain = legalMoves(afterBlue);
        expect(orangeAgain.some(m => m.node === '2,3' && m.direction === -1)).toBe(false);
        // The same direction is still legal (continue rotating)
        expect(orangeAgain.some(m => m.node === '2,3' && m.direction === 1)).toBe(true);
    });
});

describe('applyMove rotation mechanics', () => {
    test('clockwise rotation cycles the 6 surrounding contents by 1', () => {
        // Construct a synthetic state where each surrounding slot has a distinct, identifiable colour.
        // We'll use a 3x3 grid and override the triangles map.
        const shape = GridShape.rectangular(3, 3);
        const state = createInitialState(shape, { topRows: 0, bottomRows: 0 });
        // Set the 6 around node (2,3) to follow orange / blue / neutral pattern
        const node = '2,3';
        const surrounding = surroundingKeys(node);
        const tri = new Map<string, Colour>(state.triangles);
        // Slot 0,2,4 = orange, 1,3,5 = blue
        const pattern: Colour[] = ['orange', 'blue', 'orange', 'blue', 'orange', 'blue'];
        surrounding.forEach((k, i) => tri.set(k, pattern[i]));
        // Add an orange anchor so the move is legal
        const stateWithSetup = { ...state, triangles: tri, turn: 'orange' as const };
        const after = applyMove(stateWithSetup, { node, direction: 1 });
        // After CW: new[i] = old[(i+5)%6]
        const newColours = surrounding.map(k => after.state.triangles.get(k)!);
        expect(newColours[0]).toBe(pattern[5]); // blue
        expect(newColours[1]).toBe(pattern[0]); // orange
        expect(newColours[2]).toBe(pattern[1]); // blue
        expect(newColours[3]).toBe(pattern[2]); // orange
        expect(newColours[4]).toBe(pattern[3]); // blue
        expect(newColours[5]).toBe(pattern[4]); // orange
    });

    test('counter-clockwise rotation cycles the 6 surrounding contents by -1', () => {
        const shape = GridShape.rectangular(3, 3);
        const state = createInitialState(shape, { topRows: 0, bottomRows: 0 });
        const node = '2,3';
        const surrounding = surroundingKeys(node);
        const tri = new Map<string, Colour>(state.triangles);
        const pattern: Colour[] = ['orange', 'blue', 'orange', 'blue', 'orange', 'blue'];
        surrounding.forEach((k, i) => tri.set(k, pattern[i]));
        const stateWithSetup = { ...state, triangles: tri, turn: 'orange' as const };
        const after = applyMove(stateWithSetup, { node, direction: -1 });
        const newColours = surrounding.map(k => after.state.triangles.get(k)!);
        // CCW: new[i] = old[(i+1)%6]
        for (let i = 0; i < 6; i++) {
            expect(newColours[i]).toBe(pattern[(i + 1) % 6]);
        }
    });
});

describe('post-move effects', () => {
    test('domination (+2) destroys opponent pieces', () => {
        const shape = GridShape.rectangular(3, 3);
        const state = createInitialState(shape, { topRows: 0, bottomRows: 0 });
        const node = '2,3';
        const surrounding = surroundingKeys(node);
        const tri = new Map<string, Colour>(state.triangles);
        // 4 orange, 2 blue → diff 2 trigger
        const pattern: Colour[] = ['orange', 'orange', 'orange', 'blue', 'orange', 'blue'];
        surrounding.forEach((k, i) => tri.set(k, pattern[i]));
        const stateWithSetup = { ...state, triangles: tri, turn: 'orange' as const };
        const r = applyMove(stateWithSetup, { node, direction: 1 });
        expect(r.destroyed).toBeGreaterThan(0);
        for (const k of surrounding) {
            expect(r.state.triangles.get(k)).not.toBe('blue');
        }
    });

    test('domination does not trigger at +1 (3-2)', () => {
        const shape = GridShape.rectangular(3, 3);
        const state = createInitialState(shape, { topRows: 0, bottomRows: 0 });
        const node = '2,3';
        const surrounding = surroundingKeys(node);
        const tri = new Map<string, Colour>(state.triangles);
        const pattern: Colour[] = ['orange', 'orange', 'orange', 'blue', 'blue', 'neutral'];
        surrounding.forEach((k, i) => tri.set(k, pattern[i]));
        const stateWithSetup = { ...state, triangles: tri, turn: 'orange' as const };
        const r = applyMove(stateWithSetup, { node, direction: 1 });
        expect(r.destroyed).toBe(0);
        const blueStill = surrounding.some(k => r.state.triangles.get(k) === 'blue');
        expect(blueStill).toBe(true);
    });

    test('conversion fires when {0,2,4} is mine and there are no opponents', () => {
        const shape = GridShape.rectangular(3, 3);
        const state = createInitialState(shape, { topRows: 0, bottomRows: 0 });
        const node = '2,3';
        const surrounding = surroundingKeys(node);
        const tri = new Map<string, Colour>(state.triangles);
        // We want post-rotation slots {0,2,4} to be all orange and slots {1,3,5} to be neutral.
        // Apply CCW: new[i] = old[(i+1) % 6], so to get new {0,2,4} = orange, we need
        //   old[1] = orange, old[3] = orange, old[5] = orange, old[0,2,4] = neutral.
        const pattern: Colour[] = ['neutral', 'orange', 'neutral', 'orange', 'neutral', 'orange'];
        surrounding.forEach((k, i) => tri.set(k, pattern[i]));
        const stateWithSetup = { ...state, triangles: tri, turn: 'orange' as const };
        const r = applyMove(stateWithSetup, { node, direction: -1 });
        expect(r.converted).toBe(3);
        for (const k of surrounding) {
            expect(r.state.triangles.get(k)).toBe('orange');
        }
    });

    test('convert+destroy chain: 3 mine + 2 neutral + 1 opp resolves in one move', () => {
        // The user's canonical example. Conversion now runs FIRST and ignores
        // opponent presence; destruction then fires on the post-conversion counts.
        //
        // Build a state where after a CCW rotation the surrounding is:
        //   {0,2,4} = orange (3 owned at 120°)
        //   {1,3,5} = neutral, neutral, blue
        //
        // CCW: new[i] = old[(i+1)%6] → choose pre such that:
        //   pre[1] = orange, pre[3] = orange, pre[5] = orange,
        //   pre[2] = neutral, pre[4] = neutral, pre[0] = blue
        const shape = GridShape.rectangular(3, 3);
        const state = createInitialState(shape, { topRows: 0, bottomRows: 0 });
        const node = '2,3';
        const surrounding = surroundingKeys(node);
        const tri = new Map<string, Colour>(state.triangles);
        const pre: Colour[] = ['blue', 'orange', 'neutral', 'orange', 'neutral', 'orange'];
        surrounding.forEach((k, i) => tri.set(k, pre[i]));
        const setup = { ...state, triangles: tri, turn: 'orange' as const };
        const r = applyMove(setup, { node, direction: -1 });

        // Expectation: 2 neutrals converted to orange (they were in {1,3,5} after rotation? Let's verify).
        // After CCW: new = [pre1, pre2, pre3, pre4, pre5, pre0]
        //                = [orange, neutral, orange, neutral, orange, blue]
        // {0,2,4} = [orange, orange, orange] ✓ — orange converts {1,3,5} neutrals → orange.
        //   slot 1 (neutral) → orange, slot 3 (neutral) → orange, slot 5 (blue) untouched.
        // After conversion: [orange, orange, orange, orange, orange, blue]. 5 orange, 1 blue.
        // Destruction: 5 vs 1 = +4 → blue piece becomes neutral.
        // End: 5 orange, 1 neutral.
        expect(r.converted).toBe(2);
        expect(r.destroyed).toBe(1);
        const finalCounts = surrounding.reduce((acc, k) => {
            const c = r.state.triangles.get(k)!;
            acc[c] = (acc[c] ?? 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        expect(finalCounts['orange']).toBe(5);
        expect(finalCounts['blue']).toBe(undefined);
        expect(finalCounts['neutral']).toBe(1);
    });

    test('impartial: opponent gets the destruction even though I moved', () => {
        // Orange rotates a hex and ends up with 2 orange + 4 blue. Under
        // impartial rules, BLUE's +2 destroys orange's pieces.
        const shape = GridShape.rectangular(3, 3);
        const state = createInitialState(shape, { topRows: 0, bottomRows: 0 });
        const node = '2,3';
        const surrounding = surroundingKeys(node);
        const tri = new Map<string, Colour>(state.triangles);
        const pre: Colour[] = ['orange', 'blue', 'blue', 'orange', 'blue', 'blue'];
        surrounding.forEach((k, i) => tri.set(k, pre[i]));
        const setup = { ...state, triangles: tri, turn: 'orange' as const };
        const r = applyMove(setup, { node, direction: 1 });
        const finalOrange = surrounding.filter(k => r.state.triangles.get(k) === 'orange').length;
        const finalBlue   = surrounding.filter(k => r.state.triangles.get(k) === 'blue').length;
        expect(finalOrange).toBe(0);
        expect(finalBlue).toBe(4);
        expect(r.destroyed).toBe(2);
    });

    test('impartial: opponent gets a conversion on my move if their subset ends up owned', () => {
        // After orange's rotation, blue ends up owning {0,2,4} and there are
        // some neutrals — blue's conversion fires.
        const shape = GridShape.rectangular(3, 3);
        const state = createInitialState(shape, { topRows: 0, bottomRows: 0 });
        const node = '2,3';
        const surrounding = surroundingKeys(node);
        const tri = new Map<string, Colour>(state.triangles);
        // After CW rotation we want: new = [blue, orange, blue, neutral, blue, neutral]
        //   {0,2,4} = blue, blue, blue ✓. {1,3,5} = orange, neutral, neutral.
        // CW: new[i] = old[(i+5)%6], so old[(i+5)%6] = desired new[i]
        //   new[0]=blue → old[5]=blue
        //   new[1]=orange → old[0]=orange
        //   new[2]=blue → old[1]=blue
        //   new[3]=neutral → old[2]=neutral
        //   new[4]=blue → old[3]=blue
        //   new[5]=neutral → old[4]=neutral
        const pre: Colour[] = ['orange', 'blue', 'neutral', 'blue', 'neutral', 'blue'];
        surrounding.forEach((k, i) => tri.set(k, pre[i]));
        const setup = { ...state, triangles: tri, turn: 'orange' as const };
        const r = applyMove(setup, { node, direction: 1 });
        // blue converts the 2 neutrals to blue. After: 5 blue + 1 orange.
        // Destruction: 5 vs 1 = +4 → orange piece destroyed. End: 5 blue + 1 neutral.
        const finalBlue   = surrounding.filter(k => r.state.triangles.get(k) === 'blue').length;
        const finalOrange = surrounding.filter(k => r.state.triangles.get(k) === 'orange').length;
        expect(finalBlue).toBe(5);
        expect(finalOrange).toBe(0);
        expect(r.converted).toBe(2);
        expect(r.destroyed).toBe(1);
    });

    test('both subsets owned (3 mine + 3 opp, alternating) → both conversions trigger but no neutrals; no destruction', () => {
        const shape = GridShape.rectangular(3, 3);
        const state = createInitialState(shape, { topRows: 0, bottomRows: 0 });
        const node = '2,3';
        const surrounding = surroundingKeys(node);
        const tri = new Map<string, Colour>(state.triangles);
        // Pre: alternating orange/blue. After CW: also alternating, just shifted.
        const pre: Colour[] = ['orange', 'blue', 'orange', 'blue', 'orange', 'blue'];
        surrounding.forEach((k, i) => tri.set(k, pre[i]));
        const setup = { ...state, triangles: tri, turn: 'orange' as const };
        const r = applyMove(setup, { node, direction: 1 });
        // No neutrals, so conversions do nothing. Counts 3-3 → no destruction.
        expect(r.converted).toBe(0);
        expect(r.destroyed).toBe(0);
        const orange = surrounding.filter(k => r.state.triangles.get(k) === 'orange').length;
        const blue   = surrounding.filter(k => r.state.triangles.get(k) === 'blue').length;
        expect(orange).toBe(3);
        expect(blue).toBe(3);
    });
});

describe('hasConnection', () => {
    test('initial 3x3 state has no connection for either player', () => {
        const state = make3x3();
        expect(hasConnection(state, 'orange')).toBe(false);
        expect(hasConnection(state, 'blue')).toBe(false);
    });

    test('a hand-crafted full-column orange chain connects', () => {
        const shape = GridShape.rectangular(3, 3);
        const state = createInitialState(shape, { topRows: 0, bottomRows: 0 });
        // Place orange at (0,0), (0,1), (1,1), (1,2), (0,2), (0,3), (1,3), (1,4), (0,4), (0,5).
        // Chain: each consecutive pair must be edge-adjacent. Use the chain I worked out by hand.
        const chain: [number, number][] = [
            [0, 0], [0, 1], [1, 1], [1, 2], [0, 2], [0, 3], [1, 3], [1, 4], [0, 4], [0, 5],
        ];
        const tri = new Map<string, Colour>(state.triangles);
        for (const [c, r] of chain) tri.set(slotKey(c, r), 'orange');
        const orangeChain = { ...state, triangles: tri };
        expect(hasConnection(orangeChain, 'orange')).toBe(true);
    });
});

describe('checkOutcome', () => {
    test('returns null on an undecided initial state', () => {
        expect(checkOutcome(make3x3())).toBeNull();
    });
});
