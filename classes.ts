export class HexNode {
    row: number;
    column: number;
    constructor(row: number, column: number) {
        this.row = row;
        this.column = column;
    }
}

export class Triangle {
    colour: string;
    id: string;
    constructor(colour: string, id: string) {
        this.colour = colour;
        this.id = id;
    }
    setColour(colour: string) {
        this.colour = colour;
    }
}

export class HexGrid {
    nodes: HexNode[];
    triangles: Triangle[][];
    m: number;
    n: number;
    h: number;
    w: number;

    constructor(m: number=3, n: number=8) {
        this.m = m;
        this.n = n;
        this.h = 2 * m;
        this.w = 2 * n - 1;
        this.nodes = [];
        this.triangles = [];
        this.constructNodes();
        this.constructTriangles();
    }

    constructNodes(){
        for (let u = 0; u < this.m; u++) {
            const y = u*2;
            for (let x = 1; x < (this.n-1)*2; x+=2) {
                this.nodes.push(new HexNode(y, x));
            }
        }
        for (let u = 0; u < this.m-1; u++) {
            const y = u*2+1;
            for (let x = 2; x < (this.n-2)*2; x+=2) {
                this.nodes.push(new HexNode(y, x));
            }
        }
    }

    constructTriangles(){
        for (let y = 0; y < this.h; y++) {
            this.triangles[y] = [];
            for (let x = 0; x < this.w; x++) {
                const colour = x == 0 ? "red" : x == this.w-1 ? "blue" : "grey";
                this.triangles[y][x] = new Triangle(colour, `${x},${y}`); // id is starting position
            }
        }
    }

    rotateTrianglesLeft(x: number, y: number ) {
        [
            this.triangles[y][x], //top
            this.triangles[y][x+1], 
            this.triangles[y+1][x+1], 
            this.triangles[y+1][x],
            this.triangles[y+1][x-1],
            this.triangles[y][x-1],
        ] = [
            this.triangles[y][x+1],
            this.triangles[y+1][x+1],
            this.triangles[y+1][x],
            this.triangles[y+1][x-1],
            this.triangles[y][x-1],
            this.triangles[y][x], // top goes left
        ];
    }

    rotateTrianglesRight(x: number, y: number ) {
        [
            this.triangles[y][x], //top
            this.triangles[y][x+1], 
            this.triangles[y+1][x+1], 
            this.triangles[y+1][x],
            this.triangles[y+1][x-1],
            this.triangles[y][x-1],
        ] = [
            this.triangles[y][x-1],
            this.triangles[y][x], // top goes right
            this.triangles[y][x+1],
            this.triangles[y+1][x+1],
            this.triangles[y+1][x],
            this.triangles[y+1][x-1],
        ];
    }
}

export class HexGridPainter {
    grid: HexGrid;
    canvas: HTMLCanvasElement;
    triangleSize: number;
    spacing: number;
    nodeSize: number;
    constructor(grid: HexGrid, canvas: HTMLCanvasElement, triangleSize: number=25, spacing: number=3, nodeSize: number=5) {
        this.grid = grid;
        this.canvas = canvas;
        this.triangleSize = triangleSize;
        this.spacing = spacing;
        this.nodeSize = nodeSize;
    }
    paint() {
        const ctx = this.canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (let y = 0; y < this.grid.h; y++) {
            for (let x = 0; x < this.grid.w; x++) {
                const triangle = this.grid.triangles[y][x];
                const posX = x * (this.triangleSize + this.spacing*2/Math.sqrt(3))/2;
                const posY = y * (this.triangleSize*Math.sqrt(3)/2 + this.spacing);
                ctx.fillStyle = triangle.colour;
                ctx.beginPath();
                if ((y+x) % 2 === 0) {
                    // Upwards pointing triangle
                    ctx.moveTo(posX, posY + this.triangleSize);
                    ctx.lineTo(posX + this.triangleSize / 2, posY);
                    ctx.lineTo(posX + this.triangleSize, posY + this.triangleSize);
                } else {
                    // Downwards pointing triangle
                    ctx.moveTo(posX, posY);
                    ctx.lineTo(posX + this.triangleSize / 2, posY + this.triangleSize);
                    ctx.lineTo(posX + this.triangleSize, posY);
                }
                ctx.fill();
            }
        }
        for (const node of this.grid.nodes) {
            const posX = node.column * (this.triangleSize + this.spacing);
            const posY = node.row * (this.triangleSize + this.spacing);
            ctx.fillStyle = "black";
            ctx.beginPath();
            ctx.arc(posX, posY, this.nodeSize, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

}

/* 

col
 0 1 2 3 4 5 6 7 8 9 A B C D E
 .---------------------------.
/ \ / \ / \ / \ / \ / \ / \ / \  row 0
---o---o---o---o---o---o---o---
\ / \ / \ / \ / \ / \ / \ / \ /  row 1
 :---o---o---o---o---o---o---:
/ \ / \ / \ / \ / \ / \ / \ / \  row 2
---o---o---o---o---o---o---o---
\ / \ / \ / \ / \ / \ / \ / \ /  row 3
 :---o---o---o---o---o---o---:
/ \ / \ / \ / \ / \ / \ / \ / \  row 4
---o---o---o---o---o---o---o---
\ / \ / \ / \ / \ / \ / \ / \ /  row 5
 '---------------------------'

0,0 triangle is upwards pointing
1,0 and 0,1 triangles are downwards pointing
1,1 triangle is upwards pointing
so for each triangle, x+y even means upwards pointing, x+y odd means downwards pointing.

Row 0 nodes connect row 0 and row 1 triangles.
Even row nodes have odd columns.
Odd row nodes have even columns.
A node connects triangles in its own column and columns to left and right (-1, 0, +1).

A grid can be defined by the number of upwards pointing triangles in the first row, 
and the number of rows. Let's call the number of upwards pointing triangles in the 
first row "n". The number of columns, w, is then n * 2 - 1.
The number of rows, h, must be 2m where m > 0.

The number of triangles is w * h, or 2m(2n-1)
So the total nodes is (n-1)*m + (n-2)*(m-1)

Eg in the diagrame above, n = 8, m = 3, so w = 15, h = 6, 
number of nodes = 34, number of triangles = 90.

The number of nodes mid-unit is n-1 and the number of nodes between units is n-2.
The number of rows of mid-unit nodes is m and the number of rows of between-unit nodes is m-1.

Rows are identified by the triangle directly above them. So, node (X,Y) 
rotates triangles (X-1,Y), (X,Y), (X+1,Y), (X-1,Y+1), (X,Y+1), (X+1,Y+1).

But if triangles can be moved about a node, then they cannot be identified by their position alone.
The grid must know the position of each triangle. The node only needs to know its own position.
This simplifies the data, since the triangles can be stored in a 2D array, while the nodes can
be stored in a list, and not a ragged array.

If a node is rotated, the triangles can be found in the grid and rotated using the node's position.



*/
