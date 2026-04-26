import Konva from 'konva';
import { GridShape } from './hexgrid';
import { config } from './config';

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

function initialColor(col: number): string {
    const maxCol = config.nUnits * 2 - 2;
    if (col === 0) return config.leftBorderColor;
    if (col === maxCol) return config.rightBorderColor;
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
        fill: initialColor(t.col),
        stroke: config.triangleStroke ?? undefined,
        strokeWidth: config.triangleStrokeWidth,
        closed: true,
    });
    trianglesLayer.add(poly);
    triangles.set(slotKey(t.col, t.row), { poly, rotationAccum: 0 });
}

// ---- nodes (clickable pivots) ----------------------------------------------

let isAnimating = false;

for (const n of shape.nodes()) {
    const p = nodePixel(n.col, n.row);
    const circle = new Konva.Circle({
        x: p.x,
        y: p.y,
        radius: config.nodeRadius,
        fill: config.nodeColor,
    });
    circle.on('click tap', () => {
        if (isAnimating) return;
        rotateAroundNode(n.col, n.row);
    });
    nodesLayer.add(circle);
}

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

function rotateAroundNode(nodeCol: number, nodeRow: number) {
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

    isAnimating = true;
    new Konva.Tween({
        node: group,
        rotation: config.rotationDegrees,
        duration: config.rotationDurationSec,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
            // Snap each triangle to its new slot. Positions come from the
            // lattice math, never from the post-tween world transform — so
            // there's no float drift between rotations.
            const moves: Array<[string, TriangleData]> = [];
            for (let i = 0; i < tris.length; i++) {
                const newSlot = slots[(i + 1) % 6];
                const c = trianglePixelCentroid(newSlot.col, newSlot.row);
                const tri = tris[i];
                tri.poly.moveTo(trianglesLayer);
                tri.poly.x(c.x);
                tri.poly.y(c.y);
                tri.rotationAccum = (tri.rotationAccum + config.rotationDegrees) % 360;
                tri.poly.rotation(tri.rotationAccum);
                moves.push([slotKey(newSlot.col, newSlot.row), tri]);
            }
            for (const [k, v] of moves) triangles.set(k, v);
            group.destroy();
            trianglesLayer.draw();
            isAnimating = false;
        },
    }).play();
}
