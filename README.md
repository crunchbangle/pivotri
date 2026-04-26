# Pivotri

A board-game prototype where the only move is to pivot a vertex shared by 6 triangles, rotating them as a hexagonal cluster. Working title; rules are still being worked out.

**Play the latest build:** https://crunchbangle.github.io/pivotri/

See [description.md](description.md) for the design notes and the rotation mechanic.

## Layout

- [try2/](try2/) — current prototype: TypeScript + Konva, with the headless grid logic in [hexgrid.ts](try2/hexgrid.ts) and tests in [hexgrid.spec.ts](try2/hexgrid.spec.ts). All visual/gameplay knobs live in [config.ts](try2/config.ts).
- [try1/](try1/) — earlier canvas-based attempt, kept for reference.

## Dev

From `try2/`:

```
npm install
npm test          # jest, headless logic
npm run build     # bundle main.ts → dist/main.js (esbuild)
npm run watch     # rebundle on changes
npm run serve     # static server on http://localhost:8080
```

Then open `http://localhost:8080/`.

## Deployment

[.github/workflows/pages.yml](.github/workflows/pages.yml) runs `npm test` and `npm run build` on push to `main`/`master`, then publishes [try2/index.html](try2/index.html) and the bundled `dist/` to GitHub Pages.

One-time setup: **Repo Settings → Pages → Source: "GitHub Actions"**.
