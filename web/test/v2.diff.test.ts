/**
 * Differential test for v2's command phase against v2.py.
 *
 * The command phase moves the attacker (Exchange, Relay), makes an edge
 * wild (Prism) and gates the follow-up on a multiple capture. Each is a
 * place where the same rule written twice has already gone wrong once in
 * this project, so the port is checked rather than trusted — before it
 * reaches a playtest, not after.
 *
 * Regenerate with:
 *   python3 gen_v2_fixture.py 3000 > web/test/fixtures/v2.json
 */

import { describe, expect, it } from 'vitest';
import fixture from './fixtures/v2.json';
import {
  type V2Ability, type V2Option, type V2State, V2_ABILITIES, V2_BOARD,
  applyCommand, commandOptions,
} from '../src/v2/game';
import { type Card } from '../src/proto/engine';

interface Result {
  option: V2Option;
  captured: number;
  own: [number, number];
  cards: (number[] | null)[];
}
interface Case {
  cells: number;
  cards: (number[] | null)[];
  own: [number, number];
  abil: (V2Ability | null)[];
  cell: number;
  player: number;
  options: V2Option[];
  results: Result[];
}

const cases = fixture.cases as unknown as Case[];

/** A state standing mid-command-phase, with the recorded board. */
function stateFor(c: Case): V2State {
  return {
    shape: V2_BOARD,
    board: {
      cards: c.cards.map((x) => (x === null ? null : (x as unknown as Card))),
      own: [c.own[0], c.own[1]],
    },
    hands: [[], []],
    reserve: [],
    abilityAt: c.abil.slice(),
    placed: V2_BOARD.order.length,
    // commands is set so that `toMove` returns the recorded player:
    // the phase alternates from P2, so an even count is P2's turn
    commands: c.player === 1 ? 0 : 1,
    seed: 0,
    log: [],
  };
}

const canon = (o: V2Option): string => {
  if (o === null) return 'null';
  return 'edge' in o ? `prism(${o.edge})` : `${o.kind}(${o.cell})`;
};

describe('v2 command phase matches the Python oracle', () => {
  it('covers all four abilities', () => {
    const seen = new Set<string>();
    for (const c of cases) if (c.abil[c.cell]) seen.add(c.abil[c.cell]!);
    for (const a of V2_ABILITIES) expect(seen.has(a), a).toBe(true);
    expect(cases.length).toBeGreaterThanOrEqual(2000);
  });

  it('offers exactly the options the oracle offers', () => {
    for (const c of cases) {
      const g = stateFor(c);
      const got = commandOptions(g, c.cell).map(canon).sort();
      expect(got, `${c.abil[c.cell]} @${c.cell}`)
        .toEqual(c.options.map(canon).sort());
    }
  });

  it('resolves every command identically, board included', () => {
    let n = 0;
    for (const c of cases) {
      for (const want of c.results) {
        const g = stateFor(c);
        const r = applyCommand(g, { cell: c.cell, option: want.option });
        const where = `${c.abil[c.cell]} ${canon(want.option)} @${c.cell}`;
        expect(r.direct.length + r.followUp.length, `${where}: captured`)
          .toBe(want.captured);
        expect(r.state.board.own, `${where}: own`).toEqual(want.own);
        expect(r.state.board.cards.map((x) => (x === null ? null : [...x])),
               `${where}: board`).toEqual(want.cards);
        n += 1;
      }
    }
    expect(n).toBeGreaterThanOrEqual(6000);
  });

  it('a follow-up happens only after a multiple capture', () => {
    // the rule that keeps Phase II at 15.9 captures instead of 20.2
    let single = 0, multi = 0;
    for (const c of cases) {
      for (const want of c.results) {
        const g = stateFor(c);
        const r = applyCommand(g, { cell: c.cell, option: want.option });
        if (r.direct.length === 1) {
          expect(r.followUp, 'single capture must not follow up').toEqual([]);
          single += 1;
        } else if (r.direct.length > 1) {
          multi += 1;
        }
      }
    }
    expect(single).toBeGreaterThan(100);
    expect(multi).toBeGreaterThan(50);
  });
});
