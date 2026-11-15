/**
 * Cascade v2: deployment and command.
 *
 * Two phases instead of one.
 *
 *   Phase I  — The Convergence. Placements alternate, P1 first. Direct
 *              matching captures apply. No abilities, no chains.
 *   Phase II — The Dominion. No new cards. An even number of commands,
 *              alternating, P2 first. A command is: choose a card you
 *              control, optionally use its ability, attack every
 *              adjacent enemy from the appropriate card; if more than
 *              one falls, one of them makes a single follow-up attack.
 *
 * The configuration here is the one that measured as working, not a
 * guess. From v2.py over 900 games per cell: the closing command is
 * worth 1.6 points of win rate, Phase II changes who wins 32.7% of the
 * time, and the deployment leader still wins 67.3%. Three findings are
 * baked in rather than left adjustable:
 *
 *   - An ODD command count is catastrophic. The player with the extra
 *     command gains 75-86 points. COMMANDS must stay even.
 *   - A follow-up after a single capture takes Phase II from 15.9 to
 *     20.2 captures and the closing command from 20 to 21 points, so
 *     the follow-up requires a multiple capture.
 *   - Locking captured cards was tried and rejected: it works, but by
 *     moving the advantage from the last mover to the first (spread
 *     37-58).
 *
 * Draws are permitted. On a complete board a level score is reachable,
 * and the measured rate is 9.5% -- low enough not to need a tiebreaker,
 * and preferable to engineering a first-player advantage simply to
 * guarantee a winner.
 *
 * Known and unfixed: a command still takes four cards about half the
 * time, and the whole game runs to 30 captures on twelve cells, about
 * 2.6 per cell against v1's 2.0. The phase split has not made the game
 * calmer per card, which was the original complaint.
 */

import {
  type Board, type Card, type Shape, OPPSIDE, cloneBoard, count,
  emptyBoard, emptyCells, makeShape, orientations, popcount, rot90,
} from '../proto/engine';
import { type Rng, mulberry32 } from '../rng';

/** The original four only. The sixteen adopted in v1 are deliberately
 *  out: v2 is testing whether the phase split creates strategy, and
 *  twenty abilities would confound that with their own power spread. */
export const V2_ABILITIES = ['pivot', 'exchange', 'relay', 'prism'] as const;
export type V2Ability = typeof V2_ABILITIES[number];

export const V2_ABILITY_TEXT: Record<V2Ability, string> = {
  pivot: 'Rotate an adjacent card 90°, then attack.',
  exchange: 'Swap with an adjacent card you control, then attack from '
          + 'its place.',
  relay: 'An adjacent card you control attacks instead of this one.',
  prism: 'One edge of the attacking card matches any sigil this command.',
};

/**
 * Variant C: the full board, six cards each, P2 opens Dominion.
 *
 * Twelve placements on twelve cells, so the board finishes complete and
 * both players deploy exactly six. Chosen by measurement over 2,500
 * games per variant:
 *
 *   A  7/6 deal, 6/5 places, P2 opens   P1 66.6  P2 33.4  draw  0.0
 *   B  6/6 deal, 6/6 places, P1 opens   P1 31.0  P2 45.4  draw 23.6
 *   C  6/6 deal, 6/6 places, P2 opens   P1 46.6  P2 43.9  draw  9.5  <-
 *   D  7/7 deal, 6/6 places, P1 opens   P1 29.6  P2 44.9  draw 25.6
 *
 * Two things in that table are load-bearing.
 *
 * On a FULL board, closing Dominion is worth about 15 points: B and C
 * differ only in who opens, and P1 goes from 31.0% to 46.6% by closing
 * instead of opening. At eleven placements the same swing measured 1.6
 * points, so this is a property of the full board and not a constant.
 *
 * C is therefore balanced by two asymmetries cancelling, not by design:
 * P1 deploys first and so can never capture with its opening placement,
 * while P2 must always place in response and usually can. P1 closing
 * Dominion pays that back. Change the order of either phase and the
 * cancellation breaks.
 *
 * D showed that a spare hand card buys nothing measurable, so the deal
 * is exactly what gets deployed.
 */
export const V2_BOARD: Shape = makeShape(3, 4, [6, 6], 14, 12);
export const COMMANDS = 6;

export interface V2Card { sigils: Card; ability: V2Ability; art?: number }

export type V2Option =
  | null
  | { kind: 'pivot' | 'exchange' | 'relay'; cell: number }
  | { kind: 'prism'; edge: number };

export interface V2State {
  shape: Shape;
  board: Board;
  hands: [V2Card[], V2Card[]];
  reserve: V2Card[];
  /** which ability the card in each cell carries; sigils cannot say */
  abilityAt: (V2Ability | null)[];
  /** placements made so far */
  placed: number;
  /** commands made so far */
  commands: number;
  seed: number;
  log: string[];
}

export const phaseOf = (g: V2State): 'deploy' | 'command' | 'over' =>
  g.placed < g.shape.order.length ? 'deploy'
  : g.commands < COMMANDS ? 'command' : 'over';

export const isOver = (g: V2State): boolean => phaseOf(g) === 'over';

/** Deployment alternates from P1; command alternates from P2. */
export const toMove = (g: V2State): number => {
  const p = phaseOf(g);
  if (p === 'deploy') return g.placed % 2;
  if (p === 'command') return 1 - (g.commands % 2);
  return -1;
};

export const score = (g: V2State): [number, number] =>
  [count(g.board, 0), count(g.board, 1)];

export function winner(g: V2State): number {
  const [a, b] = score(g);
  return a === b ? -1 : a > b ? 0 : 1;
}

// ---------------------------------------------------------------------------
// deck
// ---------------------------------------------------------------------------
const ALL: Card[] = [];
for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++)
  for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++)
    ALL.push([a, b, c, d] as unknown as Card);
const VERSATILE = ALL.filter((c) => new Set(c).size === 4);

export function newGame(seed: number): V2State {
  const rng = mulberry32(seed);
  const shape = V2_BOARD;
  const deck: V2Card[] = [];
  for (let i = 0; i < shape.deck; i++) {
    deck.push({
      sigils: VERSATILE[Math.floor(rng() * VERSATILE.length)],
      ability: V2_ABILITIES[i % V2_ABILITIES.length],
      art: (i % 20) + 1,
    });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const [h0, h1] = shape.hands;
  return {
    shape,
    board: emptyBoard(shape),
    hands: [deck.slice(0, h0), deck.slice(h0, h0 + h1)],
    reserve: deck.slice(h0 + h1),
    abilityAt: Array(shape.cells).fill(null),
    placed: 0,
    commands: 0,
    seed,
    log: [],
  };
}

// ---------------------------------------------------------------------------
// the shared attack: direct captures only, never a chain
// ---------------------------------------------------------------------------
/** Cells `src` captures by matching. `wild` makes one edge match
 *  anything; `onlyEdge` restricts the attack to one direction. */
export function strikes(s: Shape, b: Board, src: number, player: number,
                        wild?: readonly [number, number] | null): number[] {
  const opp = 1 - player;
  const sc = b.cards[src];
  if (!sc) return [];
  const out: number[] = [];
  for (let d = 0; d < 4; d++) {
    const t = s.nb[src][d];
    if (t < 0) continue;
    const tc = b.cards[t];
    if (!tc || ((b.own[opp] >>> t) & 1) === 0) continue;
    const isWild = !!wild && wild[0] === src && wild[1] === d;
    if (isWild || sc[d] === tc[OPPSIDE[d]]) out.push(t);
  }
  return out;
}

function take(b: Board, player: number, cells: number[]): void {
  const opp = 1 - player;
  for (const t of cells) {
    b.own[player] |= 1 << t;
    b.own[opp] &= ~(1 << t);
  }
}

// ---------------------------------------------------------------------------
// Phase I
// ---------------------------------------------------------------------------
export interface Placement { handIndex: number; cell: number; sigils: Card }

export function placements(g: V2State): Placement[] {
  if (phaseOf(g) !== 'deploy') return [];
  const p = toMove(g);
  const cells = emptyCells(g.shape, g.board);
  const out: Placement[] = [];
  g.hands[p].forEach((card, handIndex) => {
    for (const sigils of orientations(card.sigils)) {
      for (const cell of cells) out.push({ handIndex, cell, sigils });
    }
  });
  return out;
}

export interface Applied { state: V2State; captured: number[] }

export function applyPlacement(g: V2State, m: Placement): Applied {
  if (phaseOf(g) !== 'deploy') throw new Error('not deploying');
  if (g.board.cards[m.cell] !== null) throw new Error('cell taken');
  const p = toMove(g);
  const board = cloneBoard(g.board);
  const card = g.hands[p][m.handIndex];
  board.cards[m.cell] = m.sigils;
  board.own[p] |= 1 << m.cell;
  const abilityAt = g.abilityAt.slice();
  abilityAt[m.cell] = card.ability;

  // direct captures only -- the chain is held for Phase II
  const got = strikes(g.shape, board, m.cell, p);
  take(board, p, got);

  const hands: [V2Card[], V2Card[]] = [g.hands[0].slice(), g.hands[1].slice()];
  hands[p] = hands[p].filter((_, i) => i !== m.handIndex);
  const line = got.length
    ? `P${p + 1} deployed to ${m.cell}, took ${got.length}`
    : `P${p + 1} deployed to ${m.cell}`;
  return {
    state: { ...g, board, hands, abilityAt, placed: g.placed + 1,
             log: [line, ...g.log].slice(0, 20) },
    captured: got,
  };
}

// ---------------------------------------------------------------------------
// Phase II
// ---------------------------------------------------------------------------
export interface Command {
  /** the card being commanded */
  cell: number;
  option: V2Option;
}

export function commandOptions(g: V2State, cell: number): V2Option[] {
  const p = toMove(g);
  const s = g.shape, b = g.board;
  const out: V2Option[] = [null];
  const ab = g.abilityAt[cell];
  if (ab === null) return out;
  if (ab === 'pivot') {
    for (let d = 0; d < 4; d++) {
      const t = s.nb[cell][d];
      if (t >= 0 && b.cards[t]) out.push({ kind: 'pivot', cell: t });
    }
  } else if (ab === 'exchange' || ab === 'relay') {
    for (let d = 0; d < 4; d++) {
      const t = s.nb[cell][d];
      if (t >= 0 && b.cards[t] && ((b.own[p] >>> t) & 1)) {
        out.push({ kind: ab, cell: t });
      }
    }
  } else if (ab === 'prism') {
    for (let e = 0; e < 4; e++) out.push({ kind: 'prism', edge: e });
  }
  return out;
}

export function commands(g: V2State): Command[] {
  if (phaseOf(g) !== 'command') return [];
  const p = toMove(g);
  const out: Command[] = [];
  for (let c = 0; c < g.shape.cells; c++) {
    if (g.board.cards[c] === null || ((g.board.own[p] >>> c) & 1) === 0) {
      continue;
    }
    for (const option of commandOptions(g, c)) out.push({ cell: c, option });
  }
  return out;
}

export interface Resolved {
  state: V2State;
  /** cells taken by the commanded card */
  direct: number[];
  /** cells taken by the single follow-up, if one happened */
  followUp: number[];
  /** which captured card made the follow-up */
  via: number | null;
}

export function applyCommand(g: V2State, cmd: Command): Resolved {
  if (phaseOf(g) !== 'command') throw new Error('not commanding');
  const p = toMove(g);
  if (((g.board.own[p] >>> cmd.cell) & 1) === 0) {
    throw new Error(`cell ${cmd.cell} is not yours to command`);
  }
  const s = g.shape;
  const board = cloneBoard(g.board);
  const abilityAt = g.abilityAt.slice();
  const opt = cmd.option;
  let attacker = cmd.cell;
  let wild: readonly [number, number] | null = null;

  if (opt?.kind === 'pivot') {
    board.cards[opt.cell] = rot90(board.cards[opt.cell] as Card);
  } else if (opt?.kind === 'exchange') {
    const t = opt.cell;
    [board.cards[cmd.cell], board.cards[t]] =
      [board.cards[t], board.cards[cmd.cell]];
    [abilityAt[cmd.cell], abilityAt[t]] = [abilityAt[t], abilityAt[cmd.cell]];
    attacker = t;
  } else if (opt?.kind === 'relay') {
    attacker = opt.cell;
  } else if (opt?.kind === 'prism') {
    wild = [cmd.cell, opt.edge];
  }

  const direct = strikes(s, board, attacker, p, wild);
  take(board, p, direct);

  // a follow-up only after a multiple capture: allowing one after a
  // single capture measured 20.2 captures a phase against 15.9, and made
  // the closing command worth a point more
  let followUp: number[] = [];
  let via: number | null = null;
  if (direct.length > 1) {
    for (const f of direct) {
      const extra = strikes(s, board, f, p);
      if (extra.length > followUp.length) { followUp = extra; via = f; }
    }
    take(board, p, followUp);
  }

  const total = direct.length + followUp.length;
  const line = total
    ? `P${p + 1} commanded ${cmd.cell}${opt ? ` (${opt.kind})` : ''}, `
      + `took ${total}${followUp.length ? ` via ${via}` : ''}`
    : `P${p + 1} commanded ${cmd.cell}, took nothing`;
  return {
    state: { ...g, board, abilityAt, commands: g.commands + 1,
             log: [line, ...g.log].slice(0, 20) },
    direct, followUp, via,
  };
}

/**
 * A player with no cards left on the board has nothing to command.
 *
 * The proposal does not cover this, and it is reachable: deployment can
 * leave someone with very little, and three commands can finish them.
 * The command is consumed rather than the phase stalling, which matches
 * the Python harness and keeps the command count -- and therefore the
 * even split that the whole phase depends on -- intact.
 */
export const mustPass = (g: V2State): boolean =>
  phaseOf(g) === 'command' && commands(g).length === 0;

export function passCommand(g: V2State): V2State {
  if (phaseOf(g) !== 'command') throw new Error('not commanding');
  const p = toMove(g);
  return {
    ...g,
    commands: g.commands + 1,
    log: [`P${p + 1} has nothing to command`, ...g.log].slice(0, 20),
  };
}

/** Greedy opponent: take the most this command, ties broken by the rng. */
export function pickCommand(g: V2State, rng: Rng): Command | null {
  const all = commands(g);
  if (!all.length) return null;
  let best = -1;
  let ties: Command[] = [];
  for (const c of all) {
    const r = applyCommand(g, c);
    const got = r.direct.length + r.followUp.length;
    if (got > best) { best = got; ties = [c]; }
    else if (got === best) ties.push(c);
  }
  return ties[Math.floor(rng() * ties.length)];
}

export function pickPlacement(g: V2State, rng: Rng): Placement | null {
  const all = placements(g);
  if (!all.length) return null;
  let best = -Infinity;
  let ties: Placement[] = [];
  for (const m of all) {
    const r = applyPlacement(g, m);
    // captures now, plus a little credit for touching empty cells, which
    // is the crudest possible stand-in for building a position
    let reach = 0;
    for (let d = 0; d < 4; d++) {
      const t = g.shape.nb[m.cell][d];
      if (t >= 0 && g.board.cards[t] === null) reach++;
    }
    const s = r.captured.length + 0.15 * reach;
    if (s > best) { best = s; ties = [m]; }
    else if (s === best) ties.push(m);
  }
  return ties[Math.floor(rng() * ties.length)];
}

export const ownedBy = (g: V2State, p: number): number[] => {
  const out: number[] = [];
  for (let c = 0; c < g.shape.cells; c++) {
    if (g.board.cards[c] !== null && ((g.board.own[p] >>> c) & 1)) out.push(c);
  }
  return out;
};

export const commandsLeft = (g: V2State, p: number): number => {
  let n = 0;
  for (let k = g.commands; k < COMMANDS; k++) if (1 - (k % 2) === p) n++;
  return n;
};

export { popcount };
