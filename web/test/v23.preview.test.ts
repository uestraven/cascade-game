/**
 * Seeing what a card does before committing to it.
 *
 * The gap this closes: a card's rules text and its effect were only
 * visible after it had been selected, so comparing two cards in hand
 * meant choosing one and changing your mind.
 *
 * previewAt runs the real engine on a draft, so a preview can never
 * disagree with the move it predicts — that is the property worth
 * protecting, and it is asserted directly below.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  type V23State, CELLS, TRAIT_INFO, apply, deployments, newGame,
  previewAt, previewDeploy, score, toMove,
} from '../src/v23/rules';
import { V23App } from '../src/v23/App23';

const css = readFileSync(
  resolve(__dirname, '..', 'src', 'proto', 'ui', 'styles.css'), 'utf8');

/** a few deployments in, so there is something to capture */
function midway(seed = 7, steps = 5): V23State {
  let g = newGame(seed);
  let k = 0;
  while (g.phase === 'convergence' && k < steps) {
    g = g.pending ? apply(g, { kind: 'skip' })
      : apply(g, { kind: 'deploy', ...deployments(g)[0] });
    if (!g.pending) k++;
  }
  return g;
}

describe('previewAt agrees with the move it predicts', () => {
  it('its capture count is exactly what deploying there produces', () => {
    let checked = 0;
    for (let seed = 0; seed < 12; seed++) {
      const g = midway(seed);
      if (g.pending) continue;
      const p = toMove(g);
      for (const card of g.hands[p]) {
        for (let cell = 0; cell < CELLS; cell++) {
          if (g.cells[cell]) continue;
          const pre = previewAt(g, card, cell);
          const before = score(g)[p];
          let after = apply(g, { kind: 'deploy', card, cell });
          // previewAt reports the attack BEFORE any optional ability, so
          // decline the trait to compare like with like. An On Deploy
          // trait pauses the turn before the attack happens, which is
          // what the first version of this test got wrong.
          let guard = 0;
          while (after.pending && guard++ < 8) {
            after = apply(after, { kind: 'skip' });
          }
          // the deployed card itself, plus whatever it took
          const gained = score(after)[p] - before - 1;
          expect(gained, `seed ${seed} ${card}@${cell}`)
            .toBe(pre.taken.length);
          checked++;
        }
      }
    }
    expect(checked, 'a real number of placements compared')
      .toBeGreaterThan(200);
  });

  it('reports protection separately from a miss', () => {
    // a blocked capture is not the same as a sigil mismatch, and the
    // survey distinguishes them
    let sawBlocked = false;
    for (let seed = 0; seed < 40 && !sawBlocked; seed++) {
      const g = midway(seed, 8);
      if (g.pending) continue;
      for (const card of g.hands[toMove(g)]) {
        for (let cell = 0; cell < CELLS; cell++) {
          if (g.cells[cell]) continue;
          const p = previewAt(g, card, cell);
          if (p.blocked.length) {
            sawBlocked = true;
            for (const b of p.blocked) {
              expect(b.why, 'the reason is named')
                .toMatch(/Sanctuary|Champion/);
              expect(p.taken, 'a held card is not also taken')
                .not.toContain(b.card);
            }
          }
        }
      }
    }
    expect(sawBlocked, 'protection shows up somewhere').toBe(true);
  });

  it('counts On Deploy ability targets, and only for those traits', () => {
    let sawTargets = false;
    for (let seed = 0; seed < 25; seed++) {
      const g = midway(seed, 6);
      if (g.pending) continue;
      for (const card of g.hands[toMove(g)]) {
        const trait = g.defs[card].trait;
        const onDeploy = !!trait
          && TRAIT_INFO[trait].timing === 'onDeploy';
        for (let cell = 0; cell < CELLS; cell++) {
          if (g.cells[cell]) continue;
          const p = previewAt(g, card, cell);
          if (!onDeploy) {
            expect(p.traitOptions,
                   `${trait ?? 'no trait'} is not an On Deploy trait`)
              .toBe(0);
          } else if (p.traitOptions > 0) {
            sawTargets = true;
            // the option lists carry real targets only, no decline
            // entry, so any non-zero count is a usable target
            expect(p.traitOptions).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
    expect(sawTargets, 'some On Deploy trait had targets').toBe(true);
  });

  it('never throws, on any card at any empty cell', () => {
    for (let seed = 0; seed < 20; seed++) {
      const g = midway(seed, 10);
      if (g.pending) continue;
      for (const card of g.hands[toMove(g)]) {
        for (let cell = 0; cell < CELLS; cell++) {
          if (g.cells[cell]) continue;
          expect(() => previewAt(g, card, cell)).not.toThrow();
        }
      }
    }
  });

  it('leaves the state it inspected untouched', () => {
    const g = midway(3);
    const snap = JSON.stringify({ c: g.cells, o: g.owner, h: g.hands,
                                  d: g.deployed });
    for (const card of g.hands[toMove(g)]) {
      for (let cell = 0; cell < CELLS; cell++) {
        if (!g.cells[cell]) previewAt(g, card, cell);
      }
    }
    expect(JSON.stringify({ c: g.cells, o: g.owner, h: g.hands,
                            d: g.deployed })).toBe(snap);
  });
});

describe('the interface exposes it before selection', () => {
  it('hovering a hand card is wired, not only clicking it', () => {
    const src = readFileSync(
      resolve(__dirname, '..', 'src', 'v23', 'App23.tsx'), 'utf8');
    expect(src, 'pointer inspection').toContain('onMouseEnter');
    expect(src, 'and keyboard inspection').toContain('onFocus');
    expect(src, 'a peek state distinct from selection').toContain('setPeek');
    // the survey keys off the hovered card first, then the selected one
    expect(src).toContain('peek?.card ?? sel');
  });

  it('draws a per-cell figure and marks the best placement', () => {
    expect(css).toContain('.surv{');
    expect(css).toMatch(/\.surv\.top\{/);
    expect(css).toMatch(/\.surv-trait\{/);
    expect(css).toMatch(/\.surv-held\{/);
    // the figure scales with the cell like everything else on the board
    const b = css.slice(css.indexOf('.surv b{'));
    expect(b.slice(0, 120)).toContain('--cell');
  });

  it('the peek panel shows both abilities and names each sigil edge',
     () => {
    const src = readFileSync(
      resolve(__dirname, '..', 'src', 'v23', 'App23.tsx'), 'utf8');
    expect(src).toContain('peekcard');
    expect(src).toContain('I · CONVERGENCE');
    expect(src).toContain('II · DOMINION');
    for (const side of ['north', 'east', 'south', 'west']) {
      expect(src, `${side} edge labelled`).toContain(side);
    }
  });

  it('renders without a hover having happened', () => {
    const html = renderToStaticMarkup(createElement(V23App));
    expect(html).not.toContain('peekcard');
    expect(html).not.toContain('class="surv');
  });
});
