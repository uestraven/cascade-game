/**
 * The previews must agree with the engine exactly. A capture preview that
 * is merely close would teach a new player the wrong game -- which is the
 * whole purpose of the feature, so it is worth real tests.
 *
 * Also checked: the previews read nothing but the public board and the
 * caller's own hand, so they cannot leak the opponent's hidden hand.
 */

import { describe, expect, it } from 'vitest';

import {
  CARDS, NB, NCELLS, popcount, rot90, type Card,
} from '../src/v3/engine';
import {
  type GameState, applyMove, legalMoves, newGame,
} from '../src/v3/game';
import {
  openSides, previewPlacement, rotationPreview, threatenedCells,
} from '../src/v3/ui/vision';
import { mulberry32 } from '../src/rng';

/** Play `n` random legal moves to get a mid-game position. */
function advance(g: GameState, n: number, rng: () => number): GameState {
  let s = g;
  for (let i = 0; i < n; i++) {
    const moves = legalMoves(s);
    if (!moves.length) break;
    s = applyMove(s, moves[Math.floor(rng() * moves.length)]).state;
  }
  return s;
}

describe('openSides', () => {
  it('is empty for an empty cell and for a fully surrounded one', () => {
    const g = newGame(7);
    for (let i = 0; i < NCELLS; i++) {
      expect(openSides(g.board, i)).toEqual([]);     // board is empty
    }
  });

  it('counts exactly the neighbours that are empty', () => {
    const rng = mulberry32(99);
    for (let t = 0; t < 200; t++) {
      const g = advance(newGame(t), 1 + Math.floor(rng() * 8), rng);
      for (let i = 0; i < NCELLS; i++) {
        if (g.board.cards[i] === null) continue;
        const want: number[] = [];
        for (let d = 0; d < 4; d++) {
          const nb = NB[i][d];
          if (nb >= 0 && g.board.cards[nb] === null) want.push(d);
        }
        expect(openSides(g.board, i)).toEqual(want);
      }
    }
  });
});

describe('previewPlacement agrees with the engine', () => {
  it('splits captures into direct, cascade and reach, totalling correctly',
     () => {
    const rng = mulberry32(4242);
    let checked = 0;
    let sawCascade = 0;
    let sawDirect = 0;
    for (let t = 0; t < 300; t++) {
      const g = advance(newGame(t), 1 + Math.floor(rng() * 6), rng);
      const player = g.turn % 2 === 0 ? 0 : 1;
      if (g.hands[player].length === 0) continue;
      for (const m of legalMoves(g).slice(0, 12)) {
        const p = previewPlacement(g, player, m.cell, m.edges, m.option,
                                   m.handIndex);
        if (!p) continue;
        const truth = applyMove(g, m).resolution;
        // the three buckets must be disjoint and cover every capture
        expect(p.direct & p.cascade).toBe(0);
        expect(p.direct & p.reach).toBe(0);
        expect(p.cascade & p.reach).toBe(0);
        expect(p.total).toBe(truth.captured);
        expect(popcount(p.direct) + popcount(p.cascade) + popcount(p.reach))
          .toBe(truth.captured);
        if (p.cascade) sawCascade++;
        if (p.direct) sawDirect++;
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
    // the test would pass trivially if nothing ever captured
    expect(sawDirect).toBeGreaterThan(50);
    expect(sawCascade).toBeGreaterThan(10);
  });

  it('puts captures in the RIGHT bucket, not merely disjoint ones', () => {
    // Mutation testing caught this hole: swapping `direct` and `cascade`
    // passed every other test here, because they only checked the buckets
    // were disjoint and summed correctly. The distinction is the whole
    // point of the feature, so it needs pinning.
    //
    // The board graph is bipartite, so for a plain placement the first
    // wave can only reach cells one step from the placed card, and the
    // second wave only cells two steps away. That makes the buckets
    // identifiable by geometry alone.
    const dist = (a: number, b: number): number => {
      const seen = new Set([a]);
      let front = [a];
      for (let d = 0; d < 5; d++) {
        if (front.includes(b)) return d;
        const next: number[] = [];
        for (const u of front) {
          for (let k = 0; k < 4; k++) {
            const v = NB[u][k];
            if (v >= 0 && !seen.has(v)) { seen.add(v); next.push(v); }
          }
        }
        front = next;
      }
      return 99;
    };
    const rng = mulberry32(6060);
    let checkedDirect = 0;
    let checkedCascade = 0;
    for (let t = 0; t < 400; t++) {
      const g = advance(newGame(t), 1 + Math.floor(rng() * 6), rng);
      const player = g.turn % 2 === 0 ? 0 : 1;
      if (!g.hands[player].length) continue;
      for (const m of legalMoves(g).filter((x) => x.option === null)
             .slice(0, 10)) {
        const p = previewPlacement(g, player, m.cell, m.edges, null);
        if (!p) continue;
        for (let i = 0; i < NCELLS; i++) {
          if ((p.direct >>> i) & 1) {
            expect(dist(m.cell, i)).toBe(1);
            checkedDirect++;
          }
          if ((p.cascade >>> i) & 1) {
            expect(dist(m.cell, i)).toBe(2);
            checkedCascade++;
          }
        }
      }
    }
    expect(checkedDirect).toBeGreaterThan(100);
    expect(checkedCascade).toBeGreaterThan(20);
  });

  it('reports the placed card’s exposed edges as the engine leaves them',
     () => {
    const rng = mulberry32(17);
    for (let t = 0; t < 150; t++) {
      const g = advance(newGame(t), 1 + Math.floor(rng() * 6), rng);
      const player = g.turn % 2 === 0 ? 0 : 1;
      if (!g.hands[player].length) continue;
      const m = legalMoves(g)[0];
      const p = previewPlacement(g, player, m.cell, m.edges, m.option,
                                 m.handIndex);
      if (!p) continue;
      const after = applyMove(g, m).state.board;
      const want = openSides(after, m.cell);
      expect(p.exposed.map((e) => e.side)).toEqual(want);
      for (const e of p.exposed) {
        expect(e.element).toBe((after.cards[m.cell] as Card)[e.side]);
      }
    }
  });

  it('refuses an occupied cell and leaves the game state untouched', () => {
    const rng = mulberry32(3);
    const g = advance(newGame(5), 4, rng);
    const taken = g.board.cards.findIndex((c) => c !== null);
    expect(previewPlacement(g, 0, taken, CARDS[0], null)).toBeNull();

    const before = JSON.stringify(g);
    const empty = g.board.cards.findIndex((c) => c === null);
    previewPlacement(g, g.turn % 2 === 0 ? 0 : 1, empty, CARDS[0], null);
    expect(JSON.stringify(g)).toBe(before);
  });
});

describe('rotationPreview', () => {
  it('offers four turns whose edges are the four rotations', () => {
    const g = newGame(11);
    const card = g.hands[0][0].edges;
    const rots = rotationPreview(g, 0, card, null);
    expect(rots.length).toBe(4);
    let c = card;
    for (const r of rots) {
      expect(r.edges).toEqual(c);
      c = rot90(c);
    }
    // with no cell under consideration there is nothing to capture
    expect(rots.every((r) => r.preview === null)).toBe(true);
  });

  it('matches a direct previewPlacement for each rotation', () => {
    const rng = mulberry32(808);
    for (let t = 0; t < 120; t++) {
      const g = advance(newGame(t), 2 + Math.floor(rng() * 5), rng);
      const player = g.turn % 2 === 0 ? 0 : 1;
      if (!g.hands[player].length) continue;
      const cell = g.board.cards.findIndex((c) => c === null);
      if (cell < 0) continue;
      const card = g.hands[player][0].edges;
      for (const r of rotationPreview(g, player, card, cell)) {
        const direct = previewPlacement(g, player, cell, r.edges, null);
        expect(r.preview?.total).toBe(direct?.total);
        expect(r.preview?.direct).toBe(direct?.direct);
      }
    }
  });

  it('actually varies with rotation, or it would not be worth showing', () => {
    const rng = mulberry32(2024);
    let varied = 0;
    for (let t = 0; t < 400; t++) {
      const g = advance(newGame(t), 2 + Math.floor(rng() * 5), rng);
      const player = g.turn % 2 === 0 ? 0 : 1;
      if (!g.hands[player].length) continue;
      const cell = g.board.cards.findIndex((c) => c === null);
      if (cell < 0) continue;
      const totals = rotationPreview(g, player, g.hands[player][0].edges, cell)
        .map((r) => r.preview?.total ?? 0);
      if (new Set(totals).size > 1) varied++;
    }
    expect(varied).toBeGreaterThan(40);
  });
});

describe('threatenedCells', () => {
  it('lists exactly the empty cells adjacent to one of my cards', () => {
    const rng = mulberry32(55);
    for (let t = 0; t < 150; t++) {
      const g = advance(newGame(t), 1 + Math.floor(rng() * 7), rng);
      for (const player of [0, 1]) {
        const got = threatenedCells(g.board, player);
        for (const cell of got) {
          expect(g.board.cards[cell]).toBeNull();
          const touches = [0, 1, 2, 3].some((d) => {
            const nb = NB[cell][d];
            return nb >= 0 && g.board.cards[nb] !== null
              && ((g.board.own[player] >>> nb) & 1) === 1;
          });
          expect(touches).toBe(true);
        }
      }
    }
  });
});

describe('hidden information', () => {
  it('previews are identical however the opponent’s hand is changed',
     () => {
    const rng = mulberry32(31337);
    for (let t = 0; t < 120; t++) {
      const g = advance(newGame(t), 2 + Math.floor(rng() * 5), rng);
      const me = g.turn % 2 === 0 ? 0 : 1;
      if (!g.hands[me].length) continue;
      const cell = g.board.cards.findIndex((c) => c === null);
      if (cell < 0) continue;
      const edges = g.hands[me][0].edges;
      const base = previewPlacement(g, me, cell, edges, null);

      // swap the opponent's entire hand for different cards
      const other: GameState = {
        ...g,
        hands: me === 0
          ? [g.hands[0], g.hands[1].map((c, i) => ({
              ...c, edges: CARDS[(i * 97 + 13) % CARDS.length] }))]
          : [g.hands[0].map((c, i) => ({
              ...c, edges: CARDS[(i * 97 + 13) % CARDS.length] })), g.hands[1]],
      };
      const after = previewPlacement(other, me, cell, edges, null);
      expect(JSON.stringify(after)).toBe(JSON.stringify(base));
    }
  });
});
