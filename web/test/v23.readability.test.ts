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
import { BattleCard } from '../src/v23/BattleCard';
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
        createElement(BattleCard, { g, id: id!, owner: g.owner[id!] }));
      const def = g.defs[id!];
      expect(html, `${def.name}: name`)
        .toContain(def.name.replace(/^The /, ''));
      // the two rows are tagged I and II
      expect(html, `${def.name}: slot I`).toContain('bc-row i');
      expect(html, `${def.name}: slot II`).toContain('bc-row ii');
      expect(html, `${def.name}: owner shown`).toContain('bc-who');
      expect(html, `${def.name}: command`)
        .toContain(CMD_INFO[def.command].name);
      if (def.trait) {
        expect(html, `${def.name}: trait name`)
          .toContain(TRAIT_INFO[def.trait].name);
        // the one-line effect, allowing for HTML entity escaping
        expect(html.replace(/&#x27;|&quot;|&amp;/g, "'"),
               `${def.name}: trait effect`)
          .toContain(TRAIT_INFO[def.trait].short.replace(/'/g, "'"));
      } else {
        expect(html).toContain('No trait');
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
    for (const sel of ['.bc-title', '.bc-body b', '.bc-body em',
                       '.bc-chip']) {
      const i = css.indexOf(sel + '{');
      expect(i, `${sel} should exist`).toBeGreaterThan(-1);
      const block = css.slice(i, css.indexOf('}', i));
      expect(block, `${sel} must scale with --cell`).toContain('--cell');
    }
  });

  it('nothing on the v2.3 card face is pinned at 8px any more', () => {
    const i = css.indexOf('.bcard{');
    const head = css.slice(i);
    expect(head).not.toMatch(/font-size:\s*8px/);
  });

  it('nothing renders below 9px at any supported viewport', () => {
    // mirrors the CSS, including the rails narrowing on small screens
    // and the effect lines dropping out under 840px of height
    const cell = (vw: number, vh: number) => {
      const railL = vw <= 1280 ? 186 : vw <= 1500 ? 210 : 258;
      const railR = vw <= 1280 ? 224 : vw <= 1500 ? 252 : 310;
      const h = vh - 210, w = vw - railL - railR - 5 * 16;
      return Math.min((h - 3 * 8) / 3, (w - 4 * 8) / 4);
    };
    const clamp = (lo: number, v: number, hi: number) =>
      Math.min(Math.max(lo, v), hi);
    for (const [vw, vh] of [[2560, 1440], [1920, 1080], [1512, 982],
                            [1440, 900], [1366, 768], [1280, 720]]) {
      const c = cell(vw, vh);
      const where = `${vw}x${vh}`;
      expect(clamp(11, c * 0.055, 18), `${where} name`)
        .toBeGreaterThanOrEqual(11);
      expect(clamp(9, c * 0.042, 13), `${where} ability name`)
        .toBeGreaterThanOrEqual(9);
      if (vh > 840) {
        expect(clamp(8, c * 0.038, 12), `${where} effect`)
          .toBeGreaterThanOrEqual(8);
      }
      // sigils are supporting information now, not the focal point
      expect(c * 0.17, `${where} sigil`).toBeLessThan(c * 0.27);
    }
  });

  it('sigils shrank but stay on their four edges, which is the rule',
     () => {
    for (const side of ['.bc-sigil.n', '.bc-sigil.e', '.bc-sigil.s',
                        '.bc-sigil.w']) {
      expect(css, side).toContain(side);
    }
    const block = css.slice(css.indexOf('.bc-sigil{'),
                            css.indexOf('.bc-sigil.n{'));
    expect(block, 'about 17% of the card, down from 27%')
      .toMatch(/width:17%/);
  });

  it('drops the one-line effects rather than rendering them unreadably',
     () => {
    expect(css).toMatch(/@media \(max-height: 840px\)/);
    const q = css.slice(css.indexOf('@media (max-height: 840px)'));
    expect(q.slice(0, 200), 'the effect line is hidden, not shrunk')
      .toContain('.bc-body em{display:none}');
    // but the ability NAME is never hidden
    expect(q.slice(0, 300)).not.toMatch(/\.bc-body b\{[^}]*display:none/);
  });
});

describe('identity and state are separate', () => {
  it('ability labels are not replaced by a glow or an icon', () => {
    // the state chips are their own elements, so a label is never
    // swapped out for a highlight
    expect(css).toContain('.statechip');
    expect(css).toMatch(/\.bc-row\.i\.live/);
    const g = fullBoard();
    const html = renderToStaticMarkup(
      createElement(BattleCard, { g, id: g.cells.find(Boolean)!,
        owner: 0 }));
    expect(html).toContain('bc-row');
    expect(html).toContain('bc-title');
  });

  it('phase emphasis subdues the other phase without removing it', () => {
    expect(css).toMatch(/\.bcard\.convergence \.bc-row\.ii\{opacity:\.?\d/);
    expect(css).toMatch(/\.bc-row\.i\.expired\{opacity:\.?\d/);
    // neither is display:none -- the other phase's power stays readable
    const conv = css.slice(css.indexOf('.bcard.convergence .bc-row.ii{'));
    expect(conv.slice(0, 60)).not.toContain('display:none');
  });

  it('the enlargement is supplementary, not the only source', () => {
    const g = fullBoard();
    const html = renderToStaticMarkup(
      createElement(BattleCard, { g, id: g.cells.find(Boolean)!,
        owner: 0 }));
    // on-card info exists with no hover having happened
    expect(html).toContain('bcard');
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
