# Simulation plan

A headless agent-vs-agent harness to test rules cheaply. The point isn't to find the "right" rules — it's to make rule changes a 5-minute experiment instead of a week of theorising.

## Rules (as currently confirmed)

### Move

- A move is one rotation of the 6 triangles around a single pivot node, by ±60°.
- **Anchoring**: the player can only pivot at a node that has at least one of their own triangles among the 6 around it.
- **No undo**: a player may not, on their next move, rotate the *same* node in the *opposite* direction (cancelling their previous move). They *can* rotate the same node further in the same direction.
- **Rotation direction**: both ±60° allowed. Likely UI mapping is left-click = clockwise, right-click = counter-clockwise.

### Post-move effects (applied to the just-rotated node)

After a rotation, evaluate the 6 triangles around that node:

1. **Domination (+2 destroys)** — for each opposing colour, if the player has at least 2 more of their colour than that opponent among the 6, the opponent's triangles around that hex are destroyed (become neutral/gray).
   - Examples that trigger: 4-2, 3-1, 2-0.
   - Open question: cascade? Does the destruction trigger checks at neighbouring hexes? Default: no, only the rotated hex is checked.
2. **Conversion (3 at 120°)** — if the player owns at least one full {0,2,4} or {1,3,5} subset (i.e. three slots 120° apart) and the remaining 3 contain no opposing colour (mix of own + neutral is fine), all neutral triangles around the hex are converted to the player's colour.
   - Open question: what if both rules trigger from one move? Apply destruction first, then conversion (since conversion depends on no opponents being present, which destruction may have just guaranteed).

### Win condition

- A player resigns once the opponent owns >90% of the *coloured* (non-neutral) pieces.
- Otherwise, play continues until only one colour remains on the board.
- **Stalemate analysis is its own question**: it's possible for a player's pieces to be permanently isolated by enemy-dominated hexes, making them unable to move profitably. Detecting "is this position still winnable?" is non-trivial but worth a heuristic — even a simple "this player cannot anchor anywhere not adjacent to opponent-dominated territory" check would help spot dead games.

## Starting layout

- 8 nUnits × 3 mUnits rectangular.
- Top M-unit (triangle rows 0-1) starts amber; bottom M-unit (rows 4-5) starts blue; middle M-unit (rows 2-3) starts neutral.
- 30 amber + 30 blue + 30 neutral. Armies adjacent across the middle.

## Build order

1. **Headless game module** — pure state + transitions, no Konva. Functions:
   - `applyMove(state, nodeKey, direction) → state` (returns new state, or throws on illegal move)
   - `legalMoves(state, player) → MoveList`
   - `winner(state) → Player | null` (with the resign threshold built in)
   - `score(state) → { amber: number, blue: number, neutral: number }`
   - The data model already separates identity from position (try2/hexgrid.ts), so a state is essentially `slotKey → colour` plus the last-move record for the no-undo rule.

2. **Random vs random, 10k games**. Stats to collect:
   - Win rate (and by which player went first)
   - Game length distribution (mean, median, max)
   - Fraction of games that hit the >90% resign rule vs. play to total wipeout
   - Fraction of moves that triggered destruction / conversion / both
   - Fraction of games that stalled (max-turns timeout) — if non-zero, the rules likely permit dead positions

3. **Greedy vs random**. Greedy = "pick the move that maximises my colour count after applying" (with rotation direction included in the search). If greedy doesn't crush random by a wide margin, the rules are too noisy for strategy to matter.

4. **One-step lookahead vs greedy**. Lookahead = "for each of my legal moves, simulate the opponent's best greedy response, pick the move with the best resulting count for me". Big jump in win rate → strategic depth exists. Small jump → game is mostly tactical.

5. **Replay in Konva**. Hook a saved game-history into [try2/main.ts](try2/main.ts) so we can watch what the agents did. Useful for spotting "why did greedy lose?" patterns that the stats don't surface.

## What we're trying to learn

- Does the game terminate cleanly, or do positions get stuck?
- Is first-player advantage decisive, modest, or absent?
- Do the +2 and 120° rules fire often enough to feel relevant, or are they edge-case curiosities?
- Is one rule doing all the work? (E.g. if removing the conversion rule barely changes greedy win-rate, conversion is decoration.)
- What's the typical length of a game? (Important for whether real human play feels right.)

## Open questions to revisit before coding

- Does destruction cascade to neighbouring hexes?
- When destruction and conversion both trigger from one move, what order?
- Does anchoring count opposing colour next to opponent-dominated hexes as still anchored, or do "trapped" pieces lose anchoring?
- What's the right `maxTurns` cutoff to declare a stall? (Probably 10× board size as a starting heuristic.)
