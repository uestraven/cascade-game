/**
 * Cascade v2.3 — Convergence abilities, events, and a LIFO stack.
 *
 * This is the whole rules layer. The browser, previews, the log, replay
 * and the tests all drive this same reducer; nothing reads colour or CSS
 * to decide a rule.
 *
 * ───────────────────────────────────────────────────────────────────────
 * THE CANONICAL CONVERGENCE TURN
 *
 *   1  Deploy            card leaves the hand, enters an empty cell
 *   2  On Deploy         its trait resolves, with targets chosen; any
 *                        captures it causes push their own reactions,
 *                        and all of that finishes before step 3
 *   3  Normal attack     the deployed card compares sigils with its
 *                        orthogonal neighbours, from its CURRENT cell,
 *                        against one board snapshot
 *   4  Captures          the whole batch applies at once
 *   5  Reactions         On Capture triggers resolve, LIFO
 *   6  End turn
 *
 * Deploy → On Deploy → Normal attack → Simultaneous captures →
 * Capture reactions → End turn.
 *
 * ───────────────────────────────────────────────────────────────────────
 * RULE INTERPRETATIONS THAT COULD CHANGE A PLAYER'S DECISIONS
 *
 * - NO ROTATION. Cards deploy in one fixed orientation. v2.2 and
 *   earlier let you rotate on placement and v1 measured that at 78-82%
 *   ablation, second only to cell choice; it is removed here by
 *   instruction, so a character's four sigils are permanent.
 * - Sanctuary is evaluated against the board BEFORE a capture batch, so
 *   a batch cannot remove its own obstacle.
 * - Trigger order: the active player's reactions are pushed first and
 *   the opponent's second, so on a LIFO stack the NON-ACTIVE player's
 *   reactions resolve first. Where one player holds several, they are
 *   asked to order them, and the order is logged.
 * - Rally reacts only to an OPPOSING deployment, so a player cannot
 *   trigger it off their own Pact.
 * - Pact is blocked by Sanctuary on either side, and fails whole rather
 *   than transferring one card.
 * - Anchor forbids being moved or swapped. It does not prevent capture,
 *   does not stop the card attacking, and does not block Pact.
 */

import { type Card, OPPSIDE } from '../proto/engine';

export type Player = 0 | 1;
export type CardId = string;

export const COLS = 4;
export const ROWS = 3;
export const CELLS = COLS * ROWS;
export const DEPLOYMENTS = 12;
export const DOMINION_COMMANDS = 6;

/** orthogonal neighbours per cell, -1 off the board */
export const NB: readonly (readonly number[])[] = (() => {
  const d = [[-1, 0], [0, 1], [1, 0], [0, -1]] as const;
  const out: number[][] = [];
  for (let i = 0; i < CELLS; i++) {
    const r = Math.floor(i / COLS), c = i % COLS;
    out.push(d.map(([dr, dc]) => {
      const nr = r + dr, nc = c + dc;
      return nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS
        ? nr * COLS + nc : -1;
    }));
  }
  return out;
})();

// ---------------------------------------------------------------------------
// abilities
// ---------------------------------------------------------------------------
export type Timing = 'ongoing' | 'onDeploy' | 'onCapture';

export const TRAITS = ['sanctuary', 'anchor', 'harbinger', 'rally',
                       'exile', 'pact'] as const;
export type TraitId = typeof TRAITS[number];

export const CMDS = ['plain', 'usurp', 'usurpOne', 'transpose',
                     'reclaimRecent'] as const;
export type CmdId = typeof CMDS[number];

export interface TraitDef {
  name: string;
  timing: Timing;
  /** one line, for the card face. Must match the implemented rule. */
  short: string;
  text: string;
  /** what it is for, shown in the rail */
  why: string;
  /** approved in principle, or an experiment */
  status: 'approved' | 'experimental';
  /** the physical equivalent, so the rule stays table-feasible */
  physical: string;
}

export const TRAIT_INFO: Record<TraitId, TraitDef> = {
  sanctuary: {
    short: 'Safe while 2+ allies adjoin',
    name: 'Sanctuary', timing: 'ongoing', status: 'approved',
    text: 'This character cannot be captured while it is orthogonally '
        + 'adjacent to at least two characters controlled by its own '
        + 'controller.',
    why: 'A stronghold the opponent has to dismantle first. Blocks every '
       + 'kind of capture, including Pact. Does not prevent movement.',
    physical: 'Count the adjacent cards sharing its owner. No marker.',
  },
  anchor: {
    short: 'Cannot be moved or swapped',
    name: 'Anchor', timing: 'ongoing', status: 'approved',
    text: 'This character cannot be moved or swapped by abilities.',
    why: 'An immovable point to build around. It can still be captured, '
       + 'and still attacks normally.',
    physical: 'Printed on the card. No marker.',
  },
  harbinger: {
    short: 'On deploy: swap two adjoining cards',
    name: 'Harbinger', timing: 'onDeploy', status: 'approved',
    text: 'When deployed, you may swap the positions of two already '
        + 'deployed characters orthogonally adjacent to this one. Either '
        + 'may belong to either player.',
    why: 'Rearranges a formation before you strike it. The swap captures '
       + 'nothing on its own.',
    physical: 'Visible target selection at the moment of deployment.',
  },
  rally: {
    short: 'If an adjoining ally falls, take its place',
    name: 'Rally', timing: 'onCapture', status: 'approved',
    text: 'Once per opposing deployment, when an adjacent ally is '
        + 'captured, you may swap this character with that captured '
        + 'character after the capture resolves.',
    why: 'Answers a capture by taking the fallen ally\'s place. Does not '
       + 'undo the capture and does not attack.',
    physical: 'One temporary reaction marker, cleared at end of turn.',
  },
  exile: {
    short: 'On deploy: move an adjoining enemy',
    name: 'Exile', timing: 'onDeploy', status: 'experimental',
    text: 'When deployed, you may move one adjacent enemy character '
        + 'into any unoccupied cell. Its controller does not change.',
    why: 'Breaks a formation without taking anything. Experimental: it '
       + 'may prove too disruptive.',
    physical: 'Visible target and destination selection.',
  },
  pact: {
    short: 'On deploy: trade an ally for an enemy',
    name: 'Pact', timing: 'onDeploy', status: 'experimental',
    text: 'When deployed, you may choose one adjacent friendly and one '
        + 'adjacent enemy character and exchange their ownership. '
        + 'Neither card moves.',
    why: 'Trades a character for a character. Experimental, and the one '
       + 'ability Sanctuary is currently allowed to block.',
    physical: 'Swap the two ownership markers. Nothing moves.',
  },
};

export interface CmdDef { name: string; short: string; text: string }
export const CMD_INFO: Record<CmdId, CmdDef> = {
  plain: { short: 'Attack every adjoining enemy', name: 'Strike',
    text: 'Attack every adjacent enemy by matching sigils. If more than '
        + 'one falls, one of them attacks again.' },
  usurp: { short: 'An enemy attacks all of its own side', name: 'Usurp',
    text: 'An adjacent enemy attacks all of its own side on your '
        + 'behalf. It does not change hands.' },
  usurpOne: { short: 'An enemy attacks one of its own side', name: 'Usurp, Single',
    text: 'An adjacent enemy attacks one named card of its own side on '
        + 'your behalf.' },
  transpose: { short: 'Swap two adjoining cards', name: 'Transpose',
    text: 'Swap two adjacent characters, whoever owns them. Captures '
        + 'nothing.' },
  reclaimRecent: { short: 'Take back a card lost last command', name: 'Reclaim',
    text: 'Take back a character the opponent captured from you on their '
        + 'last command, if it is adjacent to one of yours.' },
};

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
export interface CardDef {
  id: CardId;
  name: string;
  epithet?: string;
  flavour?: string;
  /** fixed for the life of the card; never rotated */
  sigils: Card;
  trait: TraitId | null;
  command: CmdId;
  art: number;
}

export type EffectStatus = 'pending' | 'resolved' | 'failed' | 'skipped';

export interface Effect {
  id: string;
  /** the card whose ability this is, by stable id -- it may move */
  source: CardId;
  trait: TraitId;
  timing: Timing;
  /** the event that created it */
  cause: string;
  controller: Player;
  optional: boolean;
  status: EffectStatus;
  /** filled in when the player chooses */
  targets?: number[];
  /** for Rally: which captured ally it answers */
  subject?: CardId;
  /** the controller has already chosen where this sits in the order, so
   *  do not ask again -- without this the request repeats forever */
  ordered?: boolean;
  note?: string;
}

export type EventKind = 'deploy' | 'move' | 'swap' | 'captureBatch'
  | 'trigger' | 'resolve' | 'skip' | 'fail' | 'command' | 'pass' | 'phase';

export interface GameEvent {
  id: string;
  kind: EventKind;
  player?: Player;
  text: string;
  /** cards whose ownership changed, with who held them before */
  captured?: { card: CardId; from: Player }[];
  cells?: number[];
}

export type ChoiceKind = 'harbinger' | 'exile' | 'pact' | 'rally'
  | 'order';

export interface ChoiceOption {
  id: string;
  label: string;
  cells: number[];
  /** for ordering requests */
  effect?: string;
}

export interface ChoiceRequest {
  id: string;
  kind: ChoiceKind;
  player: Player;
  prompt: string;
  optional: boolean;
  options: ChoiceOption[];
  /** the effect awaiting this decision */
  effect?: string;
}

export type TurnStep = 'onDeploy' | 'attack' | 'reactions' | 'end';

export interface Turn {
  deployed: CardId;
  cell: number;
  step: TurnStep;
  /** cards adjacent to each Rally before this turn's captures */
  adjacencySnapshot: Record<CardId, CardId[]>;
}

export interface Variant {
  /** 0 = off. 2 or 3 protected Champions per player, Convergence only. */
  boundChampions: 0 | 2 | 3;
}

export interface V23State {
  phase: 'convergence' | 'dominion' | 'over';
  cells: (CardId | null)[];
  owner: Record<CardId, Player>;
  defs: Record<CardId, CardDef>;
  hands: [CardId[], CardId[]];
  reserve: CardId[];
  deployed: number;
  commands: number;
  stack: Effect[];
  pending: ChoiceRequest | null;
  turn: Turn | null;
  events: GameEvent[];
  /** once-per-limits, keyed `${trait}:${card}:${scope}` */
  used: string[];
  /** cards each player lost on the opponent's most recent command */
  recent: [CardId[], CardId[]];
  champions: [CardId[], CardId[]];
  variant: Variant;
  counter: number;
  seed: number;
}

// ---------------------------------------------------------------------------
// queries
// ---------------------------------------------------------------------------
export const cellOf = (s: V23State, id: CardId): number =>
  s.cells.indexOf(id);

export const at = (s: V23State, cell: number): CardDef | null => {
  const id = s.cells[cell];
  return id ? s.defs[id] : null;
};

export const toMove = (s: V23State): Player => {
  if (s.pending) return s.pending.player;
  if (s.phase === 'convergence') return (s.deployed % 2) as Player;
  if (s.phase === 'dominion') return (1 - (s.commands % 2)) as Player;
  return 0;
};

export const score = (s: V23State): [number, number] => {
  let a = 0, b = 0;
  for (const id of s.cells) {
    if (!id) continue;
    if (s.owner[id] === 0) a++; else b++;
  }
  return [a, b];
};

export const isOver = (s: V23State): boolean => s.phase === 'over';

export function winner(s: V23State): number {
  const [a, b] = score(s);
  return a === b ? -1 : a > b ? 0 : 1;
}

/** How many of a card's orthogonal neighbours share its controller. */
export function alliesAdjacent(s: V23State, id: CardId): number {
  const cell = cellOf(s, id);
  if (cell < 0) return 0;
  const me = s.owner[id];
  let n = 0;
  for (const t of NB[cell]) {
    if (t < 0) continue;
    const other = s.cells[t];
    if (other && s.owner[other] === me) n++;
  }
  return n;
}

/** Sanctuary, Bound Champions, and anything else that forbids capture.
 *  `view` lets the caller evaluate against a pre-batch snapshot. */
export function captureBlocked(s: V23State, id: CardId,
                               view: V23State = s): string | null {
  if (s.phase !== 'convergence') return null;
  const def = s.defs[id];
  if (view.champions[view.owner[id]]?.includes(id)) {
    return 'a Bound Champion cannot be captured during Convergence';
  }
  if (def.trait === 'sanctuary' && alliesAdjacent(view, id) >= 2) {
    return 'Sanctuary — two or more adjacent allies';
  }
  return null;
}

/** Anchor. Movement only; capture is unaffected. */
export function moveBlocked(s: V23State, id: CardId): string | null {
  if (s.phase !== 'convergence') return null;
  return s.defs[id].trait === 'anchor'
    ? 'Anchor — cannot be moved or swapped' : null;
}

export const traitState = (s: V23State, id: CardId): string => {
  const def = s.defs[id];
  if (!def.trait) return '';
  if (s.phase !== 'convergence') return 'expired';
  switch (def.trait) {
    case 'sanctuary': {
      const n = alliesAdjacent(s, id);
      return n >= 2 ? `protected — ${n} adjacent allies`
                    : `not protected — ${n} of 2 allies`;
    }
    case 'anchor': return 'cannot be moved';
    case 'harbinger': return 'resolved on deployment';
    case 'rally':
      return s.used.includes(`rally:${id}:${s.deployed}`)
        ? 'reaction used this turn'
        : 'reacts if an adjacent ally is captured';
    case 'exile': return 'resolved on deployment';
    case 'pact': return 'resolved on deployment';
  }
};

// ---------------------------------------------------------------------------
// mutation helpers (all operate on a draft copy)
// ---------------------------------------------------------------------------
const clone = (s: V23State): V23State => ({
  ...s,
  cells: s.cells.slice(),
  owner: { ...s.owner },
  hands: [s.hands[0].slice(), s.hands[1].slice()],
  reserve: s.reserve.slice(),
  stack: s.stack.map((e) => ({ ...e })),
  events: s.events.slice(),
  used: s.used.slice(),
  recent: [s.recent[0].slice(), s.recent[1].slice()],
  champions: [s.champions[0].slice(), s.champions[1].slice()],
  turn: s.turn ? { ...s.turn,
                   adjacencySnapshot: { ...s.turn.adjacencySnapshot } }
              : null,
});

const nextId = (s: V23State, tag: string): string =>
  `${tag}${s.counter++}`;

function note(s: V23State, kind: EventKind, text: string,
              extra: Partial<GameEvent> = {}): string {
  const id = nextId(s, 'e');
  s.events = [{ id, kind, text, ...extra }, ...s.events].slice(0, 80);
  return id;
}

/** Move a card. Never a capture, never an attack. */
function moveCard(s: V23State, id: CardId, to: number): void {
  const from = cellOf(s, id);
  if (from >= 0) s.cells[from] = null;
  s.cells[to] = id;
}

function swapCards(s: V23State, a: CardId, b: CardId): void {
  const ca = cellOf(s, a), cb = cellOf(s, b);
  s.cells[ca] = b;
  s.cells[cb] = a;
}

/** Ownership change. Never implies movement or an attack. */
function setOwner(s: V23State, id: CardId, p: Player): void {
  s.owner[id] = p;
}

// ---------------------------------------------------------------------------
// the normal attack
// ---------------------------------------------------------------------------
/**
 * What the card in `cell` would capture by matching, evaluated against a
 * single snapshot so that a capture inside the batch cannot affect
 * another comparison or another Sanctuary check.
 */
export function normalAttack(s: V23State, cell: number,
                             player: Player): { card: CardId;
                                                blocked: string | null }[] {
  const srcId = s.cells[cell];
  if (!srcId) return [];
  const src = s.defs[srcId];
  const out: { card: CardId; blocked: string | null }[] = [];
  for (let d = 0; d < 4; d++) {
    const t = NB[cell][d];
    if (t < 0) continue;
    const tid = s.cells[t];
    if (!tid || s.owner[tid] === player) continue;
    const tgt = s.defs[tid];
    if (src.sigils[d] !== tgt.sigils[OPPSIDE[d]]) continue;
    out.push({ card: tid, blocked: captureBlocked(s, tid, s) });
  }
  return out;
}

/**
 * Record who is beside whom, right now.
 *
 * Rally needs the adjacency that held *immediately before the capture*.
 * Taking this once at deploy time was wrong: Harbinger, Exile and Pact
 * all resolve between the deployment and the attack, and a card they
 * move leaves the snapshot claiming an adjacency that no longer exists.
 */
function snapshotAdjacency(s: V23State): Record<CardId, CardId[]> {
  const out: Record<CardId, CardId[]> = {};
  for (const id of s.cells) {
    if (!id) continue;
    const c = cellOf(s, id);
    out[id] = NB[c].filter((t) => t >= 0 && s.cells[t])
      .map((t) => s.cells[t]!);
  }
  return out;
}

/** Apply a whole batch at once and record it as one event. */
function applyBatch(s: V23State, taker: Player,
                    cards: CardId[], why: string): string | null {
  if (!cards.length) return null;
  const captured = cards.map((c) => ({ card: c, from: s.owner[c] }));
  for (const c of cards) setOwner(s, c, taker);
  return note(s, 'captureBatch',
              `P${taker + 1} captured ${cards.length} (${why})`,
              { player: taker, captured,
                cells: cards.map((c) => cellOf(s, c)) });
}

// ---------------------------------------------------------------------------
// triggers
// ---------------------------------------------------------------------------
/**
 * Collect On Capture reactions to a completed batch.
 *
 * Rally reacts only to an opposing deployment, must still belong to the
 * reacting player, must have been adjacent to the captured ally before
 * the batch, and fires at most once per opposing deployment.
 */
function collectRally(s: V23State, cause: string,
                      captured: { card: CardId; from: Player }[],
                      activePlayer: Player): Effect[] {
  if (s.phase !== 'convergence' || !s.turn) return [];
  const snap = s.turn.adjacencySnapshot;
  const out: Effect[] = [];
  for (const id of s.cells) {
    if (!id) continue;
    const def = s.defs[id];
    if (def.trait !== 'rally') continue;
    const controller = s.owner[id];
    // only an OPPOSING deployment, so a player cannot trigger off their
    // own Pact
    if (controller === activePlayer) continue;
    const key = `rally:${id}:${s.deployed}`;
    if (s.used.includes(key)) continue;
    const allies = captured.filter((c) => c.from === controller
      && (snap[id] ?? []).includes(c.card));
    if (!allies.length) continue;
    out.push({
      id: nextId(s, 'f'),
      source: id, trait: 'rally', timing: 'onCapture',
      cause, controller, optional: true, status: 'pending',
    });
  }
  return out;
}

/**
 * Push reactions. The active player's go on first and the opponent's
 * second, so on a LIFO stack the NON-ACTIVE player resolves first.
 */
function pushTriggers(s: V23State, effects: Effect[],
                      activePlayer: Player): void {
  const mine = effects.filter((e) => e.controller === activePlayer);
  const theirs = effects.filter((e) => e.controller !== activePlayer);
  for (const e of [...mine, ...theirs]) {
    s.stack.push(e);
    note(s, 'trigger',
         `${TRAIT_INFO[e.trait].name} triggered for P${e.controller + 1}`);
  }
}

// ---------------------------------------------------------------------------
// legal target enumeration for On Deploy abilities
// ---------------------------------------------------------------------------
export function harbingerOptions(s: V23State, cell: number): ChoiceOption[] {
  const adj = NB[cell].filter((t) => t >= 0 && s.cells[t]);
  const out: ChoiceOption[] = [];
  for (let i = 0; i < adj.length; i++) {
    for (let j = i + 1; j < adj.length; j++) {
      const a = s.cells[adj[i]]!, b = s.cells[adj[j]]!;
      if (moveBlocked(s, a) || moveBlocked(s, b)) continue;
      out.push({ id: `h:${adj[i]}:${adj[j]}`,
                 label: `swap ${s.defs[a].name} and ${s.defs[b].name}`,
                 cells: [adj[i], adj[j]] });
    }
  }
  return out;
}

export function exileOptions(s: V23State, cell: number,
                             player: Player): ChoiceOption[] {
  const empty: number[] = [];
  for (let i = 0; i < CELLS; i++) if (!s.cells[i]) empty.push(i);
  const out: ChoiceOption[] = [];
  for (const t of NB[cell]) {
    if (t < 0) continue;
    const id = s.cells[t];
    if (!id || s.owner[id] === player) continue;
    if (moveBlocked(s, id)) continue;
    for (const dest of empty) {
      out.push({ id: `x:${t}:${dest}`,
                 label: `move ${s.defs[id].name} to cell ${dest}`,
                 cells: [t, dest] });
    }
  }
  return out;
}

export function pactOptions(s: V23State, cell: number,
                            player: Player): ChoiceOption[] {
  const friends: number[] = [];
  const foes: number[] = [];
  for (const t of NB[cell]) {
    if (t < 0) continue;
    const id = s.cells[t];
    if (!id || t === cell) continue;
    if (s.owner[id] === player) friends.push(t);
    else foes.push(t);
  }
  const out: ChoiceOption[] = [];
  for (const f of friends) {
    for (const e of foes) {
      const fid = s.cells[f]!, eid = s.cells[e]!;
      // Sanctuary blocks the exchange, and the whole exchange fails
      // rather than half-applying, so a blocked side is not offered
      if (captureBlocked(s, fid) || captureBlocked(s, eid)) continue;
      out.push({ id: `p:${f}:${e}`,
                 label: `trade ${s.defs[fid].name} for ${s.defs[eid].name}`,
                 cells: [f, e] });
    }
  }
  return out;
}

export function rallyOptions(s: V23State, e: Effect): ChoiceOption[] {
  const cause = s.events.find((v) => v.id === e.cause);
  const snap = s.turn?.adjacencySnapshot[e.source] ?? [];
  const out: ChoiceOption[] = [];
  for (const c of cause?.captured ?? []) {
    if (c.from !== e.controller) continue;
    if (!snap.includes(c.card)) continue;
    const cell = cellOf(s, c.card);
    if (cell < 0) continue;
    if (moveBlocked(s, e.source) || moveBlocked(s, c.card)) continue;
    out.push({ id: `r:${c.card}`,
               label: `take ${s.defs[c.card].name}'s place`,
               cells: [cellOf(s, e.source), cell] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// the engine
// ---------------------------------------------------------------------------
export type Action =
  | { kind: 'deploy'; card: CardId; cell: number }
  | { kind: 'choose'; option: string }
  | { kind: 'skip' }
  | { kind: 'command'; cmd: DominionCommand }
  | { kind: 'pass' };

export type DominionCommand =
  | { kind: 'plain'; cell: number }
  | { kind: 'usurp'; cell: number; via: number }
  | { kind: 'usurpOne'; cell: number; via: number; target: number }
  | { kind: 'transpose'; cell: number; a: number; b: number }
  | { kind: 'reclaimRecent'; cell: number; target: CardId };

/** The only way state advances. Pure: same state plus action, same result. */
export function apply(prev: V23State, action: Action): V23State {
  const s = clone(prev);
  switch (action.kind) {
    case 'deploy': deploy(s, action.card, action.cell); break;
    case 'choose': resolveChoice(s, action.option); break;
    case 'skip': resolveChoice(s, null); break;
    case 'command': runCommand(s, action.cmd); break;
    case 'pass':
      note(s, 'pass', `P${toMove(s) + 1} has nothing to command`);
      s.commands += 1;
      break;
  }
  settle(s);
  return s;
}

function deploy(s: V23State, card: CardId, cell: number): void {
  if (s.phase !== 'convergence') throw new Error('not convergence');
  if (s.pending || s.turn) throw new Error('a turn is already resolving');
  const p = toMove(s);
  if (!s.hands[p].includes(card)) throw new Error('not in hand');
  if (s.cells[cell] !== null) throw new Error('cell occupied');

  s.hands[p] = s.hands[p].filter((c) => c !== card);
  s.cells[cell] = card;
  s.owner[card] = p;
  note(s, 'deploy', `P${p + 1} deployed ${s.defs[card].name} to ${cell}`,
       { player: p, cells: [cell] });

  s.turn = { deployed: card, cell, step: 'onDeploy',
             adjacencySnapshot: snapshotAdjacency(s) };
}

/** Build the choice an On Deploy trait needs, or null if it cannot act. */
function onDeployRequest(s: V23State): ChoiceRequest | null {
  const t = s.turn!;
  const def = s.defs[t.deployed];
  const p = s.owner[t.deployed];
  if (!def.trait) return null;
  const info = TRAIT_INFO[def.trait];
  if (info.timing !== 'onDeploy') return null;
  let options: ChoiceOption[] = [];
  if (def.trait === 'harbinger') options = harbingerOptions(s, t.cell);
  if (def.trait === 'exile') options = exileOptions(s, t.cell, p);
  if (def.trait === 'pact') options = pactOptions(s, t.cell, p);
  if (!options.length) return null;
  return {
    id: nextId(s, 'c'),
    kind: def.trait as ChoiceKind,
    player: p,
    prompt: `${info.name}: ${info.text}`,
    optional: true,
    options,
  };
}

function resolveChoice(s: V23State, option: string | null): void {
  const req = s.pending;
  if (!req) throw new Error('nothing to choose');
  s.pending = null;

  if (req.kind === 'order') {
    // the player is ordering their own simultaneous reactions; the
    // chosen one is pushed LAST so it resolves FIRST
    const chosen = option ?? req.options[0].id;
    const id = chosen.slice(2);
    for (const e of s.stack) {
      if (e.controller === req.player) e.ordered = true;
    }
    const idx = s.stack.findIndex((e) => e.id === id);
    if (idx >= 0) {
      const [e] = s.stack.splice(idx, 1);
      s.stack.push(e);
      note(s, 'trigger',
           `P${req.player + 1} ordered ${TRAIT_INFO[e.trait].name} first`);
    }
    return;
  }

  if (option === null) {
    if (req.effect) {
      const e = s.stack.find((x) => x.id === req.effect);
      if (e) e.status = 'skipped';
    }
    note(s, 'skip', `P${req.player + 1} declined ${req.kind}`);
    return;
  }

  const parts = option.split(':');
  const tag = parts[0];

  if (tag === 'h') {
    const [a, b] = [Number(parts[1]), Number(parts[2])];
    const ia = s.cells[a], ib = s.cells[b];
    if (!ia || !ib || moveBlocked(s, ia) || moveBlocked(s, ib)) {
      note(s, 'fail', 'Harbinger could not swap — target no longer legal');
      return;
    }
    swapCards(s, ia, ib);
    note(s, 'swap',
         `Harbinger swapped ${s.defs[ia].name} and ${s.defs[ib].name}`,
         { cells: [a, b] });
    return;
  }

  if (tag === 'x') {
    const [from, dest] = [Number(parts[1]), Number(parts[2])];
    const id = s.cells[from];
    if (!id || s.cells[dest] || moveBlocked(s, id)) {
      note(s, 'fail', 'Exile could not move — target no longer legal');
      return;
    }
    moveCard(s, id, dest);
    note(s, 'move', `Exile moved ${s.defs[id].name} to ${dest}`,
         { cells: [from, dest] });
    return;
  }

  if (tag === 'p') {
    const [f, e] = [Number(parts[1]), Number(parts[2])];
    const fid = s.cells[f], eid = s.cells[e];
    const p = s.owner[s.turn!.deployed];
    // recheck both sides; a half-applied Pact is never legal
    if (!fid || !eid || s.owner[fid] !== p || s.owner[eid] === p
        || captureBlocked(s, fid) || captureBlocked(s, eid)) {
      note(s, 'fail', 'Pact failed — one side was no longer legal, so '
                    + 'neither card changed hands');
      return;
    }
    // adjacency as it stands at this instant, not as it stood when the
    // Pact card was deployed
    if (s.turn) s.turn.adjacencySnapshot = snapshotAdjacency(s);
    const captured = [{ card: fid, from: p },
                      { card: eid, from: s.owner[eid] }];
    setOwner(s, fid, (1 - p) as Player);
    setOwner(s, eid, p);
    const ev = note(s, 'captureBatch',
      `Pact exchanged ${s.defs[fid].name} and ${s.defs[eid].name}`,
      { player: p, captured, cells: [f, e] });
    // both ownership changes are captures for anything that reacts
    pushTriggers(s, collectRally(s, ev, captured, p), p);
    return;
  }

  if (tag === 'r') {
    const e = s.stack.find((x) => x.id === req.effect);
    const subject = parts[1];
    if (!e) return;
    const srcCell = cellOf(s, e.source);
    const subCell = cellOf(s, subject);
    if (srcCell < 0 || subCell < 0 || s.owner[e.source] !== e.controller
        || moveBlocked(s, e.source) || moveBlocked(s, subject)) {
      e.status = 'failed';
      note(s, 'fail', 'Rally could not swap — no longer legal');
      return;
    }
    swapCards(s, e.source, subject);
    e.status = 'resolved';
    s.used.push(`rally:${e.source}:${s.deployed}`);
    note(s, 'swap',
         `Rally: ${s.defs[e.source].name} took `
         + `${s.defs[subject].name}'s place`,
         { cells: [srcCell, subCell] });
    return;
  }
}

/**
 * Advance until a decision is needed or the turn is over. The stack is
 * always drained before the turn's own steps continue, which is what
 * makes "all On Deploy effects and their reactions finish before the
 * normal attack" true by construction.
 */
function settle(s: V23State): void {
  for (let guard = 0; guard < 200; guard++) {
    if (s.pending) return;

    // 1. the stack, top first
    const top = s.stack[s.stack.length - 1];
    if (top) {
      if (top.status !== 'pending') { s.stack.pop(); continue; }
      // several of my own reactions at once: I choose the order
      const mine = s.stack.filter((e) => e.status === 'pending'
        && e.controller === top.controller);
      if (mine.length > 1 && !mine.every((e) => e.ordered)) {
        s.pending = {
          id: nextId(s, 'c'), kind: 'order', player: top.controller,
          prompt: 'Which of your reactions resolves first?',
          optional: false,
          options: mine.map((e) => ({
            id: `o:${e.id}`,
            label: `${TRAIT_INFO[e.trait].name} on `
                 + `${s.defs[e.source].name}`,
            cells: [cellOf(s, e.source)], effect: e.id })),
        };
        return;
      }
      if (top.trait === 'rally') {
        const opts = rallyOptions(s, top);
        if (!opts.length) {
          top.status = 'failed';
          note(s, 'fail', 'Rally had no legal swap when it resolved');
          s.stack.pop();
          continue;
        }
        s.pending = {
          id: nextId(s, 'c'), kind: 'rally', player: top.controller,
          prompt: `${TRAIT_INFO.rally.name}: ${TRAIT_INFO.rally.text}`,
          optional: true, options: opts, effect: top.id,
        };
        return;
      }
      s.stack.pop();
      continue;
    }

    // 2. the turn's own steps
    if (s.turn) {
      const t = s.turn;
      if (t.step === 'onDeploy') {
        const req = onDeployRequest(s);
        t.step = 'attack';
        if (req) { s.pending = req; return; }
        continue;
      }
      if (t.step === 'attack') {
        const p = s.owner[t.deployed];
        const from = cellOf(s, t.deployed);
        const hits = from >= 0 ? normalAttack(s, from, p) : [];
        const taken = hits.filter((h) => !h.blocked).map((h) => h.card);
        for (const h of hits) {
          if (h.blocked) {
            note(s, 'fail',
                 `${s.defs[h.card].name} held — ${h.blocked}`,
                 { cells: [cellOf(s, h.card)] });
          }
        }
        t.step = 'reactions';
        if (taken.length) {
          // On Deploy effects may have moved cards since the deployment,
          // so re-read adjacency before the batch that Rally answers
          t.adjacencySnapshot = snapshotAdjacency(s);
          const captured = taken.map((c) => ({ card: c, from: s.owner[c] }));
          const ev = applyBatch(s, p, taken, 'placement attack')!;
          pushTriggers(s, collectRally(s, ev, captured, p), p);
        }
        continue;
      }
      if (t.step === 'reactions') { t.step = 'end'; continue; }
      // end of turn
      s.turn = null;
      s.deployed += 1;
      s.stack = [];
      if (s.deployed >= DEPLOYMENTS) {
        s.phase = 'dominion';
        note(s, 'phase',
             'The Convergence ends. Traits expire; Dominion begins.');
      }
      continue;
    }
    return;
  }
  // a cycle we did not anticipate: fail loudly in development rather
  // than silently truncating legal play
  throw new Error('v2.3: resolution did not settle — see the event log');
}

// ---------------------------------------------------------------------------
// Dominion, preserved from v2.2
// ---------------------------------------------------------------------------
export function dominionCommands(s: V23State): DominionCommand[] {
  if (s.phase !== 'dominion') return [];
  const p = toMove(s);
  const out: DominionCommand[] = [];
  for (let cell = 0; cell < CELLS; cell++) {
    const id = s.cells[cell];
    if (!id || s.owner[id] !== p) continue;
    out.push({ kind: 'plain', cell });
    const cmd = s.defs[id].command;
    if (cmd === 'usurp') {
      for (const t of NB[cell]) {
        const tid = t >= 0 ? s.cells[t] : null;
        if (tid && s.owner[tid] !== p) out.push({ kind: 'usurp', cell, via: t });
      }
    } else if (cmd === 'usurpOne') {
      for (const t of NB[cell]) {
        const tid = t >= 0 ? s.cells[t] : null;
        if (!tid || s.owner[tid] === p) continue;
        for (const u of NB[t]) {
          const uid = u >= 0 ? s.cells[u] : null;
          if (uid && u !== cell && s.owner[uid] !== p) {
            out.push({ kind: 'usurpOne', cell, via: t, target: u });
          }
        }
      }
    } else if (cmd === 'transpose') {
      for (const a of NB[cell]) {
        if (a < 0 || !s.cells[a]) continue;
        for (const b of NB[a]) {
          if (b < 0 || !s.cells[b] || b === a || a >= b) continue;
          out.push({ kind: 'transpose', cell, a, b });
        }
      }
    } else if (cmd === 'reclaimRecent') {
      for (const target of s.recent[p]) {
        const tc = cellOf(s, target);
        if (tc < 0 || s.owner[target] === p) continue;
        const adj = NB[tc].some((t) => t >= 0 && s.cells[t]
          && s.owner[s.cells[t]!] === p);
        if (adj) out.push({ kind: 'reclaimRecent', cell, target });
      }
    }
  }
  return out;
}

function runCommand(s: V23State, cmd: DominionCommand): void {
  if (s.phase !== 'dominion') throw new Error('not dominion');
  const p = toMove(s);
  const srcId = s.cells[cmd.cell];
  if (!srcId || s.owner[srcId] !== p) throw new Error('not yours');
  const before: CardId[] = s.cells.filter(
    (c): c is CardId => !!c && s.owner[c] !== p);

  let direct: CardId[] = [];
  if (cmd.kind === 'plain') {
    direct = normalAttack(s, cmd.cell, p).map((h) => h.card);
  } else if (cmd.kind === 'usurp') {
    const via = s.cells[cmd.via]!;
    const vcell = cellOf(s, via);
    for (let d = 0; d < 4; d++) {
      const t = NB[vcell][d];
      const tid = t >= 0 ? s.cells[t] : null;
      if (!tid || s.owner[tid] === p) continue;
      if (s.defs[via].sigils[d] === s.defs[tid].sigils[OPPSIDE[d]]) {
        direct.push(tid);
      }
    }
  } else if (cmd.kind === 'usurpOne') {
    const via = s.cells[cmd.via]!, tgt = s.cells[cmd.target];
    const d = NB[cellOf(s, via)].indexOf(cmd.target);
    if (tgt && d >= 0 && s.owner[tgt] !== p
        && s.defs[via].sigils[d] === s.defs[tgt].sigils[OPPSIDE[d]]) {
      direct = [tgt];
    }
  } else if (cmd.kind === 'transpose') {
    const a = s.cells[cmd.a]!, b = s.cells[cmd.b]!;
    swapCards(s, a, b);
    note(s, 'swap', `P${p + 1} transposed ${cmd.a} and ${cmd.b}`,
         { player: p, cells: [cmd.a, cmd.b] });
  } else {
    direct = [cmd.target];
  }

  if (direct.length) {
    applyBatch(s, p, direct, CMD_INFO[s.defs[srcId].command].name);
    // the multiple-direct-capture follow-up, unchanged
    if (direct.length > 1) {
      let best: CardId[] = [];
      for (const f of direct) {
        const extra = normalAttack(s, cellOf(s, f), p).map((h) => h.card);
        if (extra.length > best.length) best = extra;
      }
      if (best.length) applyBatch(s, p, best, 'follow-up');
    }
  } else if (cmd.kind !== 'transpose') {
    note(s, 'command', `P${p + 1} commanded ${cmd.cell}, took nothing`,
         { player: p });
  }

  const opp = (1 - p) as Player;
  s.recent[opp] = before.filter((c) => s.owner[c] === p);
  s.commands += 1;
  if (s.commands >= DOMINION_COMMANDS) {
    s.phase = 'over';
    note(s, 'phase', 'The Dominion ends.');
  }
}

export const mustPass = (s: V23State): boolean =>
  s.phase === 'dominion' && !s.pending && dominionCommands(s).length === 0;

export const commandsLeft = (s: V23State, p: Player): number => {
  let n = 0;
  for (let k = s.commands; k < DOMINION_COMMANDS; k++) {
    if (1 - (k % 2) === p) n++;
  }
  return n;
};

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------
import { CARD_DEFS, ROSTER } from './roster';
import { mulberry32 } from '../rng';

/**
 * A new match. All twelve characters are dealt six and six, so every
 * trait is in play and the board finishes full.
 *
 * Bound Champions is an optional variant and OFF by default: universal
 * immunity would hide what Sanctuary and Pact actually do.
 */
export function newGame(seed: number,
                        variant: Variant = { boundChampions: 0 }): V23State {
  const rng = mulberry32(seed);
  const ids = ROSTER.map((e) => e.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const s: V23State = {
    phase: 'convergence',
    cells: Array(CELLS).fill(null),
    owner: {},
    defs: { ...CARD_DEFS },
    hands: [ids.slice(0, 6), ids.slice(6, 12)],
    reserve: [],
    deployed: 0,
    commands: 0,
    stack: [],
    pending: null,
    turn: null,
    events: [],
    used: [],
    recent: [[], []],
    champions: [[], []],
    variant,
    counter: 0,
    seed,
  };
  if (variant.boundChampions > 0) {
    // the prototype designates them deterministically from the deal;
    // a full version would let players choose before deployment
    for (const p of [0, 1] as Player[]) {
      s.champions[p] = s.hands[p].slice(0, variant.boundChampions);
    }
    note(s, 'phase',
         `Bound Champions: ${variant.boundChampions} per player cannot be `
         + 'captured during Convergence.');
  }
  return s;
}

/** Legal deployments for the player to move. No rotation: a cell only. */
export function deployments(s: V23State): { card: CardId; cell: number }[] {
  if (s.phase !== 'convergence' || s.pending || s.turn) return [];
  const p = toMove(s);
  const out: { card: CardId; cell: number }[] = [];
  for (const card of s.hands[p]) {
    for (let cell = 0; cell < CELLS; cell++) {
      if (!s.cells[cell]) out.push({ card, cell });
    }
  }
  return out;
}

/** What a deployment would capture, before any optional ability. Used by
 *  the preview, and deliberately the same code the live game runs. */
export function previewDeploy(s: V23State, card: CardId, cell: number):
    { taken: CardId[]; blocked: { card: CardId; why: string }[] } {
  const draft = clone(s);
  const p = toMove(draft);
  draft.hands[p] = draft.hands[p].filter((c) => c !== card);
  draft.cells[cell] = card;
  draft.owner[card] = p;
  const hits = normalAttack(draft, cell, p);
  return {
    taken: hits.filter((h) => !h.blocked).map((h) => h.card),
    blocked: hits.filter((h) => h.blocked)
      .map((h) => ({ card: h.card, why: h.blocked! })),
  };
}
