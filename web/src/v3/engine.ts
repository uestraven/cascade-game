/**
 * v3 rules engine. Port of v3.py, which is the normative reference.
 * Equivalence is proved by test/v3.diff.test.ts over 40,000 oracle positions.
 *
 * No numbers. A card is four distinct elements, one per edge, and a capture
 * is decided purely by which element faces which.
 */

export const GRID = 3;
export const NCELLS = 9;
export const ALL_CELLS = (1 << NCELLS) - 1;

/** Measured tunables. Changing one invalidates the others. */
export const ORDER: readonly number[] = [0, 1, 0, 1, 0, 1, 0, 1, 0];
/** Dealt ONCE at the start; there is no draw step. P1 plays all five;
 *  P2 plays four of six, so P2 always holds something in reserve -- that
 *  selection is what compensates P1 moving both first and last. A full
 *  planning hand is worth about twelve points of depth over drawing one
 *  at a time (72.4% vs 64.2%). */
export const HANDS: readonly [number, number] = [5, 6];
export const DECK_SIZE = 12;
export const CASCADE_CAP = 1;
/** The final card captures its neighbours but starts no CHAIN. Strict
 *  alternation on an odd board gives P1 both the first and the last move,
 *  and a live cascade there converts most of the board.
 *
 *  Rejected alternatives: also forcing that card to be played "as drawn"
 *  balanced better (2.7% vs 7.1%) but is not enforceable -- with free
 *  rotation elsewhere a card has no meaningful "up", and a card in hand is
 *  oriented however you hold it. Letting it capture nothing at all is far
 *  worse (72.2% seat edge, 12.8% depth): it makes the ninth placement a
 *  non-decision. */
export const FINAL_CASCADE_CAP = 0;
export const ROTATIONS = 4;

export const NORTH = 0, EAST = 1, SOUTH = 2, WEST = 3;
export const OPPSIDE: readonly number[] = [SOUTH, WEST, NORTH, EAST];
const DELTA: readonly [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]];

export const NB: readonly number[][] = (() => {
  const t: number[][] = [];
  for (let i = 0; i < NCELLS; i++) {
    const r = Math.floor(i / GRID), c = i % GRID;
    t.push(DELTA.map(([dr, dc]) => {
      const nr = r + dr, nc = c + dc;
      return nr >= 0 && nr < GRID && nc >= 0 && nc < GRID ? nr * GRID + nc : -1;
    }));
  }
  return t;
})();

// ---------------------------------------------------------------------------
// The wheel: every element beats 3, loses to 3, and is neutral with its twin.
// ---------------------------------------------------------------------------
export const FIRE = 1, WATER = 2, EARTH = 3, AIR = 4,
  LIGHTNING = 5, ICE = 6, LIGHT = 7, SHADOW = 8;

export const ELEMENTS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

export const NAMES: Record<number, string> = {
  1: 'Fire', 2: 'Water', 3: 'Earth', 4: 'Air',
  5: 'Lightning', 6: 'Ice', 7: 'Light', 8: 'Shadow',
};

/** Lightning and Light both start "Li", so Ln and Lt. */
export const CODES: Record<number, string> = {
  1: 'Fi', 2: 'Wa', 3: 'Ea', 4: 'Ai', 5: 'Ln', 6: 'Ic', 7: 'Lt', 8: 'Sh',
};

export const SLUGS: Record<number, string> = {
  1: 'fire', 2: 'water', 3: 'earth', 4: 'air',
  5: 'lightning', 6: 'ice', 7: 'light', 8: 'shadow',
};

export const TWIN: Record<number, number> = {
  [FIRE]: WATER, [WATER]: FIRE, [EARTH]: AIR, [AIR]: EARTH,
  [LIGHTNING]: ICE, [ICE]: LIGHTNING, [LIGHT]: SHADOW, [SHADOW]: LIGHT,
};

// Twin pairs form four groups in a cycle; each group beats the next outright
// and splits the opposite group one-for-one. That forces 3 out / 3 in.
const GROUPS: readonly number[][] = [
  [FIRE, WATER], [EARTH, AIR], [LIGHTNING, ICE], [LIGHT, SHADOW],
];
const CROSS: readonly [number, number][] = [
  [FIRE, ICE], [WATER, LIGHTNING], [EARTH, LIGHT], [AIR, SHADOW],
  [LIGHTNING, FIRE], [ICE, WATER], [LIGHT, AIR], [SHADOW, EARTH],
];

/** BEATS[e] is a bitmask over element ids. */
export const BEATS: readonly number[] = (() => {
  const b = new Array(9).fill(0);
  GROUPS.forEach((g, i) => {
    for (const a of g) for (const v of GROUPS[(i + 1) % 4]) b[a] |= 1 << v;
  });
  for (const [a, v] of CROSS) b[a] |= 1 << v;
  return b;
})();

/** Does `attacker` take `defender`? Twins and equals never resolve. */
export const beats = (attacker: number, defender: number): boolean =>
  ((BEATS[attacker] >>> defender) & 1) === 1;

export function wheelIsRegular(): boolean {
  for (const e of ELEMENTS) {
    const out = popcount(BEATS[e]);
    let inn = 0;
    for (const a of ELEMENTS) if (beats(a, e)) inn++;
    if (out !== 3 || inn !== 3) return false;
    for (const f of ELEMENTS) {
      if (f === e) continue;
      const neutral = !beats(e, f) && !beats(f, e);
      if (neutral !== (TWIN[e] === f)) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
/** Four distinct elements, clockwise from the top. */
export type Card = readonly [number, number, number, number];

export const CARDS: readonly Card[] = (() => {
  const out: Card[] = [];
  for (const a of ELEMENTS) for (const b of ELEMENTS) {
    if (b === a) continue;
    for (const c of ELEMENTS) {
      if (c === a || c === b) continue;
      for (const d of ELEMENTS) {
        if (d === a || d === b || d === c) continue;
        out.push([a, b, c, d] as Card);
      }
    }
  }
  return out;
})();

/** A quarter turn clockwise: the west edge moves to the top. */
export const rot90 = (c: Card): Card => [c[3], c[0], c[1], c[2]] as Card;
export const rot180 = (c: Card): Card => rot90(rot90(c));

/**
 * The orientations a placement may choose between: all four, every turn.
 *
 * A physical card can be rotated but never mirrored -- you cannot flip one
 * across an axis without turning it face-down -- so quarter turns are the
 * only candidates. `turn` is accepted and ignored so callers need not care.
 */
export function orientations(c: Card, _turn?: number): Card[] {
  return [c, rot90(c), rot180(c), rot90(rot180(c))];
}

export const cardName = (c: Card): string => c.map((e) => CODES[e]).join('/');

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------
export interface Board {
  cards: (Card | null)[];
  own: [number, number];
}

export const emptyBoard = (): Board =>
  ({ cards: new Array(NCELLS).fill(null), own: [0, 0] });

export const cloneBoard = (b: Board): Board =>
  ({ cards: b.cards.slice(), own: [b.own[0], b.own[1]] });

export function popcount(x: number): number {
  let v = x >>> 0, n = 0;
  while (v) { v &= v - 1; n++; }
  return n;
}

export const occupied = (b: Board): number => (b.own[0] | b.own[1]) & ALL_CELLS;
export const isEmpty = (b: Board, cell: number): boolean =>
  b.cards[cell] === null;
export const isFull = (b: Board): boolean => b.cards.every((c) => c !== null);

export function emptyCells(b: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < NCELLS; i++) if (b.cards[i] === null) out.push(i);
  return out;
}

export function ownerOf(b: Board, cell: number): number {
  if ((b.own[0] >>> cell) & 1) return 0;
  if ((b.own[1] >>> cell) & 1) return 1;
  return -1;
}

export const count = (b: Board, player: number): number =>
  popcount(b.own[player]);

export const capForTurn = (turn: number): number =>
  turn === ORDER.length - 1 ? FINAL_CASCADE_CAP : CASCADE_CAP;

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------
export interface Resolution {
  captured: number;
  /** One bitmask per wave that captured anything -- drives the animation. */
  waves: number[];
  /** Why each capture happened, for narration. Only filled when asked. */
  events?: CaptureEvent[];
}

/** A single capture, with the matchup that caused it. */
export interface CaptureEvent {
  wave: number;        // 0 = the placement itself, 1 = the ripple
  src: number;         // the attacking cell
  target: number;      // the cell taken
  attacker: number;    // element on the attacking edge
  defender: number;    // element on the edge it beat
  side: number;        // which way the attack pointed
}

/**
 * Place `card` for `player` on `cell`, then capture and cascade.
 *
 * Every capture in a chain accrues to `player`, so the opponent's count
 * strictly falls each wave and the chain always terminates.
 */
export function resolve(
  b: Board, cell: number, card: Card, player: number, cap = CASCADE_CAP,
  trace?: CaptureEvent[],
): Resolution {
  b.cards[cell] = card;
  b.own[player] = (b.own[player] | (1 << cell)) & ALL_CELLS;
  return cascadeFrom(b, 1 << cell, player, cap, trace);
}

/** The capture engine, starting from an arbitrary set of cells. */
export function cascadeFrom(
  b: Board, origin: number, player: number, cap = CASCADE_CAP,
  trace?: CaptureEvent[],
): Resolution {
  const opponent = 1 - player;
  let frontier = origin;
  let captured = 0;
  let depth = 0;
  const waves: number[] = [];

  while (frontier && depth <= cap) {
    let newly = 0;
    for (let src = 0; src < NCELLS; src++) {
      if (((frontier >>> src) & 1) === 0) continue;
      const sc = b.cards[src];
      if (!sc) continue;
      for (let d = 0; d < 4; d++) {
        const t = NB[src][d];
        if (t < 0) continue;
        if (((b.own[opponent] >>> t) & 1) === 0) continue;
        const tc = b.cards[t];
        if (!tc) continue;
        if (beats(sc[d], tc[OPPSIDE[d]])) {
          if (((newly >>> t) & 1) === 0 && trace) {
            trace.push({ wave: depth, src, target: t,
                         attacker: sc[d], defender: tc[OPPSIDE[d]], side: d });
          }
          newly |= 1 << t;
        }
      }
    }
    if (newly) {
      b.own[player] = (b.own[player] | newly) & ALL_CELLS;
      b.own[opponent] = (b.own[opponent] & ~newly) & ALL_CELLS;
      captured += popcount(newly);
      waves.push(newly);
    }
    frontier = newly;
    depth++;
  }
  return { captured, waves, events: trace };
}
