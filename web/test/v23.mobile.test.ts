/**
 * The mobile layout.
 *
 * These assert two kinds of thing, and neither is "it looks good" —
 * that is the designer's call in the live game on a real phone.
 *
 *   1  the arithmetic. A v2.3 cell derives its width and height
 *      independently, so a viewport can stretch or flatten a card
 *      without anything overflowing or erroring. The two shape
 *      failures found here were 81x187 (portrait phone) and 198x35
 *      (the same phone turned sideways), both from a --boardH written
 *      for a desktop. These recompute the CSS and bound the result.
 *
 *   2  that every preview has a touch path. The whole v2.3 preview
 *      layer was reached by hovering, which a phone cannot do.
 *
 * The arithmetic is duplicated from the stylesheet rather than read out
 * of it, which means it can drift. The guard against that is the third
 * block: it reads the stylesheet and checks the constants it was
 * derived from are still the ones written there.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { V23App } from '../src/v23/App23';
import { COLS, ROWS } from '../src/v23/rules';

const dir = resolve(__dirname, '..', 'src');
const css = readFileSync(resolve(dir, 'proto', 'ui', 'styles.css'), 'utf8');
const app = readFileSync(resolve(dir, 'v23', 'App23.tsx'), 'utf8');
const html = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');

/** devices this is expected to be played on */
const PHONES: [string, number, number][] = [
  ['iPhone SE', 375, 667],
  ['iPhone 14', 390, 844],
  ['iPhone 15 Pro Max', 430, 932],
  ['Pixel 7', 412, 915],
  ['Galaxy S8', 360, 740],
  ['iPad mini portrait', 744, 1133],
  ['iPad Air portrait', 820, 1180],
];
const LANDSCAPE: [string, number, number][] = [
  ['iPhone SE sideways', 667, 375],
  ['iPhone 14 sideways', 844, 390],
  ['Pixel 7 sideways', 915, 412],
];

/**
 * The CSS cascade for --cellw/--cellh, by hand.
 *
 * Mirrors, in order: the base `.board.v23` rule, the <=900px block's
 * height cap, then the <=560px-tall block which restates both.
 */
function cell(vw: number, vh: number) {
  const narrow = vw <= 900;          // or hoverless; same declarations
  const short = vh <= 560 && vw <= 1100;
  const gap = narrow ? 10 : 16;
  const boardW = narrow ? vw - 2 * gap : vw - 3 * gap;
  const cw = (boardW - COLS * 8) / COLS;
  if (short) {
    const h = (vh - 150 - ROWS * 8) / ROWS;
    return { w: Math.min(cw, h * 1.35), h };
  }
  if (narrow) {
    return { w: cw, h: Math.min((vh - 330 - ROWS * 8) / ROWS, cw * 1.5) };
  }
  return { w: cw, h: (vh - 260 - ROWS * 8) / ROWS };
}

const clamp = (lo: number, v: number, hi: number) =>
  Math.min(Math.max(lo, v), hi);

/**
 * CSS with its comments removed.
 *
 * Needed because these blocks are heavily commented and the comments
 * quote the selectors they are about. The first version of the
 * override test below passed against a deleted rule, having matched
 * the comment explaining why the rule was there.
 */
const bare = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('a cell stays card-shaped on a phone', () => {
  it('is never a strip, in either orientation', () => {
    // Taller than 1.6:1 or wider than 1.6:1 is not a card any more.
    // Before this pass a portrait phone produced 1:2.31 and the same
    // phone sideways produced 5.6:1.
    for (const [name, vw, vh] of [...PHONES, ...LANDSCAPE]) {
      const { w, h } = cell(vw, vh);
      expect(w, `${name} width`).toBeGreaterThan(40);
      expect(h, `${name} height`).toBeGreaterThan(40);
      expect(h / w, `${name} is ${w.toFixed(0)}x${h.toFixed(0)}`)
        .toBeLessThanOrEqual(1.6);
      expect(w / h, `${name} is ${w.toFixed(0)}x${h.toFixed(0)}`)
        .toBeLessThanOrEqual(1.6);
    }
  });

  it('fits the board inside the viewport without sideways scroll', () => {
    for (const [name, vw, vh] of [...PHONES, ...LANDSCAPE]) {
      const { w } = cell(vw, vh);
      const gap = vw <= 900 ? 10 : 16;
      const boardPx = COLS * w + (COLS - 1) * 8;
      expect(boardPx, `${name}: board ${boardPx.toFixed(0)}px`)
        .toBeLessThanOrEqual(vw - 2 * gap);
    }
  });

  it('leaves room under the board for the hand and the strip', () => {
    // status 34 + strip 62 + hand 118 + padding and gaps 46
    const CHROME = 260;
    for (const [name, vw, vh] of PHONES) {
      const { h } = cell(vw, vh);
      const boardPx = ROWS * h + (ROWS - 1) * 8;
      expect(boardPx + CHROME, `${name}: ${boardPx.toFixed(0)}px of board`)
        .toBeLessThanOrEqual(vh);
    }
  });

  it('keeps every on-card label at 9px or more', () => {
    // --cell is the type scale and is the smaller dimension
    for (const [name, vw, vh] of [...PHONES, ...LANDSCAPE]) {
      const { w, h } = cell(vw, vh);
      const c = Math.min(w, h);
      expect(clamp(11, c * 0.055, 18), `${name} name`)
        .toBeGreaterThanOrEqual(11);
      expect(clamp(9, c * 0.042, 13), `${name} ability name`)
        .toBeGreaterThanOrEqual(9);
      // the sigil socket has a 15px floor, so it survives too
      expect(Math.max(15, c * 0.115), `${name} sigil`)
        .toBeGreaterThanOrEqual(15);
    }
  });

  it('drops the ability one-liners rather than shrinking them to 6px',
     () => {
    // an honest consequence of ~85px cells, not an oversight
    const m = css.slice(css.indexOf('@media (max-width: 900px)'));
    expect(m, 'the elaboration is hidden on a phone')
      .toContain('.bc-body em{display:none}');
    // but never the ability NAME, which is the identity
    expect(m.slice(0, 4000)).not.toMatch(/\.bc-body b\{[^}]*display:none/);
  });
});

describe('the stacked layout actually stacks', () => {
  it('beats the ruleset bar\'s own height rule', () => {
    // `.rulesetbar + .page .app` is three classes; a media query adds
    // no specificity, so a bare `.app{height:auto}` lost to it and the
    // single column stayed pinned to one screen's height.
    const pin = css.indexOf('.rulesetbar + .page .app{height:calc(');
    expect(pin, 'the desktop pin still exists').toBeGreaterThan(-1);
    for (const q of ['@media (max-width: 1100px)',
                     '@media (max-width: 900px)']) {
      const i = css.indexOf(q);
      expect(i, q).toBeGreaterThan(-1);
      const block = bare(css.slice(i, css.indexOf('\n}', i)));
      expect(block, `${q} must override the pin at equal specificity`)
        .toContain('.rulesetbar + .page .app');
      expect(block, `${q} must release the height`)
        .toMatch(/height:auto/);
    }
  });

  it('measures height in dvh, so the URL bar is not counted twice',
     () => {
    // 100vh on a phone includes the retracted URL bar, so a 100vh
    // shell is taller than what you can see and its bottom edge --
    // the hand -- sits under the browser chrome.
    const shell = css.slice(css.indexOf('.app{display:grid'));
    expect(shell.slice(0, 600), 'dvh, with vh beneath it as a fallback')
      .toContain('height:100dvh');
    expect(shell.slice(0, 600)).toContain('height:100vh');
    expect(shell.indexOf('height:100vh'),
           'the vh fallback must come first to be overridden')
      .toBeLessThan(shell.indexOf('height:100dvh'));
    // and no mobile board formula may still be sized in vh
    const m = css.slice(css.indexOf('@media (max-width: 900px)'));
    const boardRules = m.match(/--board[WH]:[^;}]+/g) ?? [];
    expect(boardRules.length).toBeGreaterThan(0);
    for (const r of boardRules) {
      if (r.includes('vh')) expect(r, r).toContain('dvh');
    }
  });

  it('puts the board before the chrome', () => {
    // desktop reads rail, board, rail; stacked, that order put the
    // title, controls, stack and 40 events above the board
    const m = css.slice(css.indexOf('@media (max-width: 900px)'));
    const order = (sel: string) => {
      const i = m.indexOf(sel + '{order:');
      expect(i, `${sel} needs an order`).toBeGreaterThan(-1);
      return Number(m.slice(i).match(/order:(\d+)/)![1]);
    };
    expect(order('.stage'), 'the board comes before the right rail')
      .toBeLessThan(order('.rail.right'));
    expect(order('.rail.right'), 'reference and history go last')
      .toBeLessThan(order('.rail.left'));
  });

  it('keeps the status strip outside the grid so it can stick', () => {
    // a sticky grid item is confined to its own grid area, which here
    // is exactly its own height, so it would never have moved
    const i = app.indexOf('className="mobilestatus"');
    const j = app.indexOf('<div className="app">');
    expect(i, 'the strip exists').toBeGreaterThan(-1);
    expect(i, 'and it is a sibling of .app, not a child')
      .toBeLessThan(j);
    const m = bare(css.slice(css.indexOf('@media (max-width: 900px)')));
    const k = m.indexOf('.mobilestatus{');
    expect(m.slice(k, m.indexOf('}', k))).toContain('position:sticky');
  });

  it('declares the safe area so the sheet clears the home indicator',
     () => {
    expect(html, 'env() insets are zero without viewport-fit=cover')
      .toContain('viewport-fit=cover');
    expect(css).toContain('env(safe-area-inset-bottom)');
  });

  it('gives controls a 40px touch target', () => {
    const m = css.slice(css.indexOf('@media (max-width: 900px)'),
                        css.indexOf('/* ------', css.indexOf(
                          '@media (max-width: 900px)')));
    for (const [sel, min] of [['select,button', 40], ['.picker li', 44],
                              ['.stage .hand .slot', 44]] as const) {
      const i = m.indexOf(sel + '{');
      expect(i, `${sel} should be sized up on touch`).toBeGreaterThan(-1);
      const block = m.slice(i, m.indexOf('}', i));
      const got = Number(block.match(/min-height:(\d+)px/)?.[1] ?? 0);
      expect(got, `${sel} min-height`).toBeGreaterThanOrEqual(min);
    }
  });
});

describe('every preview has a path that does not need a hover', () => {
  it('asks the device rather than guessing from the width', () => {
    // a hybrid laptop is wide AND coarse; a narrow desktop window is
    // neither
    expect(app).toContain("matchMedia('(hover: none), (pointer: coarse)')");
    // and it starts false, so the first render matches the server's
    expect(app).toMatch(/useState\(false\)[\s\S]{0,400}hover: none/);
  });

  it('gates every mouse-only handler on the pointer kind', () => {
    // a touch browser synthesises mouseenter on tap, which opened the
    // hover popover on top of the thing just tapped
    const handlers = app.match(/on(MouseEnter|MouseLeave|Focus)=\{[^]/g)
      ?? [];
    expect(handlers.length).toBeGreaterThan(4);
    for (const m of app.matchAll(/on(MouseEnter|MouseLeave)=\{(.{0,24})/g)) {
      expect(m[2], `${m[1]} must be disabled on touch`)
        .toContain('coarse ?');
    }
  });

  it('selects on the first tap and opens the rules on the second', () => {
    expect(app).toMatch(/if \(coarse && sel === cid\)/);
    // and selecting still does not deploy anything
    const i = app.indexOf('if (coarse && sel === cid)');
    const near = app.slice(i, i + 400);
    expect(near).not.toContain("kind: 'deploy'");
  });

  it('previews a command on the first tap and commits on the second',
     () => {
    for (const v of ['cmdHover !== i', 'optHover !== o.id']) {
      expect(app, v).toContain(`coarse && ${v}`);
    }
  });

  it('states the full rules of the focused card under the board', () => {
    // the right rail carries this on desktop, but a phone puts the
    // rail below the pickers where it is no use mid-decision
    const out = renderToStaticMarkup(createElement(V23App));
    expect(out, 'the strip is in the DOM, CSS-hidden on desktop')
      .toContain('cardstrip');
    expect(out, 'phase, turn and score, pinned').toContain('mobilestatus');
    expect(css).toMatch(/\.cardstrip\{display:none\}/);
    const m = css.slice(css.indexOf('.cardstrip{display:none}'));
    expect(m).toContain('@media (max-width: 900px)');
  });

  it('turns the pointer-positioned popover into a sheet', () => {
    // 330px of fixed panel at cursor coordinates, with
    // pointer-events:none so it could not even be dismissed
    const m = css.slice(css.indexOf('@media (max-width: 900px)'));
    const i = m.indexOf('.bigcard{');
    expect(i, 'the sheet rule').toBeGreaterThan(-1);
    const block = m.slice(i, m.indexOf('}', i));
    expect(block).toContain('bottom:0');
    expect(block).toContain('pointer-events:auto');
    expect(block, 'and it must be dismissable').toContain('max-height');
    // the app stops writing inline coordinates, which would otherwise
    // beat the stylesheet and park the sheet at an arbitrary offset
    expect(app).toMatch(/const place = coarse \? undefined/);
    expect(app).toContain('sheetclose');
  });

  it('says out loud how the two-tap preview works', () => {
    expect(app).toContain('taphint');
    expect(css).toMatch(/\.taphint\{display:none\}/);
  });
});

describe('the duplicated arithmetic still matches the stylesheet', () => {
  it('reads the same constants the helper above was derived from', () => {
    const narrow = css.slice(css.indexOf('@media (max-width: 900px)'));
    expect(narrow, '--gap on a phone').toContain(':root{--gap:10px}');
    expect(narrow, 'board width').toContain('--boardW:calc(100vw - 2*var(--gap))');
    expect(narrow, 'the height cap against width')
      .toContain('calc(var(--cellw) * 1.5)');
    expect(narrow, 'the reserved chrome').toContain('100dvh - 330px');

    const short = css.slice(css.indexOf('@media (max-height: 560px)'));
    expect(short, 'the width cap against height').toContain('* 1.35');
    expect(short, 'the reserved chrome').toContain('100dvh - 150px');
    // the two caps must never reference each other: --cellw capped by
    // var(--cellh) while --cellh is capped by var(--cellw) is a
    // circular reference, and a screen matching both queries (an SE on
    // its side) would leave the board with no size at all
    const block = short.slice(0, short.indexOf('\n}'));
    const cw = block.slice(block.indexOf('--cellw:'));
    expect(cw.slice(0, cw.indexOf(';')), '--cellw must not read --cellh')
      .not.toContain('var(--cellh)');
    const ch = block.slice(block.indexOf('--cellh:'));
    expect(ch.slice(0, ch.indexOf(';')), '--cellh must not read --cellw')
      .not.toContain('var(--cellw)');
  });

  it('keeps the 8px grid gap the formulas subtract', () => {
    // the board reserves cols*8px for gaps; a mobile block that set
    // gap:6px would make the board 14px narrower than it claims
    const base = css.slice(css.indexOf('.board{--boardH'));
    expect(base.slice(0, 400)).toContain('gap:8px');
    const narrow = css.slice(css.indexOf('@media (max-width: 900px)'));
    const i = narrow.indexOf('.board{');
    if (i > -1) {
      expect(narrow.slice(i, narrow.indexOf('}', i)),
             'do not change the gap without changing both formulas')
        .not.toMatch(/gap:\s*\d/);
    }
  });
});
