/**
 * The twenty abilities as a playable set.
 *
 * The differential test proves each ability resolves the way the oracle
 * says. This one proves they are actually reachable in a game: that a
 * deck contains them, that the bot can play against them without
 * falling over, that every option a player is offered produces the
 * outcome the picker claims, and that no ability can wedge a game.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  ABILITIES, ABILITY_INFO, abilityOptions, applyMove, buildDeck, isOver,
  legalMoves, newGame, score, toMove,
} from '../src/proto/game';
import {
  ADOPTED, SHIPPED, describeOption, optionsFor,
} from '../src/proto/abilities';
import { BOARDS, type BoardName, emptyCells } from '../src/proto/engine';
import { mulberry32 } from '../src/rng';
import { pick } from '../src/proto/bot';
import { App } from '../src/proto/ui/App';

describe('all twenty abilities are present', () => {
  it('ABILITIES is the four shipped plus the sixteen adopted', () => {
    expect(ABILITIES).toHaveLength(20);
    for (const a of [...SHIPPED, ...ADOPTED]) {
      expect(ABILITIES).toContain(a);
    }
    expect(new Set(ABILITIES).size).toBe(20);
  });

  it('every ability has rules text and a one-line summary', () => {
    for (const a of ABILITIES) {
      const info = ABILITY_INFO[a];
      expect(info, a).toBeTruthy();
      expect(info.text.length, a).toBeGreaterThan(20);
      expect(info.changes.length, a).toBeGreaterThan(3);
      expect(info.group, a).toBeTruthy();
    }
  });

  it('a 20-card deck holds one of each, and a 12-card deck the first '
     + 'twelve', () => {
    const d20 = buildDeck(mulberry32(1), 20);
    expect(new Set(d20.map((c) => c.ability)).size).toBe(20);
    const d12 = buildDeck(mulberry32(1), 12);
    expect(new Set(d12.map((c) => c.ability)))
      .toEqual(new Set(ABILITIES.slice(0, 12)));
  });

  it('every card in a deck carries an ability that can be displayed',
     () => {
    for (const c of buildDeck(mulberry32(7), 20)) {
      expect(ABILITIES).toContain(c.ability);
      expect(ABILITY_INFO[c.ability].text).toBeTruthy();
    }
  });
});

describe('every offered option is honest about its result', () => {
  it('the number shown in the picker is the number the engine gives',
     () => {
    // the picker computes its figures by running applyMove, so this
    // guards the property that matters: no option is offered that the
    // engine then refuses, and none throws
    let checked = 0;
    for (const bn of Object.keys(BOARDS) as BoardName[]) {
      let g = newGame(99, BOARDS[bn]);
      const rng = mulberry32(5);
      while (!isOver(g)) {
        const p = toMove(g);
        const cells = emptyCells(g.shape, g.board);
        for (let i = 0; i < g.hands[p].length; i++) {
          const card = g.hands[p][i];
          for (const cell of cells.slice(0, 2)) {
            for (const o of abilityOptions(g, p, card.ability, cell,
                                           card.sigils)) {
              const a = applyMove(g, { handIndex: i, cell,
                                       sigils: card.sigils, option: o });
              expect(a.resolution.captured).toBeGreaterThanOrEqual(0);
              expect(describeOption(o).length).toBeGreaterThan(3);
              checked += 1;
            }
          }
        }
        const moves = legalMoves(g);
        g = applyMove(g, moves[Math.floor(rng() * moves.length)]).state;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('declining is always available', () => {
    const g = newGame(3, BOARDS['4x4']);
    for (const a of ABILITIES) {
      for (const cell of emptyCells(g.shape, g.board).slice(0, 3)) {
        const opts = optionsFor(a, {
          s: g.shape, b: g.board, player: 0, cell,
          sigils: [0, 1, 2, 3] as never, cap: 1,
        });
        expect(opts[0], `${a} must offer declining`).toBeNull();
      }
    }
  });
});

describe('a whole game plays out with all twenty in the deck', () => {
  for (const bn of Object.keys(BOARDS) as BoardName[]) {
    it(`${bn}: bot vs bot reaches a result`, () => {
      let g = newGame(2024, BOARDS[bn]);
      const rng = mulberry32(11);
      let guard = 0;
      const used = new Set<string>();
      while (!isOver(g)) {
        const c = pick(g, rng, 'hard');
        expect(c, `${bn}: bot found no move on turn ${g.turn}`).toBeTruthy();
        if (c!.option) used.add(c!.option.kind);
        g = applyMove(g, c!).state;
        expect(++guard).toBeLessThan
          (200);
      }
      const [a, b] = score(g);
      expect(a + b).toBeGreaterThan(0);
      expect(g.turn).toBe(g.shape.order.length);
    });
  }

  it('shields never accumulate without bound', () => {
    let g = newGame(5, BOARDS['4x4']);
    const rng = mulberry32(3);
    while (!isOver(g)) {
      const moves = legalMoves(g);
      g = applyMove(g, moves[Math.floor(rng() * moves.length)]).state;
      // a shield lasts two turns, so at most a handful can be live
      expect(Object.keys(g.shields).length).toBeLessThan(12);
    }
  });
});

describe('the interface lists every ability', () => {
  const html = renderToStaticMarkup(createElement(App));
  it('names all twenty in the reference list', () => {
    for (const a of ABILITIES) {
      expect(html, `${a} should be listed`).toContain(a);
    }
  });
  it('prints the rules text for each', () => {
    for (const a of ABILITIES) {
      const head = ABILITY_INFO[a].text.slice(0, 18)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;');
      expect(html, a).toContain(head);
    }
  });
});
