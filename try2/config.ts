// All the tweakable knobs for rendering and gameplay live here.

export const config = {
    // Grid shape
    mUnits: 3,
    nUnits: 8,

    // Geometry (pixels)
    nodeSpacing: 150,    // distance between adjacent lattice nodes
    triangleSide: 120,   // side length of each rendered triangle
    nodeRadius: 40,      // radius of each node circle

    // Padding around the grid (so border triangles aren't clipped)
    padding: 60,

    // Rotation animation
    rotationDurationSec: 0.3,
    rotationDegrees: 60,

    // Colours
    backgroundColor: 'white',
    nodeColor: '#444',           // dark gray
    leftBorderColor: '#ffbf00',  // amber
    rightBorderColor: '#1f77b4', // blue
    interiorColor: '#d3d3d3',    // light gray

    // Stroke for triangles (set to null to disable)
    triangleStroke: 'black',
    triangleStrokeWidth: 1,
};
