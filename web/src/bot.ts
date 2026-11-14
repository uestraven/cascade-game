/**
 * Opponent AI.
 *
 * Plain capture-counting is not enough: measurement showed only 17% of turns
 * have a unique best move by immediate captures, and on turn 1 nothing
 * captures at all, so a pure greedy bot plays the opening at random and feels
 * broken. `positional()` breaks those ties so the bot always has a reason.
 */

import {
  CASCADE_CAP, ELEMENT_BONUS, NEIGHBOURS, NCELLS, OPPOSITE,
  type Board, type Card,
  cloneBoard, face, isEmpty, ownerOf, place,
} from './engine';
import {
  type Candidate, type GameState, applyMove, legalMoves, toMove,
} from './game';
import { type Rng, choice } from './rng';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** How many board edges this cell has (centre 4, edge 3, corner 2). */
const DEGREE: readonly number[] = NEIGHBOURS.map(
  (row) => row.filter((n) => n >= 0).length,
);

/**
 * Exposure score for a just-placed card: the sum of face values pointing at
 * cells the opponent could still play into. Lower is safer, so we negate it.
 * A face of 3 or less aimed at an open cell is the classic weak flank.
 */
function positional(board: Board, cell: number, card: Card,
                    player: number): number {
  let exposure = 0;
  for (let side = 0; side < 4; side++) {
    const nb = NEIGHBOURS[cell][side];
    if (nb < 0) continue;                     // walls cost nothing
    if (!isEmpty(board, nb)) {
      // already settled; only an enemy neighbour threatens a counter
      if (ownerOf(board, nb) === 1 - player) {
        const mine = face(card, side);
        const theirs = face(board.cards[nb], OPPOSITE[side]);
        if (theirs >= mine) exposure += 1;
      }
      continue;
    }
    const v = face(card, side);
    // a low face aimed at an open cell invites capture next turn
    exposure += v <= 3 ? 3 : v <= 5 ? 1.5 : 0.25;
  }
  // mild preference for grabbing high-degree real estate early
  return -exposure + DEGREE[cell] * 0.15;
}

interface Scored extends Candidate { gain: number; pos: number }

function scoreAll(g: GameState): Scored[] {
  const player = toMove(g);
  const hand = g.hands[player];
  return legalMoves(g).map(({ cardIndex, cell }) => {
    const probe = cloneBoard(g.board);
    const { captured } = place(probe, cell, hand[cardIndex], player, {
      cap: CASCADE_CAP, bonus: ELEMENT_BONUS,
    });
    return {
      cardIndex, cell,
      gain: captured,
      pos: positional(g.board, cell, hand[cardIndex], player),
    };
  });
}

const bestOf = (rng: Rng, scored: Scored[],
                value: (s: Scored) => number): Candidate => {
  let best = -Infinity;
  let ties: Scored[] = [];
  for (const s of scored) {
    const v = value(s);
    if (v > best + 1e-9) { best = v; ties = [s]; }
    else if (Math.abs(v - best) <= 1e-9) ties.push(s);
  }
  return choice(rng, ties);
};

/** Captures only, random among ties. The weakest setting. */
export const pickEasy = (g: GameState, rng: Rng): Candidate =>
  bestOf(rng, scoreAll(g), (s) => s.gain);

/** Captures, with exposure breaking the ties. */
export const pickNormal = (g: GameState, rng: Rng): Candidate =>
  bestOf(rng, scoreAll(g), (s) => s.gain * 10 + s.pos);

/** Captures now, minus the opponent's best immediate reply. */
export function pickHard(g: GameState, rng: Rng): Candidate {
  const scored = scoreAll(g);
  const withReply = scored.map((s) => {
    const { state } = applyMove(g, s.cardIndex, s.cell);
    let reply = 0;
    if (!(state.turn >= 9)) {
      const opp = toMove(state);
      if (opp >= 0 && opp !== toMove(g)) {
        const oppHand = state.hands[opp];
        for (let j = 0; j < oppHand.length; j++) {
          for (const cell2 of emptyOf(state.board)) {
            const probe = cloneBoard(state.board);
            const r = place(probe, cell2, oppHand[j], opp, {
              cap: CASCADE_CAP, bonus: ELEMENT_BONUS,
            });
            if (r.captured > reply) reply = r.captured;
          }
        }
      }
    }
    return { ...s, gain: s.gain - reply };
  });
  return bestOf(rng, withReply, (s) => s.gain * 10 + s.pos);
}

function emptyOf(b: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < NCELLS; i++) if (isEmpty(b, i)) out.push(i);
  return out;
}

export function pick(g: GameState, rng: Rng,
                     difficulty: Difficulty = 'normal'): Candidate {
  switch (difficulty) {
    case 'easy': return pickEasy(g, rng);
    case 'hard': return pickHard(g, rng);
    default: return pickNormal(g, rng);
  }
}
