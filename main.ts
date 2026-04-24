import { HexGrid, HexGridPainter } from './classes.js';

class Game {
    private grid: HexGrid;
    private painter: HexGridPainter;
    private canvas: HTMLCanvasElement;
    private resetBtn: HTMLButtonElement;

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;

        // Create a default grid (m=3, n=8)
        this.grid = new HexGrid();
        this.painter = new HexGridPainter(this.grid, this.canvas);

        this.setupEventListeners();
        this.draw();
    }

    private setupEventListeners(): void {
        this.canvas.addEventListener('click', (event) => {
            this.handleCanvasClick(event);
        });

        this.resetBtn.addEventListener('click', () => {
            this.resetGrid();
        });
    }

    private handleCanvasClick(event: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Convert pixel coordinates to grid coordinates
        const triangleSize = 30;
        const spacing = 5;
        const gridX = Math.floor(x / (triangleSize + spacing));
        const gridY = Math.floor(y / (triangleSize + spacing));

        // Check if clicked on a node
        const clickedNode = this.grid.nodes.find(node =>
            Math.abs(node.column - gridX) <= 1 && Math.abs(node.row - gridY) <= 1
        );

        if (clickedNode) {
            this.rotateAroundNode(clickedNode);
            this.draw();
        }
    }

    private rotateAroundNode(node: { row: number; column: number }): void {
        // Find triangles around this node
        const trianglesToRotate: { triangle: any; x: number; y: number }[] = [];

        // Check all adjacent positions
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const x = node.column + dx;
                const y = node.row + dy;
                if (x >= 0 && x < this.grid.w && y >= 0 && y < this.grid.h) {
                    trianglesToRotate.push({
                        triangle: this.grid.triangles[y][x],
                        x: x,
                        y: y
                    });
                }
            }
        }

        // Simple rotation: cycle colors clockwise
        if (trianglesToRotate.length >= 3) {
            const colors = trianglesToRotate.map(t => t.triangle.colour);
            // Rotate colors
            const lastColor = colors[colors.length - 1];
            for (let i = colors.length - 1; i > 0; i--) {
                trianglesToRotate[i].triangle.setColour(colors[i - 1]);
            }
            trianglesToRotate[0].triangle.setColour(lastColor);
        }
    }

    private resetGrid(): void {
        // Recreate the grid with defaults
        this.grid = new HexGrid();
        this.painter = new HexGridPainter(this.grid, this.canvas);
        this.draw();
    }

    private draw(): void {
        this.painter.paint();
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new Game();
});