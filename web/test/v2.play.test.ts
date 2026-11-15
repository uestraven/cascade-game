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

  it('a draw is impossible: one cell always stays empty', () => {
    expect(V2_BOARD.order.length).toBe(11);
    expect(V2_BOARD.cells).toBe(12);
    const rng = () => 0.5;
    for (let seed = 0; seed < 25; seed++) {
      let g = newGame(seed);
      while (!isOver(g)) {
        g = phaseOf(g) === 'deploy'
          ? applyPlacement(g, pickPlacement(g, rng)!).state
          : mustPass(g)
            ? passCommand(g)
            : applyCommand(g, pickCommand(g, rng)!).state;
      }
      const [a, b] = score(g);
      expect(a + b).toBe(11);
      expect(a === b, `seed ${seed} drew`).toBe(false);
    }
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
  it('a fresh visit gets v2, because that is what is under test', () => {
    // this defaulted to v1 and cost two playtest sessions: the branch
    // served v1 and pinned #v1 into the URL, so v2 was never seen
    const html = renderToStaticMarkup(createElement(Root));
    expect(html).toContain('The Convergence');
    expect(html).toContain('deployment &amp; command');
  });

  it('the switch offers v1 and v2', () => {
    const html = renderToStaticMarkup(createElement(Root));
    expect(html).toContain('v1 — one phase');
    expect(html).toContain('v2 — deploy');
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
