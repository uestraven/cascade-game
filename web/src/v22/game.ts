/**
 * Cascade v2.2 — Character Powers.
 *
 * The verified v2.1 baseline is preserved exactly: 3×4, twelve
 * placements, six cards each, Dominion opening with P2, six commands,
 * follow-up only after a multiple direct capture, no exhaustion, draws
 * permitted. Only the abilities change.
 *
 * A character has TWO SLOTS, which are different kinds of thing:
 *
 *   trait    Convergence. Passive or deployment-triggered. Expires the
 *            moment Convergence ends.
 *   command  Dominion. An action you choose on your turn.
 *
 * Either slot may be empty, and they are deliberately not
 * interchangeable — treating a Convergence passive as one of four
 * equivalent "abilities" was a category error in the previous pass.
 *
 * The five commands are experiments, not a roster. Measured in the
 * Python harness against PLAIN (the same game with an ordinary attack):
 *
 *   sanctuary    trait     swing 12.9   conv 13.1->10.7, dom 15.6->11.8
 *   usurp        used 72%  swing 17.7   a snowball: -19 behind, +22 ahead
 *   usurpOne     used 18%  balanced     the snowball flattened
 *   transpose    used 13%  UNMEASURED   deferred payoff; greedy bots
 *                                       cannot price it, humans must
 *   reclaimRecent used 25% balanced     physically representable
 *
 * Both Usurps ship so they can be compared in play. `usurp` is retained
 * as the experimental original even though it measures badly.
 */

import {
  type Board, type Card, type Shape, OPPSIDE, cloneBoard, count,
  emptyBoard, emptyCells, makeShape, orientations, rot90,
} from '../proto/engine';
import { type Rng, mulberry32 } from '../rng';

export const V22_BOARD: Shape = makeShape(3, 4, [6, 6], 14, 12);
export const COMMANDS = 6;

export const TRAITS = ['sanctuary'] as const;
export type Trait = typeof TRAITS[number];

export const CMDS = ['plain', 'usurp', 'usurpOne', 'transpose',
                     'reclaimRecent'] as const;
export type Cmd = typeof CMDS[number];

export interface SlotDef { name: string; text: string; why: string }

export const TRAIT_INFO: Record<Trait, SlotDef> = {
  sanctuary: {
    name: 'Sanctuary',
    text: 'During Convergence, this character cannot be captured while '
        + 'at least two adjacent characters are yours.',
    why: 'A stronghold your opponent has to dismantle before they can '
       + 'touch it. Expires when Dominion begins.',
  },
};

export const CMD_INFO: Record<Cmd, SlotDef> = {
  plain: {
    name: 'Strike',
    text: 'Attack every adjacent enemy by matching sigils. If more than '
        + 'one falls, one of them attacks again.',
    why: 'The ordinary command, and the bar every other has to clear.',
  },
  usurp: {
    name: 'Usurp',
    text: 'Choose an adjacent enemy. It attacks ALL of its own owner’s '
        + 'neighbours on your behalf. Captures are yours; it does not '
        + 'change hands.',
    why: 'Kept for comparison. Measured as a snowball — worth −19 points '
       + 'to a player behind and +22 to one ahead — and strictly the best '
       + 'command 69% of the time.',
  },
  usurpOne: {
    name: 'Usurp, Single',
    text: 'Choose an adjacent enemy and one of its own owner’s '
        + 'neighbours. It attacks that one card on your behalf.',
    why: 'The same fantasy, capped at one capture. The snowball '
       + 'flattens and it stops crowding out every other command.',
  },
  transpose: {
    name: 'Transpose',
    text: 'Swap two adjacent characters, whoever owns them. Orientation '
        + 'and ownership travel with them. Captures nothing.',
    why: 'Rearranges the battlefield for a later command. No simulation '
       + 'here can price it — its value is entirely deferred, so this '
       + 'one is for you to judge.',
  },
  reclaimRecent: {
    name: 'Reclaim',
    text: 'Take back a character the opponent captured from you on '
        + 'their last command, if it is adjacent to one of yours. No '
        + 'sigil comparison.',
    why: 'Deliberately only the last command, so a physical game needs '
       + 'one temporary marker rather than a log of allegiances.',
  },
};

// ---------------------------------------------------------------------------
// characters
// ---------------------------------------------------------------------------
export interface Character {
  id: string;
  name: string;
  epithet: string;
  flavour: string;
  trait: Trait | null;
  command: Cmd;
  art: number;
}

/**
 * Three provisional characters. The roster is NOT final; these exist to
 * find out whether a named identity changes how people play, and each
 * pairs a Convergence trait with a Dominion command that tell the same
 * story.
 */
export const CHARACTERS: Character[] = [
  {
    id: 'equinox',
    name: 'The Veiled Equinox',
    epithet: 'Keeper of Two Truths',
    flavour: 'All things cast a shadow. Even the light that reveals them.',
    trait: 'sanctuary',
    command: 'transpose',
    art: 1,
  },
  {
    id: 'stormgrave',
    name: 'Stormgrave Empress',
    epithet: 'Sovereign of the Drowned Throne',
    flavour: 'The storm does not obey me. It remembers who crowned it.',
    trait: 'sanctuary',
    command: 'usurpOne',
    art: 8,
  },
  {
    id: 'shepherd',
    name: 'The Hollow Shepherd',
    epithet: 'Warden of the Returning',
    flavour: 'Nothing of mine stays lost. It only wanders.',
    trait: null,
    command: 'reclaimRecent',
    art: 15,
  },
];

/** Unnamed cards carrying the experimental commands, so every ability is
 *  reachable in a fourteen-card deck while the roster stays open. */
const FILLERS: { trait: Trait | null; command: Cmd; art: number }[] = [
  { trait: null, command: 'plain', art: 3 },
  { trait: 'sanctuary', command: 'plain', art: 5 },
  { trait: null, command: 'usurp', art: 11 },
  { trait: null, command: 'transpose', art: 17 },
  { trait: null, command: 'reclaimRecent', art: 19 },
  { trait: null, command: 'usurpOne', art: 6 },
  { trait: 'sanctuary', command: 'transpose', art: 13 },
  { trait: null, command: 'plain', art: 20 },
];

export interface V22Card {
  sigils: Card;
  trait: Trait | null;
  command: Cmd;
  art: number;
  /** present only for the three named characters */
  character?: Character;
}

export interface V22State {
  shape: Shape;
  board: Board;
  hands: [V22Card[], V22Card[]];
  reserve: V22Card[];
  /** what sits in each cell, by slot */
  traitAt: (Trait | null)[];
  cmdAt: (Cmd | null)[];
  charAt: (Character | undefined)[];
  placed: number;
  commands: number;
  /** cards each player lost on the opponent's most recent command */
  recent: [number[], number[]];
  seed: number;
  log: string[];
}

export const phaseOf = (g: V22State): 'convergence' | 'dominion' | 'over' =>
  g.placed < g.shape.order.length ? 'convergence'
  : g.commands < COMMANDS ? 'dominion' : 'over';

export const isOver = (g: V22State): boolean => phaseOf(g) === 'over';

export const toMove = (g: V22State): number => {
  const p = phaseOf(g);
  if (p === 'convergence') return g.placed % 2;
  if (p === 'dominion') return 1 - (g.commands % 2);
  return -1;
};

export const score = (g: V22State): [number, number] =>
  [count(g.board, 0), count(g.board, 1)];

export function winner(g: V22State): number {
  const [a, b] = score(g);
  return a === b ? -1 : a > b ? 0 : 1;
}

const ALL: Card[] = [];
for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++)
  for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++)
    ALL.push([a, b, c, d] as unknown as Card);
const VERSATILE = ALL.filter((c) => new Set(c).size === 4);

export function newGame(seed: number): V22State {
  const rng = mulberry32(seed);
  const shape = V22_BOARD;
  const deck: V22Card[] = [];
  for (const ch of CHARACTERS) {
    deck.push({
      sigils: VERSATILE[Math.floor(rng() * VERSATILE.length)],
      trait: ch.trait, command: ch.command, art: ch.art, character: ch,
    });
  }
  for (let i = 0; deck.length < shape.deck; i++) {
    const f = FILLERS[i % FILLERS.length];
    deck.push({
      sigils: VERSATILE[Math.floor(rng() * VERSATILE.length)],
      trait: f.trait, command: f.command, art: f.art,
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
    traitAt: Array(shape.cells).fill(null),
    cmdAt: Array(shape.cells).fill(null),
    charAt: Array(shape.cells).fill(undefined),
    placed: 0,
    commands: 0,
    recent: [[], []],
    seed,
    log: [],
  };
}

// ---------------------------------------------------------------------------
// Sanctuary, and the shared attack
// ---------------------------------------------------------------------------
export const friendsAdjacent = (g: V22State, b: Board, cell: number,
                                player: number): number => {
  let n = 0;
  for (let d = 0; d < 4; d++) {
    const t = g.shape.nb[cell][d];
    if (t >= 0 && b.cards[t] !== null && ((b.own[player] >>> t) & 1)) n++;
  }
  return n;
};

/** Sanctuary only holds during Convergence, and only with two allies. */
export function isProtected(g: V22State, b: Board, cell: number,
                            phase: string): boolean {
  if (phase !== 'convergence') return false;
  if (g.traitAt[cell] !== 'sanctuary') return false;
  const owner = ((b.own[0] >>> cell) & 1) ? 0 : 1;
  return friendsAdjacent(g, b, cell, owner) >= 2;
}

const ownerOf = (b: Board, t: number): number =>
  ((b.own[0] >>> t) & 1) ? 0 : 1;

export function strikes(g: V22State, b: Board, src: number, player: number,
                        phase: string, restrictOwner?: number): number[] {
  const sc = b.cards[src];
  if (!sc) return [];
  const opp = 1 - player;
  const out: number[] = [];
  for (let d = 0; d < 4; d++) {
    const t = g.shape.nb[src][d];
    if (t < 0) continue;
    const tc = b.cards[t];
    if (!tc) continue;
    const who = ownerOf(b, t);
    if (restrictOwner === undefined ? who !== opp : who !== restrictOwner) {
      continue;
    }
    if (isProtected(g, b, t, phase)) continue;
    if (sc[d] === tc[OPPSIDE[d]]) out.push(t);
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
// Convergence
// ---------------------------------------------------------------------------
export interface Placement { handIndex: number; cell: number; sigils: Card }

export function placements(g: V22State): Placement[] {
  if (phaseOf(g) !== 'convergence') return [];
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

export interface Placed { state: V22State; captured: number[] }

export function applyPlacement(g: V22State, m: Placement): Placed {
  if (phaseOf(g) !== 'convergence') throw new Error('not convergence');
  if (g.board.cards[m.cell] !== null) throw new Error('cell taken');
  const p = toMove(g);
  const board = cloneBoard(g.board);
  const card = g.hands[p][m.handIndex];
  board.cards[m.cell] = m.sigils;
  board.own[p] |= 1 << m.cell;

  const traitAt = g.traitAt.slice();
  const cmdAt = g.cmdAt.slice();
  const charAt = g.charAt.slice();
  traitAt[m.cell] = card.trait;
  cmdAt[m.cell] = card.command;
  charAt[m.cell] = card.character;

  const next: V22State = { ...g, board, traitAt, cmdAt, charAt };
  const got = strikes(next, board, m.cell, p, 'convergence');
  take(board, p, got);

  const hands: [V22Card[], V22Card[]] =
    [g.hands[0].slice(), g.hands[1].slice()];
  hands[p] = hands[p].filter((_, i) => i !== m.handIndex);
  const who = card.character ? card.character.name : `a card`;
  return {
    state: { ...next, hands, placed: g.placed + 1,
             log: [`P${p + 1} deployed ${who} to ${m.cell}`
                   + (got.length ? `, took ${got.length}` : ''),
                   ...g.log].slice(0, 24) },
    captured: got,
  };
}

// ---------------------------------------------------------------------------
// Dominion
// ---------------------------------------------------------------------------
export type Command =
  | { kind: 'plain'; cell: number }
  | { kind: 'usurp'; cell: number; via: number }
  | { kind: 'usurpOne'; cell: number; via: number; target: number }
  | { kind: 'transpose'; cell: number; a: number; b: number }
  | { kind: 'reclaimRecent'; cell: number; target: number };

export function commandsFor(g: V22State, cell: number): Command[] {
  const p = toMove(g);
  const b = g.board, s = g.shape;
  const opp = 1 - p;
  const out: Command[] = [{ kind: 'plain', cell }];
  const cmd = g.cmdAt[cell];
  if (!cmd || cmd === 'plain') return out;

  if (cmd === 'usurp') {
    for (let d = 0; d < 4; d++) {
      const t = s.nb[cell][d];
      if (t >= 0 && b.cards[t] && ((b.own[opp] >>> t) & 1)) {
        out.push({ kind: 'usurp', cell, via: t });
      }
    }
  } else if (cmd === 'usurpOne') {
    for (let d = 0; d < 4; d++) {
      const t = s.nb[cell][d];
      if (t < 0 || !b.cards[t] || !((b.own[opp] >>> t) & 1)) continue;
      for (let e = 0; e < 4; e++) {
        const u = s.nb[t][e];
        if (u < 0 || !b.cards[u] || u === cell) continue;
        if ((b.own[opp] >>> u) & 1) {
          out.push({ kind: 'usurpOne', cell, via: t, target: u });
        }
      }
    }
  } else if (cmd === 'transpose') {
    for (let d = 0; d < 4; d++) {
      const a = s.nb[cell][d];
      if (a < 0 || !b.cards[a]) continue;
      for (let e = 0; e < 4; e++) {
        const bb = s.nb[a][e];
        if (bb < 0 || !b.cards[bb] || bb === a) continue;
        if (a < bb) out.push({ kind: 'transpose', cell, a, b: bb });
      }
    }
  } else if (cmd === 'reclaimRecent') {
    for (const t of g.recent[p]) {
      if (!b.cards[t] || !((b.own[opp] >>> t) & 1)) continue;
      if (friendsAdjacent(g, b, t, p) >= 1) {
        out.push({ kind: 'reclaimRecent', cell, target: t });
      }
    }
  }
  return out;
}

export function allCommands(g: V22State): Command[] {
  if (phaseOf(g) !== 'dominion') return [];
  const p = toMove(g);
  const out: Command[] = [];
  for (let c = 0; c < g.shape.cells; c++) {
    if (g.board.cards[c] === null) continue;
    if (((g.board.own[p] >>> c) & 1) === 0) continue;
    out.push(...commandsFor(g, c));
  }
  return out;
}

export interface Resolved {
  state: V22State;
  direct: number[];
  followUp: number[];
  moved: boolean;
}

export function applyCommand(g: V22State, cmd: Command): Resolved {
  if (phaseOf(g) !== 'dominion') throw new Error('not dominion');
  const p = toMove(g);
  const opp = 1 - p;
  if (((g.board.own[p] >>> cmd.cell) & 1) === 0) {
    throw new Error(`cell ${cmd.cell} is not yours to command`);
  }
  const board = cloneBoard(g.board);
  const traitAt = g.traitAt.slice();
  const cmdAt = g.cmdAt.slice();
  const charAt = g.charAt.slice();
  const next: V22State = { ...g, board, traitAt, cmdAt, charAt };
  const before = board.own[opp];

  let direct: number[] = [];
  let followUp: number[] = [];
  let moved = false;
  let line = '';

  if (cmd.kind === 'plain') {
    direct = strikes(next, board, cmd.cell, p, 'dominion');
    take(board, p, direct);
    line = `P${p + 1} struck from ${cmd.cell}`;
  } else if (cmd.kind === 'usurp') {
    direct = strikes(next, board, cmd.via, p, 'dominion', opp);
    take(board, p, direct);
    line = `P${p + 1} usurped ${cmd.via} against its own side`;
  } else if (cmd.kind === 'usurpOne') {
    const sc = board.cards[cmd.via], tc = board.cards[cmd.target];
    const d = g.shape.nb[cmd.via].indexOf(cmd.target);
    if (sc && tc && d >= 0 && ((board.own[opp] >>> cmd.target) & 1)
        && !isProtected(next, board, cmd.target, 'dominion')
        && sc[d] === tc[OPPSIDE[d]]) {
      direct = [cmd.target];
      take(board, p, direct);
    }
    line = `P${p + 1} turned ${cmd.via} on ${cmd.target}`;
  } else if (cmd.kind === 'transpose') {
    const { a, b: bb } = cmd;
    [board.cards[a], board.cards[bb]] = [board.cards[bb], board.cards[a]];
    [traitAt[a], traitAt[bb]] = [traitAt[bb], traitAt[a]];
    [cmdAt[a], cmdAt[bb]] = [cmdAt[bb], cmdAt[a]];
    [charAt[a], charAt[bb]] = [charAt[bb], charAt[a]];
    const oa = (board.own[0] >>> a) & 1;
    const ob = (board.own[0] >>> bb) & 1;
    for (const q of [0, 1] as const) {
      board.own[q] &= ~((1 << a) | (1 << bb));
    }
    board.own[ob ? 0 : 1] |= 1 << a;
    board.own[oa ? 0 : 1] |= 1 << bb;
    moved = true;
    line = `P${p + 1} transposed ${a} and ${bb}`;
  } else {
    // reclaimRecent — no sigil comparison
    direct = [cmd.target];
    take(board, p, direct);
    line = `P${p + 1} reclaimed ${cmd.target}`;
  }

  // the follow-up, unchanged from the verified baseline
  if (direct.length > 1) {
    for (const f of direct) {
      const extra = strikes(next, board, f, p, 'dominion');
      if (extra.length > followUp.length) followUp = extra;
    }
    take(board, p, followUp);
  }

  const lost = before & ~board.own[opp];
  const recent: [number[], number[]] = [g.recent[0].slice(),
                                        g.recent[1].slice()];
  recent[opp] = [];
  for (let c = 0; c < g.shape.cells; c++) {
    if ((lost >>> c) & 1) recent[opp].push(c);
  }
  const n = direct.length + followUp.length;
  return {
    state: { ...next, cmdAt, traitAt, charAt, recent,
             commands: g.commands + 1,
             log: [`${line}${n ? `, took ${n}` : ''}`,
                   ...g.log].slice(0, 24) },
    direct, followUp, moved,
  };
}

export const mustPass = (g: V22State): boolean =>
  phaseOf(g) === 'dominion' && allCommands(g).length === 0;

export function passCommand(g: V22State): V22State {
  const p = toMove(g);
  return { ...g, commands: g.commands + 1,
           log: [`P${p + 1} has nothing to command`, ...g.log].slice(0, 24) };
}

export const commandsLeft = (g: V22State, p: number): number => {
  let n = 0;
  for (let k = g.commands; k < COMMANDS; k++) if (1 - (k % 2) === p) n++;
  return n;
};

// ---------------------------------------------------------------------------
// opponent
// ---------------------------------------------------------------------------
export function pickPlacement(g: V22State, rng: Rng): Placement | null {
  const all = placements(g);
  if (!all.length) return null;
  const p = toMove(g);
  let best = -Infinity;
  let ties: Placement[] = [];
  for (const m of all) {
    const r = applyPlacement(g, m);
    let reach = 0;
    for (let d = 0; d < 4; d++) {
      const t = g.shape.nb[m.cell][d];
      if (t >= 0 && g.board.cards[t] === null) reach++;
    }
    // a Sanctuary holder wants neighbours
    const card = g.hands[p][m.handIndex];
    const sanct = card.trait === 'sanctuary'
      ? 0.35 * Math.min(friendsAdjacent(r.state, r.state.board, m.cell, p), 2)
      : 0;
    const s = r.captured.length + 0.15 * reach + sanct;
    if (s > best) { best = s; ties = [m]; }
    else if (s === best) ties.push(m);
  }
  return ties[Math.floor(rng() * ties.length)];
}

export function pickCommand(g: V22State, rng: Rng): Command | null {
  const all = allCommands(g);
  if (!all.length) return null;
  const p = toMove(g);
  let best = -Infinity;
  let ties: Command[] = [];
  for (const c of all) {
    const r = applyCommand(g, c);
    let look = 0;
    if (c.kind === 'transpose') {
      // a transposition takes nothing now, so value the board it leaves
      for (let s2 = 0; s2 < g.shape.cells; s2++) {
        if (r.state.board.cards[s2] === null) continue;
        if (((r.state.board.own[p] >>> s2) & 1) === 0) continue;
        look = Math.max(look,
          strikes(r.state, r.state.board, s2, p, 'dominion').length);
      }
    }
    const s = r.direct.length + r.followUp.length + 0.5 * look;
    if (s > best) { best = s; ties = [c]; }
    else if (s === best) ties.push(c);
  }
  return ties[Math.floor(rng() * ties.length)];
}
