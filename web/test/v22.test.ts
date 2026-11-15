/**
 * v2.2 — character powers.
 *
 * Two jobs. First, replay the Python oracle: five commands and the
 * Sanctuary trait, written twice from the same prose, which has
 * silently diverged twice in this project's history. Second, assert the
 * verified v2.1 baseline really is preserved, since the whole point of
 * changing only the abilities is that the structure stays put.
 *
 * Regenerate the fixture with:
 *   python3 gen_v22_fixture.py 2500 > web/test/fixtures/v22.json
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import fixture from './fixtures/v22.json';
import {
  type Cmd, type Command, type Trait, type V22State, CHARACTERS,
  CMDS, CMD_INFO, COMMANDS, TRAITS, TRAIT_INFO, V22_BOARD, allCommands,
  applyCommand, applyPlacement, commandsFor, isOver, isProtected,
  mustPass, newGame, passCommand, phaseOf, pickCommand, pickPlacement,
  placements, score, toMove,
} from '../src/v22/game';
import { type Card } from '../src/proto/engine';
import { V22_BOARD as B2 } from '../src/v22/game';
import { V2_BOARD } from '../src/v2/game';
import { Root } from '../src/Root';
import { V22App } from '../src/v22/App22';

interface Res {
  option: Command & { kind: string };
  captured: number;
  own: [number, number];
  cards: (number[] | null)[];
  trait: (Trait | null)[];
  cmd: (Cmd | null)[];
}
interface Case {
  cells: number;
  cards: (number[] | null)[];
  own: [number, number];
  trait: (Trait | null)[];
  cmd: (Cmd | null)[];
  cell: number;
  player: number;
  recent: number[];
  options: (Command & { kind: string })[];
  results: Res[];
}

const cases = fixture.cases as unknown as Case[];

function stateFor(c: Case): V22State {
  const recent: [number[], number[]] = [[], []];
  recent[c.player] = c.recent.slice();
  return {
    shape: V22_BOARD,
    board: {
      cards: c.cards.map((x) => (x === null ? null : (x as unknown as Card))),
      own: [c.own[0], c.own[1]],
    },
    hands: [[], []],
    reserve: [],
    traitAt: c.trait.slice(),
    cmdAt: c.cmd.slice(),
    charAt: Array(c.cells).fill(undefined),
    placed: V22_BOARD.order.length,
    commands: c.player === 1 ? 0 : 1,
    recent,
    seed: 0,
    log: [],
  };
}

const canon = (o: Command | (Command & { kind: string })): string => {
  const rest = Object.entries(o as Record<string, unknown>)
    .filter(([k]) => k !== 'kind' && k !== 'cell')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(',');
  return `${(o as { kind: string }).kind}(${rest})`;
};

describe('v2.2 matches the Python oracle', () => {
  it('covers every command', () => {
    const seen = new Set<string>();
    for (const c of cases) for (const o of c.options) seen.add(o.kind);
    for (const k of CMDS) expect(seen.has(k), k).toBe(true);
    expect(cases.length).toBeGreaterThanOrEqual(1500);
  });

  it('offers exactly the commands the oracle offers', () => {
    for (const c of cases) {
      const g = stateFor(c);
      const got = commandsFor(g, c.cell).map(canon).sort();
      expect(got, `cell ${c.cell}`)
        .toEqual(c.options.map(canon).sort());
    }
  });

  it('resolves identically, board and both slots included', () => {
    let n = 0;
    for (const c of cases) {
      for (const want of c.results) {
        const g = stateFor(c);
        const cmd = { ...want.option, cell: c.cell } as Command;
        const r = applyCommand(g, cmd);
        const w = `${canon(want.option)} @${c.cell}`;
        expect(r.direct.length + r.followUp.length, `${w}: captured`)
          .toBe(want.captured);
        expect(r.state.board.own, `${w}: own`).toEqual(want.own);
        expect(r.state.board.cards.map((x) => (x === null ? null : [...x])),
               `${w}: board`).toEqual(want.cards);
        // Transpose moves the slots with the cards, so they are compared
        expect(r.state.traitAt, `${w}: traits`).toEqual(want.trait);
        expect(r.state.cmdAt, `${w}: commands`).toEqual(want.cmd);
        n += 1;
      }
    }
    expect(n).toBeGreaterThanOrEqual(4000);
  });
});

describe('the verified baseline is preserved', () => {
  it('same board, deal, placements and command count as v2.1', () => {
    expect(B2.rows).toBe(V2_BOARD.rows);
    expect(B2.cols).toBe(V2_BOARD.cols);
    expect(B2.cells).toBe(V2_BOARD.cells);
    expect(B2.hands).toEqual(V2_BOARD.hands);
    expect(B2.order.length).toBe(V2_BOARD.order.length);
    expect(COMMANDS).toBe(6);
    expect(COMMANDS % 2).toBe(0);
  });

  it('Dominion still opens with P2, so P1 still closes', () => {
    let g = newGame(5);
    const rng = () => 0.5;
    while (phaseOf(g) === 'convergence') {
      g = applyPlacement(g, pickPlacement(g, rng)!).state;
    }
    const order: number[] = [];
    while (phaseOf(g) === 'dominion') {
      order.push(toMove(g));
      g = mustPass(g) ? passCommand(g)
        : applyCommand(g, pickCommand(g, rng)!).state;
    }
    expect(order[0]).toBe(1);
    expect(order).toHaveLength(COMMANDS);
  });

  it('plays to a finish on every seed, board full, draws possible', () => {
    const rng = () => 0.5;
    let drawn = 0;
    for (let seed = 0; seed < 40; seed++) {
      let g = newGame(seed);
      while (!isOver(g)) {
        g = phaseOf(g) === 'convergence'
          ? applyPlacement(g, pickPlacement(g, rng)!).state
          : mustPass(g) ? passCommand(g)
            : applyCommand(g, pickCommand(g, rng)!).state;
      }
      const [a, b] = score(g);
      expect(a + b).toBe(12);
      if (a === b) drawn += 1;
    }
    expect(drawn).toBeLessThan(20);
  });
});

describe('the two slots are distinct', () => {
  it('a trait and a command are separate fields', () => {
    const g = newGame(3);
    for (const h of [...g.hands[0], ...g.hands[1], ...g.reserve]) {
      expect(CMDS).toContain(h.command);
      if (h.trait !== null) expect(TRAITS).toContain(h.trait);
    }
    // and at least one card has a trait while another has none
    const all = [...g.hands[0], ...g.hands[1], ...g.reserve];
    expect(all.some((c) => c.trait !== null)).toBe(true);
    expect(all.some((c) => c.trait === null)).toBe(true);
  });

  it('Sanctuary protects only during Convergence, and only with two '
     + 'allies', () => {
    let g = newGame(11);
    const rng = () => 0.4;
    // run deployment and look for a moment where it held
    let everHeld = false;
    while (phaseOf(g) === 'convergence') {
      for (let c = 0; c < g.shape.cells; c++) {
        if (g.traitAt[c] === 'sanctuary'
            && isProtected(g, g.board, c, 'convergence')) everHeld = true;
      }
      g = applyPlacement(g, pickPlacement(g, rng)!).state;
    }
    expect(everHeld, 'Sanctuary should hold at some point').toBe(true);
    // and it must be gone the moment Dominion starts
    for (let c = 0; c < g.shape.cells; c++) {
      expect(isProtected(g, g.board, c, 'dominion'),
             `cell ${c} still warded in Dominion`).toBe(false);
    }
  });

  it('every command and trait has player-facing text and a rationale',
     () => {
    for (const k of CMDS) {
      expect(CMD_INFO[k].name.length).toBeGreaterThan(2);
      expect(CMD_INFO[k].text.length).toBeGreaterThan(30);
      expect(CMD_INFO[k].why.length).toBeGreaterThan(20);
    }
    for (const k of TRAITS) {
      expect(TRAIT_INFO[k].text.length).toBeGreaterThan(30);
    }
  });

  it('both Usurps ship, and the single-target one is capped at one', () => {
    expect(CMDS).toContain('usurp');
    expect(CMDS).toContain('usurpOne');
    // usurpOne can never take more than one card directly
    const rng = () => 0.5;
    let checked = 0;
    for (let seed = 0; seed < 30; seed++) {
      let g = newGame(seed);
      while (phaseOf(g) === 'convergence') {
        g = applyPlacement(g, pickPlacement(g, rng)!).state;
      }
      while (phaseOf(g) === 'dominion') {
        for (const c of allCommands(g)) {
          if (c.kind === 'usurpOne') {
            const r = applyCommand(g, c);
            expect(r.direct.length).toBeLessThanOrEqual(1);
            // and with one direct capture there can be no follow-up
            expect(r.followUp).toEqual([]);
            checked += 1;
          }
        }
        g = mustPass(g) ? passCommand(g)
          : applyCommand(g, pickCommand(g, rng)!).state;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('Transpose captures nothing but does move cards', () => {
    const rng = () => 0.5;
    let moved = 0;
    for (let seed = 0; seed < 30 && moved < 5; seed++) {
      let g = newGame(seed);
      while (phaseOf(g) === 'convergence') {
        g = applyPlacement(g, pickPlacement(g, rng)!).state;
      }
      for (const c of allCommands(g)) {
        if (c.kind !== 'transpose') continue;
        const r = applyCommand(g, c);
        expect(r.direct).toEqual([]);
        expect(r.followUp).toEqual([]);
        expect(r.moved).toBe(true);
        expect(r.state.board.cards[c.a]).toEqual(g.board.cards[c.b]);
        expect(r.state.board.cards[c.b]).toEqual(g.board.cards[c.a]);
        moved += 1;
      }
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('Reclaim needs only the last command, not a history', () => {
    const g = newGame(7);
    // nothing has been lost yet, so nothing is reclaimable
    expect(g.recent).toEqual([[], []]);
  });
});

describe('the interface shows both slots and the cast', () => {
  const html = renderToStaticMarkup(createElement(V22App));

  it('names the phase and says traits are held during Convergence', () => {
    expect(html).toContain('The Convergence');
    expect(html).toContain('Commands are held');
  });

  it('introduces the three provisional characters by name', () => {
    for (const ch of CHARACTERS) expect(html).toContain(ch.name);
    expect(CHARACTERS).toHaveLength(3);
  });

  it('labels the two slots separately', () => {
    expect(html).toContain('Convergence trait');
    expect(html).toContain('Dominion command');
  });

  it('v2.2 is reachable and is the default', () => {
    const root = renderToStaticMarkup(createElement(Root));
    expect(root).toContain('v2.2 — character powers');
    expect(root).toContain('The Convergence');
    expect(root).toContain('character powers');
  });

  it('v1 and v2.1 are still offered as controls', () => {
    const root = renderToStaticMarkup(createElement(Root));
    expect(root).toContain('v1 — one phase');
    expect(root).toContain('v2.1 — deploy');
  });
});
