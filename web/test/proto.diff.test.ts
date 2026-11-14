/**
 * Differential test for Prototype A against proto.py.
 * Regenerate with:
 *   python3 gen_proto_fixture.py 6000 > web/test/fixtures/proto.json
 *
 * Compares the option LIST, the capture count, the final owners and the
 * final board, for every option of every ability on all three boards. The
 * final board matters as much as the count: pivot and exchange change the
 * cards themselves, and a rotation turning the wrong way is invisible to
 * a count-only comparison.
 */

import { describe, expect, it } from 'vitest';

import fixture from './fixtures/proto.json';
import { SHIPPED } from '../src/proto/abilities';
import {
  type Board, type Card, type Shape, BOARDS, CASCADE_CAP, makeShape,
  rot90,
} from '../src/proto/engine';
import {
  type AbilityId, type GameCard, type GameState, type Option,
  abilityOptions, applyMove, cardShape,
} from '../src/proto/game';

interface Result {
  option: Option;
  captured: number;
  own: [number, number];
  cards: (number[] | null)[];
}
interface Case {
  board: string;
  cells: number;
  cards: (number[] | null)[];
  own: [number, number];
  cell: number;
  sigils: number[];
  ability: AbilityId;
  player: number;
  cap: number;
  options: Option[];
  results: Result[];
}

const cases = fixture.cases as unknown as Case[];
const boardMeta = fixture.boards as Record<
  string, { rows: number; cols: number; hands: number[]; placements: number }>;

const shapeFor = (name: string): Shape => {
  const m = boardMeta[name];
  return makeShape(m.rows, m.cols, [m.hands[0], m.hands[1]] as [number, number],
                   m.rows * m.cols, m.placements);
};

const optKey = (o: Option): string => {
  if (!o) return '-';
  const a = o as Record<string, unknown>;
  return [a.kind, a.cell ?? '', a.edge ?? ''].join('|');
};

/** A state where `player` is to move and has already placed once, so the
 *  ability gate is open -- which is what the fixture assumes. */
function stateFor(c: Case, card: GameCard): GameState {
  const shape = shapeFor(c.board);
  const board: Board = {
    cards: c.cards.map((x) => (x ? (x as unknown as Card) : null)),
    own: [c.own[0], c.own[1]],
  };
  // find a turn index on this board whose mover is c.player, away from
  // the last placement so the cascade cap is the normal one
  let turn = -1;
  for (let i = 1; i < shape.order.length - 1; i++) {
    if (shape.order[i] === c.player) { turn = i; break; }
  }
  const prior = { player: c.player, handIndex: 0, cell: 0,
                  placed: card, option: null };
  return {
    shape, board,
    hands: c.player === 0 ? [[card], []] : [[], [card]],
    reserve: [],
    turn,
    history: [prior, prior],
    seed: 0,
  } as GameState;
}

describe('proto fixture integrity', () => {
  it('covers every shipped ability and every board', () => {
    // SHIPPED, not ABILITIES: this fixture is the original four. The
    // sixteen adopted abilities are covered by proto16.diff.test.ts
    // against their own oracle, and asserting them here would only make
    // this file fail for the wrong reason.
    const seenAb = new Set(cases.map((c) => c.ability));
    for (const a of SHIPPED) expect(seenAb.has(a)).toBe(true);
    const seenB = new Set(cases.map((c) => c.board));
    for (const b of Object.keys(BOARDS)) expect(seenB.has(b)).toBe(true);
  });

  it('is large enough, and most cases offer a real choice', () => {
    expect(cases.length).toBeGreaterThanOrEqual(4000);
    const withOption = cases.filter((c) => c.options.length > 1).length;
    expect(withOption / cases.length).toBeGreaterThan(0.5);
  });

  it('agrees on the cascade cap', () => {
    expect(cases[0].cap).toBe(CASCADE_CAP);
  });

  it('uses only two-of-a-kind sigil shapes, never triples', () => {
    for (const c of cases.slice(0, 500)) {
      const counts = new Map<number, number>();
      for (const s of c.sigils) counts.set(s, (counts.get(s) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
      expect(['versatile', 'focused', 'specialized'])
        .toContain(cardShape(c.sigils as unknown as Card));
    }
  });
});

describe('proto/game.ts matches proto.py', () => {
  it('offers the same option list', () => {
    const bad: string[] = [];
    cases.forEach((c, i) => {
      const card: GameCard = {
        sigils: c.sigils as unknown as Card, ability: c.ability,
      };
      const g = stateFor(c, card);
      const got = abilityOptions(g, c.player, c.ability, c.cell)
        .map(optKey).sort();
      const want = c.options.map(optKey).sort();
      if (JSON.stringify(got) !== JSON.stringify(want) && bad.length < 6) {
        bad.push(`case ${i} (${c.board}/${c.ability}): `
                 + `ts=${JSON.stringify(got)} py=${JSON.stringify(want)}`);
      }
    });
    expect(bad, `${bad.length} option-list mismatches`).toEqual([]);
  });

  it('resolves every option identically', () => {
    const bad: string[] = [];
    let checked = 0;
    cases.forEach((c, i) => {
      const card: GameCard = {
        sigils: c.sigils as unknown as Card, ability: c.ability,
      };
      for (const r of c.results) {
        const g = stateFor(c, card);
        const applied = applyMove(g, {
          handIndex: 0, cell: c.cell,
          sigils: c.sigils as unknown as Card, option: r.option,
        });
        checked++;
        const b = applied.state.board;
        const gotCards = b.cards.map((x) => (x ? [...x] : null));
        const same =
          applied.resolution.captured === r.captured &&
          b.own[0] === r.own[0] && b.own[1] === r.own[1] &&
          JSON.stringify(gotCards) === JSON.stringify(r.cards);
        if (!same && bad.length < 8) {
          bad.push(
            `case ${i} ${c.board}/${c.ability} ${JSON.stringify(r.option)}: `
            + `captured ts=${applied.resolution.captured} py=${r.captured}; `
            + `own ts=[${b.own}] py=[${r.own}]; `
            + `cards ts=${JSON.stringify(gotCards)} py=${JSON.stringify(r.cards)}`);
        }
      }
    });
    expect(checked).toBeGreaterThan(10000);
    expect(bad, `${bad.length} outcome mismatches`).toEqual([]);
  });
});

describe('rules that must hold by construction', () => {
  it('only the acting card attacks, so the opponent never gains a cell',
     () => {
    for (const c of cases.slice(0, 2000)) {
      const card: GameCard = {
        sigils: c.sigils as unknown as Card, ability: c.ability,
      };
      for (const r of c.results) {
        const g = stateFor(c, card);
        const before = g.board.own[1 - c.player];
        const b = applyMove(g, {
          handIndex: 0, cell: c.cell,
          sigils: c.sigils as unknown as Card, option: r.option,
        }).state.board;
        expect(b.own[1 - c.player] & ~before).toBe(0);
      }
    }
  });

  it('never changes how many cards are on the board, beyond the one placed',
     () => {
    for (const c of cases.slice(0, 1500)) {
      const card: GameCard = {
        sigils: c.sigils as unknown as Card, ability: c.ability,
      };
      const before = c.cards.filter(Boolean).length;
      for (const r of c.results) {
        const g = stateFor(c, card);
        const b = applyMove(g, {
          handIndex: 0, cell: c.cell,
          sigils: c.sigils as unknown as Card, option: r.option,
        }).state.board;
        expect(b.cards.filter(Boolean).length).toBe(before + 1);
        expect(b.own[0] & b.own[1]).toBe(0);
      }
    }
  });

  it('a sigil only ever captures its own kind, unless Prism is used',
     () => {
    for (const c of cases.slice(0, 1500)) {
      if (c.ability === 'prism') continue;
      const card: GameCard = {
        sigils: c.sigils as unknown as Card, ability: c.ability,
      };
      const g = stateFor(c, card);
      const applied = applyMove(g, {
        handIndex: 0, cell: c.cell,
        sigils: c.sigils as unknown as Card, option: null,
      });
      for (const e of applied.events) {
        const src = applied.state.board.cards[e.src] as Card;
        const tgt = applied.state.board.cards[e.target] as Card;
        expect(src[e.side]).toBe(e.sigil);
        expect(tgt[[2, 3, 0, 1][e.side]]).toBe(e.sigil);
      }
    }
  });
});

describe('four rotations, and rotation is a cycle of four', () => {
  it('returns to the original after four turns', () => {
    for (const c of cases.slice(0, 300)) {
      let x = c.sigils as unknown as Card;
      for (let i = 0; i < 4; i++) x = rot90(x);
      expect(x).toEqual(c.sigils);
    }
  });
});
