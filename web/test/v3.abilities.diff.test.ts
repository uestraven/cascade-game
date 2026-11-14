/**
 * Differential test for ABILITIES against v3_abilities.py.
 * Regenerate with:
 *   python3 gen_ability_fixture.py 6500 > web/test/fixtures/abilities.json
 *
 * The existing v3 fixture covers plain placement only, and game.test.ts
 * only asserts that each ability "resolves without throwing" -- which an
 * ability that rotated the wrong way, or chained from the wrong cell,
 * would pass. This compares the option LIST, the capture count, the final
 * owners and the final board, for every option of every ability.
 */

import { describe, expect, it } from 'vitest';

import fixture from './fixtures/abilities.json';
import { CASCADE_CAP, NCELLS, type Board, type Card } from '../src/v3/engine';
import {
  ABILITY_IDS, type AbilityId, type GameCard, type GameState, type Option,
  abilityOptions, applyMove,
} from '../src/v3/game';

interface Result {
  option: Option;
  captured: number;
  own: [number, number];
  cards: (number[] | null)[];
}
interface Case {
  board: (number[] | null)[];
  own: [number, number];
  cell: number;
  edges: number[];
  ability: AbilityId;
  player: number;
  cap: number;
  options: Option[];
  results: Result[];
}

const cases = fixture.cases as unknown as Case[];

const optKey = (o: Option): string => {
  if (!o) return '';
  const a = o as Record<string, unknown>;
  return ['kind', 'cell', 'near', 'edge']
    .map((k) => (a[k] === undefined ? '' : String(a[k]))).join('|');
};

/** A state in which `player` is to move and has already placed once, so
 *  abilities are live -- the shipped gate is the second placement. */
function stateFor(c: Case, card: GameCard): GameState {
  const board: Board = {
    cards: c.board.map((x) => (x ? (x as unknown as Card) : null)),
    own: [c.own[0], c.own[1]],
  };
  // turn index with ORDER[turn] === player, far from the final turn so the
  // cascade cap is the normal one
  const turn = c.player === 0 ? 2 : 3;
  const prior = {
    player: c.player, handIndex: 0, cell: 0,
    placed: card, option: null,
  };
  return {
    board,
    leaders: [null, null],
    leaderUsed: [false, false],
    pivot: [false, false],
    barFinalLeader: false,
    hands: c.player === 0 ? [[card], []] : [[], [card]],
    decks: [[], []],
    turn,
    history: [prior, prior],
    seed: 0,
  } as GameState;
}

describe('ability fixture integrity', () => {
  it('covers every ability the game ships', () => {
    const seen = new Set(cases.map((c) => c.ability));
    for (const id of ABILITY_IDS) expect(seen.has(id)).toBe(true);
  });

  it('is large enough, and most cases offer a real choice', () => {
    expect(cases.length).toBeGreaterThanOrEqual(5000);
    const withOption = cases.filter((c) => c.options.length > 1).length;
    expect(withOption / cases.length).toBeGreaterThan(0.4);
  });

  it('agrees on the cascade cap', () => {
    expect(cases[0].cap).toBe(CASCADE_CAP);
  });
});

describe('game.ts abilities match v3_abilities.py', () => {
  it('offers the same option list', () => {
    const bad: string[] = [];
    cases.forEach((c, i) => {
      const card: GameCard = {
        edges: c.edges as unknown as Card, ability: c.ability,
      };
      const g = stateFor(c, card);
      const got = abilityOptions(g, c.player, card, c.cell).map(optKey).sort();
      const want = c.options.map(optKey).sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        if (bad.length < 6) {
          bad.push(`case ${i} (${c.ability}): ts=${JSON.stringify(got)} `
                   + `py=${JSON.stringify(want)}`);
        }
      }
    });
    expect(bad, `${bad.length} option-list mismatches`).toEqual([]);
  });

  it('resolves every option identically', () => {
    const bad: string[] = [];
    let checked = 0;
    cases.forEach((c, i) => {
      const card: GameCard = {
        edges: c.edges as unknown as Card, ability: c.ability,
      };
      for (const r of c.results) {
        const g = stateFor(c, card);
        const handIndex = 0;
        const applied = applyMove(g, {
          handIndex, cell: c.cell, edges: c.edges as unknown as Card,
          option: r.option,
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
            `case ${i} ${c.ability} ${JSON.stringify(r.option)}: `
            + `captured ts=${applied.resolution.captured} py=${r.captured}; `
            + `own ts=[${b.own}] py=[${r.own}]; `
            + `cards ts=${JSON.stringify(gotCards)} `
            + `py=${JSON.stringify(r.cards)}`);
        }
      }
    });
    expect(checked).toBeGreaterThan(10000);
    expect(bad, `${bad.length} outcome mismatches`).toEqual([]);
  });
});

describe('invariants that hold for every ability', () => {
  it('never changes how many cards are on the board', () => {
    for (const c of cases.slice(0, 1500)) {
      const card: GameCard = {
        edges: c.edges as unknown as Card, ability: c.ability,
      };
      const before = c.board.filter(Boolean).length;
      for (const r of c.results) {
        const g = stateFor(c, card);
        const applied = applyMove(g, {
          handIndex: 0, cell: c.cell, edges: c.edges as unknown as Card,
          option: r.option,
        });
        const after = applied.state.board.cards.filter(Boolean).length;
        expect(after).toBe(before + 1);
      }
    }
  });

  it('never leaves a cell owned by both players or by neither', () => {
    for (const c of cases.slice(0, 1500)) {
      const card: GameCard = {
        edges: c.edges as unknown as Card, ability: c.ability,
      };
      for (const r of c.results) {
        const g = stateFor(c, card);
        const b = applyMove(g, {
          handIndex: 0, cell: c.cell, edges: c.edges as unknown as Card,
          option: r.option,
        }).state.board;
        expect(b.own[0] & b.own[1]).toBe(0);
        for (let i = 0; i < NCELLS; i++) {
          const occupied = b.cards[i] !== null;
          const owned = (((b.own[0] | b.own[1]) >>> i) & 1) === 1;
          expect(owned).toBe(occupied);
        }
      }
    }
  });
});
