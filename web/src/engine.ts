/**
 * Rules engine. Port of engine.py, which is the normative reference for this
 * game -- every balance figure in the design was measured against it.
 * Equivalence is proved, not assumed: see test/engine.diff.test.ts, which
 * replays 40,000 oracle-generated positions through this file.
 *
 * Cards are kept as PACKED INTEGERS here rather than objects, matching the
 * oracle's representation exactly. That removes a whole class of conversion
 * bug from the differential test. Use faces()/element() for display.
 */

export const GRID = 3;
export const NCELLS = 9;
export const ALL_CELLS = (1 << NCELLS) - 1;

/** Validated tunables. Changing these invalidates the measured balance. */
export const CASCADE_CAP = 1;
export const ELEMENT_BONUS = 2;
export const TURN_ORDER: readonly number[] = [0, 0, 1, 1, 0, 0, 1, 1, 0];
export const HAND_SIZES: readonly [number, number] = [5, 4];

export const NORTH = 0, EAST = 1, SOUTH = 2, WEST = 3;
export const OPPOSITE: readonly number[] = [SOUTH, WEST, NORTH, EAST];
const DELTA: readonly [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]];

/** NEIGHBOURS[cell][side] -> cell index, or -1 off the board. */
export const NEIGHBOURS: readonly number[][] = (() => {
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
// Elements: stored 1..8, with 0 meaning "no element".
// ---------------------------------------------------------------------------
export const NO_ELEMENT = 0;
export const FIRE = 1, WATER = 2, EARTH = 3, AIR = 4,
  LIGHTNING = 5, ICE = 6, SHADOW = 7, LIGHT = 8;

export const ELEMENT_NAMES: readonly string[] = [
  'Fire', 'Water', 'Earth', 'Air', 'Lightning', 'Ice', 'Shadow', 'Light',
];

const WHEEL: Record<number, number[]> = {
  [FIRE]: [ICE, AIR],
  [WATER]: [FIRE, LIGHTNING],
  [EARTH]: [WATER, SHADOW],
  [AIR]: [EARTH, LIGHT],
  [LIGHTNING]: [AIR, SHADOW],
  [ICE]: [EARTH, LIGHTNING],
  [SHADOW]: [LIGHT, FIRE],
  [LIGHT]: [ICE, WATER],
};

/** BEATS[e] is a bitmask of the elements e defeats. */
export const BEATS: readonly number[] = (() => {
  const b = new Array(9).fill(0);
  for (const k of Object.keys(WHEEL)) {
    const e = Number(k);
    for (const victim of WHEEL[e]) b[e] |= 1 << victim;
  }
  return b;
})();

/** Every element beats exactly two and loses to exactly two. */
export function wheelIsRegular(): boolean {
  for (let e = 1; e <= 8; e++) {
    if (popcount(BEATS[e]) !== 2) return false;
    let losses = 0;
    for (let a = 1; a <= 8; a++) if ((BEATS[a] >>> e) & 1) losses++;
    if (losses !== 2) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Card packing: four 4-bit faces (N,E,S,W) plus a 4-bit element at bit 16.
// A packed card is never 0 because every face is >= 1, so 0 doubles as
// "empty cell".
// ---------------------------------------------------------------------------
export type Card = number;
const ELEM_SHIFT = 16;
const NIBBLE = 0xf;

export function makeCard(
  n: number, e: number, s: number, w: number, element = NO_ELEMENT,
): Card {
  for (const v of [n, e, s, w]) {
    if (!Number.isInteger(v) || v < 1 || v > 10) {
      throw new Error(`face ${v} outside 1..10`);
    }
  }
  if (!Number.isInteger(element) || element < 0 || element > 8) {
    throw new Error(`element ${element} outside 0..8`);
  }
  if (Math.min(n, e, s, w) > 3) {
    throw new Error('weak-flank rule: at least one face must be <= 3');
  }
  return n | (e << 4) | (s << 8) | (w << 12) | (element << ELEM_SHIFT);
}

export const face = (card: Card, side: number): number =>
  (card >>> (side * 4)) & NIBBLE;

export const faces = (card: Card): [number, number, number, number] => [
  card & NIBBLE, (card >>> 4) & NIBBLE,
  (card >>> 8) & NIBBLE, (card >>> 12) & NIBBLE,
];

export const element = (card: Card): number =>
  (card >>> ELEM_SHIFT) & NIBBLE;

export function cardName(card: Card): string {
  const [n, e, s, w] = faces(card);
  const el = element(card);
  return `${n}/${e}/${s}/${w} ${el ? ELEMENT_NAMES[el - 1] : '-'}`;
}

/** Faces rotated 90 degrees clockwise: the west face moves to the top. */
export function rotateCW(card: Card): Card {
  const [n, e, s, w] = faces(card);
  return w | (n << 4) | (e << 8) | (s << 12) | (element(card) << ELEM_SHIFT);
}

/** Every face lowered by `amount`, never below `floor`. */
export function weaken(card: Card, amount = 1, floor = 1): Card {
  const [n, e, s, w] = faces(card).map((v) => Math.max(floor, v - amount));
  return n | (e << 4) | (s << 8) | (w << 12) | (element(card) << ELEM_SHIFT);
}

// ---------------------------------------------------------------------------
// The legal card pool: the weak-flank rule, 7,599 face combinations.
// ---------------------------------------------------------------------------
export const LEGAL_FACES: readonly [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [];
  for (let n = 1; n <= 10; n++) {
    for (let e = 1; e <= 10; e++) {
      for (let s = 1; s <= 10; s++) {
        for (let w = 1; w <= 10; w++) {
          if (Math.min(n, e, s, w) <= 3) out.push([n, e, s, w]);
        }
      }
    }
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Board. Ownership is two 9-bit masks; cards are packed ints.
// ---------------------------------------------------------------------------
export interface Board {
  cards: Card[];
  own: [number, number];
}

export const emptyBoard = (): Board => ({
  cards: new Array(NCELLS).fill(0),
  own: [0, 0],
});

export const cloneBoard = (b: Board): Board => ({
  cards: b.cards.slice(),
  own: [b.own[0], b.own[1]],
});

export function popcount(x: number): number {
  let v = x >>> 0, n = 0;
  while (v) { v &= v - 1; n++; }
  return n;
}

export const occupied = (b: Board): number => (b.own[0] | b.own[1]) & ALL_CELLS;
export const isEmpty = (b: Board, cell: number): boolean =>
  ((occupied(b) >>> cell) & 1) === 0;

export function emptyCells(b: Board): number[] {
  const occ = occupied(b), out: number[] = [];
  for (let i = 0; i < NCELLS; i++) if (((occ >>> i) & 1) === 0) out.push(i);
  return out;
}

export function ownerOf(b: Board, cell: number): number {
  if ((b.own[0] >>> cell) & 1) return 0;
  if ((b.own[1] >>> cell) & 1) return 1;
  return -1;
}

export const count = (b: Board, player: number): number =>
  popcount(b.own[player]);

export const isFull = (b: Board): boolean => occupied(b) === ALL_CELLS;

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------
/**
 * Does `attacker` capture `defender` across `side`?
 *
 * `attackBonus` is an offence-only modifier belonging to the attacking player
 * (the Prince aura). It is never written back to a card, so a card's weak
 * flank stays weak whenever that card is the one defending.
 */
export function beats(
  attacker: Card, side: number, defender: Card,
  bonus = ELEMENT_BONUS, attackBonus = 0,
): boolean {
  let att = face(attacker, side) + attackBonus;
  let def = face(defender, OPPOSITE[side]);
  const ae = element(attacker), de = element(defender);
  if (ae && de) {
    if ((BEATS[ae] >>> de) & 1) att += bonus;
    else if ((BEATS[de] >>> ae) & 1) def += bonus;
  }
  return att > def;
}

export interface CascadeOptions {
  cap?: number;
  bonus?: number;
  attackBonus?: number;
  /** Cells that can never be captured (Leto's frozen cards). */
  protectedMask?: number;
}

export interface Resolution {
  captured: number;
  /** One bitmask per wave that captured anything -- drives the animation. */
  waves: number[];
}

/**
 * Run a capture wave from `originMask`, then up to `cap` further ripples.
 *
 * Every capture accrues to `player`, so the opponent's card count strictly
 * decreases each wave and the chain always terminates. A card cannot flip
 * twice within one resolution.
 */
export function cascade(
  b: Board, originMask: number, player: number, opts: CascadeOptions = {},
): Resolution {
  const cap = opts.cap ?? CASCADE_CAP;
  const bonus = opts.bonus ?? ELEMENT_BONUS;
  const attackBonus = opts.attackBonus ?? 0;
  const prot = opts.protectedMask ?? 0;

  const opponent = 1 - player;
  let frontier = originMask;
  let captured = 0;
  let depth = 0;
  const waves: number[] = [];

  while (frontier && depth <= cap) {
    let newly = 0;
    for (let src = 0; src < NCELLS; src++) {
      if (((frontier >>> src) & 1) === 0) continue;
      const srcCard = b.cards[src];
      const row = NEIGHBOURS[src];
      for (let side = 0; side < 4; side++) {
        const target = row[side];
        if (target < 0) continue;
        if ((prot >>> target) & 1) continue;
        if (((b.own[opponent] >>> target) & 1) === 0) continue;
        if (beats(srcCard, side, b.cards[target], bonus, attackBonus)) {
          newly |= 1 << target;
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
  return { captured, waves };
}

/** Place `card` for `player` on `cell`, then resolve captures and cascades. */
export function place(
  b: Board, cell: number, card: Card, player: number,
  opts: CascadeOptions = {},
): Resolution {
  if (!isEmpty(b, cell)) throw new Error(`cell ${cell} is occupied`);
  b.cards[cell] = card;
  b.own[player] = (b.own[player] | (1 << cell)) & ALL_CELLS;
  return cascade(b, 1 << cell, player, opts);
}
