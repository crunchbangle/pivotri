// hexgrid.ts

export type Point = {
    id: string;
    x: number;
    y: number;
};

export type RankDef = {
    index: number;   // 0 = first rank
    offset: number;  // start file in N-units (1 N-unit = 2 file-cells)
    files: number;   // width in N-units
};

// One-shot factory for the initial slot layout. (col, row) here are abstract
// integer axes; the renderer decides which is horizontal.
export class GridShape {
    readonly ranks: ReadonlyArray<RankDef>;
    readonly totalMUnits: number;
    readonly totalNUnits: number;

    constructor(ranks: RankDef[]) {
        if (ranks.length === 0) throw new Error("GridShape requires at least one rank");
        this.ranks = [...ranks].sort((a, b) => a.index - b.index);
        this.totalMUnits = Math.max(...ranks.map(r => r.index)) + 1;
        this.totalNUnits = Math.max(...ranks.map(r => r.offset + r.files));
    }

    static rectangular(m: number, n: number): GridShape {
        const ranks: RankDef[] = [];
        for (let i = 0; i < m; i++) ranks.push({ index: i, offset: 0, files: n });
        return new GridShape(ranks);
    }

    triangles(): Array<{ col: number; row: number }> {
        const out: Array<{ col: number; row: number }> = [];
        for (const rank of this.ranks) {
            const top = rank.index * 2;
            const minCol = rank.offset * 2;
            const maxCol = (rank.offset + rank.files) * 2 - 2;
            for (let row = top; row <= top + 1; row++) {
                for (let col = minCol; col <= maxCol; col++) {
                    out.push({ col, row });
                }
            }
        }
        return out;
    }

    nodes(): Array<{ col: number; row: number }> {
        const out: Array<{ col: number; row: number }> = [];
        const maxRow = this.totalMUnits * 2 - 1;
        for (let row = 0; row < maxRow; row++) {
            const colStart = row % 2 === 0 ? 1 : 2;
            for (let col = colStart; col < this.totalNUnits * 2 - 1; col += 2) {
                const around = [
                    [col - 1, row],     [col, row],     [col + 1, row],
                    [col - 1, row + 1], [col, row + 1], [col + 1, row + 1],
                ];
                if (around.every(([c, r]) => this.containsTriangle(c, r))) {
                    out.push({ col, row });
                }
            }
        }
        return out;
    }

    private containsTriangle(col: number, row: number): boolean {
        const rank = this.ranks.find(r => r.index === Math.floor(row / 2));
        if (!rank) return false;
        const minCol = rank.offset * 2;
        const maxCol = (rank.offset + rank.files) * 2 - 2;
        return col >= minCol && col <= maxCol;
    }
}

export class HexGrid { 
    gridShape: GridShape; // defines the shape in rank and file
    interval: number; // distance between neighbouring nodes or triangle centres
    nodeSize: number; // radius of the node circles
    spacing: number; // distance between the edge of a triangle and the centre of a node

    // the rest of the properties are calculated from the above parameters
    
    hSpacing: number; // calculated spacing between triangle centres in the horizontal direction
    vSpacing: number; // calculated spacing between triangle centres in the vertical direction
    gridWidth: number; // calculated width of the grid in terms of triangle centres
    gridHeight: number; // calculated height of the grid in terms of triangle centres
    totalWidth: number; // calculated total width of the grid in pixels
    totalHeight: number; // calculated total height of the grid in pixels
    vUnits: number; // number of vertical units (2 rows of triangles) in the grid
    hUnits: number; // number of horizontal units (columns of triangles) in the grid
    constructor(interval: number, spacing: number, nodeSize: number, gridShape: GridShape) {
        this.vUnits = gridShape.totalMUnits;
        this.hUnits = gridShape.totalNUnits;
        this.gridShape = gridShape;
        this.interval = interval;
        this.spacing = spacing;
        this.nodeSize = nodeSize;
        this.hSpacing = interval + spacing*2/Math.sqrt(3);
        this.vSpacing = interval*Math.sqrt(3)/2 + spacing;
        this.gridWidth = this.hUnits * 2 - 1;
        this.gridHeight = this.vUnits * 2;
        this.totalWidth = this.gridWidth * this.hSpacing;
        this.totalHeight = this.gridHeight * this.vSpacing;
    }
}

// the following functions are for calculating rotations on graphical objects
// they are independent of the above, but rely on the correct layout from above.

export const rotate = (nodePoint: Point, trianglePoints: Point[], spacing: number, by: number=1): Point[] => {
    // this puts everything below together:
    const neighbours = getNeighbouringTriangles(nodePoint, trianglePoints, spacing);
    const orderedNeighbours = orderTriangles(neighbours);
    return rotateTriangles(orderedNeighbours, by);
}

export const rotateTriangles = (triangles: Point[], by: number=1): Point[] => {
    if (triangles.length != 6) {
        throw new Error("Expected 6 triangles to rotate");
    }
    // separate the xy from the id
    const xys = triangles.map(t => ({ x: t.x, y: t.y }));
    const ids = triangles.map(t => t.id);
    // set by to be between 0 and 5
    by = ((by % 6) + 6) % 6;
    // rotate the xy
    for (let i = 0; i < by; i++) {
        xys.push(xys.shift()!);
    }
    // recombine the xy with the id
    return xys.map((xy, i) => ({ id: ids[i], x: xy.x, y: xy.y }));
}

export const orderTriangles = (triangles: Point[]): Point[] => {
    return triangles.map(t => ({ point: t, alpha: Math.atan2(t.y, t.x) }))
        .sort((a, b) => a.alpha - b.alpha)
        .map(op => op.point);
}

export const getNeighbouringTriangles = (nodePoint: Point, trianglePoints: Point[], spacing: number): Point[] => {
    var neighbours = trianglePoints.filter(t => distanceBetweenPoints(nodePoint, t) <= spacing);
    if (neighbours.length != 6) {
        throw new Error("Expected 6 neighbouring triangles");
    }
    return neighbours;
}

export const distanceBetweenPoints = (p1: Point, p2: Point): number => {
    if (p1.x === p2.x) return Math.abs(p1.y - p2.y);
    if (p1.y === p2.y) return Math.abs(p1.x - p2.x);
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}
