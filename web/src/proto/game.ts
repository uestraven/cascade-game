/**
 * Prototype A game layer: the shared deck, the abilities, moves.
 *
 * All twenty abilities are live: the four the design shipped with, and
 * the sixteen adopted for playtesting. Each modifies exactly one
 * understood thing -- the edges, the attack geometry, the cascade, or
 * the board you leave behind -- so none needs a relationship table to
 * explain. Definitions, option shapes and resolution are in
 * `abilities.ts`; this file owns the deck, turn order and move records.
 *
 * Measured on the oracle: abilities are worth about 20 points of win
 * rate here, against roughly 2 in the eight-element game, while cell
 * choice and rotation still rank above them. That ordering --
 * positioning first, abilities a real second, hand third -- is the
 * design intent, and it holds on all three boards.
 */

import {
  type Board, type Card, type CaptureEvent, type Resolution, type Shape,
  type Sigil, type Shields, BOARDS, NSYM, capForTurn, cloneBoard,
  count, emptyBoard, emptyCells, orientations,
} from './engine';
import {
  ALL_ABILITIES, type AbilityId, type AbilityDef, ABILITY_INFO,
  type Option, expireShields, optionsFor, resolvePlacement,
} from './abilities';
import { type Rng, mulberry32 } from '../rng';

export { ABILITY_INFO, type AbilityId, type AbilityDef, type Option };
export const ABILITIES = ALL_ABILITIES;

export const ABILITY_FROM_PLACEMENT = 2;

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
  /** Fortify's shields: the one effect that outlives its placement */
  shields: Shields;
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
      // Abilities cycle through all twenty, so a 20-card deck holds one
      // of each and a 12-card deck holds the first twelve. Which twelve
      // is deliberately NOT randomised: a playtester auditing abilities
      // needs to know which are in the deck, and a fixed prefix makes
      // "set the board size to 4x4 to see all twenty" a usable
      // instruction rather than a matter of luck.
      ability: ABILITIES[i % ABILITIES.length],
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
    shields: {},
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
                               ability: AbilityId, cell: number,
                               sigils?: Card): Option[] {
  if (!abilityLive(g, player)) return [null];
  // Mirror needs the card as it would be laid down, because which swaps
  // are legal depends on the rotation. Callers that do not have a
  // rotation in hand yet get the unrotated card, which is correct for
  // every other ability and the best available answer for Mirror.
  const fallback = g.hands[player].find((c) => c.ability === ability);
  return optionsFor(ability, {
    s: g.shape, b: g.board, player, cell,
    sigils: sigils ?? fallback?.sigils ?? ([0, 0, 0, 0] as unknown as Card),
    cap: capForTurn(g.shape, g.turn),
  });
}

export function legalMoves(g: GameState): Candidate[] {
  if (isOver(g)) return [];
  const player = toMove(g);
  const cells = emptyCells(g.shape, g.board);
  const out: Candidate[] = [];
  g.hands[player].forEach((card, handIndex) => {
    for (const sigils of orientations(card.sigils)) {
      for (const cell of cells) {
        for (const option of abilityOptions(g, player, card.ability, cell,
                                            sigils)) {
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
  const shields: Shields = { ...g.shields };

  const resolution = resolvePlacement({
    s, b: board, player, cell: c.cell, sigils: c.sigils, option: opt,
    cap: capForTurn(s, g.turn), turn: g.turn, shields, trace: events,
  });

  const hands: [GameCard[], GameCard[]] =
    [g.hands[0].slice(), g.hands[1].slice()];
  hands[player] = hands[player].filter((_, i) => i !== c.handIndex);

  const move: Move = {
    player, handIndex: c.handIndex, cell: c.cell,
    placed: { ...original, sigils: c.sigils }, option: opt,
  };
  return {
    state: { ...g, board, hands, turn: g.turn + 1,
             history: [...g.history, move],
             shields: expireShields(shields, g.turn + 1) },
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
