/**
 * Prototype A -- four sigils, matching captures.
 *
 *   symbols provide constraints   -- which edges can interact
 *   abilities provide opportunity -- what you can change
 *   positioning decides           -- whether it works
 *
 * MATCHING FACING SIGILS CAPTURE. Different sigils do nothing. There is
 * no hierarchy, no twin, no wheel. Only the acting card attacks, so two
 * stationary cards showing the same sigil never trade.
 *
 * Matching is SYMMETRIC where the old eight-element wheel was
 * antisymmetric, which is a change worth naming because the wheel's
 * antisymmetry quietly underwrote the proof that cascades terminate.
 * Measured on the Python oracle over 40,000 chains: the opponent never
 * gains a cell on your turn and capture counts reconcile with ownership
 * exactly, because captures still accrue only to the placer. Ownership
 * still moves one way, so the chain still terminates and still resolves
 * in any order.
 *
 * Verified against proto.py by a differential fixture.
 */

export const NSYM = 4;
export const SIGILS = [0, 1, 2, 3] as const;
export const SIGIL_NAMES = ['halo', 'ward', 'crux', 'gyre'] as const;
export type Sigil = 0 | 1 | 2 | 3;

/** N, E, S, W. */
export type Card = readonly [Sigil, Sigil, Sigil, Sigil];

export const NORTH = 0, EAST = 1, SOUTH = 2, WEST = 3;
export const OPPSIDE: readonly number[] = [SOUTH, WEST, NORTH, EAST];

export const CASCADE_CAP = 1;
export const FINAL_CAP = 0;
export const ROTATIONS = 4;

export interface Shape {
  rows: number;
  cols: number;
  cells: number;
  /** neighbour cell per side, or -1 off the board */
  nb: readonly (readonly number[])[];
  /** turn order; its length is the number of placements */
  order: readonly number[];
  hands: readonly [number, number];
  deck: number;
}

const DELTA = [[-1, 0], [0, 1], [1, 0], [0, -1]] as const;

export function makeShape(rows: number, cols: number,
                          hands: [number, number], deck: number,
                          placements?: number): Shape {
  const cells = rows * cols;
  const nb: number[][] = [];
  for (let i = 0; i < cells; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    nb.push(DELTA.map(([dr, dc]) => {
      const nr = r + dr, nc = c + dc;
      return (nr >= 0 && nr < rows && nc >= 0 && nc < cols)
        ? nr * cols + nc : -1;
    }));
  }
  const n = placements ?? cells;
  const order: number[] = [];
  for (let i = 0; i < n; i++) order.push(i % 2);
  return { rows, cols, cells, nb, order, hands, deck };
}

/**
 * The three boards that measured balanced. All of them land within five
 * points of even, so the board is a choice about length and feel rather
 * than about fairness -- which the eight-element game could not say,
 * because 3x4 and 4x4 were unbalanceable there.
 *
 * On an even board one cell is deliberately left empty: eight or sixteen
 * owned cells can split evenly, and leaving one out forces an odd margin
 * so a draw cannot happen.
 */
export const BOARDS = {
  '3x3': makeShape(3, 3, [5, 5], 12),            // 9 placements, P1 45.4%
  '3x4': makeShape(3, 4, [6, 7], 16, 11),        // 1 cell spare, P1 46.6%
  '4x4': makeShape(4, 4, [8, 8], 20, 15),        // 1 cell spare, P1 45.1%
} as const;
export type BoardName = keyof typeof BOARDS;

export const rot90 = (c: Card): Card => [c[3], c[0], c[1], c[2]] as Card;
export const rot180 = (c: Card): Card => rot90(rot90(c));

export function orientations(c: Card): Card[] {
  const out: Card[] = [];
  let x = c;
  for (let i = 0; i < ROTATIONS; i++) { out.push(x); x = rot90(x); }
  return out;
}

export function capForTurn(s: Shape, turn: number): number {
  return turn === s.order.length - 1 ? FINAL_CAP : CASCADE_CAP;
}

export interface Board {
  cards: (Card | null)[];
  own: [number, number];
}

export const emptyBoard = (s: Shape): Board =>
  ({ cards: Array(s.cells).fill(null), own: [0, 0] });

export const cloneBoard = (b: Board): Board =>
  ({ cards: b.cards.slice(), own: [b.own[0], b.own[1]] });

export const popcount = (x: number): number => {
  let n = 0;
  for (let v = x; v; v &= v - 1) n++;
  return n;
};

export const emptyCells = (s: Shape, b: Board): number[] => {
  const out: number[] = [];
  for (let i = 0; i < s.cells; i++) if (b.cards[i] === null) out.push(i);
  return out;
};

export const count = (b: Board, p: number): number => popcount(b.own[p]);

export interface CaptureEvent {
  wave: number; src: number; target: number;
  sigil: Sigil; side: number; wild: boolean;
}

export interface Resolution { captured: number; waves: number[] }

/**
 * The capture engine. `wild` is an optional [cell, side] whose sigil
 * matches anything -- that is Prism.
 */
export function cascadeFrom(
  s: Shape, b: Board, origin: number, player: number, cap: number,
  wild?: readonly [number, number] | null,
  trace?: CaptureEvent[],
): Resolution {
  const opp = 1 - player;
  let frontier = origin, captured = 0, depth = 0;
  const waves: number[] = [];
  while (frontier && depth <= cap) {
    let newly = 0;
    for (let src = 0; src < s.cells; src++) {
      if (((frontier >>> src) & 1) === 0) continue;
      const sc = b.cards[src];
      if (!sc) continue;
      for (let d = 0; d < 4; d++) {
        const t = s.nb[src][d];
        if (t < 0) continue;
        if (((b.own[opp] >>> t) & 1) === 0) continue;
        const tc = b.cards[t];
        if (!tc) continue;
        const isWild = !!wild && wild[0] === src && wild[1] === d;
        if (isWild || sc[d] === tc[OPPSIDE[d]]) {
          if (((newly >>> t) & 1) === 0 && trace) {
            trace.push({ wave: depth, src, target: t, sigil: sc[d],
                         side: d, wild: isWild });
          }
          newly |= 1 << t;
        }
      }
    }
    if (newly) {
      b.own[player] |= newly;
      b.own[opp] &= ~newly;
      captured += popcount(newly);
      waves.push(newly);
    }
    frontier = newly;
    depth += 1;
  }
  return { captured, waves };
}
