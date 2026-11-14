/**
 * Differential test: the sixteen adopted abilities, Python vs TypeScript.
 *
 * proto16.py is the oracle. For every recorded position this replays
 * both the option list and every option's outcome, and demands exact
 * agreement on the capture count, the ownership masks, the final board
 * AND Fortify's shield state.
 *
 * The final board is compared because six of the sixteen -- Anchor,
 * Withdraw, Crossing, Mend, Reorient, Hinge -- move or turn cards
 * without necessarily changing the capture count. A count-only check
 * would pass while every one of them was wrong.
 *
 * Regenerate with:
 *   python3 gen_proto16_fixture.py 4800 > web/test/fixtures/proto16.json
 */

import { describe, expect, it } from 'vitest';
import fixture from './fixtures/proto16.json';
import {
  ADOPTED, type AbilityId, type Option, optionsFor, resolvePlacement,
} from '../src/proto/abilities';
import {
  BOARDS, type Board, type BoardName, type Card, type Shields,
} from '../src/proto/engine';

interface Result {
  option: Option;
  captured: number;
  own: [number, number];
  cards: (number[] | null)[];
  shields: Record<string, number>;
}
interface Case {
  board: BoardName;
  cells: number;
  cards: (number[] | null)[];
  own: [number, number];
  cell: number;
  sigils: number[];
  ability: AbilityId;
  player: number;
  cap: number;
  turn: number;
  options: Option[];
  results: Result[];
}

const cases = fixture.cases as unknown as Case[];

const board = (c: Case): Board => ({
  cards: c.cards.map((x) => (x === null ? null : (x as unknown as Card))),
  own: [c.own[0], c.own[1]],
});

/** Options are compared as a set of canonical strings: the two
 *  implementations are free to enumerate in different orders, but not to
 *  offer a different set of choices. */
const canon = (o: Option): string => {
  if (o === null) return 'null';
  const rest = Object.entries(o as Record<string, unknown>)
    .filter(([k]) => k !== 'kind')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(',');
  return `${(o as { kind: string }).kind}(${rest})`;
};

describe('the sixteen adopted abilities match the Python oracle', () => {
  it('the fixture covers every adopted ability and every board', () => {
    const seen = new Set(cases.map((c) => c.ability));
    for (const a of ADOPTED) expect(seen.has(a), a).toBe(true);
    const boards = new Set(cases.map((c) => c.board));
    for (const b of Object.keys(BOARDS)) expect(boards.has(b)).toBe(true);
    expect(cases.length).toBeGreaterThanOrEqual(3000);
  });

  it('offers exactly the options the oracle offers', () => {
    let checked = 0;
    for (const c of cases) {
      const got = optionsFor(c.ability, {
        s: BOARDS[c.board], b: board(c), player: c.player, cell: c.cell,
        sigils: c.sigils as unknown as Card, cap: c.cap,
      });
      const a = got.map(canon).sort();
      const b = c.options.map(canon).sort();
      expect(a, `${c.ability} @${c.cell} on ${c.board}`).toEqual(b);
      checked += 1;
    }
    expect(checked).toBe(cases.length);
  });

  it('resolves every option identically, board and shields included',
     () => {
    let outcomes = 0;
    for (const c of cases) {
      for (const want of c.results) {
        const b = board(c);
        const shields: Shields = {};
        const r = resolvePlacement({
          s: BOARDS[c.board], b, player: c.player, cell: c.cell,
          sigils: c.sigils as unknown as Card, option: want.option,
          cap: c.cap, turn: c.turn, shields,
        });
        const where = `${c.ability} ${canon(want.option)} @${c.cell} `
          + `on ${c.board} turn ${c.turn}`;
        expect(r.captured, `${where}: captured`).toBe(want.captured);
        expect(b.own, `${where}: own`).toEqual(want.own);
        expect(b.cards.map((x) => (x === null ? null : [...x])),
               `${where}: board`).toEqual(want.cards);
        expect(shields, `${where}: shields`).toEqual(want.shields);
        outcomes += 1;
      }
    }
    expect(outcomes).toBeGreaterThanOrEqual(10000);
  });
});
