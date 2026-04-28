import Konva from 'konva';
import { GridShape } from './hexgrid';
import { config } from './config';
import {
    createInitialState,
    applyMove,
    legalMoves as gameLegalMoves,
    checkOutcome,
    score as gameScore,
    GameState,
    Move,
    Colour,
    Player,
} from './sim/game';

const SQRT3 = Math.sqrt(3);

// ---- geometry ---------------------------------------------------------------

const L = config.nodeSpacing;
const H = L * SQRT3 / 2;
const PAD = config.padding;

function trianglePixelCentroid(col: number, row: number): { x: number; y: number } {
    const isUp = (col + row) % 2 === 0;
    return {
        x: (col + 1) * L / 2 + PAD,
        y: (row + (isUp ? 2 / 3 : 1 / 3)) * H + PAD,
    };
}

function nodePixel(col: number, row: number): { x: number; y: number } {
    return {
        x: (col + 1) * L / 2 + PAD,
        y: (row + 1) * H + PAD,
    };
}

// Equilateral triangle of side `s`, centred on origin, in Konva polygon-points form.
function trianglePoints(s: number, isUp: boolean): number[] {
    const rCirc = s / SQRT3;       // centroid → vertex
    const rIn = s * SQRT3 / 6;     // centroid → edge midpoint
    return isUp
        ? [0, -rCirc, -s / 2, rIn,  s / 2, rIn]
        : [0,  rCirc, -s / 2, -rIn, s / 2, -rIn];
}

function initialColor(_col: number, row: number): string {
    // Top M-unit (= first 2 triangle-rows) is amber; bottom M-unit is blue.
    if (row < 2) return config.topBorderColor;
    if (row >= config.mUnits * 2 - 2) return config.bottomBorderColor;
    return config.interiorColor;
}

// ---- shape & stage ----------------------------------------------------------

const shape = GridShape.rectangular(config.mUnits, config.nUnits);

const canvasWidth = config.nUnits * L + PAD * 2;
const canvasHeight = config.mUnits * 2 * H + PAD * 2;

document.body.style.background = config.backgroundColor;

const stage = new Konva.Stage({
    container: 'container',
    width: canvasWidth,
    height: canvasHeight,
});

const trianglesLayer = new Konva.Layer();
const nodesLayer = new Konva.Layer();
stage.add(trianglesLayer);
stage.add(nodesLayer);

// ---- triangles --------------------------------------------------------------

interface TriangleData {
    poly: Konva.Line;
    rotationAccum: number;
}

const slotKey = (col: number, row: number) => `${col},${row}`;
const triangles = new Map<string, TriangleData>();

for (const t of shape.triangles()) {
    const isUp = (t.col + t.row) % 2 === 0;
    const c = trianglePixelCentroid(t.col, t.row);
    const poly = new Konva.Line({
        points: trianglePoints(config.triangleSide, isUp),
        x: c.x,
        y: c.y,
        rotation: 0,
        fill: initialColor(t.col, t.row),
        stroke: config.triangleStroke ?? undefined,
        strokeWidth: config.triangleStrokeWidth,
        closed: true,
    });
    trianglesLayer.add(poly);
    triangles.set(slotKey(t.col, t.row), { poly, rotationAccum: 0 });
}

// ---- game state (silent layer) ---------------------------------------------
// The renderer above is the "native game": free rotation, no rule effects.
// The GameState below mirrors every rotation and tracks rule-aware effects
// (conversion, destruction, turns) for the sidebar. It does not currently
// drive any visible change in the playground.

let gameState: GameState = createInitialState(shape, { topRows: 2, bottomRows: 2 });
const cumulative = {
    orangeGained: 0, orangeLost: 0,
    blueGained: 0,   blueLost: 0,
};

function setText(id: string, val: number | string) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
}

function updateSidebar() {
    const s = gameScore(gameState);
    setText('move-count', gameState.moveCount);
    setText('orange-count', s.orange);
    setText('blue-count', s.blue);
    setText('orange-gained', cumulative.orangeGained);
    setText('orange-lost', cumulative.orangeLost);
    setText('blue-gained', cumulative.blueGained);
    setText('blue-lost', cumulative.blueLost);
    const turnEl = document.getElementById('current-turn');
    if (turnEl) {
        turnEl.textContent = gameState.turn === 'orange' ? 'Earth' : 'Sky';
        turnEl.className = `turn-indicator turn-${gameState.turn}`;
    }
}

updateSidebar();

// ---- rules-on toggle: visualise rule effects (conversion / destruction) ----

function rulesEnabled(): boolean {
    const cb = document.getElementById('rules-toggle') as HTMLInputElement | null;
    return cb?.checked ?? false;
}

function fillFor(c: Colour): string {
    if (c === 'orange') return config.bottomBorderColor;
    if (c === 'blue')   return config.topBorderColor;
    return config.interiorColor;
}

// Compare the current Konva fills against gameState.triangles and animate any
// triangle whose colour has fallen out of sync (i.e. rule effects fired since
// the last visual update).
function visualiseEffects(animate: boolean) {
    for (const [slotK, triData] of triangles.entries()) {
        const stateColor = gameState.triangles.get(slotK);
        if (!stateColor) continue;
        const expectedFill = fillFor(stateColor);
        if (triData.poly.fill() === expectedFill) continue;
        if (animate) {
            new Konva.Tween({
                node: triData.poly,
                fill: expectedFill,
                duration: 0.3,
                easing: Konva.Easings.EaseOut,
            }).play();
        } else {
            triData.poly.fill(expectedFill);
        }
    }
    if (!animate) trianglesLayer.batchDraw();
}

// When the user toggles the checkbox, snap-sync visuals to current state and
// refresh the legal-pivot highlights to match the rules-on/off mode.
document.getElementById('rules-toggle')?.addEventListener('change', () => {
    if (rulesEnabled()) visualiseEffects(false);
    updateLegalHighlights();
});

// ---- game-over banner ------------------------------------------------------

function showWinner(winner: Player) {
    const banner = document.getElementById('game-over-banner');
    const text = document.getElementById('winner-text');
    if (!banner || !text) return;
    text.textContent = (winner === 'orange' ? 'Earth' : 'Sky') + ' wins!';
    text.className = `winner-text turn-${winner}`;
    banner.classList.remove('hidden');
}

function hideWinner() {
    document.getElementById('game-over-banner')?.classList.add('hidden');
}

// ---- reset (used by "New game" and later by the demo button) ---------------

function resetGame() {
    // Reset each slot's colour to the initial layout. Shapes don't need to
    // move — the rotation invariant guarantees their visual orientation
    // already matches whichever slot they're currently in.
    for (const [slot, data] of triangles.entries()) {
        const [col, row] = slot.split(',').map(Number);
        data.poly.fill(initialColor(col, row));
    }
    gameState = createInitialState(shape, { topRows: 2, bottomRows: 2 });
    cumulative.orangeGained = 0;
    cumulative.orangeLost = 0;
    cumulative.blueGained = 0;
    cumulative.blueLost = 0;
    hideWinner();
    updateSidebar();
    updateLegalHighlights();
    trianglesLayer.batchDraw();
}

document.getElementById('new-game-btn')?.addEventListener('click', resetGame);

// ---- demo: replay a saved game from the simulator -------------------------

let demoRunning = false;

async function playDemo() {
    if (demoRunning) return;
    const btn = document.getElementById('demo-btn') as HTMLButtonElement | null;
    let data: { history: Move[] };
    try {
        const response = await fetch('sim/shortest-game.json');
        if (!response.ok) {
            console.warn('Demo file not found — run `npm run sim` to generate one.');
            return;
        }
        data = await response.json();
    } catch (err) {
        console.warn('Failed to load demo:', err);
        return;
    }

    demoRunning = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Playing demo…'; }

    // Force rules on so effects animate.
    const toggle = document.getElementById('rules-toggle') as HTMLInputElement | null;
    if (toggle && !toggle.checked) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
    }

    resetGame();
    await new Promise(r => setTimeout(r, 400));

    try {
        for (const move of data.history) {
            if (!demoRunning) break; // allow abort via reset
            const [col, row] = move.node.split(',').map(Number);
            await rotateAroundNode(col, row, move.direction as 1 | -1);
            // Pacing: rotation animation is ~300ms; this delay brings the
            // total to ~1s per move so the demo is followable.
            await new Promise(r => setTimeout(r, 700));
        }
    } finally {
        demoRunning = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Play demo'; }
    }
}

document.getElementById('demo-btn')?.addEventListener('click', () => { void playDemo(); });

// ---- nodes (clickable pivots) ----------------------------------------------

let isAnimating = false;

// Suppress the browser's context menu over the whole stage so right-clicks
// don't pop the menu; we don't use right-click as an input.
stage.container().addEventListener('contextmenu', (e) => e.preventDefault());

const nodeArcs = new Map<string, { ccw: Konva.Arc; cw: Konva.Arc }>();
const nodeDividers = new Map<string, Konva.Line>();
const nodeArrows = new Map<string, { ccw: Konva.Text; cw: Konva.Text }>();

function isLegal(nodeCol: number, nodeRow: number, direction: 1 | -1): boolean {
    const node = `${nodeCol},${nodeRow}`;
    return gameLegalMoves(gameState).some(m => m.node === node && m.direction === direction);
}

function updateLegalHighlights() {
    const rulesOn = rulesEnabled();
    const moves = rulesOn ? gameLegalMoves(gameState) : [];
    const turnFill = fillFor(gameState.turn);
    const legalDirs = new Map<string, Set<number>>();
    for (const m of moves) {
        if (!legalDirs.has(m.node)) legalDirs.set(m.node, new Set());
        legalDirs.get(m.node)!.add(m.direction);
    }
    for (const [nodeKey, arcs] of nodeArcs.entries()) {
        const dirs = legalDirs.get(nodeKey);
        // In rules-off mode, all halves are clickable in dark grey (so the
        // free-rotation playground still has visible click targets). In
        // rules-on mode, only legal halves are visible/clickable.
        const cwLegal  = !rulesOn || (dirs?.has(1)  ?? false);
        const ccwLegal = !rulesOn || (dirs?.has(-1) ?? false);
        const cwFill  = rulesOn ? (cwLegal  ? turnFill : '') : config.nodeColor;
        const ccwFill = rulesOn ? (ccwLegal ? turnFill : '') : config.nodeColor;
        arcs.cw.fill(cwFill);
        arcs.ccw.fill(ccwFill);
        arcs.cw.listening(cwLegal);
        arcs.ccw.listening(ccwLegal);
        const div = nodeDividers.get(nodeKey);
        if (div) div.visible(cwLegal || ccwLegal);
        const arrows = nodeArrows.get(nodeKey);
        if (arrows) {
            arrows.cw.visible(cwLegal);
            arrows.ccw.visible(ccwLegal);
        }
    }
    nodesLayer.batchDraw();
}

// Each pivot is two clickable half-pies (CW = right half, CCW = left half).
// They show in the player's colour when that direction is legal (rules on),
// in dark grey in free-rotation mode, and hide in rules-on / illegal cases.
const arcOuter = config.nodeRadius + 4;

function makeArc(x: number, y: number, rotation: number): Konva.Arc {
    return new Konva.Arc({
        x, y,
        innerRadius: 0,
        outerRadius: arcOuter,
        angle: 180,
        rotation,
        fill: '',
        listening: true,
    });
}

function makeArrow(x: number, y: number, symbol: string): Konva.Text {
    const t = new Konva.Text({
        text: symbol,
        fontSize: 18,
        fontStyle: 'bold',
        fill: 'white',
        listening: false,
    });
    // Centre on the requested point.
    t.x(x - t.width() / 2);
    t.y(y - t.height() / 2);
    return t;
}

for (const n of shape.nodes()) {
    const p = nodePixel(n.col, n.row);
    const arrowOffset = arcOuter * 0.55;

    // Right half (CW): start at 12 o'clock, sweep 180° clockwise via 3 to 6.
    const cwArc  = makeArc(p.x, p.y, -90);
    // Left half (CCW): start at 6 o'clock, sweep 180° clockwise via 9 to 12.
    const ccwArc = makeArc(p.x, p.y,  90);
    nodesLayer.add(cwArc);
    nodesLayer.add(ccwArc);

    function attachHandler(arc: Konva.Arc, direction: 1 | -1) {
        arc.on('click tap', (e) => {
            const btn = (e.evt as MouseEvent | undefined)?.button;
            if (btn !== undefined && btn !== 0) return;
            if (isAnimating) return;
            if (rulesEnabled() && !isLegal(n.col, n.row, direction)) return;
            rotateAroundNode(n.col, n.row, direction);
        });
    }
    attachHandler(cwArc, 1);
    attachHandler(ccwArc, -1);

    // Vertical divider so the split between the two halves is visible.
    const dividerExtent = arcOuter + 2;
    const divider = new Konva.Line({
        points: [p.x, p.y - dividerExtent, p.x, p.y + dividerExtent],
        stroke: 'white',
        strokeWidth: 2,
        listening: false,
        visible: false,
    });
    nodesLayer.add(divider);

    // Direction arrows (unicode rotation glyphs).
    const cwArrow  = makeArrow(p.x + arrowOffset, p.y, '↻');
    const ccwArrow = makeArrow(p.x - arrowOffset, p.y, '↺');
    nodesLayer.add(cwArrow);
    nodesLayer.add(ccwArrow);

    nodeArcs.set(`${n.col},${n.row}`,    { cw: cwArc,    ccw: ccwArc });
    nodeDividers.set(`${n.col},${n.row}`, divider);
    nodeArrows.set(`${n.col},${n.row}`,  { cw: cwArrow,  ccw: ccwArrow });
}

// Initial highlight pass (no-op when rules are off, which is the default).
updateLegalHighlights();

// ---- rotation ---------------------------------------------------------------

// 6 surrounding triangle slots, listed clockwise starting at top-left.
function surroundingSlots(nodeCol: number, nodeRow: number) {
    return [
        { col: nodeCol - 1, row: nodeRow     },
        { col: nodeCol,     row: nodeRow     },
        { col: nodeCol + 1, row: nodeRow     },
        { col: nodeCol + 1, row: nodeRow + 1 },
        { col: nodeCol,     row: nodeRow + 1 },
        { col: nodeCol - 1, row: nodeRow + 1 },
    ];
}

function rotateAroundNode(nodeCol: number, nodeRow: number, direction: 1 | -1): Promise<void> {
    return new Promise<void>((resolve) => {
    const slots = surroundingSlots(nodeCol, nodeRow);
    const node = nodePixel(nodeCol, nodeRow);
    const tris = slots.map(s => triangles.get(slotKey(s.col, s.row))!);

    // Reparent the 6 triangles into a temp group whose origin is the node.
    const group = new Konva.Group({ x: node.x, y: node.y });
    trianglesLayer.add(group);
    for (const t of tris) {
        const oldX = t.poly.x();
        const oldY = t.poly.y();
        t.poly.moveTo(group);
        t.poly.x(oldX - node.x);
        t.poly.y(oldY - node.y);
    }
    trianglesLayer.draw();

    const rotateBy = config.rotationDegrees * direction;

    isAnimating = true;
    new Konva.Tween({
        node: group,
        rotation: rotateBy,
        duration: config.rotationDurationSec,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
            // Snap each triangle to its new slot. Positions come from the
            // lattice math, never from the post-tween world transform — so
            // there's no float drift between rotations.
            const moves: Array<[string, TriangleData]> = [];
            for (let i = 0; i < tris.length; i++) {
                const newSlotIdx = direction === 1 ? (i + 1) % 6 : (i + 5) % 6;
                const newSlot = slots[newSlotIdx];
                const c = trianglePixelCentroid(newSlot.col, newSlot.row);
                const tri = tris[i];
                tri.poly.moveTo(trianglesLayer);
                tri.poly.x(c.x);
                tri.poly.y(c.y);
                tri.rotationAccum = (tri.rotationAccum + rotateBy + 360) % 360;
                tri.poly.rotation(tri.rotationAccum);
                moves.push([slotKey(newSlot.col, newSlot.row), tri]);
            }
            for (const [k, v] of moves) triangles.set(k, v);
            group.destroy();
            trianglesLayer.draw();

            // Mirror the move into the rule-aware GameState (silent — no
            // visible effects in this layer; sidebar updates from it).
            const move: Move = {
                node: `${nodeCol},${nodeRow}`,
                direction,
            };
            const preScore = gameScore(gameState);
            const result = applyMove(gameState, move);
            gameState = result.state;
            const postScore = gameScore(gameState);
            const dOrange = postScore.orange - preScore.orange;
            const dBlue   = postScore.blue   - preScore.blue;
            if (dOrange > 0) cumulative.orangeGained += dOrange;
            else cumulative.orangeLost -= dOrange;
            if (dBlue > 0) cumulative.blueGained += dBlue;
            else cumulative.blueLost -= dBlue;
            updateSidebar();

            if (rulesEnabled()) visualiseEffects(true);
            updateLegalHighlights();

            // Win check (only meaningful when rules are on; the silent layer
            // tracks state regardless, but we don't pop the banner if the
            // user is in free-rotation mode).
            if (rulesEnabled()) {
                const outcome = checkOutcome(gameState);
                if (outcome && outcome.winner) showWinner(outcome.winner);
            }

            isAnimating = false;
            resolve();
        },
    }).play();
    });
}
