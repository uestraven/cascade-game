/**
 * v2 is actually playable, and actually different from v1.
 *
 * The complaint that prompted this file was "I am play testing v2 and I
 * see no difference" — which was correct, because v2 existed only in the
 * Python harness and the app was byte-identical to v1. These tests fail
 * if that is ever true again.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  COMMANDS, V2_ABILITIES, V2_BOARD, applyCommand, applyPlacement,
  commandOptions, commands, commandsLeft, isOver, mustPass, newGame,
  passCommand, phaseOf, pickCommand, pickPlacement, placements, score,
  toMove,
} from '../src/v2/game';
import { mulberry32 } from '../src/rng';
import { Root } from '../src/Root';
import { V2App } from '../src/v2/App2';

describe('v2 is a different game from v1', () => {
  it('has two phases, and the second places no cards', () => {
    let g = newGame(4);
    expect(phaseOf(g)).toBe('deploy');
    const rng = () => 0.5;
    let deployed = 0;
    while (phaseOf(g) === 'deploy') {
      const m = pickPlacement(g, rng)!;
      g = applyPlacement(g, m).state;
      deployed += 1;
    }
    expect(deployed).toBe(V2_BOARD.order.length);
    expect(phaseOf(g)).toBe('command');
    // no placements are offered in the command phase, ever
    expect(placements(g)).toEqual([]);
    const cardsOnBoard = g.board.cards.filter((c) => c !== null).length;
    let n = 0;
    while (phaseOf(g) === 'command') {
      g = mustPass(g) ? passCommand(g)
        : applyCommand(g, pickCommand(g, rng)!).state;
      n += 1;
    }
    expect(n).toBe(COMMANDS);
    expect(g.board.cards.filter((c) => c !== null).length)
      .toBe(cardsOnBoard);
    expect(isOver(g)).toBe(true);
  });

  it('deployment captures directly but never chains', () => {
    // a chain would mean a placement taking a card not adjacent to it
    const rng = () => 0.3;
    for (let seed = 0; seed < 40; seed++) {
      let g = newGame(seed);
      while (phaseOf(g) === 'deploy') {
        const m = pickPlacement(g, rng)!;
        const r = applyPlacement(g, m);
        for (const t of r.captured) {
          expect(g.shape.nb[m.cell].includes(t),
                 `placement at ${m.cell} took non-adjacent ${t}`).toBe(true);
        }
        g = r.state;
      }
    }
  });

  it('abilities are withheld until the command phase', () => {
    const g = newGame(11);
    expect(phaseOf(g)).toBe('deploy');
    // a placement carries no option at all; the only choices are cell
    // and rotation
    const m = placements(g)[0];
    expect(Object.keys(m).sort()).toEqual(['cell', 'handIndex', 'sigils']);
  });

  it('commands alternate from P2, so the count must stay even', () => {
    let g = newGame(5);
    const rng = () => 0.5;
    while (phaseOf(g) === 'deploy') {
      g = applyPlacement(g, pickPlacement(g, rng)!).state;
    }
    const order: number[] = [];
    while (phaseOf(g) === 'command') {
      order.push(toMove(g));
      g = mustPass(g) ? passCommand(g)
        : applyCommand(g, pickCommand(g, rng)!).state;
    }
    expect(order[0]).toBe(1);                 // P2 opens
    expect(order).toHaveLength(COMMANDS);
    expect(COMMANDS % 2).toBe(0);             // an odd count is worth 75+ pts
    const p1 = order.filter((p) => p === 0).length;
    expect(p1).toBe(order.length - p1);       // equal commands each
  });

  it('only four abilities, not v1\'s twenty', () => {
    expect(V2_ABILITIES).toHaveLength(4);
    const g = newGame(2);
    for (const h of [...g.hands[0], ...g.hands[1], ...g.reserve]) {
      expect(V2_ABILITIES).toContain(h.ability);
    }
  });

  it('you can only command your own cards', () => {
    let g = newGame(8);
    const rng = () => 0.5;
    while (phaseOf(g) === 'deploy') {
      g = applyPlacement(g, pickPlacement(g, rng)!).state;
    }
    const p = toMove(g);
    for (const c of commands(g)) {
      expect((g.board.own[p] >>> c.cell) & 1).toBe(1);
    }
    // and commanding an enemy card is refused rather than ignored
    const theirs = [...Array(g.shape.cells).keys()]
      .find((c) => g.board.cards[c] !== null
                && ((g.board.own[1 - p] >>> c) & 1) === 1)!;
    expect(() => applyCommand(g, { cell: theirs, option: null }))
      .toThrow(/not yours/);
  });

  it('a follow-up requires a multiple capture', () => {
    const rng = () => 0.5;
    let seen = 0;
    for (let seed = 0; seed < 60; seed++) {
      let g = newGame(seed);
      while (phaseOf(g) === 'deploy') {
        g = applyPlacement(g, pickPlacement(g, rng)!).state;
      }
      while (phaseOf(g) === 'command') {
        const p = toMove(g);
        for (const c of commands(g)) {
          const r = applyCommand(g, c);
          if (r.direct.length <= 1) {
            expect(r.followUp, 'single capture must not follow up')
              .toEqual([]);
            seen += 1;
          }
        }
        g = mustPass(g)
          ? passCommand(g)
          : applyCommand(g, pickCommand(g, rng)!).state;
      }
    }
    expect(seen).toBeGreaterThan(200);
  });

  it('the board finishes complete, and draws are allowed', () => {
    // variant C deploys twelve cards onto twelve cells, so a level
    // score is reachable. Draws are permitted on purpose: measured at
    // 9.5%, which is preferable to engineering a first-player advantage
    // just to guarantee a winner.
    expect(V2_BOARD.order.length).toBe(12);
    expect(V2_BOARD.cells).toBe(12);
    expect(V2_BOARD.hands).toEqual([6, 6]);
    const rng = () => 0.5;
    let drawn = 0, played = 0;
    for (let seed = 0; seed < 60; seed++) {
      let g = newGame(seed);
      while (!isOver(g)) {
        g = phaseOf(g) === 'deploy'
          ? applyPlacement(g, pickPlacement(g, rng)!).state
          : mustPass(g)
            ? passCommand(g)
            : applyCommand(g, pickCommand(g, rng)!).state;
      }
      const [a, b] = score(g);
      // every cell is owned by somebody at the end
      expect(a + b).toBe(12);
      expect(g.hands[0]).toHaveLength(0);
      expect(g.hands[1]).toHaveLength(0);
      if (a === b) drawn += 1;
      played += 1;
    }
    // a deterministic rng is not the measured distribution, so this only
    // checks draws are reachable and not the common case
    expect(played).toBe(60);
    expect(drawn).toBeLessThan(played / 2);
  });

  it('both players deploy exactly six, with no card left over', () => {
    const g = newGame(9);
    expect(g.hands[0]).toHaveLength(6);
    expect(g.hands[1]).toHaveLength(6);
    expect(g.reserve).toHaveLength(2);
  });

});

describe('the shipped game is variant C', () => {
  it('reproduces the measured distribution', () => {
    // The configuration is three numbers -- 12 placements, a 6/6 deal,
    // P2 opening Dominion -- and getting any of them wrong changes the
    // game without breaking a single other test. The Python experiment
    // over 2,500 games per variant gave:
    //
    //   A  7/6, 6/5, P2 opens   P1 66.6  P2 33.4  draw  0.0
    //   B  6/6, 6/6, P1 opens   P1 31.0  P2 45.4  draw 23.6
    //   C  6/6, 6/6, P2 opens   P1 46.6  P2 43.9  draw  9.5
    //   D  7/7, 6/6, P1 opens   P1 29.6  P2 44.9  draw 25.6
    //
    // Only C lands inside the bounds below, so this test tells the
    // variants apart rather than merely checking the game runs. Bounds
    // are wide because the two bots break ties differently.
    const N = 400;
    let p1 = 0, p2 = 0, draw = 0, c1 = 0;
    for (let seed = 0; seed < N; seed++) {
      const rng = mulberry32((seed * 2654435761) >>> 0);
      let g = newGame(seed);
      while (!isOver(g)) {
        if (phaseOf(g) === 'deploy') {
          const r = applyPlacement(g, pickPlacement(g, rng)!);
          c1 += r.captured.length;
          g = r.state;
        } else if (mustPass(g)) {
          g = passCommand(g);
        } else {
          g = applyCommand(g, pickCommand(g, rng)!).state;
        }
      }
      const [a, b] = score(g);
      if (a > b) p1 += 1; else if (b > a) p2 += 1; else draw += 1;
    }
    const pc = (x: number) => (100 * x) / N;
    expect(pc(p1), 'P1 win rate').toBeGreaterThan(40);
    expect(pc(p1), 'P1 win rate').toBeLessThan(54);
    expect(pc(p2), 'P2 win rate').toBeGreaterThan(36);
    expect(pc(p2), 'P2 win rate').toBeLessThan(50);
    expect(Math.abs(pc(p1) - pc(p2)), 'seat bias').toBeLessThan(10);
    // a 50% P1 rate can hide a quarter of games ending level, so draws
    // are bounded in their own right
    expect(pc(draw), 'draw rate').toBeGreaterThan(4);
    expect(pc(draw), 'draw rate').toBeLessThan(17);
    expect(c1 / N, 'phase I captures').toBeGreaterThan(11.5);
    expect(c1 / N, 'phase I captures').toBeLessThan(14.5);
  });
});

describe('a side with nothing on the board', () => {
  it('passes its command instead of stalling the phase', () => {
    // the proposal is silent on this and it is reachable; a stall would
    // be an unwinnable screen rather than a loss
    let g = newGame(3);
    const rng = () => 0.5;
    while (phaseOf(g) === 'deploy') {
      g = applyPlacement(g, pickPlacement(g, rng)!).state;
    }
    // hand the whole board to P1 and check P2's command is consumed
    const all = (1 << g.shape.cells) - 1;
    const filled = g.board.cards.reduce(
      (m, c, i) => (c === null ? m : m | (1 << i)), 0);
    g = { ...g, board: { ...g.board, own: [filled, 0] },
          commands: 0 };
    expect(toMove(g)).toBe(1);
    expect(mustPass(g)).toBe(true);
    const after = passCommand(g);
    expect(after.commands).toBe(1);
    expect(toMove(after)).toBe(0);
    expect(after.log[0]).toMatch(/nothing to command/);
    expect(all).toBeGreaterThan(0);
  });
});

describe('both rulesets are reachable from the interface', () => {
  it('a fresh visit gets the ruleset under test, not an older one',
     () => {
    // the original fault this guards: the switch defaulted to v1 while
    // v2 was the branch under test, and pinned '#v1' into the URL, so
    // two playtest sessions were spent on the wrong game. The newest
    // ruleset is now v2.2, so that is what a fresh visit must serve.
    const html = renderToStaticMarkup(createElement(Root));
    expect(html).toContain('The Convergence');
    expect(html).toContain('character powers');
    expect(html).not.toContain('place, capture, cascade, repeat');
  });

  it('every ruleset stays reachable as a control', () => {
    const html = renderToStaticMarkup(createElement(Root));
    expect(html).toContain('v1 — one phase');
    expect(html).toContain('v2.1 — deploy');
    expect(html).toContain('v2.2 — character powers');
  });

  it('v2 renders its phase banner and says which phase it is', () => {
    const html = renderToStaticMarkup(createElement(V2App));
    expect(html).toContain('Phase I');
    expect(html).toContain('The Convergence');
    expect(html).toContain('phasebar');
    // and it must not look like v1: no cascade, no 20-ability list
    expect(html).not.toContain('converge');
    expect(html).not.toContain('handoff');
  });

  it('v2 shows the commands remaining, which v1 has no concept of',
     () => {
    const g = newGame(1);
    expect(commandsLeft(g, 0) + commandsLeft(g, 1)).toBe(COMMANDS);
    expect(commandsLeft(g, 0)).toBe(COMMANDS / 2);
  });
});
