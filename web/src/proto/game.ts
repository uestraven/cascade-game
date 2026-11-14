/**
 * Prototype A game layer: the shared deck, the four abilities, moves.
 *
 * Four abilities, each modifying exactly one understood thing, so none
 * of them needs a relationship table to explain:
 *
 *   pivot     orientation   rotate one adjacent card 90 clockwise,
 *                           either player's, before attacking
 *   exchange  position      swap the placed card with an adjacent card
 *                           you control; it attacks from its destination
 *   relay     attack origin an adjacent card you control attacks from
 *                           its own position instead
 *   prism     matching      one edge of the placed card matches ANY
 *                           sigil, this placement only
 *
 * Measured on the oracle: abilities are worth about 20 points of win
 * rate here, against roughly 2 in the eight-element game, while cell
 * choice and rotation still rank above them. That ordering --
 * positioning first, abilities a real second, hand third -- is the
 * design intent, and it holds on all three boards.
 */

import {
  type Board, type Card, type CaptureEvent, type Resolution, type Shape,
  type Sigil, BOARDS, NSYM, OPPSIDE, capForTurn, cascadeFrom, cloneBoard,
  count, emptyBoard, emptyCells, orientations, popcount, rot90,
} from './engine';
import { type Rng, mulberry32 } from '../rng';

export const ABILITIES = ['pivot', 'exchange', 'relay', 'prism'] as const;
export type AbilityId = typeof ABILITIES[number];

export const ABILITY_FROM_PLACEMENT = 2;

export interface AbilityDef { changes: string; text: string }

export const ABILITY_INFO: Record<AbilityId, AbilityDef> = {
  pivot: { changes: 'orientation',
    text: 'Rotate one adjacent card 90° clockwise — either player’s — '
        + 'before attacking.' },
  exchange: { changes: 'position',
    text: 'Swap this card with one adjacent card you control. It attacks '
        + 'from its destination.' },
  relay: { changes: 'attack origin',
    text: 'Instead of this card attacking, an adjacent card you control '
        + 'attacks from its own position.' },
  prism: { changes: 'matching',
    text: 'Choose one edge of this card. For this placement, that edge '
        + 'matches any sigil.' },
};

/** The three symbol shapes, by how a card's four sigils repeat. */
export type CardShape = 'versatile' | 'focused' | 'specialized';

export const SHAPE_INFO: Record<CardShape, string> = {
  versatile: 'four different sigils — can answer any single exposed edge',
  focused: 'one sigil repeated — fewer answers, but can take two at once',
  specialized: 'two pairs — narrow, and strongest against a matching wall',
};

export interface GameCard {
  sigils: Card;
  ability: AbilityId;
  /**
   * Which artwork this card wears, 1-20. Optional because the
   * differential fixture builds cards from sigils and ability alone --
   * art is presentation and must never reach the rules. CardFace falls
   * back to a deterministic choice when it is absent, so a card always
   * looks the same twice.
   */
  art?: number;
}

export type Option =
  | null
  | { kind: 'pivot' | 'exchange' | 'relay'; cell: number }
  | { kind: 'prism'; edge: number };

export interface Move {
  player: number;
  handIndex: number;
  cell: number;
  placed: GameCard;
  option: Option;
}

export interface GameState {
  shape: Shape;
  board: Board;
  hands: [GameCard[], GameCard[]];
  /** cards never dealt -- at least one, which is what forbids draws */
  reserve: GameCard[];
  turn: number;
  history: Move[];
  seed: number;
}

// ---------------------------------------------------------------------------
// cards and decks
// ---------------------------------------------------------------------------
function shapeOf(c: Card): CardShape {
  const n = new Map<number, number>();
  for (const s of c) n.set(s, (n.get(s) ?? 0) + 1);
  const counts = [...n.values()].sort((a, b) => b - a);
  if (counts.length === 4) return 'versatile';
  if (counts[0] === 2 && counts.length === 3) return 'focused';
  return 'specialized';
}

export const cardShape = shapeOf;

const ALL: Card[] = [];
for (let a = 0; a < NSYM; a++)
  for (let b = 0; b < NSYM; b++)
    for (let c = 0; c < NSYM; c++)
      for (let d = 0; d < NSYM; d++)
        ALL.push([a, b, c, d] as unknown as Card);

export const BY_SHAPE: Record<CardShape, Card[]> = {
  versatile: [], focused: [], specialized: [],
};
for (const c of ALL) {
  const s = shapeOf(c);
  // triples and monos are left out of the deck pool: a card with three or
  // four of one sigil can answer almost nothing, which is a dead card
  // rather than a specialised one
  if (s === 'versatile' || s === 'focused' || s === 'specialized') {
    const n = new Map<number, number>();
    for (const x of c) n.set(x, (n.get(x) ?? 0) + 1);
    if ([...n.values()].some((v) => v >= 3)) continue;
    BY_SHAPE[s].push(c);
  }
}

const SHAPE_CYCLE: CardShape[] = ['versatile', 'focused', 'specialized'];

/** A shared deck: sigil shapes and abilities both cycled, then shuffled. */
export function buildDeck(rng: Rng, size: number): GameCard[] {
  const deck: GameCard[] = [];
  for (let i = 0; i < size; i++) {
    const sh = SHAPE_CYCLE[i % SHAPE_CYCLE.length];
    const pool = BY_SHAPE[sh];
    deck.push({
      sigils: pool[Math.floor(rng() * pool.length)],
      ability: ABILITIES[i % ABILITIES.length],
      // the 20 artworks map onto deck position, so a 12-card 3x3 deck
      // uses art 1-12 and a 20-card 4x4 deck uses all of it
      art: (i % 20) + 1,
    });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function newGame(seed: number, shape: Shape = BOARDS['3x3']):
    GameState {
  const rng = mulberry32(seed);
  const deck = buildDeck(rng, shape.deck);
  const [h0, h1] = shape.hands;
  return {
    shape,
    board: emptyBoard(shape),
    hands: [deck.slice(0, h0), deck.slice(h0, h0 + h1)],
    reserve: deck.slice(h0 + h1),
    turn: 0,
    history: [],
    seed,
  };
}

export const isOver = (g: GameState): boolean =>
  g.turn >= g.shape.order.length;
export const toMove = (g: GameState): number =>
  isOver(g) ? -1 : g.shape.order[g.turn];
export const placedCount = (g: GameState, p: number): number =>
  g.history.filter((m) => m.player === p).length;

export const abilityLive = (g: GameState, p: number): boolean =>
  placedCount(g, p) >= ABILITY_FROM_PLACEMENT - 1;

// ---------------------------------------------------------------------------
// moves
// ---------------------------------------------------------------------------
export interface Candidate {
  handIndex: number;
  cell: number;
  sigils: Card;
  option: Option;
}

export function abilityOptions(g: GameState, player: number,
                               ability: AbilityId, cell: number): Option[] {
  if (!abilityLive(g, player)) return [null];
  const s = g.shape, b = g.board;
  const out: Option[] = [null];
  const mine = b.own[player];
  switch (ability) {
    case 'pivot':
      for (let d = 0; d < 4; d++) {
        const t = s.nb[cell][d];
        if (t >= 0 && b.cards[t]) out.push({ kind: 'pivot', cell: t });
      }
      break;
    case 'exchange':
    case 'relay':
      for (let d = 0; d < 4; d++) {
        const t = s.nb[cell][d];
        if (t >= 0 && ((mine >>> t) & 1)) {
          out.push({ kind: ability, cell: t });
        }
      }
      break;
    case 'prism':
      for (let e = 0; e < 4; e++) out.push({ kind: 'prism', edge: e });
      break;
  }
  return out;
}

export function legalMoves(g: GameState): Candidate[] {
  if (isOver(g)) return [];
  const player = toMove(g);
  const cells = emptyCells(g.shape, g.board);
  const out: Candidate[] = [];
  g.hands[player].forEach((card, handIndex) => {
    for (const sigils of orientations(card.sigils)) {
      for (const cell of cells) {
        for (const option of abilityOptions(g, player, card.ability, cell)) {
          out.push({ handIndex, cell, sigils, option });
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
  events: CaptureEvent[];
}

export function applyMove(g: GameState, c: Candidate): Applied {
  if (isOver(g)) throw new Error('game is over');
  const s = g.shape;
  const player = toMove(g);
  const hand = g.hands[player];
  if (c.handIndex < 0 || c.handIndex >= hand.length) {
    throw new Error(`no card ${c.handIndex} in hand`);
  }
  if (g.board.cards[c.cell] !== null) {
    throw new Error(`cell ${c.cell} is occupied`);
  }

  const board = cloneBoard(g.board);
  const original = hand[c.handIndex];
  const live = abilityLive(g, player);
  const opt = live ? c.option : null;
  const events: CaptureEvent[] = [];

  // orientation changes before anything is compared, so a pivot can set
  // up the capture that follows rather than merely annoying the opponent
  if (opt?.kind === 'pivot') {
    board.cards[opt.cell] = rot90(board.cards[opt.cell] as Card);
  }

  board.cards[c.cell] = c.sigils;
  board.own[player] = board.own[player] | (1 << c.cell);

  let origin = 1 << c.cell;
  let wild: [number, number] | null = null;

  if (opt?.kind === 'exchange') {
    const tmp = board.cards[c.cell];
    board.cards[c.cell] = board.cards[opt.cell];
    board.cards[opt.cell] = tmp;
    origin = 1 << opt.cell;          // the placed card attacks from there
  } else if (opt?.kind === 'relay') {
    origin = 1 << opt.cell;          // the ally attacks instead
  } else if (opt?.kind === 'prism') {
    wild = [c.cell, opt.edge];
  }

  const cap = capForTurn(s, g.turn);
  const resolution = cascadeFrom(s, board, origin, player, cap, wild,
                                 events);

  const hands: [GameCard[], GameCard[]] =
    [g.hands[0].slice(), g.hands[1].slice()];
  hands[player] = hands[player].filter((_, i) => i !== c.handIndex);

  const move: Move = {
    player, handIndex: c.handIndex, cell: c.cell,
    placed: { ...original, sigils: c.sigils }, option: opt,
  };
  return {
    state: { ...g, board, hands, turn: g.turn + 1,
             history: [...g.history, move] },
    resolution, move, events,
  };
}

export const score = (g: GameState): [number, number] =>
  [count(g.board, 0), count(g.board, 1)];

export function winner(g: GameState): number {
  const [a, b] = score(g);
  return a === b ? -1 : (a > b ? 0 : 1);
}

/** Ownership masks after each wave, for animating a resolution. */
export function ownershipSteps(before: Board, move: Move,
                               waves: number[]): [number, number][] {
  const own: [number, number] = [before.own[0], before.own[1]];
  own[move.player] |= 1 << move.cell;
  const steps: [number, number][] = [[own[0], own[1]]];
  for (const w of waves) {
    own[move.player] |= w;
    own[1 - move.player] &= ~w;
    steps.push([own[0], own[1]]);
  }
  return steps;
}
