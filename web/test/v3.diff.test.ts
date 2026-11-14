/**
 * Differential test for the v3 rules against v3.py.
 * Regenerate the fixture with:  python3 gen_v3_fixture.py 40000
 */

import { describe, expect, it } from 'vitest';

import fixture from './fixtures/v3.json';
import {
  BEATS, CARDS, CASCADE_CAP, ELEMENTS, FINAL_CASCADE_CAP, HANDS, NB, NCELLS,
  ORDER, ROTATIONS, TWIN, type Board, type Card,
  beats, capForTurn, orientations, popcount, resolve, rot90, rot180,
  wheelIsRegular,
} from '../src/v3/engine';

type Row = [
  (number[] | null)[], number, number,   // cards9, own0, own1
  number, number[], number, number,      // cell, card, player, cap
  number, number, number, number,        // expCaptured, expWaves, own0, own1
];

const cases = fixture.cases as unknown as Row[];

const toBoard = (row: Row): Board => ({
  cards: row[0].map((c) => (c ? (c as unknown as Card) : null)),
  own: [row[1], row[2]],
});

describe('fixture integrity', () => {
  it('agrees with the oracle on constants', () => {
    const c = fixture.constants;
    expect(c.ORDER).toEqual([...ORDER]);
    expect(c.HANDS).toEqual([...HANDS]);
    expect(c.CASCADE_CAP).toBe(CASCADE_CAP);
    expect(c.FINAL_CASCADE_CAP).toBe(FINAL_CASCADE_CAP);
    expect(c.ROTATIONS).toBe(ROTATIONS);
    expect(c.CARD_COUNT).toBe(CARDS.length);
  });

  it('agrees with the oracle on the whole wheel', () => {
    for (const e of ELEMENTS) {
      const want = (fixture.beats as Record<string, number[]>)[String(e)];
      const got = ELEMENTS.filter((f) => beats(e, f));
      expect(got.sort()).toEqual([...want].sort());
      expect(TWIN[e]).toBe((fixture.twin as Record<string, number>)[String(e)]);
    }
  });

  it('has real coverage, so it cannot pass trivially', () => {
    expect(cases.length).toBeGreaterThanOrEqual(10000);
    const withCaps = cases.filter((r) => r[7] > 0).length;
    const multi = cases.filter((r) => r[8] > 1).length;
    expect(withCaps / cases.length).toBeGreaterThan(0.15);
    expect(multi / cases.length).toBeGreaterThan(0.01);
  });
});

describe('v3 engine.ts matches v3.py', () => {
  it('resolves every fixture position identically', () => {
    const failures: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      const row = cases[i];
      const [, , , cell, card, player, cap,
             expCaptured, expWaves, expOwn0, expOwn1] = row;
      const b = toBoard(row);
      const got = resolve(b, cell, card as unknown as Card, player, cap);

      if (got.captured !== expCaptured ||
          got.waves.length !== expWaves ||
          b.own[0] !== expOwn0 || b.own[1] !== expOwn1) {
        failures.push(
          `case ${i}: cell=${cell} player=${player} cap=${cap}\n` +
          `  captured got ${got.captured} want ${expCaptured}\n` +
          `  waves    got ${got.waves.length} want ${expWaves}\n` +
          `  own      got [${b.own}] want [${expOwn0},${expOwn1}]`);
        if (failures.length >= 5) break;
      }
    }
    expect(failures.join('\n\n')).toBe('');
  });
});

describe('invariants', () => {
  it('only moves cards toward the placing player, and terminates', () => {
    for (let i = 0; i < cases.length; i += 7) {
      const row = cases[i];
      const [, , , cell, card, player] = row;
      const b = toBoard(row);
      const beforeOpp = popcount(b.own[1 - player]);
      const beforeMine = popcount(b.own[player]);
      const got = resolve(b, cell, card as unknown as Card, player, 99);
      expect(popcount(b.own[1 - player])).toBe(beforeOpp - got.captured);
      expect(popcount(b.own[player])).toBe(beforeMine + got.captured + 1);
      expect(b.own[0] & b.own[1]).toBe(0);
    }
  });
});

describe('structure', () => {
  it('has a regular wheel with one neutral twin each', () => {
    expect(wheelIsRegular()).toBe(true);
    for (const e of ELEMENTS) {
      expect(popcount(BEATS[e])).toBe(3);
      expect(beats(e, TWIN[e])).toBe(false);
      expect(beats(TWIN[e], e)).toBe(false);
      expect(TWIN[TWIN[e]]).toBe(e);
    }
  });

  it('has 1680 cards, all with four distinct elements', () => {
    expect(CARDS.length).toBe(1680);
    for (const c of CARDS) expect(new Set(c).size).toBe(4);
  });

  it('rotates correctly and returns to identity', () => {
    const c: Card = [1, 2, 3, 4];
    expect(rot90(c)).toEqual([4, 1, 2, 3]);      // west moves to the top
    expect(rot180(c)).toEqual([3, 4, 1, 2]);
    expect(rot90(rot90(rot90(rot90(c))))).toEqual(c);
  });

  it('offers exactly the orientations the rules allow', () => {
    // The rule is "as drawn, or turned 180" -- asserting only the COUNT let
    // a 90-degree mutation pass the whole suite, so assert the contents.
    const c: Card = [1, 2, 3, 4];
    const o = orientations(c);
    expect(o).toHaveLength(ROTATIONS);
    expect(o[0]).toEqual(c);
    expect(o).toContainEqual(rot90(c));
    expect(o).toContainEqual(rot180(c));
    // every rotation exactly once, and never a mirror
    for (const card of CARDS.slice(0, 200)) {
      const os = orientations(card);
      expect(new Set(os.map((x) => x.join())).size).toBe(ROTATIONS);
      expect(os[0]).toEqual(card);
      const mirrorY: Card = [card[0], card[3], card[2], card[1]];
      if (mirrorY.join() !== card.join() &&
          !os.some((x) => x.join() === rot90(card).join() &&
                          x.join() === mirrorY.join())) {
        // a mirror is not a rotation of a 4-distinct card
        expect(os.map((x) => x.join())).not.toContain(mirrorY.join());
      }
    }
  });

  it('offers all four rotations on every turn, including the last', () => {
    const c: Card = [1, 2, 3, 4];
    for (let t = 0; t < ORDER.length; t++) {
      expect(orientations(c, t)).toHaveLength(ROTATIONS);
    }
  });

  it('mutes only the CHAIN on the final card, not its capture', () => {
    expect(capForTurn(ORDER.length - 1)).toBe(FINAL_CASCADE_CAP);
    expect(FINAL_CASCADE_CAP).toBe(0);   // one wave still resolves
  });

  it('mutes the cascade on the final placement only', () => {
    for (let t = 0; t < ORDER.length - 1; t++) {
      expect(capForTurn(t)).toBe(CASCADE_CAP);
    }
    expect(capForTurn(ORDER.length - 1)).toBe(FINAL_CASCADE_CAP);
  });

  it('places five and four against the turn order', () => {
    const p1 = ORDER.filter((p) => p === 0).length;
    expect([p1, ORDER.length - p1]).toEqual([5, 4]);
    expect([...HANDS]).toEqual([5, 6]);   // hand sizes, not placement counts
    expect(ORDER[0]).toBe(0);
    expect(ORDER[ORDER.length - 1]).toBe(0);
  });

  it('has a symmetric neighbour table of 12 edges', () => {
    let deg = 0;
    for (let i = 0; i < NCELLS; i++) {
      for (let d = 0; d < 4; d++) {
        const j = NB[i][d];
        if (j < 0) continue;
        deg++;
        expect(NB[j][[2, 3, 0, 1][d]]).toBe(i);
      }
    }
    expect(deg / 2).toBe(12);
  });
});
