// All the tweakable knobs for rendering and gameplay live here.

export const config = {
    // Grid shape
    mUnits: 3,
    nUnits: 3,

    // Geometry (pixels)
    nodeSpacing: 140,    // distance between adjacent lattice nodes
    triangleSide: 120,   // side length of each rendered triangle
    nodeRadius: 20,      // radius of each node circle

    // Padding around the grid (so border triangles aren't clipped)
    padding: 60,

    // Rotation animation
    rotationDurationSec: 0.3,
    rotationDegrees: 60,

    // Colours
    backgroundColor: 'white',
    nodeColor: '#444',           // dark gray
    topBorderColor: '#7cc7e8',    // sky blue (lighter)
    bottomBorderColor: '#e08a3c', // earth orange
    interiorColor: '#d3d3d3',    // light gray

    // Stroke for triangles (set to null to disable)
    triangleStroke: 'black',
    triangleStrokeWidth: 1,
};
