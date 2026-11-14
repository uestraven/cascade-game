/**
 * Differential test against the Python oracle.
 *
 * engine.py is the normative reference for this game's rules. This replays
 * every fixture position through engine.ts and requires an exact match on
 * the capture count, both ownership masks, and the per-wave breakdown that
 * drives the cascade animation.
 *
 * Regenerate the fixture with:  python3 gen_fixture.py 40000
 */

import { describe, expect, it } from 'vitest';

import fixture from './fixtures/resolution.json';
import {
  BEATS, CASCADE_CAP, ELEMENT_BONUS, HAND_SIZES, LEGAL_FACES, NEIGHBOURS,
  NCELLS, TURN_ORDER, cascade, faces, makeCard, place, popcount, rotateCW,
  weaken, wheelIsRegular, type Board,
} from '../src/engine';

type Row = [
  number[], number, number, number,  // cards9, own0, own1, protected
  number, number, number,            // cell, card, player
  number, number, number,            // cap, bonus, attackBonus
  number, number, number, number[],  // expCaptured, expOwn0, expOwn1, expWaves
];

const cases = fixture.cases as unknown as Row[];

describe('fixture integrity', () => {
  it('matches the oracle constants', () => {
    const c = fixture.constants;
    expect(c.CASCADE_CAP).toBe(CASCADE_CAP);
    expect(c.ELEMENT_BONUS).toBe(ELEMENT_BONUS);
    expect(c.TURN_ORDER).toEqual([...TURN_ORDER]);
    expect(c.HAND_SIZES).toEqual([...HAND_SIZES]);
    expect(c.LEGAL_FACE_COMBOS).toBe(LEGAL_FACES.length);
  });

  it('has a fixture worth trusting', () => {
    expect(cases.length).toBeGreaterThanOrEqual(10000);
    const withCaptures = cases.filter((r) => r[10] > 0).length;
    const multiWave = cases.filter((r) => r[13].length > 1).length;
    const withFrozen = cases.filter((r) => r[3] !== 0).length;
    // A fixture of all no-ops would pass trivially; demand real coverage.
    expect(withCaptures / cases.length).toBeGreaterThan(0.15);
    expect(multiWave / cases.length).toBeGreaterThan(0.02);
    expect(withFrozen / cases.length).toBeGreaterThan(0.05);
  });
});

describe('engine.ts matches engine.py', () => {
  it('resolves every fixture position identically', () => {
    let checked = 0;
    const failures: string[] = [];

    for (let i = 0; i < cases.length; i++) {
      const [
        cards, own0, own1, prot, cell, card, player,
        cap, bonus, attackBonus, expCaptured, expOwn0, expOwn1, expWaves,
      ] = cases[i];

      const board: Board = { cards: cards.slice(), own: [own0, own1] };
      const got = place(board, cell, card, player, {
        cap, bonus, attackBonus, protectedMask: prot,
      });

      if (
        got.captured !== expCaptured ||
        board.own[0] !== expOwn0 ||
        board.own[1] !== expOwn1 ||
        got.waves.length !== expWaves.length ||
        got.waves.some((w, k) => w !== expWaves[k])
      ) {
        failures.push(
          `case ${i}: cap=${cap} bonus=${bonus} atk=${attackBonus} ` +
          `prot=${prot} cell=${cell} player=${player}\n` +
          `  captured  got ${got.captured} want ${expCaptured}\n` +
          `  own0      got ${board.own[0]} want ${expOwn0}\n` +
          `  own1      got ${board.own[1]} want ${expOwn1}\n` +
          `  waves     got [${got.waves}] want [${expWaves}]`,
        );
        if (failures.length >= 5) break;
      }
      checked++;
    }

    expect(failures.join('\n\n')).toBe('');
    expect(checked).toBe(cases.length);
  });
});

describe('invariants the oracle also guarantees', () => {
  it('only ever moves cards to the placing player, and terminates', () => {
    for (let i = 0; i < cases.length; i += 7) {
      const [cards, own0, own1, prot, cell, card, player] = cases[i];
      const board: Board = { cards: cards.slice(), own: [own0, own1] };
      const beforeOpp = popcount(board.own[1 - player]);
      const beforeMine = popcount(board.own[player]);

      const got = place(board, cell, card, player, {
        cap: 99, protectedMask: prot,
      });

      expect(popcount(board.own[1 - player])).toBe(beforeOpp - got.captured);
      expect(popcount(board.own[player])).toBe(beforeMine + got.captured + 1);
      expect(got.captured).toBeLessThanOrEqual(beforeOpp);
      expect(board.own[0] & board.own[1]).toBe(0);
    }
  });

  it('never captures a protected cell', () => {
    for (const row of cases) {
      const prot = row[3];
      if (!prot) continue;
      const [cards, own0, own1, , cell, card, player] = row;
      const board: Board = { cards: cards.slice(), own: [own0, own1] };
      const ownedBefore = [board.own[0] & prot, board.own[1] & prot];
      place(board, cell, card, player, { cap: 99, protectedMask: prot });
      // placement itself may land on an unprotected cell only
      expect(board.own[0] & prot).toBe(ownedBefore[0]);
      expect(board.own[1] & prot).toBe(ownedBefore[1]);
    }
  });
});

describe('structural tables and card rules', () => {
  it('has a regular element wheel', () => {
    expect(wheelIsRegular()).toBe(true);
    for (let e = 1; e <= 8; e++) {
      for (let f = 1; f <= 8; f++) {
        const aBeatsB = ((BEATS[e] >>> f) & 1) === 1;
        const bBeatsA = ((BEATS[f] >>> e) & 1) === 1;
        expect(aBeatsB && bBeatsA).toBe(false); // no mutual beats
      }
    }
  });

  it('enforces the weak-flank rule', () => {
    expect(() => makeCard(4, 5, 6, 7)).toThrow();
    expect(() => makeCard(3, 10, 10, 10)).not.toThrow();
    expect(() => makeCard(0, 1, 1, 1)).toThrow();
    expect(() => makeCard(1, 1, 1, 11)).toThrow();
    expect(LEGAL_FACES.length).toBe(7599);
    expect(LEGAL_FACES.every((t) => Math.min(...t) <= 3)).toBe(true);
  });

  it('round-trips card packing', () => {
    const c = makeCard(1, 2, 3, 9, 5);
    expect(faces(c)).toEqual([1, 2, 3, 9]);
    expect(faces(rotateCW(c))).toEqual([9, 1, 2, 3]); // west moves to top
    expect(faces(rotateCW(rotateCW(rotateCW(rotateCW(c)))))).toEqual(
      [1, 2, 3, 9],
    );
    expect(faces(weaken(makeCard(1, 1, 1, 1)))).toEqual([1, 1, 1, 1]);
    expect(faces(weaken(makeCard(3, 5, 5, 5)))).toEqual([2, 4, 4, 4]);
  });

  it('has a symmetric neighbour table', () => {
    for (let i = 0; i < NCELLS; i++) {
      for (let side = 0; side < 4; side++) {
        const j = NEIGHBOURS[i][side];
        if (j < 0) continue;
        expect(NEIGHBOURS[j][[2, 3, 0, 1][side]]).toBe(i);
      }
    }
    // 12 undirected edges on a full 3x3
    let deg = 0;
    for (let i = 0; i < NCELLS; i++) {
      deg += NEIGHBOURS[i].filter((x) => x >= 0).length;
    }
    expect(deg / 2).toBe(12);
  });

  it('terminates a cascade on an empty origin', () => {
    const b: Board = { cards: new Array(NCELLS).fill(0), own: [0, 0] };
    expect(cascade(b, 0, 0).captured).toBe(0);
  });
});
