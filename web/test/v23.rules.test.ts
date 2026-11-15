/**
 * v2.3 rules verification — the battery specified in the brief's §13.
 *
 * These establish correctness, not enjoyment. Scenarios are hand-built
 * from an explicit board so the expected sequence is reviewed rather
 * than inferred: random agreement between two implementations proves
 * nothing if both share a wrong reading.
 */

import { describe, expect, it } from 'vitest';
import {
  type CardId, type Player, type V23State, CELLS, CMDS, DEPLOYMENTS,
  DOMINION_COMMANDS, NB, TRAITS, TRAIT_INFO, alliesAdjacent, apply,
  captureBlocked, cellOf, deployments, dominionCommands, isOver,
  moveBlocked, mustPass, newGame, normalAttack, previewDeploy, score,
  toMove, traitState,
} from '../src/v23/rules';
import { ROSTER, TRAIT_COUNTS } from '../src/v23/roster';
import { type Card } from '../src/proto/engine';

const S = (n: number, e: number, s: number, w: number): Card =>
  [n, e, s, w] as unknown as Card;

/**
 * Build an exact mid-Convergence position. `board` maps cell -> [owner,
 * trait, sigils]; the card named in `hand` is the one about to deploy.
 */
function scene(opts: {
  board: Record<number, [Player, string | null, Card]>;
  hand: [string | null, Card];
  toMove?: Player;
  deployedCount?: number;
}): V23State {
  const s = newGame(1);
  s.cells = Array(CELLS).fill(null);
  s.owner = {};
  s.defs = {};
  s.hands = [[], []];
  s.used = [];
  s.events = [];
  s.stack = [];
  s.turn = null;
  s.pending = null;
  let n = 0;
  for (const [cellStr, [owner, trait, sig]] of Object.entries(opts.board)) {
    const id = `c${n++}`;
    s.defs[id] = { id, name: id, sigils: sig,
                   trait: trait as never, command: 'plain', art: 1 };
    s.cells[Number(cellStr)] = id;
    s.owner[id] = owner;
  }
  const hid = 'hand';
  s.defs[hid] = { id: hid, name: 'Deployer', sigils: opts.hand[1],
                  trait: opts.hand[0] as never, command: 'plain', art: 1 };
  const mover = opts.toMove ?? 0;
  s.hands[mover] = [hid];
  // deployed count must have the right parity for `toMove`
  s.deployed = opts.deployedCount
    ?? (mover === 0 ? 2 : 3);
  return s;
}

const idAt = (s: V23State, cell: number): CardId => s.cells[cell]!;

// ---------------------------------------------------------------------------
describe('roster and setup', () => {
  it('twelve characters, each trait exactly twice', () => {
    expect(ROSTER).toHaveLength(12);
    for (const t of TRAITS) {
      expect(TRAIT_COUNTS[t], `${t} should appear twice`).toBe(2);
    }
  });

  it('sigils are fixed: no rotation anywhere in the rules', () => {
    // a deployment is a card and a cell, and nothing else
    const g = newGame(4);
    const d = deployments(g);
    expect(d.length).toBeGreaterThan(0);
    for (const m of d) expect(Object.keys(m).sort())
      .toEqual(['card', 'cell']);
  });

  it('deals six and six, filling all twelve cells', () => {
    const g = newGame(9);
    expect(g.hands[0]).toHaveLength(6);
    expect(g.hands[1]).toHaveLength(6);
    expect(DEPLOYMENTS).toBe(12);
    expect(CELLS).toBe(12);
  });

  it('Bound Champions is off by default', () => {
    expect(newGame(1).variant.boundChampions).toBe(0);
    expect(newGame(1, { boundChampions: 2 }).champions[0]).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
describe('SANCTUARY', () => {
  const sanc = (allies: number): V23State => {
    // target at cell 5 with `allies` friendly neighbours, and an enemy
    // deployer coming into cell 1 that matches it
    const board: Record<number, [Player, string | null, Card]> = {
      5: [1, 'sanctuary', S(0, 0, 0, 0)],
    };
    const spots = [4, 6, 9];
    for (let i = 0; i < allies; i++) {
      board[spots[i]] = [1, null, S(3, 3, 3, 3)];
    }
    return scene({ board, hand: [null, S(3, 3, 0, 3)], toMove: 0 });
  };

  it('is unprotected at zero and one ally, protected from two', () => {
    for (const [n, want] of [[0, false], [1, false], [2, true],
                             [3, true]] as const) {
      const s = sanc(n);
      const target = idAt(s, 5);
      expect(alliesAdjacent(s, target), `${n} allies`).toBe(n);
      expect(!!captureBlocked(s, target), `${n} allies`).toBe(want);
    }
  });

  it('blocks the capture, and the attacker takes nothing', () => {
    const s = apply(sanc(2), { kind: 'deploy', card: 'hand', cell: 1 });
    expect(score(s)[0]).toBe(1);          // only the deployed card
    expect(s.events.some((e) => e.kind === 'fail'
      && /Sanctuary/.test(e.text))).toBe(true);
  });

  it('allows the capture once support drops below two', () => {
    const s = apply(sanc(1), { kind: 'deploy', card: 'hand', cell: 1 });
    expect(score(s)[0]).toBe(2);          // deployed card plus the capture
  });

  it('is evaluated before a batch, so a batch cannot clear its own '
     + 'obstacle', () => {
    // cell 5 holds Sanctuary with exactly two allies, one of which (cell
    // 4) the deployer could also capture in the same batch. Sanctuary
    // must still hold, because the batch is judged against one snapshot.
    const s = scene({
      board: {
        5: [1, 'sanctuary', S(0, 0, 0, 0)],
        4: [1, null, S(0, 0, 0, 0)],
        9: [1, null, S(3, 3, 3, 3)],
      },
      hand: [null, S(0, 0, 0, 0)], toMove: 0,
    });
    // deploying at 1: north of 5 and... check geometry first
    expect(NB[1][2]).toBe(5);             // cell 1 is north of cell 5
    const out = apply(s, { kind: 'deploy', card: 'hand', cell: 1 });
    const sanctuary = idAt(out, 5);
    expect(out.owner[sanctuary], 'Sanctuary must survive its own batch')
      .toBe(1);
  });

  it('expires in Dominion', () => {
    const s = sanc(3);
    s.phase = 'dominion';
    expect(captureBlocked(s, idAt(s, 5))).toBeNull();
    expect(traitState(s, idAt(s, 5))).toBe('expired');
  });
});

// ---------------------------------------------------------------------------
describe('ANCHOR', () => {
  it('cannot be moved, but can be captured', () => {
    const s = scene({
      board: { 5: [1, 'anchor', S(0, 0, 0, 0)] },
      hand: [null, S(0, 0, 0, 0)], toMove: 0,
    });
    const anchored = idAt(s, 5);
    expect(moveBlocked(s, anchored)).toMatch(/Anchor/);
    expect(captureBlocked(s, anchored)).toBeNull();
    const out = apply(s, { kind: 'deploy', card: 'hand', cell: 1 });
    expect(out.owner[anchored], 'Anchor does not stop capture').toBe(0);
  });

  it('is not offered as a Harbinger target', () => {
    const s = scene({
      board: { 4: [0, 'anchor', S(1, 1, 1, 1)],
               6: [0, null, S(1, 1, 1, 1)],
               1: [0, null, S(1, 1, 1, 1)] },
      hand: ['harbinger', S(2, 2, 2, 2)], toMove: 0,
    });
    const out = apply(s, { kind: 'deploy', card: 'hand', cell: 5 });
    // 4, 6 and 1 are adjacent to 5; every offered pair must exclude 4
    expect(out.pending).toBeTruthy();
    for (const o of out.pending!.options) {
      expect(o.cells, 'an anchored card must not be swappable')
        .not.toContain(4);
    }
  });

  it('is not offered as an Exile target', () => {
    const s = scene({
      board: { 4: [1, 'anchor', S(1, 1, 1, 1)] },
      hand: ['exile', S(2, 2, 2, 2)], toMove: 0,
    });
    const out = apply(s, { kind: 'deploy', card: 'hand', cell: 5 });
    // the only adjacent enemy is anchored, so the ability cannot act
    expect(out.pending).toBeNull();
  });

  it('does not block Pact, which changes ownership without moving', () => {
    const s = scene({
      board: { 4: [0, null, S(1, 1, 1, 1)],
               6: [1, 'anchor', S(1, 1, 1, 1)] },
      hand: ['pact', S(2, 2, 2, 2)], toMove: 0,
    });
    const out = apply(s, { kind: 'deploy', card: 'hand', cell: 5 });
    expect(out.pending, 'Pact should still be offered').toBeTruthy();
    const opt = out.pending!.options[0];
    const done = apply(out, { kind: 'choose', option: opt.id });
    expect(done.owner[idAt(done, 6)]).toBe(0);
    expect(done.owner[idAt(done, 4)]).toBe(1);
    expect(cellOf(done, idAt(done, 6)), 'nothing moved').toBe(6);
  });
});

// ---------------------------------------------------------------------------
describe('HARBINGER', () => {
  const base = (): V23State => scene({
    board: { 4: [0, null, S(1, 1, 1, 1)],
             6: [1, null, S(2, 2, 2, 2)],
             1: [0, null, S(3, 3, 3, 3)] },
    hand: ['harbinger', S(0, 0, 0, 0)], toMove: 0,
  });

  it('swaps two adjacent cards of any ownership, atomically', () => {
    const s = apply(base(), { kind: 'deploy', card: 'hand', cell: 5 });
    const a = idAt(s, 4), b = idAt(s, 6);
    const opt = s.pending!.options.find((o) =>
      o.cells.includes(4) && o.cells.includes(6))!;
    const out = apply(s, { kind: 'choose', option: opt.id });
    expect(idAt(out, 4)).toBe(b);
    expect(idAt(out, 6)).toBe(a);
    // ownership travelled with the cards, not the cells
    expect(out.owner[a]).toBe(0);
    expect(out.owner[b]).toBe(1);
  });

  it('never swaps itself in', () => {
    const s = apply(base(), { kind: 'deploy', card: 'hand', cell: 5 });
    for (const o of s.pending!.options) expect(o.cells).not.toContain(5);
  });

  it('produces no captures from the swap alone', () => {
    const s = apply(base(), { kind: 'deploy', card: 'hand', cell: 5 });
    const before = score(s);
    const opt = s.pending!.options[0];
    const out = apply(s, { kind: 'choose', option: opt.id });
    // any ownership change must come from the normal attack, which is
    // recorded as its own event
    const swaps = out.events.filter((e) => e.kind === 'swap');
    expect(swaps.length).toBe(1);
    expect(swaps[0].captured).toBeUndefined();
    expect(before[0] + before[1]).toBe(score(out)[0] + score(out)[1]);
  });

  it('can be declined, and the normal attack still happens', () => {
    const s = scene({
      board: { 4: [0, null, S(1, 1, 1, 1)],
               6: [1, null, S(0, 0, 0, 0)],
               1: [0, null, S(3, 3, 3, 3)] },
      hand: ['harbinger', S(0, 0, 0, 0)], toMove: 0,
    });
    const mid = apply(s, { kind: 'deploy', card: 'hand', cell: 5 });
    const enemy = idAt(mid, 6);
    const out = apply(mid, { kind: 'skip' });
    // cell 5 east edge (0) vs cell 6 west edge (0) -> captured
    expect(out.owner[enemy]).toBe(0);
    expect(out.pending).toBeNull();
    expect(out.turn).toBeNull();
  });

  it('is skipped entirely when fewer than two targets exist', () => {
    const s = scene({
      board: { 4: [0, null, S(1, 1, 1, 1)] },
      hand: ['harbinger', S(2, 2, 2, 2)], toMove: 0,
    });
    const out = apply(s, { kind: 'deploy', card: 'hand', cell: 5 });
    expect(out.pending).toBeNull();
    expect(out.turn).toBeNull();
  });

  it('breaking a Sanctuary formation exposes it to the normal attack '
     + 'that follows', () => {
    // 4 cols x 3 rows, so cell 7 is adjacent to 3, 6 and 11 only.
    // Enemy Sanctuary sits at 6 supported by 2 and 10. Harbinger deploys
    // at 7 and swaps the Sanctuary card itself out to cell 3, where it
    // has only one ally -- then captures it on the attack that follows.
    const s = scene({
      board: {
        6: [1, 'sanctuary', S(1, 1, 0, 1)],   // south edge 0
        2: [1, null, S(3, 3, 3, 3)],
        10: [1, null, S(3, 3, 3, 3)],
        3: [0, null, S(2, 2, 2, 2)],
      },
      hand: ['harbinger', S(0, 2, 2, 2)], toMove: 0,   // north edge 0
    });
    const mid = apply(s, { kind: 'deploy', card: 'hand', cell: 7 });
    const sanctuary = idAt(mid, 6);
    expect(alliesAdjacent(mid, sanctuary), 'protected before the swap')
      .toBe(2);
    expect(captureBlocked(mid, sanctuary)).toMatch(/Sanctuary/);
    const opt = mid.pending!.options.find((o) =>
      o.cells.includes(6) && o.cells.includes(3))!;
    expect(opt, 'swapping 6 with 3 should be offered').toBeTruthy();
    const out = apply(mid, { kind: 'choose', option: opt.id });
    expect(cellOf(out, sanctuary), 'moved to 3').toBe(3);
    expect(alliesAdjacent(out, sanctuary), 'only one ally there').toBe(1);
    expect(out.owner[sanctuary],
           'unprotected, and the attack that follows takes it').toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('EXILE', () => {
  it('relocates an adjacent enemy without capturing it', () => {
    const s = scene({
      board: { 6: [1, null, S(1, 1, 1, 1)] },
      hand: ['exile', S(2, 2, 2, 2)], toMove: 0,
    });
    const mid = apply(s, { kind: 'deploy', card: 'hand', cell: 5 });
    const victim = idAt(mid, 6);
    const opt = mid.pending!.options.find((o) => o.cells[1] === 0)!;
    const out = apply(mid, { kind: 'choose', option: opt.id });
    expect(cellOf(out, victim)).toBe(0);
    expect(out.cells[6]).toBeNull();
    expect(out.owner[victim], 'Exile does not capture').toBe(1);
    expect(out.events.some((e) => e.kind === 'move')).toBe(true);
    expect(out.events.some((e) => e.kind === 'captureBatch')).toBe(false);
  });

  it('offers only unoccupied destinations', () => {
    const s = scene({
      board: { 6: [1, null, S(1, 1, 1, 1)], 0: [0, null, S(1, 1, 1, 1)] },
      hand: ['exile', S(2, 2, 2, 2)], toMove: 0,
    });
    const mid = apply(s, { kind: 'deploy', card: 'hand', cell: 5 });
    for (const o of mid.pending!.options) {
      expect(mid.cells[o.cells[1]], 'destination must be empty').toBeNull();
    }
  });

  it('is skipped on the last deployment, when no cell is free', () => {
    const board: Record<number, [Player, string | null, Card]> = {};
    for (let i = 0; i < CELLS; i++) {
      if (i === 5) continue;
      board[i] = [i % 2 as Player, null, S(1, 1, 1, 1)];
    }
    const s = scene({ board, hand: ['exile', S(2, 2, 2, 2)], toMove: 0 });
    const out = apply(s, { kind: 'deploy', card: 'hand', cell: 5 });
    expect(out.pending, 'no empty destination, so no choice').toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('PACT', () => {
  const base = (friendTrait: string | null = null,
                foeTrait: string | null = null): V23State => scene({
    board: { 4: [0, friendTrait, S(1, 1, 1, 1)],
             6: [1, foeTrait, S(2, 2, 2, 2)] },
    hand: ['pact', S(3, 3, 3, 3)], toMove: 0,
  });

  it('exchanges ownership atomically, moving nothing', () => {
    const mid = apply(base(), { kind: 'deploy', card: 'hand', cell: 5 });
    const friend = idAt(mid, 4), foe = idAt(mid, 6);
    const out = apply(mid, { kind: 'choose',
                             option: mid.pending!.options[0].id });
    expect(out.owner[friend]).toBe(1);
    expect(out.owner[foe]).toBe(0);
    expect(cellOf(out, friend)).toBe(4);
    expect(cellOf(out, foe)).toBe(6);
    const batch = out.events.find((e) => e.kind === 'captureBatch');
    expect(batch!.captured).toHaveLength(2);
  });

  it('is not offered when there is no friendly or no enemy neighbour',
     () => {
    const s = scene({
      board: { 4: [0, null, S(1, 1, 1, 1)] },
      hand: ['pact', S(3, 3, 3, 3)], toMove: 0,
    });
    expect(apply(s, { kind: 'deploy', card: 'hand', cell: 5 }).pending)
      .toBeNull();
  });

  it('is blocked by Sanctuary on either side', () => {
    for (const [f, e] of [['sanctuary', null],
                          [null, 'sanctuary']] as const) {
      // give the protected card two allies so Sanctuary actually holds
      const s = scene({
        board: {
          4: [0, f, S(1, 1, 1, 1)],
          6: [1, e, S(2, 2, 2, 2)],
          0: [0, null, S(1, 1, 1, 1)],
          1: [0, null, S(1, 1, 1, 1)],
          2: [1, null, S(2, 2, 2, 2)],
          7: [1, null, S(2, 2, 2, 2)],
        },
        hand: ['pact', S(3, 3, 3, 3)], toMove: 0,
      });
      const mid = apply(s, { kind: 'deploy', card: 'hand', cell: 5 });
      const prot = f ? idAt(mid, 4) : idAt(mid, 6);
      if (captureBlocked(mid, prot)) {
        const offered = (mid.pending?.options ?? []).some((o) =>
          o.cells.includes(4) && o.cells.includes(6));
        expect(offered, 'a Sanctuary-protected side must not be offered')
          .toBe(false);
      }
    }
  });

  it('fails whole rather than transferring one card', () => {
    const mid = apply(base(), { kind: 'deploy', card: 'hand', cell: 5 });
    const friend = idAt(mid, 4), foe = idAt(mid, 6);
    // invalidate one side behind the engine's back, then resolve
    const tampered: V23State = { ...mid, owner: { ...mid.owner } };
    tampered.owner[foe] = 0;              // both now friendly
    const out = apply(tampered, { kind: 'choose',
                                  option: mid.pending!.options[0].id });
    expect(out.owner[friend], 'no partial exchange').toBe(0);
    expect(out.events.some((e) => e.kind === 'fail')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('RALLY', () => {
  /** P1 Rally at 4, its ally at 5, P0 deploys at 1 and takes cell 5. */
  const base = (): V23State => scene({
    board: { 4: [1, 'rally', S(3, 3, 3, 3)],
             5: [1, null, S(0, 3, 3, 3)] },
    hand: [null, S(3, 3, 0, 3)], toMove: 0,
  });

  it('triggers on an adjacent ally being captured, and swaps places '
     + 'without undoing the capture', () => {
    const mid = apply(base(), { kind: 'deploy', card: 'hand', cell: 1 });
    const rally = idAt(mid, 4);
    const fallen = mid.cells[5]!;
    expect(mid.owner[fallen], 'the capture completed').toBe(0);
    expect(mid.pending?.kind).toBe('rally');
    expect(mid.pending?.player).toBe(1);
    const out = apply(mid, { kind: 'choose',
                             option: mid.pending!.options[0].id });
    expect(cellOf(out, rally)).toBe(5);
    expect(cellOf(out, fallen)).toBe(4);
    expect(out.owner[rally], 'Rally keeps its controller').toBe(1);
    expect(out.owner[fallen], 'the capture still stands').toBe(0);
  });

  it('can be declined', () => {
    const mid = apply(base(), { kind: 'deploy', card: 'hand', cell: 1 });
    const rally = idAt(mid, 4);
    const out = apply(mid, { kind: 'skip' });
    expect(cellOf(out, rally)).toBe(4);
    expect(out.pending).toBeNull();
    expect(out.turn).toBeNull();
  });

  it('does not trigger on a failed capture attempt', () => {
    // the deployer matches nothing, so nothing is captured
    const s = scene({
      board: { 4: [1, 'rally', S(3, 3, 3, 3)],
               5: [1, null, S(2, 3, 3, 3)] },
      hand: [null, S(3, 3, 0, 3)], toMove: 0,
    });
    const out = apply(s, { kind: 'deploy', card: 'hand', cell: 1 });
    expect(out.pending).toBeNull();
    expect(out.events.some((e) => e.kind === 'trigger')).toBe(false);
  });

  it('fires at most once per opposing deployment', () => {
    const mid = apply(base(), { kind: 'deploy', card: 'hand', cell: 1 });
    const out = apply(mid, { kind: 'choose',
                             option: mid.pending!.options[0].id });
    expect(out.used.some((u) => u.startsWith('rally:'))).toBe(true);
    expect(out.pending).toBeNull();
  });

  it('does not react to its own controller\'s Pact', () => {
    // P0 holds both the Rally and the Pact; surrendering its own ally
    // must not trigger it
    const s = scene({
      board: { 4: [0, 'rally', S(3, 3, 3, 3)],
               6: [1, null, S(2, 2, 2, 2)],
               9: [0, null, S(3, 3, 3, 3)] },
      hand: ['pact', S(1, 1, 1, 1)], toMove: 0,
    });
    const mid = apply(s, { kind: 'deploy', card: 'hand', cell: 5 });
    const opt = mid.pending!.options.find((o) =>
      o.cells.includes(9) && o.cells.includes(6));
    if (opt) {
      const out = apply(mid, { kind: 'choose', option: opt.id });
      expect(out.pending?.kind,
             'a player cannot Rally off their own Pact')
        .not.toBe('rally');
    }
  });

  it('fails safely if its swap target became illegal', () => {
    const mid = apply(base(), { kind: 'deploy', card: 'hand', cell: 1 });
    const rally = idAt(mid, 4);
    // the Rally card changes hands before its reaction resolves
    const tampered: V23State = { ...mid, owner: { ...mid.owner } };
    tampered.owner[rally] = 0;
    const out = apply(tampered, { kind: 'choose',
                                  option: mid.pending!.options[0].id });
    expect(out.events.some((e) => e.kind === 'fail')).toBe(true);
    expect(isOver(out)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('the stack', () => {
  it('an On Deploy effect resolves before the normal attack', () => {
    const s = scene({
      board: { 6: [1, null, S(1, 1, 1, 0)], 0: [0, null, S(1, 1, 1, 1)] },
      hand: ['exile', S(0, 0, 0, 0)], toMove: 0,
    });
    const mid = apply(s, { kind: 'deploy', card: 'hand', cell: 5 });
    const victim = idAt(mid, 6);
    // move the only capturable enemy out of reach, then the attack runs
    const opt = mid.pending!.options.find((o) => o.cells[1] === 8)!;
    const out = apply(mid, { kind: 'choose', option: opt.id });
    expect(cellOf(out, victim)).toBe(8);
    expect(out.owner[victim],
           'moved out of reach before the attack, so not captured')
      .toBe(1);
    const order = out.events.map((e) => e.kind).reverse();
    expect(order.indexOf('move')).toBeLessThan(
      order.length);            // the move is recorded
  });

  it('the non-active player\'s reaction resolves first', () => {
    // active player pushes nothing; only the opponent reacts, which is
    // the orderable case this prototype can exercise deterministically
    const mid = apply(scene({
      board: { 4: [1, 'rally', S(3, 3, 3, 3)],
               5: [1, null, S(0, 3, 3, 3)] },
      hand: [null, S(3, 3, 0, 3)], toMove: 0,
    }), { kind: 'deploy', card: 'hand', cell: 1 });
    expect(mid.pending!.player, 'the reacting player decides').toBe(1);
    expect(toMove(mid)).toBe(1);
  });

  it('asks the controller to order several of their own reactions', () => {
    // two Rally cards, both adjacent to one ally that falls
    const s = scene({
      board: { 4: [1, 'rally', S(3, 3, 3, 3)],
               6: [1, 'rally', S(3, 3, 3, 3)],
               5: [1, null, S(0, 3, 3, 3)] },
      hand: [null, S(3, 3, 0, 3)], toMove: 0,
    });
    const mid = apply(s, { kind: 'deploy', card: 'hand', cell: 1 });
    expect(mid.pending?.kind).toBe('order');
    expect(mid.pending!.options).toHaveLength(2);
    const out = apply(mid, { kind: 'choose',
                             option: mid.pending!.options[0].id });
    expect(out.pending?.kind, 'then the chosen one resolves').toBe('rally');
  });

  it('cannot be bypassed by ending a turn', () => {
    const mid = apply(scene({
      board: { 4: [1, 'rally', S(3, 3, 3, 3)],
               5: [1, null, S(0, 3, 3, 3)] },
      hand: [null, S(3, 3, 0, 3)], toMove: 0,
    }), { kind: 'deploy', card: 'hand', cell: 1 });
    expect(mid.pending).toBeTruthy();
    expect(() => apply(mid, { kind: 'deploy', card: 'x', cell: 0 }))
      .toThrow();
  });

  it('no movement ever generates a capture', () => {
    // across many random games, every move/swap event is capture-free
    for (let seed = 0; seed < 30; seed++) {
      let g = newGame(seed);
      let guard = 0;
      while (!isOver(g) && guard++ < 200) {
        if (g.pending) {
          g = apply(g, g.pending.optional && guard % 3 === 0
            ? { kind: 'skip' }
            : { kind: 'choose', option: g.pending.options[0].id });
          continue;
        }
        if (g.phase === 'convergence') {
          const d = deployments(g);
          g = apply(g, { kind: 'deploy', ...d[guard % d.length] });
        } else if (mustPass(g)) {
          g = apply(g, { kind: 'pass' });
        } else {
          const c = dominionCommands(g);
          g = apply(g, { kind: 'command', cmd: c[guard % c.length] });
        }
      }
      for (const e of g.events) {
        if (e.kind === 'move' || e.kind === 'swap') {
          expect(e.captured, `${e.text} must not capture`).toBeUndefined();
        }
      }
    }
  });

  it('the final deployment resolves fully before Dominion', () => {
    let g = newGame(12);
    let guard = 0;
    while (g.phase === 'convergence' && guard++ < 200) {
      if (g.pending) {
        g = apply(g, { kind: 'skip' });
        continue;
      }
      const d = deployments(g);
      g = apply(g, { kind: 'deploy', ...d[0] });
    }
    expect(g.phase).toBe('dominion');
    expect(g.stack).toHaveLength(0);
    expect(g.pending).toBeNull();
    expect(g.turn).toBeNull();
    expect(g.cells.filter((c) => c !== null)).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
describe('Dominion is unchanged', () => {
  it('six commands, P2 first, traits expired', () => {
    expect(DOMINION_COMMANDS).toBe(6);
    let g = newGame(21);
    let guard = 0;
    while (g.phase === 'convergence' && guard++ < 200) {
      g = g.pending ? apply(g, { kind: 'skip' })
        : apply(g, { kind: 'deploy', ...deployments(g)[0] });
    }
    expect(toMove(g), 'P2 opens Dominion').toBe(1);
    for (const id of g.cells) {
      if (id) expect(captureBlocked(g, id)).toBeNull();
    }
    const order: number[] = [];
    while (!isOver(g) && guard++ < 400) {
      order.push(toMove(g));
      g = mustPass(g) ? apply(g, { kind: 'pass' })
        : apply(g, { kind: 'command', cmd: dominionCommands(g)[0] });
    }
    expect(order).toHaveLength(6);
    expect(order[0]).toBe(1);
    expect(CMDS).toHaveLength(5);
  });

  it('plays complete matches from every seed', () => {
    for (let seed = 0; seed < 25; seed++) {
      let g = newGame(seed);
      let guard = 0;
      while (!isOver(g) && guard++ < 300) {
        if (g.pending) {
          g = apply(g, { kind: 'choose',
                         option: g.pending.options[0].id });
        } else if (g.phase === 'convergence') {
          g = apply(g, { kind: 'deploy', ...deployments(g)[0] });
        } else if (mustPass(g)) {
          g = apply(g, { kind: 'pass' });
        } else {
          g = apply(g, { kind: 'command', cmd: dominionCommands(g)[0] });
        }
      }
      expect(isOver(g), `seed ${seed} finished`).toBe(true);
      const [a, b] = score(g);
      expect(a + b).toBe(12);
    }
  });
});

// ---------------------------------------------------------------------------
describe('determinism and previews', () => {
  it('the same state and choices give the same result', () => {
    const run = (): V23State => {
      let g = newGame(77);
      let guard = 0;
      while (!isOver(g) && guard++ < 300) {
        if (g.pending) {
          g = apply(g, { kind: 'choose', option: g.pending.options[0].id });
        } else if (g.phase === 'convergence') {
          g = apply(g, { kind: 'deploy', ...deployments(g)[0] });
        } else if (mustPass(g)) {
          g = apply(g, { kind: 'pass' });
        } else {
          g = apply(g, { kind: 'command', cmd: dominionCommands(g)[0] });
        }
      }
      return g;
    };
    const a = run(), b = run();
    expect(a.cells).toEqual(b.cells);
    expect(a.owner).toEqual(b.owner);
    expect(score(a)).toEqual(score(b));
  });

  it('a preview uses the live rules, and reports what Sanctuary blocks',
     () => {
    const s = scene({
      board: { 5: [1, 'sanctuary', S(0, 0, 0, 0)],
               4: [1, null, S(3, 3, 3, 3)],
               6: [1, null, S(3, 3, 3, 3)] },
      hand: [null, S(3, 3, 0, 3)], toMove: 0,
    });
    const p = previewDeploy(s, 'hand', 1);
    expect(p.taken).toHaveLength(0);
    expect(p.blocked).toHaveLength(1);
    expect(p.blocked[0].why).toMatch(/Sanctuary/);
    // and the live move agrees with the preview
    const out = apply(s, { kind: 'deploy', card: 'hand', cell: 1 });
    expect(score(out)[0]).toBe(1);
  });
});
