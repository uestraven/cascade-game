/**
 * v3 game layer: state, dealing, moves, abilities.
 *
 * engine.ts stays pure (edges only) because that is what the 40,000-case
 * differential fixture verifies. The richer card -- sigil and ability --
 * lives here, on top of it.
 */

import {
  ALL_CELLS, CARDS, DECK_SIZE, ELEMENTS, HANDS, ICE, NB, NCELLS, ORDER,
  OPPSIDE, TWIN, type Board, type Card, type CaptureEvent, type Resolution,
  beats, capForTurn, cascadeFrom, cloneBoard, count, emptyBoard, emptyCells,
  orientations, resolve, rot90, rot180,
} from './engine';
import { type Rng, choice, mulberry32 } from '../rng';

// ---------------------------------------------------------------------------
// Abilities. Costs are the measured tiers: only free and one affinity fit a
// nine-turn game -- at two affinity an ability fires in 25-62% of games,
// which is a gamble rather than a cost.
// ---------------------------------------------------------------------------
export type AbilityId =
  | 'conduit' | 'scorch' | 'gust' | 'tremor' | 'eclipse'
  | 'tide' | 'glaciate' | 'beacon' | 'backlash' | 'arc' | 'upheaval'
  | 'umbra' | 'cyclone' | 'surge';

export interface AbilityDef {
  /** flavour only -- it no longer gates anything */
  element: number;
  text: string;
  /**
   * STALE. These were measured through v3_abilities.play(), which still
   * draws a card every turn -- a hand model the game dropped in favour of
   * dealing 5 and 6 once. Through that path the no-ability baseline is
   * already P1 71.4%, so these were never win rates against a neutral.
   *
   * Re-measured under the shipped rules by ability_power.py, seats
   * swapped, for the eight in the physical test deck:
   *
   *   gust 59  beacon 57  tide 56  tremor 55
   *   arc 53   eclipse 52  conduit 52  scorch 46     (neutral = 50)
   *
   * Gust and Beacon are too strong; Scorch is a trap -- used in 73% of
   * games, loses with it, and drops depth from 70% to 57%. The other five
   * are not re-measured. Do not quote this field in the UI until it is.
   */
  power: string;
}

/**
 * An ability may be used from your SECOND placement onward.
 *
 * This replaced a sigil-and-affinity cost, which was deleted. That system
 * made an ability affordable only 21% of the times you held one, left half
 * of all games with no usable ability at all, and -- backwards from its
 * whole purpose -- punished sigil concentration, because you only ever play
 * five cards and an element-specific cost cannot reliably be met in four
 * prior placements. Matching the sigil to the ability's own element barely
 * helped (21.6%). A flat turn gate gets 69% affordability with nothing
 * printed on the card.
 */
export const ABILITY_FROM_PLACEMENT = 2;

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  conduit: { element: 5, power: '52.5 / 66.1',
    text: 'Trigger this card’s cascade from an adjacent card you control instead of from this one.' },
  arc: { element: 5, power: '50.7 / 67.0',
    text: 'Trigger this card’s cascade from ANY card you control.' },
  scorch: { element: 1, power: '51.6 / 67.8',
    text: 'Also attack one diagonal neighbour, using the edge nearest it.' },
  backlash: { element: 1, power: '49.8 / 64.7',
    text: 'Also attack in a straight line through one empty cell.' },
  gust: { element: 4, power: '53.6 / 64.0',
    text: 'Rotate one adjacent card 90°.' },
  cyclone: { element: 4, power: '52.2 / 63.5',
    text: 'Rotate every card on the board 90°.' },
  tremor: { element: 3, power: '52.7 / 65.6',
    text: 'Rotate every card adjacent to this one 180°.' },
  upheaval: { element: 3, power: '50.7 / 64.0',
    text: 'Rotate this card and every adjacent card you control 90°.' },
  eclipse: { element: 8, power: '52.8 / 65.4',
    text: 'This turn, treat each of this card’s edges as its twin element.' },
  umbra: { element: 8, power: '51.8 / 65.9',
    text: 'One adjacent enemy card’s edges count as their twins this turn.' },
  tide: { element: 2, power: '50.7 / 63.1',
    text: 'Swap this card’s position with an adjacent card you control.' },
  glaciate: { element: 6, power: '50.7 / 64.0',
    text: 'This turn, treat all four of this card’s edges as Ice.' },
  beacon: { element: 7, power: '52.5 / 63.8',
    text: 'Attack one adjacent enemy card with the edge of your choice.' },
  // PRINCE, ported from the deleted leader subsystem. As a free leader
  // action this was worth +15 to +18 and detonated on the final turn in
  // ~78% of games; as a card that costs a placement it measured 68.7%
  // instant and 52.6% delayed.
  surge: { element: 5, power: '68.7 instant / 52.6 delayed',
    text: 'The chain starts from EVERY card you control, not just this one.' },
};

/** Deckbuilding: at most this many ability cards in a deck.
 *
 *  This is a LEGIBILITY rule, not a balance patch. Measured: a deck of
 *  twelve ability cards against one with none wins 54.4% -- about four
 *  points -- and density-matched play shows no trend at all. The cap exists
 *  so abilities stay highlights instead of homework. */
export const MAX_ABILITY_CARDS = 5;

export const ABILITY_IDS = Object.keys(ABILITIES) as AbilityId[];

/** Straight-line reach: [midCell, farCell, edgeIndex] per cell. */
export const LINE: readonly [number, number, number][][] = (() => {
  const out: [number, number, number][][] = [];
  const D = [[-1, 0], [0, 1], [1, 0], [0, -1]] as const;
  for (let i = 0; i < NCELLS; i++) {
    const r = Math.floor(i / 3), c = i % 3;
    const row: [number, number, number][] = [];
    D.forEach(([dr, dc], d) => {
      const mr = r + dr, mc = c + dc, fr = r + 2 * dr, fc = c + 2 * dc;
      if (fr >= 0 && fr < 3 && fc >= 0 && fc < 3) {
        row.push([mr * 3 + mc, fr * 3 + fc, d]);
      }
    });
    out.push(row);
  }
  return out;
})();

/** Diagonal neighbours, with the edge index that points at each. */
export const DIAG: readonly [number, number][][] = (() => {
  const out: [number, number][][] = [];
  for (let i = 0; i < NCELLS; i++) {
    const r = Math.floor(i / 3), c = i % 3;
    const row: [number, number][] = [];
    for (const [dr, dc, near] of
         [[-1, -1, 0], [-1, 1, 0], [1, -1, 2], [1, 1, 2]] as const) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 3 && nc >= 0 && nc < 3) row.push([nr * 3 + nc, near]);
    }
    out.push(row);
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
export interface GameCard {
  edges: Card;
  ability: AbilityId | null;
}

export const randomCard = (rng: Rng, abilityChance = 0.45): GameCard => ({
  edges: choice(rng, CARDS),
  ability: rng() < abilityChance ? choice(rng, ABILITY_IDS) : null,
});

export const twinEdges = (c: Card): Card =>
  c.map((e) => TWIN[e]) as unknown as Card;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export interface Move {
  player: number;
  handIndex: number;
  cell: number;
  /** the card as actually placed, after the player's chosen rotation */
  placed: GameCard;
  option: Option;
}

export type Option =
  | null
  | { kind: 'eclipse' | 'tremor' | 'glaciate' | 'cyclone' | 'upheaval'
          | 'surge' }
  | { kind: 'gust' | 'conduit' | 'arc' | 'tide' | 'umbra'; cell: number }
  | { kind: 'scorch' | 'backlash'; cell: number; near: number }
  | { kind: 'beacon'; cell: number; near: number; edge: number };

export interface GameState {
  board: Board;
  hands: [GameCard[], GameCard[]];
  decks: [GameCard[], GameCard[]];
  turn: number;
  history: Move[];
  seed: number;
}

/** A legal deck: at most MAX_ABILITY_CARDS of its cards carry an ability. */
export function buildDeck(rng: Rng, size = DECK_SIZE,
                          maxAbilities = MAX_ABILITY_CARDS): GameCard[] {
  const n = Math.min(maxAbilities, size);
  const deck: GameCard[] = [];
  for (let i = 0; i < n; i++) deck.push(randomCard(rng, 1));
  for (let i = n; i < size; i++) deck.push(randomCard(rng, 0));
  // shuffle so the ability cards are not all at the top
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export const abilityCount = (deck: GameCard[]): number =>
  deck.filter((c) => c.ability !== null).length;

export function newGame(seed: number): GameState {
  const rng = mulberry32(seed);
  const size = Math.max(DECK_SIZE, HANDS[0], HANDS[1]);
  const piles: GameCard[][] = [buildDeck(rng, size), buildDeck(rng, size)];
  return {
    board: emptyBoard(),
    hands: [piles[0].slice(0, HANDS[0]), piles[1].slice(0, HANDS[1])],
    decks: [piles[0].slice(HANDS[0]), piles[1].slice(HANDS[1])],
    turn: 0,
    history: [],
    seed,
  };
}

export const isOver = (g: GameState): boolean => g.turn >= ORDER.length;
export const toMove = (g: GameState): number =>
  isOver(g) ? -1 : ORDER[g.turn];

/** How many cards this player has placed so far. */
export const placedCount = (g: GameState, player: number): number =>
  g.history.filter((m) => m.player === player).length;

/** Abilities come online from your second placement. */
export function abilityLive(g: GameState, player: number,
                            card: GameCard): boolean {
  if (!card.ability) return false;
  return placedCount(g, player) >= ABILITY_FROM_PLACEMENT - 1;
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------
export interface Candidate {
  handIndex: number;
  cell: number;
  edges: Card;
  option: Option;
  /** Leto: the cell the cascade starts from, if not the placed card. */
  origin?: number;
}

export function abilityOptions(g: GameState, player: number,
                               card: GameCard, cell: number): Option[] {
  if (!abilityLive(g, player, card)) return [null];
  const b = g.board;
  const out: Option[] = [null];
  const mine = b.own[player], theirs = b.own[1 - player];
  switch (card.ability) {
    case 'eclipse':
    case 'tremor':
    case 'glaciate':
    case 'cyclone':
    case 'upheaval':
    case 'surge':
      out.push({ kind: card.ability });
      break;
    case 'gust':
      for (let d = 0; d < 4; d++) {
        const t = NB[cell][d];
        if (t >= 0 && b.cards[t]) out.push({ kind: 'gust', cell: t });
      }
      break;
    case 'conduit':
      for (let d = 0; d < 4; d++) {
        const t = NB[cell][d];
        if (t >= 0 && ((mine >>> t) & 1)) {
          out.push({ kind: 'conduit', cell: t });
        }
      }
      break;
    case 'arc':
      for (let t = 0; t < NCELLS; t++) {
        if (t !== cell && ((mine >>> t) & 1)) {
          out.push({ kind: 'arc', cell: t });
        }
      }
      break;
    case 'tide':
      for (let d = 0; d < 4; d++) {
        const t = NB[cell][d];
        if (t >= 0 && ((mine >>> t) & 1)) out.push({ kind: 'tide', cell: t });
      }
      break;
    case 'umbra':
      for (let d = 0; d < 4; d++) {
        const t = NB[cell][d];
        if (t >= 0 && ((theirs >>> t) & 1)) {
          out.push({ kind: 'umbra', cell: t });
        }
      }
      break;
    case 'scorch':
      for (const [t, near] of DIAG[cell]) {
        if (b.cards[t] && ((theirs >>> t) & 1)) {
          out.push({ kind: 'scorch', cell: t, near });
        }
      }
      break;
    case 'backlash':
      for (const [mid, far, d] of LINE[cell]) {
        if (b.cards[mid] === null && b.cards[far] &&
            ((theirs >>> far) & 1)) {
          out.push({ kind: 'backlash', cell: far, near: d });
        }
      }
      break;
    case 'beacon':
      for (let d = 0; d < 4; d++) {
        const t = NB[cell][d];
        if (t < 0 || !b.cards[t] || !((theirs >>> t) & 1)) continue;
        for (let edge = 0; edge < 4; edge++) {
          out.push({ kind: 'beacon', cell: t, near: d, edge });
        }
      }
      break;
  }
  return out;
}

export function legalMoves(g: GameState): Candidate[] {
  if (isOver(g)) return [];
  const player = toMove(g);
  const cells = emptyCells(g.board);
  const out: Candidate[] = [];
  const origins: (number | undefined)[] = [undefined];
  g.hands[player].forEach((card, handIndex) => {
    for (const edges of orientations(card.edges, g.turn)) {
      for (const cell of cells) {
        for (const option of abilityOptions(g, player, card, cell)) {
          for (const origin of origins) {
            out.push({ handIndex, cell, edges, option, origin });
          }
        }
      }
    }
  });
  return out;
}

export interface Applied {
  state: GameState;
  resolution: Resolution;
  move: Move;
  /** every capture with the matchup that caused it, for narration */
  events: CaptureEvent[];
}

export function applyMove(g: GameState, c: Candidate): Applied {
  if (isOver(g)) throw new Error('game is over');
  const player = toMove(g);
  const hand = g.hands[player];
  if (c.handIndex < 0 || c.handIndex >= hand.length) {
    throw new Error(`no card ${c.handIndex} in hand`);
  }
  if (!emptyCells(g.board).includes(c.cell)) {
    throw new Error(`cell ${c.cell} is occupied`);
  }

  const board = cloneBoard(g.board);
  const original = hand[c.handIndex];
  const live = abilityLive(g, player, original);
  const opt = live ? c.option : null;

  // Modifiers resolve BEFORE any comparison, so they can set up the
  // capture that follows rather than merely annoying the opponent.
  let placedEdges = c.edges;
  if (opt?.kind === 'eclipse') placedEdges = twinEdges(placedEdges);
  if (opt?.kind === 'glaciate') placedEdges = [ICE, ICE, ICE, ICE] as Card;
  if (opt?.kind === 'upheaval') {
    placedEdges = rot90(placedEdges);
    for (let d = 0; d < 4; d++) {
      const t = NB[c.cell][d];
      if (t >= 0 && board.cards[t] && ((board.own[player] >>> t) & 1)) {
        board.cards[t] = rot90(board.cards[t]!);
      }
    }
  }
  if (opt?.kind === 'gust') {
    board.cards[opt.cell] = rot90(board.cards[opt.cell]!);
  }
  if (opt?.kind === 'cyclone') {
    for (let t = 0; t < NCELLS; t++) {
      if (board.cards[t]) board.cards[t] = rot90(board.cards[t]!);
    }
  }
  if (opt?.kind === 'tremor') {
    for (let d = 0; d < 4; d++) {
      const t = NB[c.cell][d];
      if (t >= 0 && board.cards[t]) {
        board.cards[t] = rot180(board.cards[t]!);
      }
    }
  }
  if (opt?.kind === 'umbra') {
    board.cards[opt.cell] = twinEdges(board.cards[opt.cell]!);
  }

  const placed: GameCard = { ...original, edges: placedEdges };
  const cap = capForTurn(g.turn);
  const events: CaptureEvent[] = [];

  // Conduit redirects the chain's origin; the card still lands on `cell`.
  let resolution: Resolution;
  if (opt?.kind === 'surge') {
    // PRINCE, ported: the chain starts from every card you control. The
    // placed card lands first so it is included.
    board.cards[c.cell] = placedEdges;
    board.own[player] = (board.own[player] | (1 << c.cell)) & ALL_CELLS;
    resolution = cascadeFrom(board, board.own[player], player, cap, events);
  } else if (opt?.kind === 'conduit' || opt?.kind === 'arc') {
    board.cards[c.cell] = placedEdges;
    board.own[player] = (board.own[player] | (1 << c.cell)) & ALL_CELLS;
    resolution = resolveFrom(board, opt.cell, player, cap, events);
  } else if (opt?.kind === 'tide') {
    // land, then trade places with one of your own cards
    board.cards[c.cell] = placedEdges;
    board.own[player] = (board.own[player] | (1 << c.cell)) & ALL_CELLS;
    const tmp = board.cards[c.cell];
    board.cards[c.cell] = board.cards[opt.cell];
    board.cards[opt.cell] = tmp;
    resolution = resolveFrom(board, opt.cell, player, cap, events);
  } else if (c.origin !== undefined) {
    board.cards[c.cell] = placedEdges;
    board.own[player] = (board.own[player] | (1 << c.cell)) & ALL_CELLS;
    resolution = resolveFrom(board, c.origin, player, cap, events);
  } else {
    resolution = resolve(board, c.cell, placedEdges, player, cap, events);
  }

  // Reach resolves AFTER the chain, so it cannot feed the cascade.
  if (opt?.kind === 'scorch' || opt?.kind === 'backlash' ||
      opt?.kind === 'beacon') {
    const target = board.cards[opt.cell];
    const attacker = opt.kind === 'beacon'
      ? placedEdges[opt.edge] : placedEdges[opt.near];
    if (target && ((board.own[1 - player] >>> opt.cell) & 1) &&
        beats(attacker, target[OPPSIDE[opt.near]])) {
      board.own[player] |= 1 << opt.cell;
      board.own[1 - player] &= ~(1 << opt.cell);
      resolution = {
        captured: resolution.captured + 1,
        waves: [...resolution.waves, 1 << opt.cell],
      };
    }
  }

  const hands: [GameCard[], GameCard[]] = [g.hands[0].slice(), g.hands[1].slice()];
  hands[player] = hands[player].filter((_, i) => i !== c.handIndex);
  // No draw step: hands are dealt once and only ever shrink.
  const decks: [GameCard[], GameCard[]] = [g.decks[0], g.decks[1]];

  const move: Move = {
    player, handIndex: c.handIndex, cell: c.cell, placed, option: opt,
  };
  return {
    state: { ...g, board, hands, decks,
             turn: g.turn + 1, history: [...g.history, move] },
    resolution, move, events,
  };
}

/** Cascade starting from an existing card rather than a fresh placement. */
function resolveFrom(b: Board, origin: number, player: number,
                     cap: number, trace?: CaptureEvent[]): Resolution {
  const card = b.cards[origin]!;
  const saveOwn: [number, number] = [b.own[0], b.own[1]];
  const r = resolve(b, origin, card, player, cap, trace);
  // resolve() re-asserts ownership of `origin`, which Conduit already owned
  if (((saveOwn[player] >>> origin) & 1) === 0) {
    b.own[player] = saveOwn[player];
    b.own[1 - player] = saveOwn[1 - player];
  }
  return r;
}

export const score = (g: GameState): [number, number] =>
  [count(g.board, 0), count(g.board, 1)];

export function winner(g: GameState): number {
  if (!isOver(g)) throw new Error('game is not finished');
  const [a, b] = score(g);
  if (a === b) throw new AssertionError();
  return a > b ? 0 : 1;
}

class AssertionError extends Error {
  constructor() { super('draw on an odd board -- rules violated'); }
}

/** Ownership after each animation frame: the placement, then each wave. */
export function ownershipSteps(
  before: Board, move: { player: number; cell: number }, waves: number[],
): [number, number][] {
  const own: [number, number] = [before.own[0], before.own[1]];
  if (move.cell >= 0) {
    own[move.player] = (own[move.player] | (1 << move.cell)) & ALL_CELLS;
  }
  const steps: [number, number][] = [[own[0], own[1]]];
  let cur: [number, number] = [own[0], own[1]];
  for (const wave of waves) {
    const next: [number, number] = [cur[0], cur[1]];
    next[move.player] = (next[move.player] | wave) & ALL_CELLS;
    next[1 - move.player] = (next[1 - move.player] & ~wave) & ALL_CELLS;
    steps.push(next);
    cur = next;
  }
  return steps;
}
