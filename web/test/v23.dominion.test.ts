/**
 * Phase II: its beginning, its progression, and its end.
 *
 * The designer's report was that a player should not have to remember
 * how many commands remain, wonder whether they can act again, or guess
 * whether a comeback is still possible. Most of that is presentation,
 * and these assert the presentation is PRESENT and correct — whether it
 * reads well is the designer's call in the live game.
 *
 * One thing found here was not presentation at all. Checking the stated
 * rule "there is no seventh command" against the engine turned up a
 * case where there was: see the first block.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { DominionHeader, comeback } from '../src/v23/App23';
import {
  type Player, type V23State, CELLS, DOMINION_COMMANDS,
  DOMINION_SEQUENCE, apply, commandPlayer, commandsLeft, deployments,
  dominionCommands, isOver, mustPass, newGame, score, toMove, winner,
} from '../src/v23/rules';

const app = readFileSync(
  resolve(__dirname, '..', 'src', 'v23', 'App23.tsx'), 'utf8');

/** Play Convergence out and stop at the start of Dominion. */
function dominion(seed = 7): V23State {
  let g = newGame(seed);
  let n = 0;
  while (g.phase === 'convergence' && n++ < 400) {
    g = g.pending ? apply(g, { kind: 'skip' })
      : apply(g, { kind: 'deploy', ...deployments(g)[0] });
  }
  expect(g.phase).toBe('dominion');
  return g;
}

/** Rewrite ownership so one side holds everything on the board. */
function sweep(g: V23State, to: Player): V23State {
  const owner = { ...g.owner };
  for (const id of g.cells) if (id) owner[id] = to;
  return { ...g, owner };
}

/** Play Dominion to its end, greedily, and return the finished state. */
function finish(g: V23State): V23State {
  let s = g, n = 0;
  while (!isOver(s) && n++ < 60) {
    if (s.pending) { s = apply(s, { kind: 'skip' }); continue; }
    if (mustPass(s)) { s = apply(s, { kind: 'pass' }); continue; }
    const p = toMove(s);
    const cmds = dominionCommands(s);
    let best = cmds[0], gain = -Infinity;
    for (const c of cmds) {
      const d = score(apply(s, { kind: 'command', cmd: c }))[p];
      if (d > gain) { gain = d; best = c; }
    }
    s = apply(s, { kind: 'command', cmd: best });
  }
  expect(isOver(s), 'Dominion must terminate').toBe(true);
  return s;
}

describe('there is no seventh command', () => {
  it('ends even when the sixth command is a pass', () => {
    // The end-of-phase check lived only in runCommand, so a pass -- the
    // command of a player who controls nothing -- bumped the counter
    // without ending the game. P1 takes commands 2, 4 and 6, so giving
    // P2 the whole board makes the SIXTH command a pass. Dominion then
    // ran a seventh, and since P1 still controlled nothing mustPass
    // stayed true and the counter ran away.
    //
    // Reachable exactly where it matters: a player wiped out during
    // Convergence, which is the 11-1 and 12-0 case the designer asked
    // about.
    const s = finish(sweep(dominion(), 1));
    expect(s.commands, 'exactly six commands')
      .toBe(DOMINION_COMMANDS);
    expect(s.phase).toBe('over');
    // and the three passes are recorded, not lost
    const passes = s.ledger.filter((r) => r.kind === 'pass');
    expect(passes).toHaveLength(3);
    for (const r of passes) expect(r.player).toBe(0);
  });

  it('ends when the sixth command is a pass the other way round', () => {
    // P2 opens, so P2's passes land on commands 1, 3 and 5 and the
    // sixth is a real command. The asymmetry is the whole reason the
    // first version of this bug was easy to miss.
    const s = finish(sweep(dominion(), 0));
    expect(s.commands).toBe(DOMINION_COMMANDS);
    expect(s.ledger.filter((r) => r.kind === 'pass')).toHaveLength(3);
    expect(s.ledger[5].kind).toBe('command');
  });

  it('stops at six from a dozen ordinary games', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = finish(dominion(seed));
      expect(s.commands, `seed ${seed}`).toBe(DOMINION_COMMANDS);
      expect(s.ledger, `seed ${seed}`).toHaveLength(DOMINION_COMMANDS);
    }
  });
});

describe('the command order is one rule, stated once', () => {
  it('runs P2, P1, P2, P1, P2, P1 — three each', () => {
    expect(DOMINION_SEQUENCE).toEqual([1, 0, 1, 0, 1, 0]);
    expect(DOMINION_SEQUENCE.filter((p) => p === 0)).toHaveLength(3);
    expect(DOMINION_SEQUENCE.filter((p) => p === 1)).toHaveLength(3);
  });

  it('is the same order the engine actually takes turns in', () => {
    // toMove and the header must not be able to disagree
    let s = dominion();
    for (let k = 0; k < DOMINION_COMMANDS; k++) {
      expect(toMove(s), `command ${k + 1}`).toBe(commandPlayer(k));
      expect(commandPlayer(k)).toBe(DOMINION_SEQUENCE[k]);
      s = mustPass(s) ? apply(s, { kind: 'pass' })
        : apply(s, { kind: 'command',
                     cmd: dominionCommands(s)[0] });
      while (s.pending) s = apply(s, { kind: 'skip' });
    }
    expect(isOver(s)).toBe(true);
  });

  it('counts down the remaining commands correctly for both', () => {
    let s = dominion();
    for (let k = 0; k <= DOMINION_COMMANDS; k++) {
      const left0 = commandsLeft(s, 0), left1 = commandsLeft(s, 1);
      expect(left0 + left1, `after ${k}`).toBe(DOMINION_COMMANDS - k);
      // the remaining count must match the remaining sequence
      const rest = DOMINION_SEQUENCE.slice(k);
      expect(left0).toBe(rest.filter((p) => p === 0).length);
      expect(left1).toBe(rest.filter((p) => p === 1).length);
      if (k === DOMINION_COMMANDS) break;
      s = mustPass(s) ? apply(s, { kind: 'pass' })
        : apply(s, { kind: 'command', cmd: dominionCommands(s)[0] });
      while (s.pending) s = apply(s, { kind: 'skip' });
    }
  });
});

describe('the ledger records what each command did', () => {
  it('reports the acting player\'s real net gain', () => {
    for (let seed = 20; seed < 26; seed++) {
      let s = dominion(seed);
      let k = 0;
      while (!isOver(s) && k < DOMINION_COMMANDS) {
        const p = toMove(s);
        const before = score(s)[p];
        const was = s.ledger.length;
        s = mustPass(s) ? apply(s, { kind: 'pass' })
          : apply(s, { kind: 'command',
                       cmd: dominionCommands(s).at(-1)! });
        while (s.pending) s = apply(s, { kind: 'skip' });
        const rec = s.ledger[was];
        expect(s.ledger.length, 'one entry per spent command')
          .toBe(was + 1);
        expect(rec.player, `seed ${seed} cmd ${k + 1}`).toBe(p);
        expect(rec.took, `seed ${seed} cmd ${k + 1}: took`)
          .toBe(score(s)[p] - before);
        if (rec.kind === 'pass') expect(rec.took).toBe(0);
        k++;
      }
    }
  });

  it('is empty until Dominion and never grows afterwards', () => {
    let g = newGame(3);
    while (g.phase === 'convergence') {
      expect(g.ledger, 'Convergence spends no commands').toHaveLength(0);
      g = g.pending ? apply(g, { kind: 'skip' })
        : apply(g, { kind: 'deploy', ...deployments(g)[0] });
    }
    const s = finish(g);
    expect(s.ledger).toHaveLength(DOMINION_COMMANDS);
  });

  it('survives a clone, like every other part of the state', () => {
    // apply() clones; a field left out of clone() silently resets
    let s = dominion(9);
    s = mustPass(s) ? apply(s, { kind: 'pass' })
      : apply(s, { kind: 'command', cmd: dominionCommands(s)[0] });
    expect(s.ledger).toHaveLength(1);
    const t = apply(s, mustPass(s) ? { kind: 'pass' }
      : { kind: 'command', cmd: dominionCommands(s)[0] });
    expect(t.ledger, 'the earlier entry is still there').toHaveLength(2);
    expect(t.ledger[0]).toEqual(s.ledger[0]);
  });
});

describe('what a trailing player is facing, in captures', () => {
  it('matches the arithmetic for every split of twelve', () => {
    // a capture moves a card from one side to the other, so it changes
    // the gap by TWO -- the number the designer tabulated
    const table: [number, number, number, number][] = [
      // behind, ahead, net captures to draw, to win
      [6, 6, 0, 1],
      [5, 7, 1, 2],
      [4, 8, 2, 3],
      [3, 9, 3, 4],
      [2, 10, 4, 5],
      [1, 11, 5, 6],
    ];
    for (const [lo, hi, draw, win] of table) {
      expect(lo + hi, 'twelve cards').toBe(CELLS);
      expect(comeback(lo, hi), `${hi}-${lo}`).toEqual({ draw, win });
    }
  });

  it('is derived rather than tabulated', () => {
    // 12-0: six captures level it, seven would be needed to win, and
    // there are only three commands -- the designer's "impossible"
    expect(comeback(0, 12)).toEqual({ draw: 6, win: 7 });
    // An odd total cannot be drawn at all, and `draw` is meaningless
    // there: 7-4 plus two captures is 6-5, a win, not a level board.
    // Every v2.3 board is twelve cards, so the function is only ever
    // asked an even question; `win` is right either way.
    expect(comeback(4, 7).win, '4 -> 5 -> 6 beats 7 -> 6 -> 5').toBe(2);
  });

  it('a 12-0 entry leaves the trailing player no command at all', () => {
    // not a comeback probability -- a rule. With no card on the board
    // there is nothing to command, so all three commands are passes.
    const s = sweep(dominion(), 1);
    expect(score(s)[0]).toBe(0);
    const finished = finish(s);
    expect(finished.ledger.filter((r) => r.player === 0
      && r.kind === 'pass')).toHaveLength(3);
    expect(winner(finished)).toBe(1);
  });
});

describe('the header states the whole phase', () => {
  const render = (g: V23State) => renderToStaticMarkup(
    createElement(DominionHeader, { g, mode: 'hotseat' as const }));

  it('draws all six commands from the first one onward', () => {
    const html = render(dominion());
    // every step is present, numbered, and attributed
    for (let k = 1; k <= DOMINION_COMMANDS; k++) {
      expect(html, `step ${k}`).toContain(`>${k}</span>`);
    }
    expect((html.match(/dh-step/g) ?? [])).toHaveLength(DOMINION_COMMANDS);
    // three each, by name
    expect((html.match(/>P1</g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((html.match(/>P2</g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('says which command this is and whose it is', () => {
    const g = dominion();
    expect(render(g)).toContain('Command 1 of 6');
    expect(render(g), 'P2 opens Dominion').toContain('P2 to command');
    const after = apply(g, { kind: 'command',
                             cmd: dominionCommands(g)[0] });
    expect(render(after)).toContain('Command 2 of 6');
    expect(render(after)).toContain('P1 to command');
  });

  it('states the victory condition permanently, not just at the start',
     () => {
    // a line dismissed four commands ago is not an answer to "what am
    // I trying to do"
    let s = dominion();
    for (let k = 0; k < DOMINION_COMMANDS; k++) {
      expect(render(s), `at command ${k + 1}`)
        .toMatch(/Victory: control the most cards after command/);
      s = mustPass(s) ? apply(s, { kind: 'pass' })
        : apply(s, { kind: 'command', cmd: dominionCommands(s)[0] });
      while (s.pending) s = apply(s, { kind: 'skip' });
    }
  });

  it('marks spent commands with what they took, and passes as passes',
     () => {
    const s = finish(sweep(dominion(), 1));
    const html = render(s);
    expect(html, 'a pass is shown as a spent command')
      .toContain('passed');
    expect((html.match(/dh-step spent/g) ?? []))
      .toHaveLength(DOMINION_COMMANDS);
  });

  it('calls out the final command, and only then', () => {
    let s = dominion();
    for (let k = 0; k < DOMINION_COMMANDS; k++) {
      const html = render(s);
      expect(html.includes('final command'), `before command ${k + 1}`)
        .toBe(k === DOMINION_COMMANDS - 1);
      s = mustPass(s) ? apply(s, { kind: 'pass' })
        : apply(s, { kind: 'command', cmd: dominionCommands(s)[0] });
      while (s.pending) s = apply(s, { kind: 'skip' });
    }
    // and once it is over, it is not "final", it is finished
    expect(render(s)).not.toContain('final command');
    expect(render(s)).toContain('all six commands spent');
    expect(render(s)).not.toContain('to command');
  });

  it('names the bot rather than P2 when playing the computer', () => {
    const html = renderToStaticMarkup(createElement(DominionHeader,
      { g: dominion(), mode: 'bot' as const }));
    expect(html).toContain('bot');
    expect(html).not.toContain('>P2<');
  });
});

describe('both boundaries are events, not label changes', () => {
  it('briefs the player before the first command', () => {
    expect(app, 'the briefing is gated on command 0')
      .toMatch(/game\.phase === 'dominion' && game\.commands === 0\s*\n?\s*&& !briefed/);
    expect(app).toContain('The Convergence is complete');
    expect(app, 'three commands each').toMatch(/three commands<\/b>/);
    expect(app, 'who acts first').toContain('acts\n              first');
    expect(app, 'the objective')
      .toContain('Control the most characters after the sixth command');
  });

  it('holds the bot and the auto-pass behind the briefing', () => {
    // P2 opens Dominion and P2 is the bot, so without this the first
    // command of the phase was taken while the overlay explaining the
    // phase was still on screen
    expect(app).toMatch(/if \(mode !== 'bot' \|\| over \|\| gate\) return/);
    expect(app).toMatch(/mustPass\(game\) && !over && !gate/);
  });

  it('shows the result automatically when the sixth command resolves',
     () => {
    expect(app).toMatch(/\{over && !sawResult &&/);
    expect(app, 'the final counts').toContain('cards controlled');
    expect(app, 'and what the six commands did').toContain('ct-summary');
    // the board stays reviewable rather than being replaced for good
    expect(app).toContain('review the board');
  });

  it('announces a pass instead of consuming it in 340ms', () => {
    expect(app).toContain('passnote');
    expect(app).toContain('is\n              spent as a pass');
    const ms = Number(app.match(/const PASS_MS = (\d+)/)![1]);
    expect(ms, 'long enough to read').toBeGreaterThanOrEqual(1200);
  });

  it('clears both overlays on a new game', () => {
    // a result screen that survived a reset would cover the new board
    const i = app.indexOf('const reset = useCallback');
    const body = app.slice(i, app.indexOf('}, []);', i));
    expect(body).toContain('setBriefed(false)');
    expect(body).toContain('setSawResult(false)');
  });

  it('tells a Convergence player what Phase II is for', () => {
    // the objective has to be reachable before the phase starts, not
    // only once it has
    expect(app).toMatch(/then <b>Phase II<\/b>/);
    expect(app).toContain('whoever controls the most of the twelve wins');
  });
});
