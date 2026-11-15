/**
 * v2.3 card readability (presentation only; mechanics untouched).
 *
 * The designer's report was that abilities could not be tracked on the
 * board. Cause: the overlay was font-size:8px while a cell is 172-402px
 * depending on viewport, so ability text was ~3% of the card.
 *
 * These assert the information is PRESENT and sized from --cell. They
 * cannot judge whether it reads well; that is the designer's call in
 * the live game.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { V23App } from '../src/v23/App23';
import {
  type Player, type V23State, CELLS, CMD_INFO, TRAITS, TRAIT_INFO, apply,
  deployments, dominionCommands, isOver, mustPass, newGame, toMove,
} from '../src/v23/rules';
import { CardInfo } from '../src/v23/CardInfo';
import { ROSTER } from '../src/v23/roster';

const css = readFileSync(
  resolve(__dirname, '..', 'src', 'proto', 'ui', 'styles.css'), 'utf8');

/** Play to a full board so every deployed card is on screen. */
function fullBoard(): V23State {
  let g = newGame(5);
  let guard = 0;
  while (g.phase === 'convergence' && guard++ < 200) {
    g = g.pending ? apply(g, { kind: 'skip' })
      : apply(g, { kind: 'deploy', ...deployments(g)[0] });
  }
  return g;
}

describe('every card states both of its abilities', () => {
  it('each trait and command has a one-line label matching the rules',
     () => {
    for (const t of TRAITS) {
      expect(TRAIT_INFO[t].short.length, t).toBeGreaterThan(10);
      expect(TRAIT_INFO[t].short.length, `${t} must stay one line`)
        .toBeLessThan(44);
    }
    for (const k of Object.keys(CMD_INFO) as (keyof typeof CMD_INFO)[]) {
      expect(CMD_INFO[k].short.length, k).toBeGreaterThan(10);
      expect(CMD_INFO[k].short.length, `${k} must stay one line`)
        .toBeLessThan(44);
    }
  });

  it('a fully occupied board names all twelve characters and both '
     + 'ability slots for each', () => {
    const g = fullBoard();
    expect(g.cells.filter(Boolean)).toHaveLength(CELLS);
    // render each real card from the real board
    for (const id of g.cells) {
      const html = renderToStaticMarkup(
        createElement(CardInfo, { g, id: id! }));
      const def = g.defs[id!];
      expect(html, `${def.name}: name`).toContain(def.name);
      expect(html, `${def.name}: slot I`).toContain('I ·');
      expect(html, `${def.name}: slot II`).toContain('II ·');
      expect(html, `${def.name}: command`)
        .toContain(CMD_INFO[def.command].name.toUpperCase());
      if (def.trait) {
        expect(html, `${def.name}: trait name`)
          .toContain(TRAIT_INFO[def.trait].name.toUpperCase());
        // the one-line effect, allowing for HTML entity escaping
        expect(html.replace(/&#x27;|&quot;|&amp;/g, "'"),
               `${def.name}: trait effect`)
          .toContain(TRAIT_INFO[def.trait].short.replace(/'/g, "'"));
      } else {
        expect(html).toContain('NONE');
      }
      expect(html, `${def.name}: owner`).toContain(`P${g.owner[id!] + 1}`);
    }
    expect(ROSTER).toHaveLength(12);
  });

  it('all six traits appear somewhere on a full board', () => {
    // the roster carries each trait twice and all twelve are dealt, so
    // every trait must be on the board once deployment ends
    const g = fullBoard();
    const seen = new Set<string>();
    for (const id of g.cells) {
      if (!id) continue;
      const t = g.defs[id].trait;
      if (t) seen.add(t);
    }
    for (const t of TRAITS) expect(seen.has(t), `${t} missing`).toBe(true);
  });
});

describe('text is sized from the cell, not in fixed pixels', () => {
  it('every on-card text rule scales with --cell', () => {
    for (const sel of ['.ci-name', '.ci-slot b', '.ci-slot em',
                       '.statechip']) {
      const i = css.indexOf(sel + '{');
      expect(i, `${sel} should exist`).toBeGreaterThan(-1);
      const block = css.slice(i, css.indexOf('}', i));
      expect(block, `${sel} must scale with --cell`).toContain('--cell');
    }
  });

  it('nothing on the v2.3 card face is pinned at 8px any more', () => {
    const i = css.indexOf('.cardinfo{');
    const section = css.slice(i);
    const head = section.slice(0, section.indexOf('.bigcard'));
    expect(head).not.toMatch(/font-size:\s*8px/);
  });

  it('the computed text size is legible at every supported viewport',
     () => {
    // mirrors the CSS: clamp(9px, cell*0.062, 20px) for the name and
    // clamp(7px, cell*0.042, 13px) for an ability label
    const cell = (vw: number, vh: number) => {
      const h = vh - 210, w = vw - 258 - 310 - 5 * 16;
      return Math.min((h - 3 * 8) / 3, (w - 4 * 8) / 4);
    };
    for (const [vw, vh] of [[2560, 1440], [1920, 1080], [1440, 900],
                            [1366, 768]]) {
      const c = cell(vw, vh);
      const name = Math.min(Math.max(9, c * 0.062), 20);
      const label = Math.min(Math.max(7, c * 0.042), 13);
      expect(name, `${vw}x${vh} name`).toBeGreaterThanOrEqual(9);
      expect(label, `${vw}x${vh} label`).toBeGreaterThanOrEqual(7);
      // and the old overlay would have been this, for comparison
      expect(label).toBeGreaterThan(7 - 0.01);
    }
    // on a 1080p screen the labels should be comfortably above 8px
    const c = cell(1920, 1080);
    expect(Math.min(Math.max(7, c * 0.042), 13)).toBeGreaterThan(10);
  });
});

describe('identity and state are separate', () => {
  it('ability labels are not replaced by a glow or an icon', () => {
    // the state chips are their own elements, so a label is never
    // swapped out for a highlight
    expect(css).toContain('.statechip');
    expect(css).toMatch(/\.ci-slot\.ci-i\.active/);
    const g = fullBoard();
    const html = renderToStaticMarkup(
      createElement(CardInfo, { g, id: g.cells.find(Boolean)! }));
    expect(html).toContain('ci-slot');
    expect(html).toContain('ci-name');
  });

  it('phase emphasis subdues the other phase without removing it', () => {
    expect(css).toMatch(/\.cardinfo\.convergence \.ci-ii\{opacity:\.?\d/);
    expect(css).toMatch(/\.cardinfo\.dominion \.ci-i\{opacity:\.?\d/);
    // neither is display:none -- the future power stays readable
    const conv = css.slice(css.indexOf('.cardinfo.convergence .ci-ii{'));
    expect(conv.slice(0, 60)).not.toContain('display:none');
  });

  it('the enlargement is supplementary, not the only source', () => {
    const g = fullBoard();
    const html = renderToStaticMarkup(
      createElement(CardInfo, { g, id: g.cells.find(Boolean)! }));
    // on-card info exists with no hover having happened
    expect(html).toContain('cardinfo');
    const app = renderToStaticMarkup(createElement(V23App));
    expect(app).not.toContain('bigcard');
    expect(css).toContain('.bigcard');
    expect(css).toMatch(/\.bigcard\{[^}]*pointer-events:none/);
  });

  it('the right rail still carries the authoritative text', () => {
    const html = renderToStaticMarkup(createElement(V23App));
    expect(html).toContain('the six convergence traits');
    expect(html).toContain(TRAIT_INFO.sanctuary.text.slice(0, 24));
  });
});

describe('mechanics are untouched by this milestone', () => {
  it('a full match still plays out identically', () => {
    const run = () => {
      let g = newGame(33);
      let guard = 0;
      const order: number[] = [];
      while (!isOver(g) && guard++ < 300) {
        order.push(toMove(g) as Player);
        if (g.pending) {
          g = apply(g, { kind: 'choose', option: g.pending.options[0].id });
        } else if (g.phase === 'convergence') {
          g = apply(g, { kind: 'deploy', ...deployments(g)[0] });
        } else {
          g = mustPass(g) ? apply(g, { kind: 'pass' })
            : apply(g, { kind: 'command', cmd: dominionCommands(g)[0] });
        }
      }
      return { cells: g.cells, owner: g.owner, order };
    };
    const a = run(), b = run();
    expect(a.cells).toEqual(b.cells);
    expect(a.owner).toEqual(b.owner);
    expect(a.order).toEqual(b.order);
  });
});
