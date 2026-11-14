/**
 * All twenty abilities: the four shipped ones and the sixteen adopted
 * for playtesting.
 *
 * The Python side is the oracle. `proto.py` holds the original four and
 * `proto16.py` the sixteen, and `web/test/proto16.diff.test.ts` replays
 * a fixture generated from them against this file. That matters more
 * here than anywhere else in the project: the last time an ability was
 * written twice from the same prose, the two versions disagreed and both
 * passed their own tests. If you change a rule here, change it there and
 * regenerate.
 *
 * Option shapes are deliberately explicit rather than a tuple, because
 * the UI has to render a human-readable description of each choice
 * before the player commits to it.
 */

import {
  ADJ, AXES, type Board, type CaptureEvent, type Card, cascadeFrom,
  diagonals, edgeKey, isShielded, lineBeyond, OPPSIDE, type Resolution,
  rot90, type Shape, type Shields,
} from './engine';

export const SHIPPED = ['pivot', 'exchange', 'relay', 'prism'] as const;

export const ADOPTED = [
  // change the edges
  'mirror', 'echo', 'attune', 'converge',
  // change the attack geometry
  'lance', 'corner', 'bridge', 'crossing',
  // change the cascade
  'hinge', 'amplify', 'anchor', 'handoff',
  // change the board you leave behind
  'fortify', 'withdraw', 'reorient', 'mend',
] as const;

export const ALL_ABILITIES = [...SHIPPED, ...ADOPTED] as const;
export type AbilityId = typeof ALL_ABILITIES[number];

export type AbilityGroup = 'shipped' | 'edges' | 'geometry'
  | 'cascade' | 'aftermath';

export interface AbilityDef {
  group: AbilityGroup;
  /** what the card changes, in two or three words, for the card face */
  changes: string;
  /** the printed rules text */
  text: string;
}

export const ABILITY_INFO: Record<AbilityId, AbilityDef> = {
  pivot: { group: 'shipped', changes: 'orientation',
    text: 'Rotate one adjacent card 90° clockwise — either player’s — '
        + 'before attacking.' },
  exchange: { group: 'shipped', changes: 'position',
    text: 'Swap this card with one adjacent card you own. The card you '
        + 'placed attacks from its new cell.' },
  relay: { group: 'shipped', changes: 'attack origin',
    text: 'One adjacent card you own makes the attack instead of this '
        + 'card.' },
  prism: { group: 'shipped', changes: 'matching',
    text: 'Choose one edge of this card. It matches any sigil this '
        + 'placement.' },

  mirror: { group: 'edges', changes: 'edge order',
    text: 'Choose two adjacent edges of this card with different sigils '
        + 'and swap them for this placement.' },
  echo: { group: 'edges', changes: 'a repeated sigil',
    text: 'Copy the sigil on one edge of this card onto another edge of '
        + 'this card for this placement.' },
  attune: { group: 'edges', changes: 'a borrowed sigil',
    text: 'Choose an adjacent card you own. One edge of this card also '
        + 'counts as the sigil that ally shows this card.' },
  converge: { group: 'edges', changes: 'two edges at once',
    text: 'Choose two edges of this card. Each counts as either of their '
        + 'two sigils for this placement.' },

  lance: { group: 'geometry', changes: 'reach through a gap',
    text: 'Choose an edge facing an empty cell. This card also attacks '
        + 'the card beyond that empty cell, in line.' },
  corner: { group: 'geometry', changes: 'a diagonal attack',
    text: 'Attack one diagonal neighbour with the chosen edge. This card '
        + 'gives up all of its orthogonal attacks.' },
  bridge: { group: 'geometry', changes: 'reach past an ally',
    text: 'Choose an adjacent card you own. This card also attacks the '
        + 'enemy directly beyond it, in line.' },
  crossing: { group: 'geometry', changes: 'one axis, then a step',
    text: 'Attack along one axis only. If exactly one card falls, this '
        + 'card may then move into the empty cell opposite it.' },

  hinge: { group: 'cascade', changes: 'the chain’s aim',
    text: 'After direct captures, rotate one card you captured 90° '
        + 'clockwise before it makes its cascade attack. The rotation '
        + 'persists.' },
  amplify: { group: 'cascade', changes: 'a free capture',
    text: 'Attack along one edge only. If it captures, that card makes '
        + 'one cascade attack on an adjacent enemy that ignores '
        + 'matching. Its other edges do not attack.' },
  anchor: { group: 'cascade', changes: 'the chain for a step',
    text: 'If this card captures directly, you may give up the entire '
        + 'cascade to move one captured card into an empty cell beside '
        + 'it. It keeps its orientation and does not attack.' },
  handoff: { group: 'cascade', changes: 'who chains',
    text: 'A card you captured makes no cascade attack. Instead one '
        + 'card you already owned, adjacent to this one, makes it from '
        + 'its own position.' },

  fortify: { group: 'aftermath', changes: 'an edge that holds',
    text: 'Choose one edge of this card. It cannot be captured through '
        + 'until the end of your opponent’s next turn.' },
  withdraw: { group: 'aftermath', changes: 'a retreat on a miss',
    text: 'If this card captured nothing, move it to an adjacent empty '
        + 'cell.' },
  reorient: { group: 'aftermath', changes: 'an ally’s facing',
    text: 'After everything resolves, rotate one adjacent card you own '
        + '90° in either direction.' },
  mend: { group: 'aftermath', changes: 'advancing into a capture',
    text: 'If the chosen edge captures directly, swap this card with '
        + 'that card after the cascade resolves.' },
};

// ---------------------------------------------------------------------------
// options
// ---------------------------------------------------------------------------
export type Option =
  | null
  | { kind: 'pivot' | 'exchange' | 'relay'; cell: number }
  | { kind: 'prism'; edge: number }
  | { kind: 'mirror'; a: number; b: number }
  | { kind: 'echo'; from: number; to: number }
  | { kind: 'attune'; cell: number; edge: number }
  | { kind: 'converge'; a: number; b: number }
  | { kind: 'lance'; edge: number }
  | { kind: 'corner'; cell: number; edge: number }
  | { kind: 'bridge'; through: number; cell: number; edge: number }
  | { kind: 'crossing'; axis: number }
  | { kind: 'hinge'; cell: number }
  | { kind: 'amplify'; edge: number; target: number | null }
  | { kind: 'anchor'; cell: number; dest: number }
  | { kind: 'handoff'; cell: number; ally: number }
  | { kind: 'fortify'; edge: number }
  | { kind: 'withdraw'; dest: number }
  | { kind: 'reorient'; cell: number; cw: boolean }
  | { kind: 'mend'; edge: number };

export interface OptionCtx {
  s: Shape;
  b: Board;
  player: number;
  cell: number;
  /** the card as it would be laid down, rotation included */
  sigils: Card;
  cap: number;
}

/** Every choice this ability offers at this placement, plus declining. */
export function optionsFor(ability: AbilityId, c: OptionCtx): Option[] {
  const { s, b, player, cell, sigils, cap } = c;
  const nb = s.nb[cell];
  const mine = b.own[player], theirs = b.own[1 - player];
  const out: Option[] = [null];
  const isMine = (t: number) => t >= 0 && ((mine >>> t) & 1) !== 0;
  const isEnemy = (t: number) =>
    t >= 0 && b.cards[t] !== null && ((theirs >>> t) & 1) !== 0;

  switch (ability) {
    case 'pivot':
      for (let d = 0; d < 4; d++) {
        if (nb[d] >= 0 && b.cards[nb[d]]) {
          out.push({ kind: 'pivot', cell: nb[d] });
        }
      }
      break;
    case 'exchange':
    case 'relay':
      for (let d = 0; d < 4; d++) {
        if (isMine(nb[d])) out.push({ kind: ability, cell: nb[d] });
      }
      break;
    case 'prism':
      for (let e = 0; e < 4; e++) out.push({ kind: 'prism', edge: e });
      break;

    case 'mirror':
      // only where the two sigils differ; swapping equal ones is not a
      // move. Verified exhaustively in Python: an adjacent swap is never
      // reachable by rotating, on any card shape the deck uses.
      for (const [a, bb] of ADJ) {
        if (sigils[a] !== sigils[bb]) out.push({ kind: 'mirror', a, b: bb });
      }
      break;
    case 'echo':
      for (let from = 0; from < 4; from++) {
        for (let to = 0; to < 4; to++) {
          if (from !== to) out.push({ kind: 'echo', from, to });
        }
      }
      break;
    case 'attune':
      for (let d = 0; d < 4; d++) {
        if (!isMine(nb[d])) continue;
        for (let e = 0; e < 4; e++) {
          out.push({ kind: 'attune', cell: nb[d], edge: e });
        }
      }
      break;
    case 'converge':
      for (let a = 0; a < 4; a++) {
        for (let bb = a + 1; bb < 4; bb++) {
          out.push({ kind: 'converge', a, b: bb });
        }
      }
      break;

    case 'lance':
      for (let d = 0; d < 4; d++) {
        const lb = lineBeyond(s, cell, d);
        if (lb && b.cards[lb[0]] === null && isEnemy(lb[1])) {
          out.push({ kind: 'lance', edge: d });
        }
      }
      break;
    case 'corner':
      for (const [t, pair] of diagonals(s, cell)) {
        if (!isEnemy(t)) continue;
        for (const e of pair) out.push({ kind: 'corner', cell: t, edge: e });
      }
      break;
    case 'bridge':
      for (let d = 0; d < 4; d++) {
        const lb = lineBeyond(s, cell, d);
        if (lb && isMine(lb[0]) && b.cards[lb[0]] && isEnemy(lb[1])) {
          out.push({ kind: 'bridge', through: lb[0], cell: lb[1], edge: d });
        }
      }
      break;
    case 'crossing':
      out.push({ kind: 'crossing', axis: 0 });
      out.push({ kind: 'crossing', axis: 1 });
      break;

    case 'hinge':
      for (let d = 0; d < 4; d++) {
        if (isEnemy(nb[d])) out.push({ kind: 'hinge', cell: nb[d] });
      }
      break;
    case 'amplify':
      // the free capture is the player's choice, not an iteration
      // order's: name every enemy the card you might take could reach
      for (let d = 0; d < 4; d++) {
        const t = nb[d];
        if (!isEnemy(t)) continue;
        out.push({ kind: 'amplify', edge: d, target: null });
        for (let e = 0; e < 4; e++) {
          const u = s.nb[t][e];
          if (u >= 0 && u !== cell && isEnemy(u)) {
            out.push({ kind: 'amplify', edge: d, target: u });
          }
        }
      }
      break;
    case 'anchor':
      // needs a cascade to spend, so it is not on offer on a placement
      // that does not get one
      if (cap > 0) {
        for (let d = 0; d < 4; d++) {
          const t = nb[d];
          if (!isEnemy(t)) continue;
          for (let e = 0; e < 4; e++) {
            const dest = s.nb[t][e];
            if (dest >= 0 && dest !== cell && b.cards[dest] === null) {
              out.push({ kind: 'anchor', cell: t, dest });
            }
          }
        }
      }
      break;
    case 'handoff':
      for (let d = 0; d < 4; d++) {
        if (!isEnemy(nb[d])) continue;
        for (let e = 0; e < 4; e++) {
          if (isMine(nb[e]) && b.cards[nb[e]]) {
            out.push({ kind: 'handoff', cell: nb[d], ally: nb[e] });
          }
        }
      }
      break;

    case 'fortify':
      for (let e = 0; e < 4; e++) out.push({ kind: 'fortify', edge: e });
      break;
    case 'withdraw':
      for (let d = 0; d < 4; d++) {
        if (nb[d] >= 0 && b.cards[nb[d]] === null) {
          out.push({ kind: 'withdraw', dest: nb[d] });
        }
      }
      break;
    case 'reorient':
      for (let d = 0; d < 4; d++) {
        if (!isMine(nb[d]) || !b.cards[nb[d]]) continue;
        out.push({ kind: 'reorient', cell: nb[d], cw: true });
        out.push({ kind: 'reorient', cell: nb[d], cw: false });
      }
      break;
    case 'mend':
      for (let d = 0; d < 4; d++) {
        if (isEnemy(nb[d])) out.push({ kind: 'mend', edge: d });
      }
      break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// resolution
// ---------------------------------------------------------------------------
const ccw = (c: Card): Card => rot90(rot90(rot90(c)));

export interface PlaceCtx {
  s: Shape;
  b: Board;
  player: number;
  cell: number;
  sigils: Card;
  option: Option;
  cap: number;
  turn: number;
  /** mutated in place when Fortify fires */
  shields: Shields;
  trace?: CaptureEvent[];
}

/**
 * Place a card and resolve everything that follows: edge rewrites, the
 * attack, the cascade, and whatever the ability leaves behind.
 *
 * The board is mutated. The ordering here mirrors proto16.py exactly and
 * the order is load-bearing -- an edge rewrite has to happen before any
 * sigil is compared, and Mend's swap has to happen after the cascade or
 * it would change what the cascade sees.
 */
export function resolvePlacement(ctx: PlaceCtx): Resolution {
  const { s, player, cell, option: opt, turn, shields, trace } = ctx;
  const b = ctx.b;
  const opp = 1 - player;
  let cap = ctx.cap;
  const edges: Card = [...ctx.sigils] as unknown as Card;
  const mut = edges as unknown as number[];
  const extras: Record<string, readonly number[]> = {};
  let wild: readonly [number, number] | null = null;
  let only: ReadonlySet<string> | null = null;

  // --- edge rewrites, before anything is compared ------------------
  if (opt?.kind === 'mirror') {
    const t = mut[opt.a]; mut[opt.a] = mut[opt.b]; mut[opt.b] = t;
  } else if (opt?.kind === 'echo') {
    mut[opt.to] = mut[opt.from];
  } else if (opt?.kind === 'attune') {
    const d = s.nb[cell].indexOf(opt.cell);
    const ally = b.cards[opt.cell];
    if (d >= 0 && ally) {
      extras[edgeKey(cell, opt.edge)] = [ally[OPPSIDE[d]]];
    }
  } else if (opt?.kind === 'converge') {
    const both = [mut[opt.a], mut[opt.b]];
    extras[edgeKey(cell, opt.a)] = both;
    extras[edgeKey(cell, opt.b)] = both;
  }

  // orientation changes before the comparison too
  if (opt?.kind === 'pivot') {
    b.cards[opt.cell] = rot90(b.cards[opt.cell] as Card);
  }

  b.cards[cell] = edges;
  b.own[player] |= 1 << cell;

  let origin = 1 << cell;
  const X = { extras, shields, turn };

  // --- geometry ----------------------------------------------------
  if (opt?.kind === 'lance') {
    // additive: only Corner, Amplify and Crossing state exclusivity
    const r = cascadeFrom(s, b, origin, player, cap, null, trace, X);
    const lb = lineBeyond(s, cell, opt.edge);
    if (lb) {
      const [, far] = lb;
      const fc = b.cards[far];
      if (fc && ((b.own[opp] >>> far) & 1)
          && !isShielded(shields, far, OPPSIDE[opt.edge], turn)
          && edges[opt.edge] === fc[OPPSIDE[opt.edge]]) {
        b.own[player] |= 1 << far;
        b.own[opp] &= ~(1 << far);
        trace?.push({ wave: 0, src: cell, target: far,
                      sigil: edges[opt.edge], side: opt.edge, wild: false });
        return { captured: r.captured + 1,
                 waves: [...r.waves, 1 << far] };
      }
    }
    return r;
  }

  if (opt?.kind === 'corner') {
    const t = opt.cell, d = OPPSIDE[opt.edge];
    const tc = b.cards[t];
    if (!tc || !((b.own[opp] >>> t) & 1)
        || isShielded(shields, t, d, turn)
        || edges[opt.edge] !== tc[d]) {
      return { captured: 0, waves: [] };
    }
    b.own[player] |= 1 << t;
    b.own[opp] &= ~(1 << t);
    trace?.push({ wave: 0, src: cell, target: t, sigil: edges[opt.edge],
                  side: opt.edge, wild: false });
    if (cap <= 0) return { captured: 1, waves: [1 << t] };
    // the card it takes still chains: the cascade is a property of the
    // board, not of the attack that started it
    const r = cascadeFrom(s, b, 1 << t, player, cap - 1, null, trace, X);
    return { captured: 1 + r.captured, waves: [1 << t, ...r.waves] };
  }

  if (opt?.kind === 'bridge') {
    const r = cascadeFrom(s, b, origin, player, cap, null, trace, X);
    const far = opt.cell, fc = b.cards[far];
    if (fc && ((b.own[opp] >>> far) & 1)
        && !isShielded(shields, far, OPPSIDE[opt.edge], turn)
        && edges[opt.edge] === fc[OPPSIDE[opt.edge]]) {
      b.own[player] |= 1 << far;
      b.own[opp] &= ~(1 << far);
      trace?.push({ wave: 0, src: cell, target: far, sigil: edges[opt.edge],
                    side: opt.edge, wild: false });
      return { captured: r.captured + 1, waves: [...r.waves, 1 << far] };
    }
    return r;
  }

  if (opt?.kind === 'crossing') {
    const [a, bb] = AXES[opt.axis];
    only = new Set([edgeKey(cell, a), edgeKey(cell, bb)]);
  }
  if (opt?.kind === 'amplify') only = new Set([edgeKey(cell, opt.edge)]);

  // --- Anchor: spend the whole cascade to walk a captured card -----
  if (opt?.kind === 'anchor') {
    const before = b.own[player];
    const r = cascadeFrom(s, b, origin, player, 0, null, trace, X);
    const taken = b.own[player] & ~before;
    if (r.captured && ((taken >>> opt.cell) & 1)
        && b.cards[opt.dest] === null) {
      b.cards[opt.dest] = b.cards[opt.cell];
      b.cards[opt.cell] = null;
      b.own[player] = (b.own[player] & ~(1 << opt.cell)) | (1 << opt.dest);
    }
    return r;
  }

  // --- Hinge, Amplify, Handoff: the chain is interfered with -------
  if (opt?.kind === 'hinge' || opt?.kind === 'amplify'
      || opt?.kind === 'handoff') {
    const before = b.own[player];
    const direct = cascadeFrom(s, b, origin, player, 0, null, trace,
                               { ...X, only });
    const taken = b.own[player] & ~before;
    if (cap <= 0 || direct.captured === 0) return direct;

    let chainFrom = taken;
    let free: readonly [number, number] | null = null;
    let chainOnly: ReadonlySet<string> | null = null;

    if (opt.kind === 'hinge' && ((taken >>> opt.cell) & 1)) {
      b.cards[opt.cell] = rot90(b.cards[opt.cell] as Card);
    } else if (opt.kind === 'handoff' && ((taken >>> opt.cell) & 1)) {
      chainFrom = (taken & ~(1 << opt.cell)) | (1 << opt.ally);
    } else if (opt.kind === 'amplify') {
      // the nominated card takes the nominated enemy, matching or not,
      // and its other edges are spent
      const src = s.nb[cell][opt.edge];
      if (opt.target !== null && ((taken >>> src) & 1)
          && ((b.own[opp] >>> opt.target) & 1)) {
        const d = s.nb[src].indexOf(opt.target);
        if (d >= 0) { free = [src, d]; chainOnly = new Set([edgeKey(src, d)]); }
      }
      if (!free) chainOnly = new Set();
    }

    const chain = cascadeFrom(s, b, chainFrom, player, 0, null, trace,
                              { ...X, free, only: chainOnly });
    return { captured: direct.captured + chain.captured,
             waves: [...direct.waves, ...chain.waves] };
  }

  // --- the ordinary path, plus the four shipped abilities ----------
  if (opt?.kind === 'exchange') {
    const tmp = b.cards[cell];
    b.cards[cell] = b.cards[opt.cell];
    b.cards[opt.cell] = tmp;
    origin = 1 << opt.cell;
  } else if (opt?.kind === 'relay') {
    origin = 1 << opt.cell;
  } else if (opt?.kind === 'prism') {
    wild = [cell, opt.edge];
  }

  const r = cascadeFrom(s, b, origin, player, cap, wild, trace,
                        { ...X, only });

  // --- what the ability leaves behind ------------------------------
  if (opt?.kind === 'fortify') {
    // through the opponent's next turn
    shields[edgeKey(cell, opt.edge)] = turn + 2;
  } else if (opt?.kind === 'withdraw') {
    if (r.captured === 0 && b.cards[opt.dest] === null) {
      b.cards[opt.dest] = b.cards[cell];
      b.cards[cell] = null;
      b.own[player] = (b.own[player] & ~(1 << cell)) | (1 << opt.dest);
    }
  } else if (opt?.kind === 'reorient') {
    const ally = b.cards[opt.cell];
    if (ally && ((b.own[player] >>> opt.cell) & 1)) {
      b.cards[opt.cell] = opt.cw ? rot90(ally) : ccw(ally);
    }
  } else if (opt?.kind === 'crossing') {
    // advance into the cell opposite the card you just took, not
    // whichever cell on the axis happens to be free
    if (r.captured === 1) {
      const [a, bb] = AXES[opt.axis];
      let took: number | null = null;
      for (const e of [a, bb]) {
        const t = s.nb[cell][e];
        if (t >= 0 && ((r.waves[0] ?? 0) >>> t) & 1) took = e;
      }
      if (took !== null) {
        const back = s.nb[cell][OPPSIDE[took]];
        if (back >= 0 && b.cards[back] === null) {
          b.cards[back] = b.cards[cell];
          b.cards[cell] = null;
          b.own[player] = (b.own[player] & ~(1 << cell)) | (1 << back);
        }
      }
    }
  } else if (opt?.kind === 'mend') {
    const t = s.nb[cell][opt.edge];
    if (t >= 0 && b.cards[t] && ((b.own[player] >>> t) & 1)) {
      const tmp = b.cards[cell];
      b.cards[cell] = b.cards[t];
      b.cards[t] = tmp;
    }
  }
  return r;
}

const EDGE = ['top', 'right', 'bottom', 'left'] as const;

/**
 * A readable description of one choice, for the picker the player sees
 * before committing. Phrased as what it does, not as its parameters:
 * "copy top onto left" rather than "echo(0,3)".
 */
export function describeOption(o: Option): string {
  if (o === null) return 'use nothing';
  switch (o.kind) {
    case 'pivot': return `turn the card on cell ${o.cell} 90°`;
    case 'exchange': return `swap places with cell ${o.cell}`;
    case 'relay': return `let cell ${o.cell} attack instead`;
    case 'prism': return `${EDGE[o.edge]} edge matches anything`;
    case 'mirror': return `swap the ${EDGE[o.a]} and ${EDGE[o.b]} sigils`;
    case 'echo': return `copy the ${EDGE[o.from]} sigil onto ${EDGE[o.to]}`;
    case 'attune':
      return `${EDGE[o.edge]} edge also counts as cell ${o.cell}'s sigil`;
    case 'converge':
      return `${EDGE[o.a]} and ${EDGE[o.b]} each count as either sigil`;
    case 'lance': return `fire ${EDGE[o.edge]} through the gap`;
    case 'corner':
      return `strike cell ${o.cell} diagonally, giving up the rest`;
    case 'bridge':
      return `reach cell ${o.cell} through your card on ${o.through}`;
    case 'crossing':
      return o.axis === 0 ? 'attack up and down only'
                          : 'attack left and right only';
    case 'hinge': return `turn cell ${o.cell} before it chains`;
    case 'amplify':
      return o.target === null
        ? `attack ${EDGE[o.edge]} only`
        : `attack ${EDGE[o.edge]} only, then take cell ${o.target} free`;
    case 'anchor':
      return `give up the chain, move cell ${o.cell} to ${o.dest}`;
    case 'handoff':
      return `cell ${o.ally} chains instead of cell ${o.cell}`;
    case 'fortify': return `hold the ${EDGE[o.edge]} edge`;
    case 'withdraw': return `if nothing falls, step to cell ${o.dest}`;
    case 'reorient':
      return `turn your card on cell ${o.cell} `
        + `${o.cw ? 'clockwise' : 'anticlockwise'}`;
    case 'mend': return `advance into cell taken ${EDGE[o.edge]}`;
  }
}

/** Drop shields that have lapsed, so state does not grow without bound. */
export function expireShields(sh: Shields, turn: number): Shields {
  const out: Shields = {};
  for (const [k, v] of Object.entries(sh)) if (turn <= v) out[k] = v;
  return out;
}
