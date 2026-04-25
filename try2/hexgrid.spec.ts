import {
    Point,
    RankDef,
    GridShape,
    HexGrid,
    rotate,
    rotateTriangles,
    orderTriangles,
    getNeighbouringTriangles,
    distanceBetweenPoints,
} from "./hexgrid";
import { describe, test, expect } from "@jest/globals";

// ---- helpers ----------------------------------------------------------------

const SQRT3 = Math.sqrt(3);

const pt = (id: string, x: number, y: number): Point => ({ id, x, y });

// six triangles arranged hex-style around (0,0) at unit distance,
// listed in deliberately scrambled order so ordering tests are meaningful.
const sixHexNeighbours = (): Point[] => [
    pt("e60",  0.5, -SQRT3 / 2), //  60° below x-axis (atan2 = -π/3)
    pt("w",   -1,    0),         //  180°            (atan2 =  π)
    pt("e",    1,    0),         //    0°            (atan2 =  0)
    pt("w60", -0.5,  SQRT3 / 2), //  120°            (atan2 =  2π/3)
    pt("w-60",-0.5, -SQRT3 / 2), // -120°            (atan2 = -2π/3)
    pt("e-60", 0.5,  SQRT3 / 2), //   60°            (atan2 =  π/3)
];

// ---- distanceBetweenPoints --------------------------------------------------

describe("distanceBetweenPoints", () => {
    test("returns 0 for the same point", () => {
        expect(distanceBetweenPoints(pt("a", 3, 4), pt("b", 3, 4))).toBe(0);
    });

    test("uses fast path on a shared y-axis", () => {
        expect(distanceBetweenPoints(pt("a", 1, 7), pt("b", 5, 7))).toBe(4);
    });

    test("uses fast path on a shared x-axis", () => {
        expect(distanceBetweenPoints(pt("a", 2, -3), pt("b", 2, 4))).toBe(7);
    });

    test("computes Pythagorean distance for a 3-4-5 triangle", () => {
        expect(distanceBetweenPoints(pt("a", 0, 0), pt("b", 3, 4))).toBe(5);
    });

    test("is symmetric in its arguments", () => {
        const a = pt("a", -2, 5);
        const b = pt("b", 7, -1);
        expect(distanceBetweenPoints(a, b)).toBeCloseTo(distanceBetweenPoints(b, a));
    });

    test("handles negative coordinates", () => {
        expect(distanceBetweenPoints(pt("a", -1, -1), pt("b", 2, 3))).toBe(5);
    });
});

// ---- orderTriangles ---------------------------------------------------------

describe("orderTriangles", () => {
    test("sorts six hex neighbours by atan2 ascending", () => {
        const ordered = orderTriangles(sixHexNeighbours());
        expect(ordered.map(p => p.id)).toEqual([
            "w-60", // -2π/3
            "e60",  // -π/3
            "e",    //  0
            "e-60", //  π/3
            "w60",  //  2π/3
            "w",    //  π
        ]);
    });

    test("keeps each id paired with its original coordinates", () => {
        const ordered = orderTriangles(sixHexNeighbours());
        for (const p of ordered) {
            const original = sixHexNeighbours().find(o => o.id === p.id)!;
            expect(p.x).toBe(original.x);
            expect(p.y).toBe(original.y);
        }
    });

    test("does not mutate its input", () => {
        const input = sixHexNeighbours();
        const before = input.map(p => p.id);
        orderTriangles(input);
        expect(input.map(p => p.id)).toEqual(before);
    });

    test("handles an empty array", () => {
        expect(orderTriangles([])).toEqual([]);
    });
});

// ---- getNeighbouringTriangles -----------------------------------------------

describe("getNeighbouringTriangles", () => {
    const node = pt("node", 0, 0);

    test("returns exactly the six points within spacing", () => {
        const close = sixHexNeighbours(); // all at distance 1
        const far = [pt("far1", 5, 0), pt("far2", 0, -5)];
        const result = getNeighbouringTriangles(node, [...close, ...far], 1.5);
        expect(result.map(p => p.id).sort()).toEqual(close.map(p => p.id).sort());
    });

    test("includes points exactly at distance == spacing (inclusive boundary)", () => {
        const close = sixHexNeighbours(); // distance is exactly 1
        const result = getNeighbouringTriangles(node, close, 1);
        expect(result).toHaveLength(6);
    });

    test("throws when fewer than 6 are within spacing", () => {
        const close = sixHexNeighbours();
        expect(() => getNeighbouringTriangles(node, close, 0.9))
            .toThrow("Expected 6 neighbouring triangles");
    });

    test("throws when more than 6 are within spacing", () => {
        const close = sixHexNeighbours();
        const extra = pt("extra", 0.1, 0.1); // also within spacing 1.5
        expect(() => getNeighbouringTriangles(node, [...close, extra], 1.5))
            .toThrow("Expected 6 neighbouring triangles");
    });

    test("works when the node is not at the origin", () => {
        const offset = pt("node", 10, 10);
        const close = sixHexNeighbours().map(p => pt(p.id, p.x + 10, p.y + 10));
        const result = getNeighbouringTriangles(offset, close, 1.5);
        expect(result).toHaveLength(6);
    });
});

// ---- rotateTriangles --------------------------------------------------------

describe("rotateTriangles", () => {
    // a-f along the x-axis so coords stay distinguishable
    const sixOnAxis = (): Point[] => [
        pt("a", 1, 0),
        pt("b", 2, 0),
        pt("c", 3, 0),
        pt("d", 4, 0),
        pt("e", 5, 0),
        pt("f", 6, 0),
    ];

    test("throws unless given exactly 6 triangles", () => {
        expect(() => rotateTriangles(sixOnAxis().slice(0, 5))).toThrow("Expected 6 triangles");
        expect(() => rotateTriangles([...sixOnAxis(), pt("g", 7, 0)])).toThrow("Expected 6 triangles");
        expect(() => rotateTriangles([])).toThrow("Expected 6 triangles");
    });

    test("by=0 leaves coords aligned with their original ids", () => {
        const result = rotateTriangles(sixOnAxis(), 0);
        expect(result).toEqual(sixOnAxis());
    });

    test("by=1 shifts so that id at index i takes the xy from index (i+1) mod 6", () => {
        const input = sixOnAxis();
        const result = rotateTriangles(input, 1);
        // ids stay in original order; xys shift left by 1
        expect(result.map(p => p.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
        expect(result.map(p => p.x)).toEqual([2, 3, 4, 5, 6, 1]);
    });

    test("by=6 is the identity", () => {
        expect(rotateTriangles(sixOnAxis(), 6)).toEqual(sixOnAxis());
    });

    test("by=-1 is equivalent to by=5", () => {
        expect(rotateTriangles(sixOnAxis(), -1)).toEqual(rotateTriangles(sixOnAxis(), 5));
    });

    test("by=7 is equivalent to by=1", () => {
        expect(rotateTriangles(sixOnAxis(), 7)).toEqual(rotateTriangles(sixOnAxis(), 1));
    });

    test("applying by=1 six times returns to the original arrangement", () => {
        let current = sixOnAxis();
        for (let i = 0; i < 6; i++) current = rotateTriangles(current, 1);
        expect(current).toEqual(sixOnAxis());
    });

    test("ids are never reordered, only coordinates shift", () => {
        for (let by = 0; by < 6; by++) {
            const result = rotateTriangles(sixOnAxis(), by);
            expect(result.map(p => p.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
        }
    });

    test("does not mutate its input", () => {
        const input = sixOnAxis();
        rotateTriangles(input, 3);
        expect(input).toEqual(sixOnAxis());
    });
});

// ---- rotate (integration) ---------------------------------------------------

describe("rotate", () => {
    const node = pt("node", 0, 0);

    test("orders the six neighbours then shifts coords by `by`", () => {
        const neighbours = sixHexNeighbours();
        const far = [pt("far", 99, 99)];
        const result = rotate(node, [...neighbours, ...far], 1.5, 1);

        // ids appear in atan2-sorted order of the *originals*
        expect(result.map(p => p.id)).toEqual([
            "w-60", "e60", "e", "e-60", "w60", "w",
        ]);

        // coords are the ordered coords shifted left by 1
        const orderedCoords = orderTriangles(neighbours).map(p => ({ x: p.x, y: p.y }));
        const expectedCoords = [...orderedCoords.slice(1), orderedCoords[0]];
        result.forEach((p, i) => {
            expect(p.x).toBeCloseTo(expectedCoords[i].x);
            expect(p.y).toBeCloseTo(expectedCoords[i].y);
        });
    });

    test("by=0 leaves the ordered neighbours unchanged", () => {
        const neighbours = sixHexNeighbours();
        const ordered = orderTriangles(neighbours);
        const result = rotate(node, neighbours, 1.5, 0);
        expect(result).toEqual(ordered);
    });

    test("propagates the 'not 6 neighbours' error", () => {
        expect(() => rotate(node, [pt("only", 1, 0)], 1.5)).toThrow("Expected 6 neighbouring triangles");
    });
});

// ---- GridShape --------------------------------------------------------------

describe("GridShape", () => {
    test("stores its constructor arguments verbatim", () => {
        const ranks: RankDef[] = [
            { index: 0, offset: 0, files: 3 },
            { index: 1, offset: 1, files: 2 },
        ];
        const shape = new GridShape(2, 3, ranks);
        expect(shape.totalMUnits).toBe(2);
        expect(shape.totalNUnits).toBe(3);
        expect(shape.ranks).toBe(ranks);
    });
});

// ---- HexGrid ----------------------------------------------------------------

describe("HexGrid", () => {
    const makeShape = (m = 2, n = 3) =>
        new GridShape(m, n, [{ index: 0, offset: 0, files: n }]);

    test("mirrors the gridShape unit counts into vUnits/hUnits", () => {
        const grid = new HexGrid(2, 0, 0.1, makeShape(4, 5));
        expect(grid.vUnits).toBe(4);
        expect(grid.hUnits).toBe(5);
    });

    test("retains its raw constructor parameters", () => {
        const shape = makeShape();
        const grid = new HexGrid(2, 0.5, 0.25, shape);
        expect(grid.gridShape).toBe(shape);
        expect(grid.interval).toBe(2);
        expect(grid.spacing).toBe(0.5);
        expect(grid.nodeSize).toBe(0.25);
    });

    test("computes hSpacing = interval + spacing*2/sqrt(3)", () => {
        const grid = new HexGrid(2, 0.5, 0, makeShape());
        expect(grid.hSpacing).toBeCloseTo(2 + (0.5 * 2) / SQRT3);
    });

    test("computes vSpacing = interval*sqrt(3)/2 + spacing", () => {
        const grid = new HexGrid(2, 0.5, 0, makeShape());
        expect(grid.vSpacing).toBeCloseTo((2 * SQRT3) / 2 + 0.5);
    });

    test("computes gridWidth = hUnits*2 - 1", () => {
        const grid = new HexGrid(1, 0, 0, makeShape(2, 3));
        expect(grid.gridWidth).toBe(5);
    });

    test("computes gridHeight = vUnits*2", () => {
        const grid = new HexGrid(1, 0, 0, makeShape(2, 3));
        expect(grid.gridHeight).toBe(4);
    });

    test("computes totalWidth = gridWidth * hSpacing", () => {
        const grid = new HexGrid(2, 0, 0, makeShape(2, 3));
        expect(grid.totalWidth).toBeCloseTo(grid.gridWidth * grid.hSpacing);
    });

    test("computes totalHeight = gridHeight * vSpacing", () => {
        const grid = new HexGrid(2, 0, 0, makeShape(2, 3));
        expect(grid.totalHeight).toBeCloseTo(grid.gridHeight * grid.vSpacing);
    });

    test("with spacing=0 the geometry collapses to a regular triangle lattice", () => {
        // interval=2, spacing=0 → hSpacing=2, vSpacing=sqrt(3)
        const grid = new HexGrid(2, 0, 0, makeShape(1, 1));
        expect(grid.hSpacing).toBeCloseTo(2);
        expect(grid.vSpacing).toBeCloseTo(SQRT3);
        expect(grid.gridWidth).toBe(1);
        expect(grid.gridHeight).toBe(2);
        expect(grid.totalWidth).toBeCloseTo(2);
        expect(grid.totalHeight).toBeCloseTo(2 * SQRT3);
    });
});
