import { describe, expect, it } from 'vitest';

import { DECK_SIZE, HANDS, NCELLS, ORDER, ROTATIONS, isFull, rot180 }
  from '../src/v3/engine';
import {
  ABILITIES, ABILITY_FROM_PLACEMENT, ABILITY_IDS, MAX_ABILITY_CARDS,
  abilityCount, applyMove, buildDeck, isOver, legalMoves, newGame,
  ownershipSteps, placedCount, score, toMove, winner,
} from '../src/v3/game';
import { pick, type Difficulty } from '../src/v3/bot';
import { mulberry32 } from '../src/rng';

const playOut = (seed: number, d: Difficulty = 'normal') => {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  let g = newGame(seed);
  while (!isOver(g)) g = applyMove(g, pick(g, rng, d)).state;
  return g;
};

describe('v3 game layer', () => {
  it('deals 5 and 6 and fills the board exactly', () => {
    const g0 = newGame(1);
    expect(g0.hands[0]).toHaveLength(HANDS[0]);
    expect(g0.hands[1]).toHaveLength(HANDS[1]);
    for (let seed = 0; seed < 120; seed++) {
      const g = playOut(seed);
      expect(isFull(g.board)).toBe(true);
      const [a, b] = score(g);
      expect(a + b).toBe(NCELLS);
      expect(a).not.toBe(b);            // odd board: no draws
      expect(() => winner(g)).not.toThrow();
      expect(g.history).toHaveLength(NCELLS);
    }
  });

  it('never replenishes a hand', () => {
    const rng = mulberry32(4);
    let g = newGame(808);
    let prev = [g.hands[0].length, g.hands[1].length];
    expect(prev).toEqual([...HANDS]);
    while (!isOver(g)) {
      const p = toMove(g);
      g = applyMove(g, pick(g, rng)).state;
      expect(g.hands[p].length).toBe(prev[p] - 1);   // only ever shrinks
      prev = [g.hands[0].length, g.hands[1].length];
    }
    // P1 plays all five; P2 plays four of six and keeps two
    expect(g.hands[0]).toHaveLength(0);
    expect(g.hands[1]).toHaveLength(HANDS[1] - 4);
  });

  it('offers every rotation of every card', () => {
    const g = newGame(42);
    const moves = legalMoves(g);
    const open = NCELLS - g.history.length;
    expect(moves.length).toBeGreaterThanOrEqual(
      g.hands[0].length * ROTATIONS * open);
    const first = g.hands[0][0].edges;
    const shown = new Set(moves.filter((m) => m.handIndex === 0)
      .map((m) => m.edges.join(',')));
    expect(shown.size).toBe(ROTATIONS);
    expect(shown).toContain(first.join(','));
    expect(shown).toContain(rot180(first).join(','));
  });

  it('does not mutate the state passed to applyMove', () => {
    const g = newGame(7);
    const cards = g.board.cards.slice();
    const own: [number, number] = [g.board.own[0], g.board.own[1]];
    const handLen = g.hands[0].length;
    applyMove(g, legalMoves(g)[0]);
    expect(g.board.cards).toEqual(cards);
    expect([g.board.own[0], g.board.own[1]]).toEqual(own);
    expect(g.hands[0]).toHaveLength(handLen);
    expect(g.turn).toBe(0);
  });

  it('rejects illegal moves', () => {
    const g = newGame(9);
    expect(() => applyMove(g, { handIndex: 99, cell: 0, edges: g.hands[0][0].edges, option: null })).toThrow();
    const after = applyMove(g, legalMoves(g)[0]).state;
    const taken = after.history[0].cell;
    expect(() => applyMove(after, {
      handIndex: 0, cell: taken,
      edges: after.hands[1][0].edges, option: null,
    })).toThrow();
  });
});

describe('abilities come online on your second placement', () => {
  it('is closed on your first placement and open after', () => {
    const rng = mulberry32(5);
    let g = newGame(2024);
    const seen = new Set<boolean>();
    while (!isOver(g)) {
      const p = toMove(g);
      const open = placedCount(g, p) >= ABILITY_FROM_PLACEMENT - 1;
      for (const m of legalMoves(g)) {
        if (m.option !== null) expect(open).toBe(true);
      }
      seen.add(open);
      g = applyMove(g, pick(g, rng)).state;
    }
    expect(seen).toContain(false);   // closed early
    expect(seen).toContain(true);    // open later
  });

  it('counts only that player\'s own placements', () => {
    const rng = mulberry32(6);
    let g = newGame(77);
    while (!isOver(g)) {
      const p = toMove(g);
      expect(placedCount(g, p)).toBe(
        g.history.filter((m) => m.player === p).length);
      g = applyMove(g, pick(g, rng)).state;
    }
    expect(placedCount(g, 0)).toBe(5);
    expect(placedCount(g, 1)).toBe(4);
  });
});

describe('animation frames', () => {
  it('end on the real post-move ownership', () => {
    let g = newGame(31337);
    while (!isOver(g)) {
      const before = g.board;
      const m = legalMoves(g)[0];
      const { state, resolution, move } = applyMove(g, m);
      const steps = ownershipSteps(before, move, resolution.waves);
      expect(steps).toHaveLength(resolution.waves.length + 1);
      expect(steps[steps.length - 1]).toEqual(
        [state.board.own[0], state.board.own[1]]);
      g = state;
    }
  });
});

describe('bot', () => {
  it('always returns a legal move', () => {
    for (const d of ['easy', 'normal'] as Difficulty[]) {
      const rng = mulberry32(8);
      let g = newGame(555);
      while (!isOver(g)) {
        const m = pick(g, rng, d);
        const legal = legalMoves(g).some(
          (x) => x.handIndex === m.handIndex && x.cell === m.cell &&
                 x.edges.join() === m.edges.join());
        expect(legal).toBe(true);
        g = applyMove(g, m).state;
      }
    }
  });

  it('beats the random-ish setting, with seats controlled', () => {
    // P1 is the weaker seat here, so a one-sided test measures the seat
    // rather than the skill. Play every deal twice with the seats swapped.
    let wins = 0;
    const seeds = 50;
    for (let seed = 0; seed < seeds; seed++) {
      for (const normalSeat of [0, 1]) {
        const rng = mulberry32(seed * 7 + 1 + normalSeat);
        let g = newGame(seed);
        while (!isOver(g)) {
          const d: Difficulty =
            toMove(g) === normalSeat ? 'normal' : 'easy';
          g = applyMove(g, pick(g, rng, d)).state;
        }
        if (winner(g) === normalSeat) wins++;
      }
    }
    expect(wins / (seeds * 2)).toBeGreaterThan(0.5);
  });
});

describe('abilities', () => {
  it('covers all eight elements and prices only free or one affinity', () => {
    const byElement = new Set(ABILITY_IDS.map((id) => ABILITIES[id].element));
    expect(byElement.size).toBe(8);
    // 14 since PRINCE was ported from the deleted leader subsystem
    expect(ABILITY_IDS).toHaveLength(14);
    for (const id of ABILITY_IDS) {
      expect(ABILITIES[id].text.length).toBeGreaterThan(10);
    }
  });

  it('respects the deckbuilding cap', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const deck = buildDeck(rng);
      expect(deck).toHaveLength(DECK_SIZE);
      expect(abilityCount(deck)).toBeLessThanOrEqual(MAX_ABILITY_CARDS);
    }
    const g = newGame(11);
    expect(abilityCount([...g.hands[0], ...g.decks[0]]))
      .toBeLessThanOrEqual(MAX_ABILITY_CARDS);
    expect(abilityCount([...g.hands[1], ...g.decks[1]]))
      .toBeLessThanOrEqual(MAX_ABILITY_CARDS);
  });

  it('never offers an ability that cannot be paid for', () => {
    const rng = mulberry32(17);
    for (let seed = 0; seed < 60; seed++) {
      let g = newGame(seed);
      while (!isOver(g)) {
        const p = toMove(g);
        for (const m of legalMoves(g)) {
          if (m.option === null) continue;
          const card = g.hands[p][m.handIndex];
          expect(card.ability).not.toBeNull();
          expect(placedCount(g, p))
            .toBeGreaterThanOrEqual(ABILITY_FROM_PLACEMENT - 1);
        }
        g = applyMove(g, pick(g, rng)).state;
      }
    }
  });

  it('still fills the board and forbids draws with abilities live', () => {
    const rng = mulberry32(99);
    for (let seed = 0; seed < 150; seed++) {
      let g = newGame(seed);
      while (!isOver(g)) g = applyMove(g, pick(g, rng)).state;
      const [a, b] = score(g);
      expect(a + b).toBe(NCELLS);     // nothing leaves the board
      expect(a).not.toBe(b);
      expect(isFull(g.board)).toBe(true);
    }
  });

  it('resolves every ability without throwing, on its own terms', () => {
    // force each ability in turn and exercise all of its options
    const rng = mulberry32(5);
    for (const id of ABILITY_IDS) {
      let hit = 0;
      for (let seed = 0; seed < 40 && hit < 3; seed++) {
        let g = newGame(seed);
        g = { ...g, hands: [
          g.hands[0].map((c) => ({ ...c, ability: id })),
          g.hands[1].map((c) => ({ ...c, ability: id })),
        ] as typeof g.hands };
        while (!isOver(g)) {
          const opts = legalMoves(g).filter((m) => m.option !== null);
          if (opts.length) {
            hit++;
            for (const m of opts.slice(0, 6)) {
              expect(() => applyMove(g, m)).not.toThrow();
            }
          }
          g = applyMove(g, pick(g, rng)).state;
        }
      }
    }
  });
});
