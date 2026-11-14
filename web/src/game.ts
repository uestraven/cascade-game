/**
 * Game state and the move reducer. Immutable: applyMove returns a new state
 * so the UI can hold both the pre-move and post-move board for animation.
 *
 * Nine cells cannot split evenly between two players, so draws are
 * impossible and there is no tie-breaker.
 */

import {
  ALL_CELLS, CASCADE_CAP, ELEMENT_BONUS, HAND_SIZES, LEGAL_FACES, NCELLS,
  TURN_ORDER,
  type Board, type Card, type Resolution,
  cloneBoard, count, emptyBoard, emptyCells, makeCard, place,
} from './engine';
import {
  type LeaderId, type LeaderState, type Payload,
  applyLeader, attackBonus, leaderOptions, newLeaderState, tickAura,
} from './leaders';
import { type Rng, choice, mulberry32, randint, sample } from './rng';

export const CUBE_SIZE = 15;
/** A random cube averages ~301 face points; an unbudgeted optimised one
 *  totals 484 and wins 80.9% of games, so the budget is load-bearing. */
export const CUBE_BUDGET = 300;

export interface Move {
  player: number;
  cardIndex: number;
  cell: number;
  card: Card;
}

export interface GameState {
  board: Board;
  hands: [Card[], Card[]];
  turn: number;
  history: Move[];
  seed: number;
  /** Cells frozen by Leto: they keep their owner but can never be captured. */
  frozen: number;
  leaders: [LeaderState, LeaderState];
}

export const randomCard = (rng: Rng): Card => {
  const [n, e, s, w] = choice(rng, LEGAL_FACES);
  return makeCard(n, e, s, w, randint(rng, 1, 8));
};

const faceSum = (card: Card): number =>
  (card & 0xf) + ((card >>> 4) & 0xf) + ((card >>> 8) & 0xf) +
  ((card >>> 12) & 0xf);

/** Random legal cube whose total face points stay within the budget. */
export function buildCube(rng: Rng, size = CUBE_SIZE,
                          budget = CUBE_BUDGET): Card[] {
  for (;;) {
    const cube: Card[] = [];
    for (let i = 0; i < size; i++) cube.push(randomCard(rng));
    if (cube.reduce((t, c) => t + faceSum(c), 0) <= budget) return cube;
  }
}

export function newGame(
  seed: number,
  leaders: [LeaderId | null, LeaderId | null] = [null, null],
): GameState {
  const rng: Rng = mulberry32(seed);
  const cubes = [buildCube(rng), buildCube(rng)];
  return {
    board: emptyBoard(),
    hands: [
      sample(rng, cubes[0], HAND_SIZES[0]),
      sample(rng, cubes[1], HAND_SIZES[1]),
    ],
    turn: 0,
    history: [],
    seed,
    frozen: 0,
    leaders: [newLeaderState(leaders[0]), newLeaderState(leaders[1])],
  };
}

export const isOver = (g: GameState): boolean =>
  g.turn >= TURN_ORDER.length;

export const toMove = (g: GameState): number =>
  isOver(g) ? -1 : TURN_ORDER[g.turn];

export interface Candidate { cardIndex: number; cell: number }

export function legalMoves(g: GameState): Candidate[] {
  if (isOver(g)) return [];
  const hand = g.hands[toMove(g)];
  const cells = emptyCells(g.board);
  const out: Candidate[] = [];
  for (let cardIndex = 0; cardIndex < hand.length; cardIndex++) {
    for (const cell of cells) out.push({ cardIndex, cell });
  }
  return out;
}

export interface Applied {
  state: GameState;
  resolution: Resolution;
  move: Move;
}

export function applyMove(g: GameState, cardIndex: number,
                          cell: number): Applied {
  if (isOver(g)) throw new Error('game is over');
  const player = toMove(g);
  const hand = g.hands[player];
  if (cardIndex < 0 || cardIndex >= hand.length) {
    throw new Error(`no card ${cardIndex} in hand`);
  }
  const card = hand[cardIndex];

  const board = cloneBoard(g.board);
  const resolution = place(board, cell, card, player, {
    cap: CASCADE_CAP,
    bonus: ELEMENT_BONUS,
    attackBonus: attackBonus(g.leaders[player]),
    protectedMask: g.frozen,
  });

  const hands: [Card[], Card[]] = [g.hands[0].slice(), g.hands[1].slice()];
  hands[player] = hands[player].filter((_, i) => i !== cardIndex);

  // the Prince aura covers a fixed number of placements, so it expires here
  const leaders: [LeaderState, LeaderState] = [
    { ...g.leaders[0] }, { ...g.leaders[1] },
  ];
  tickAura(leaders[player]);

  const move: Move = { player, cardIndex, cell, card };
  return {
    state: { ...g, board, hands, leaders, turn: g.turn + 1,
             history: [...g.history, move] },
    resolution,
    move,
  };
}

/** Activation is free: the turn counter does not advance. */
export interface LeaderApplied {
  state: GameState;
  resolution: Resolution;
  cell: number;
  waves: number[];
}

/** Legal activations for an explicit player, independent of whose turn it is.
 *  Needed for the co-cast window after your own placement, when the turn
 *  counter has already moved on. */
export const leaderChoicesFor = (g: GameState, player: number): Payload[] =>
  leaderOptions({
    board: g.board, frozen: g.frozen, player, states: g.leaders,
  });

export const leaderChoices = (g: GameState): Payload[] =>
  isOver(g) ? [] : leaderChoicesFor(g, toMove(g));

export function activateLeader(g: GameState, payload: Payload,
                               asPlayer?: number): LeaderApplied {
  const player = asPlayer ?? toMove(g);
  if (player < 0) throw new Error('no player to act');
  const board = cloneBoard(g.board);
  const leaders: [LeaderState, LeaderState] = [
    { ...g.leaders[0] }, { ...g.leaders[1] },
  ];
  const res = applyLeader(
    { board, frozen: g.frozen, player, states: leaders }, payload);
  const anchor = typeof payload === 'number' ? payload
    : Array.isArray(payload) ? payload[0] : -1;
  return {
    state: { ...g, board, leaders, frozen: res.frozen },
    resolution: { captured: res.captured, waves: res.waves },
    cell: anchor,
    waves: res.waves,
  };
}

export const score = (g: GameState): [number, number] =>
  [count(g.board, 0), count(g.board, 1)];

export function winner(g: GameState): number {
  if (!isOver(g)) throw new Error('game is not finished');
  const [a, b] = score(g);
  if (a === b) throw new Error('draw on an odd board -- rules violated');
  return a > b ? 0 : 1;
}

/**
 * Ownership after each animation step: index 0 is the placement itself,
 * then one entry per capture wave. Card positions never change after the
 * placement, so only the masks need stepping.
 */
export function ownershipSteps(
  before: Board, move: { player: number; cell: number },
  resolution: Resolution,
): [number, number][] {
  const own: [number, number] = [before.own[0], before.own[1]];
  if (move.cell >= 0) {
    own[move.player] = (own[move.player] | (1 << move.cell)) & ALL_CELLS;
  }
  const steps: [number, number][] = [[own[0], own[1]]];
  let cur: [number, number] = [own[0], own[1]];
  for (const wave of resolution.waves) {
    const next: [number, number] = [cur[0], cur[1]];
    next[move.player] = (next[move.player] | wave) & ALL_CELLS;
    next[1 - move.player] = (next[1 - move.player] & ~wave) & ALL_CELLS;
    steps.push(next);
    cur = next;
  }
  return steps;
}

export const CELL_COUNT = NCELLS;
