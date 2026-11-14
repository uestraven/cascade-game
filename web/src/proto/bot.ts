/**
 * The opponent. Ported from proto.py's `pick`, which is the bot every
 * measurement in the prototype used.
 *
 * It maximises captures and, on 'normal', breaks ties toward the cell
 * that leaves fewest of its own edges exposed. That exposure term is
 * worth essentially nothing here -- measured at -0.4 points, against
 * 21.6 in the eight-element game -- because under matching a versatile
 * card answers any single exposed edge, so hiding edges does not protect
 * them. It is kept only as a tie-break so the bot does not look random.
 */

import {
  type Board, type Shape, emptyCells,
} from './engine';
import {
  type Candidate, type GameState, applyMove, isOver, legalMoves, toMove,
} from './game';

export type Difficulty = 'easy' | 'normal';

function exposure(s: Shape, b: Board, player: number): number {
  let n = 0;
  for (let i = 0; i < s.cells; i++) {
    if (((b.own[player] >>> i) & 1) === 0 || !b.cards[i]) continue;
    for (let d = 0; d < 4; d++) {
      const t = s.nb[i][d];
      if (t >= 0 && b.cards[t] === null) n++;
    }
  }
  return n;
}

export function pick(g: GameState, rng: () => number,
                     difficulty: Difficulty = 'normal'): Candidate {
  const player = toMove(g);
  const moves = legalMoves(g);
  if (!moves.length) throw new Error('no legal moves');
  const lam = difficulty === 'easy' ? 0 : 0.5;

  let best = -Infinity;
  let ties: Candidate[] = [];
  for (const m of moves) {
    const applied = applyMove(g, m);
    const score = applied.resolution.captured
      - lam * exposure(g.shape, applied.state.board, player);
    if (score > best) { best = score; ties = [m]; }
    else if (score === best) ties.push(m);
  }
  return ties[Math.floor(rng() * ties.length)];
}

export { isOver, emptyCells };
