# Simulation record

A log of agent-vs-agent experiments testing the rules of pivotri. Each iteration: what we planned, what happened, what we learned. Lives under [try2/sim/](try2/sim/); run with `npm run sim` from `try2/`.

## Setup

### Rules

**Move.** One rotation of the 6 triangles around a single pivot node, ±60°. UI: left-click clockwise, right-click counter-clockwise.

**Anchoring.** A player can only pivot at a node that has at least one of their own triangles among the 6 around it.

**No undo.** A player may not, on their next move, rotate the *same* node in the *opposite* direction (cancelling their own previous move). They *can* rotate the same node further in the same direction.

**Null-move prevention.** A rotation that produces no change to the board is illegal — i.e. you can't rotate a hex where all 6 surrounding triangles are your own colour.

**Post-move effects** (impartial — fire based on configuration, not on who moved):

1. **Conversion (3 at 120°, runs first)** — if either player owns at least one full {0,2,4} or {1,3,5} subset around the hex, every neutral around that hex becomes their colour. (No "no opponent" check — opponents elsewhere don't block conversion.)
2. **Domination (+3 destroys)** — if either side has ≥3 more pieces than the other around the hex (and the other has at least one piece), the other's pieces around that hex become neutral. Triggers: 4-1, 5-1.

**Propagation (limited).**

- Rotation can fire conversions and destructions.
- Conversion can fire destructions.
- Conversion **cannot** fire another conversion.
- Destruction **cannot** fire another destruction.

Implementation: snapshot-based two-phase pass. Phase 1 (conversion) checks every hex affected by the rotation; phase 2 (destruction) checks every hex affected by rotation or phase-1 conversion. Neither phase cascades into itself.

**Win condition.** A player wins when they hold an **edge-connected chain of their colour from row 0 (top) to the last triangle row (bottom)**. Adjacency is "two triangles share an edge" — every triangle has 3 edge-neighbours, all of the opposite up/down orientation. Checked for both colours after every move.

**Other terminals.** No legal moves → that player loses. 200-move cap → draw (safety net while we tune).

### Starting layout

3 nUnits × 3 mUnits rectangular: 30 triangles, 8 valid pivot nodes. Top M-unit (rows 0-1) starts **blue (sky)**, bottom M-unit (rows 4-5) starts **orange (earth)**, middle (rows 2-3) starts neutral. 10/10/10 split. Orange moves first.

### Agents

In [try2/sim/agents.ts](try2/sim/agents.ts):

- **Random** — uniform pick over legal moves.
- **Greedy** — picks the move maximising the heuristic one ply ahead.
- **Lookahead(N)** — minimax to N plies, no pruning.

## Strategic shape (informal observation)

The game has surprisingly logical interaction: players can directly impact each other's positions, not just their own. If you spot the opponent setting up for a connection, and you have a triangle adjacent to their preparation, you can rotate to push their pieces into less favourable positions. So defensive play has the same vocabulary as offensive play — every move is a placement *and* a disruption. This is the kind of structural property that's worth keeping intact as we tune the rules.

## Iterations

### Iteration 1 — piece-count heuristic (v0)

**Plan.** Implement the headless game module and the three agents. Use the obvious first-pass evaluator: `myPieces - oppPieces`, with ±1e9 for connection wins/losses. Run random vs random as a baseline; greedy vs random to confirm strategy beats noise; greedy vs greedy and lookahead-2 vs greedy to see whether deeper search pays off.

**Result.**

| Matchup | Result |
| --- | --- |
| Random vs Random (2000 games) | 51 / 47 / 1, mean 566 moves, 70% connections |
| Greedy(orange) vs Random | **100%** orange, mean 85 moves |
| Random vs Greedy(blue) | **100%** blue, mean 85 moves |
| Greedy vs Greedy (500) | **100% stalemate** — every game hit the 2000-move cap |
| Lookahead-2 vs Greedy (100) | **100% stalemate** |

**Insight.** Random play terminates fine, so the rules can produce a winner. But once both sides play strategically with this heuristic, they get into a destruction-loop — 723 destructions and 733 conversions per game, 638 moves where both fired. Piece-count rewards destruction (which removes opponent pieces) but never rewards forward progress, so two competent players just clobber each other forever. Lookahead-2 with the same evaluator just plans deeper destruction — same outcome. The fix isn't a deeper agent, it's a heuristic that values *connection*.

### Iteration 2 — connection-distance heuristic (v1)

**Plan.** Add a `connectionDistance(state, player)` function: 0-1 BFS from row 0 to the last row through (own + neutral) tiles, with own = 0 cost and neutral = 1 cost. The result is the minimum number of neutrals you'd need to convert to complete a chain — a lower-bound on "moves to win". Include it in the evaluator with heavy weight, so closing the gap dominates piece-count:

```
+1e9        if I'm connected
-1e9        if opponent is connected
±5e8        if exactly one side has no possible path through (own + neutral)
otherwise:  100 * (oppDist - myDist) + (myPieces - oppPieces)
```

Re-run the same matchups.

**Result.**

| Matchup | Result |
| --- | --- |
| Random vs Random | 50 / 49 / 1 (unchanged baseline) |
| Greedy(orange) vs Random | 76 / 24, mean 470 moves |
| Random vs Greedy(blue) | 27 / 73, mean 492 moves |
| Greedy vs Greedy | 32 / 33 / **34% draws**, mean 934 moves |
| Lookahead-2(orange) vs Greedy | **74** / 13 / 13% draws, mean 824 moves |

**Insight.** The stall is broken. Greedy-vs-greedy resolves two-thirds of the time, and lookahead-2 beats greedy by a wide margin — there's real strategic depth and the heuristic actually drives play toward winning. Two surprises:

1. **Greedy beats random *less* convincingly than v0** (76% vs 100%). The new heuristic spends moves on blocking the opponent's distance, which is wasted against an opponent who isn't trying to advance. Random is a degenerate baseline — not a problem, but interesting.
2. **A third of greedy-vs-greedy games still draw** (hit the 2000-move cap). Either the heuristic has a blind spot or some positions are genuinely dead. Need replays to know which.

### Iteration 3 — null-move rule + impartial rules + colour swap (v2)

**Plan.** Several rule additions in one iteration. (a) Null-move prevention: rotating a hex where all 6 are your own colour is illegal. (b) Both rules become impartial: domination and conversion fire based on the configuration around the hex, not on who moved — so a rotation can backfire and hand the opponent a destruction or conversion. (c) Conversion runs *before* destruction, and conversion drops its "no opponent" pre-condition (the user wanted "convert next to a single opponent, then destroy them" to resolve in one move). (d) Colour swap: top is **blue (sky)**, bottom is **orange (earth)**. (e) Win condition is now "edge-connected chain from top row to bottom row" (replaces the 90% resign threshold).

**Result.** (with destruction at +2, single-pass per hex, no propagation)

| Matchup | Result |
| --- | --- |
| Random vs Random | 50 / 50, 0 stalemates, mean 263 moves |
| Greedy vs Random | 63 / 37, mean 245 moves |
| Greedy vs Greedy | 30 / 33 / 36% draws, mean 890 moves |
| Lookahead-2 vs Greedy | 65 / 34 / 1% draws, mean 432 moves |

**Insight.** Game still works. The impartial change is the strategically meaningful one — every move is now both an opportunity and a risk, and the lookahead agent benefits from being able to *see* opponent backfires that greedy can't predict (lookahead beats greedy 65–34, almost no draws). Greedy-vs-greedy is the weakest matchup; one in three games stalls because both sides defend symmetrically.

### Iteration 4 — full propagation (v3)

**Plan.** User intent: rules cascade. A destruction at hex A whose effects change a triangle in hex B should re-evaluate B; same for conversions. Implemented as a single BFS that runs *both* rules at each hex, propagating any colour change to all other hexes containing that triangle. No cap on cascade depth (other than a safety counter).

**Result.**

| Matchup | Result |
| --- | --- |
| Random vs Random | 0 / 0 / **100%** draws, max-out at 2000 moves |
| Greedy vs Random | same |
| Greedy vs Greedy | same |
| Lookahead-2 vs Greedy | same |

Per game: ~1900 destructions, ~1900 conversions, hitting the 2000-move cap.

**Insight.** Cascading broke the game. Every move triggers a wave of effects across the whole board; pieces are converted, destroyed, and recreated faster than any chain can stabilise. The board never settles into anything connectable. Random play used to terminate ~70% of the time; now nothing terminates.

### Iteration 5 — limited propagation, two-phase + 200-move cap (v4)

**Plan.** Restrict the cascade. User clarification: "rotation can make conversions and destructions; conversion can make destructions; conversion cannot make another conversion; destruction cannot make another destruction." Implemented as snapshot-based two-phase: phase 1 conversions checked at every rotation-affected hex (no within-phase cascade); phase 2 destructions checked at every rotation- *or* phase-1-affected hex (no within-phase cascade). Also dropped the move cap from 2000 to 200 (we shouldn't need more in a healthy game) and started recording each game's move history so the shortest decisive game can be saved for later replay.

**Result.**

| Matchup | Result |
| --- | --- |
| Random vs Random | 0.1% / 0.1% / 99.8% draws — 4 decisive games out of 2000 |
| Greedy vs Random | 0 / 0 / 100% draws |
| Random vs Greedy | 0.2% / 0.2% / 99.6% draws |
| Greedy vs Greedy | 0 / 0 / 100% draws |
| Lookahead-2 vs Greedy | 0 / 0 / 100% draws |

Per game: ~186 destructions, ~195 conversions. Around 50% of moves trigger destruction, 75% trigger conversion. Shortest decisive game found across all matchups: 32 moves, blue won (random luck) — saved to [try2/sim/shortest-game.json](try2/sim/shortest-game.json).

**Insight.** Limiting cascade depth barely moved the dial. Per-move effect rates hardly dropped — every rotation still touches ~6 affected hexes, each can fire independently. The frequency of rule-firings is the underlying problem, not the cascade depth. With ~1 destruction per move on average, no piece is load-bearing for long enough to anchor a connection. Strategic agents do worse than random because the heuristic optimises for distance-closing moves that immediately get destroyed; random sometimes blunders into a connection by accident.

### Iteration 6 — destruction threshold +3 (v5)

**Plan.** Raise the destruction trigger from +2 to +3 (so 4-1 and 5-0 fire, but 3-1 and 4-2 don't). Keep limited propagation. The hypothesis: destruction is the noisier rule; raising its threshold should let pieces survive long enough to be useful.

**Result.**

| Matchup | Result |
| --- | --- |
| Random vs Random | 0 / 0 / **100%** draws |
| Greedy vs Random | 0 / 0 / 100% draws |
| Random vs Greedy | 0 / 0 / 100% draws |
| Greedy vs Greedy | 0 / 0 / 100% draws |
| Lookahead-2 vs Greedy | 0 / 0 / 100% draws |

Per game: ~177 destructions, ~185 conversions (down from 186 / 195 — barely changed). Around 47% of moves trigger destruction (down from 50%).

**Insight.** Even fewer destructions per move, but still 100% stalemate everywhere — *worse* than v4, which had at least some random connections. The reduction in destructions wasn't enough; conversions are still firing at ~71% of moves, creating piece imbalances that the slightly-higher destruction threshold still picks up. Conversions might be the bigger culprit than destructions.

### Iteration 7 — destruction disabled (v6, with limited propagation kept)

**Plan.** Ablation: keep limited propagation and conversion as in v4, but disable destruction entirely. Hypothesis: conversions are constructive (only ever add pieces of one colour), so the game can only converge toward more-coloured states. If chains form, destruction was the load-bearing problem.

**Result.**

| Matchup | Result |
| --- | --- |
| Random vs Random | many connections (decisive) — shortest 15 moves, orange won |
| Greedy vs Random | 45 / 10 / 45% draws, mean 154 moves, shortest 19 moves |
| Random vs Greedy | 12 / 40 / 48% draws, mean 158 moves, shortest 22 moves |
| Greedy vs Greedy | 33 / 37 / 30% draws, mean 137 moves, shortest 18 moves |
| Lookahead-2 vs Greedy | 41 / 0 / 59% draws, mean 165 moves, shortest 31 moves |

Per game: 0 destructions (as expected) and ~10 conversions. Conversion fires at ~5% of moves — much quieter than v4 (75% conversion-firing). Greedy-vs-greedy resolves 70% of the time.

**Insight.** The game is suddenly playable. Destruction was the dominant noise source; once removed, conversions act as a slow, constructive force that lets territory form and chains stabilise. Lookahead-2 doesn't beat greedy on offence (41% wins vs greedy's typical 35% in greedy-vs-greedy) — but its draw rate is notably higher (59% vs 30%) and *blue never wins against it*. So lookahead is much better defensively than offensively under these mechanics. Worth digging into: maybe the heuristic over-values blocking in deeper search.

This iteration also introduced **rule toggles** in [try2/sim/game.ts](try2/sim/game.ts) (`DESTRUCTION_THRESHOLD` and `CONVERSION_ENABLED`) so future ablations are a constant change.

### Iteration 8 — revert to iteration 3 rules + lookahead-3 (v7)

**Plan.** Iteration 3's single-hex rules were the most decisive matchup we had found before the propagation experiments. Revert to those (no propagation, both rules at the rotated hex only, +2 destruction, conversion-first impartial), and add lookahead-3 to the matchup list. Also exclude any matchup involving `Random` from the "shortest decisive game" tally — random-vs-anything games end in short flukes that aren't strategically interesting.

**Result.**

| Matchup | Result |
| --- | --- |
| Random vs Random | 20 / 20 / 60% draws, mean 179 |
| Greedy vs Random | 29 / 15 / 56% draws, mean 177 |
| Random vs Greedy | 13 / 26 / 61% draws, mean 179 |
| Greedy vs Greedy | 7 / 5 / **88% draws**, mean 195 |
| Lookahead-2 vs Greedy | 17 / 13 / 70% draws, mean 186 |
| Lookahead-3 vs Greedy | 8 / 6 / 86% draws, mean 191 |
| Lookahead-3 vs Lookahead-2 | 6 / 16 / 78% draws, mean 188 |

Shortest decisive interesting game (excluding random): **77 moves**, lookahead-3 won (orange) vs greedy.

**Insight.** Two problems:

1. **The 200-move cap is too tight for iteration 3's rules.** When this iteration was originally run (with the older 2000 cap), greedy-vs-greedy had mean 934 moves and 67% decisive games. With the 200 cap most games stall out. The cap that made sense for v4/v5/v6 (where games were noisy and the timeout was a safety net) is wrong here.
2. **Lookahead-3 *loses* to lookahead-2 (6 vs 16, with 78% draws).** Deeper search produces *worse* results. The heuristic is misbehaving at depth — likely overvaluing distance-blocking moves so heavily that lookahead-3 plans further into block-and-stall territory while lookahead-2 occasionally commits to advance. Same pattern as iteration 7 (lookahead defensive) but sharper.

**Comparison of the two viable rule sets:**

| | v6 (destruction off, propagation kept) | v7 (full iteration 3 rules) |
| --- | --- | --- |
| Greedy-vs-greedy decisive rate | 70% | 12% (constrained by cap) |
| Mean game length | 137 | 195 |
| Lookahead behaviour | strongly defensive | also defensive at depth |

v6 (destruction disabled) is the more decisive, shorter, more playable rule set under the 200-move cap. v7 (full iteration 3) is more chaotic but most of its decisiveness is hidden by the cap.

## Next iteration (planned)

- **Replay viewer**: hook the saved game-history (`try2/sim/shortest-game.json`) into [try2/main.ts](try2/main.ts) so we can step through the shortest interesting decisive game and watch the rotation/conversion/destruction sequence visually. Stats won't surface tactical detail.
- **Lookahead-4** if lookahead-3 shows meaningful gains over lookahead-2.

## Open questions

- The 100× weight on distance vs piece-count in the heuristic is arbitrary. Worth a sweep to see if a different weight produces sharper greedy-vs-greedy games.
- Should "this position is dead, declare it a draw" fire when both players have `connectionDistance === Infinity`? Currently only a heuristic signal; no auto-termination.
- Does anchoring need any extra restriction (e.g. "isolated pieces don't anchor")?
- Why does lookahead-2 do *worse* offensively than greedy on the destruction-disabled rule set? Likely an interaction between depth and the connection-distance heuristic — worth investigating before going to lookahead-4.

## Possible future experiments (rule variants worth trying once we have a stable baseline)

- **Single-row starting layout** instead of two rows — top row blue, bottom row orange, the rest neutral (4 + 4 + 22 split on a 3×3 board).
- **Centre motif start** — pre-place the alternating-six pattern (3 orange + 3 blue around one node) at the centre of the board.
- **Motif as checkpoint** — require *forming* the alternating-six motif somewhere on the board before either player can win the connection. Adds a forced mid-game phase.
- **Variable rotation by piece count** — instead of a fixed ±60° rotation, rotate by *N* steps where *N* is one of: (a) the number of triangles around the node (always 6 — degenerate), (b) the number of *your* triangles around the node, or (c) your count − opponent count. Only one direction allowed (left-click only). Forces engagement with the count-around-this-node calculation on every move; rewards building presence around a hex (more pieces → stronger rotation effect). Variant (c) makes 0-rotation possible (null move when balanced), giving a defensive incentive to neutralise opponent setups.
