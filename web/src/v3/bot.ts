/**
 * v3 opponent. Captures first, then the placement that leaves the fewest
 * beatable edges facing open cells -- every element loses to exactly three
 * others, so open-edge count is the whole risk measure.
 */

import { NB, cloneBoard } from './engine';
import {
  type Candidate, type GameState,
  applyMove, legalMoves, toMove,
} from './game';
import { type Rng, choice } from '../rng';

export type Difficulty = 'easy' | 'normal';

const exposure = (g: GameState, cell: number): number => {
  let open = 0;
  for (let d = 0; d < 4; d++) {
    const t = NB[cell][d];
    if (t >= 0 && g.board.cards[t] === null) open++;
  }
  return open;
};

function scored(g: GameState): { c: Candidate; gain: number }[] {
  return legalMoves(g).map((c) => {
    const probe = applyMove(g, c);
    return { c, gain: probe.resolution.captured };
  });
}

export function pick(g: GameState, rng: Rng,
                     difficulty: Difficulty = 'normal'): Candidate {
  const sc = scored(g);
  const best = Math.max(...sc.map((x) => x.gain));
  const top = sc.filter((x) => x.gain === best).map((x) => x.c);
  if (difficulty === 'easy') return choice(rng, top);
  const low = Math.min(...top.map((c) => exposure(g, c.cell)));
  return choice(rng, top.filter((c) => exposure(g, c.cell) === low));
}
