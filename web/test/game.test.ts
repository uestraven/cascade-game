import { describe, expect, it } from 'vitest';

import {
  HAND_SIZES, NCELLS, TURN_ORDER, faces, isFull, occupied,
} from '../src/engine';
import {
  CUBE_BUDGET, CUBE_SIZE, applyMove, buildCube, isOver, legalMoves,
  newGame, ownershipSteps, score, toMove, winner,
} from '../src/game';
import { pick, type Difficulty } from '../src/bot';
import { mulberry32 } from '../src/rng';

const playOut = (seed: number, difficulty: Difficulty = 'normal') => {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  let g = newGame(seed);
  while (!isOver(g)) {
    const { cardIndex, cell } = pick(g, rng, difficulty);
    g = applyMove(g, cardIndex, cell).state;
  }
  return g;
};

describe('turn order and hands', () => {
  it('matches the measured AABBAABBA order', () => {
    expect([...TURN_ORDER]).toEqual([0, 0, 1, 1, 0, 0, 1, 1, 0]);
    const p1 = TURN_ORDER.filter((p) => p === 0).length;
    const p2 = TURN_ORDER.length - p1;
    expect([p1, p2]).toEqual([...HAND_SIZES]);
  });

  it('deals 5 and 4, and spends every card', () => {
    const g0 = newGame(1234);
    expect(g0.hands[0]).toHaveLength(5);
    expect(g0.hands[1]).toHaveLength(4);
    const g = playOut(1234);
    expect(g.hands[0]).toHaveLength(0);
    expect(g.hands[1]).toHaveLength(0);
    expect(g.history).toHaveLength(NCELLS);
  });

  it('fills the board exactly, so draws cannot happen', () => {
    for (let seed = 0; seed < 150; seed++) {
      const g = playOut(seed);
      expect(isFull(g.board)).toBe(true);
      const [a, b] = score(g);
      expect(a + b).toBe(NCELLS);
      expect(a).not.toBe(b);
      expect(() => winner(g)).not.toThrow();
    }
  });

  it('offers only empty cells, and shrinks the move list each turn', () => {
    let g = newGame(77);
    let prev = Infinity;
    while (!isOver(g)) {
      const moves = legalMoves(g);
      const hand = g.hands[toMove(g)];
      const open = NCELLS - g.history.length;
      expect(moves).toHaveLength(hand.length * open);
      expect(moves.length).toBeLessThan(prev);
      prev = moves.length;
      g = applyMove(g, moves[0].cardIndex, moves[0].cell).state;
    }
  });
});

describe('immutability', () => {
  it('does not mutate the state passed to applyMove', () => {
    const g = newGame(42);
    const snapshotCards = g.board.cards.slice();
    const snapshotOwn = [g.board.own[0], g.board.own[1]];
    const handLen = g.hands[0].length;

    applyMove(g, 0, 4);

    expect(g.board.cards).toEqual(snapshotCards);
    expect([g.board.own[0], g.board.own[1]]).toEqual(snapshotOwn);
    expect(g.hands[0]).toHaveLength(handLen);
    expect(g.turn).toBe(0);
  });

  it('rejects illegal moves', () => {
    const g = newGame(9);
    expect(() => applyMove(g, 99, 0)).toThrow();
    const after = applyMove(g, 0, 4).state;
    expect(() => applyMove(after, 0, 4)).toThrow();
  });
});

describe('cube budget', () => {
  it('never exceeds the budget that keeps the game fair', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const cube = buildCube(rng);
      expect(cube).toHaveLength(CUBE_SIZE);
      const total = cube.reduce(
        (t, c) => t + faces(c).reduce((x, y) => x + y, 0), 0);
      expect(total).toBeLessThanOrEqual(CUBE_BUDGET);
    }
  });
});

describe('animation steps', () => {
  it('ends on the real post-move ownership', () => {
    let g = newGame(2024);
    while (!isOver(g)) {
      const before = g.board;
      const moves = legalMoves(g);
      const m = moves[Math.floor(moves.length / 3)];
      const { state, resolution, move } = applyMove(g, m.cardIndex, m.cell);
      const steps = ownershipSteps(before, move, resolution);

      expect(steps).toHaveLength(resolution.waves.length + 1);
      expect(steps[steps.length - 1]).toEqual([
        state.board.own[0], state.board.own[1],
      ]);
      // the placed cell is owned from the very first frame
      expect((steps[0][move.player] >>> move.cell) & 1).toBe(1);
      g = state;
    }
  });

  it('only ever transfers cells toward the mover', () => {
    let g = newGame(31337);
    while (!isOver(g)) {
      const before = g.board;
      const moves = legalMoves(g);
      const m = moves[0];
      const { state, resolution, move } = applyMove(g, m.cardIndex, m.cell);
      const steps = ownershipSteps(before, move, resolution);
      for (let k = 1; k < steps.length; k++) {
        const gained = steps[k][move.player] & ~steps[k - 1][move.player];
        const lost = steps[k - 1][move.player] & ~steps[k][move.player];
        expect(lost).toBe(0);
        expect(gained).not.toBe(0);
      }
      g = state;
    }
  });
});

describe('bot', () => {
  it('always returns a legal move at every difficulty', () => {
    for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const rng = mulberry32(8);
      let g = newGame(555);
      while (!isOver(g)) {
        const m = pick(g, rng, d);
        const legal = legalMoves(g).some(
          (x) => x.cardIndex === m.cardIndex && x.cell === m.cell);
        expect(legal).toBe(true);
        g = applyMove(g, m.cardIndex, m.cell).state;
      }
    }
  });

  it('does not play the opening at random', () => {
    // 'normal' uses exposure to break capture ties; over many deals its
    // first move should concentrate, whereas 'easy' should spread out.
    const spread = (d: Difficulty) => {
      const seen = new Map<number, number>();
      for (let seed = 0; seed < 120; seed++) {
        const g = newGame(seed);
        const m = pick(g, mulberry32(seed + 1), d);
        seen.set(m.cell, (seen.get(m.cell) ?? 0) + 1);
      }
      return seen.size;
    };
    expect(spread('normal')).toBeLessThan(spread('easy'));
  });

  it('beats the random-ish bot more often than not', () => {
    let normalWins = 0;
    const games = 60;
    for (let seed = 0; seed < games; seed++) {
      const rng = mulberry32(seed * 7 + 1);
      let g = newGame(seed);
      // normal plays P1, easy plays P2
      while (!isOver(g)) {
        const d: Difficulty = toMove(g) === 0 ? 'normal' : 'easy';
        const m = pick(g, rng, d);
        g = applyMove(g, m.cardIndex, m.cell).state;
      }
      if (winner(g) === 0) normalWins++;
    }
    expect(normalWins / games).toBeGreaterThan(0.5);
  });
});
