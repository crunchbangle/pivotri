// hexgrid.ts

export type Point = {
    id: string;
    x: number;
    y: number;
};

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
