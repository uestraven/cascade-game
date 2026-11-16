/**
 * Telling cards apart: ownership, and which characters are Champions.
 *
 * The report was that Champions were hard to distinguish. Two causes,
 * and only the second one is a matter of taste:
 *
 *   1  the gold ring marking a Champion was `box-shadow: inset` on the
 *      CELL, and the battle card is `position:absolute; inset:0` over
 *      that cell's padding box, painted after it. The ring was
 *      completely hidden. Only the small corner badge marked a
 *      Champion at all.
 *
 *   2  both players' cards had the same #0f1117 body, so ownership
 *      rested on a 2px border, a chip and an accent gradient.
 *
 * Colour is asserted in CIE L*, not by eye and not by hex string: this
 * build has already shipped one unmeasured brightness claim that was
 * satisfied by numbers nobody could see apart.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { BattleCard } from '../src/v23/BattleCard';
import { V23App } from '../src/v23/App23';
import {
  type V23State, apply, deployments, isChampion, newGame,
} from '../src/v23/rules';

const dir = resolve(__dirname, '..', 'src');
const css = readFileSync(resolve(dir, 'proto', 'ui', 'styles.css'), 'utf8');
const app = readFileSync(resolve(dir, 'v23', 'App23.tsx'), 'utf8');

// ---- colour, measured --------------------------------------------------
const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
function luminance(hex: string) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** perceptual lightness: a dL* of ~2 is a just-noticeable step */
function Lstar(hex: string) {
  const y = luminance(hex);
  return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y;
}
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/**
 * The declarations of one rule, by exact selector.
 *
 * Needed because `css.indexOf(sel)` followed by a lazy regex will
 * happily match a declaration from a LATER rule: deleting the
 * animation from .bcard.champ.live::after left the first version of
 * the sparkle test passing against an animation two hundred lines
 * down. Bounded at the closing brace.
 */
function rule(selector: string) {
  const i = css.indexOf(selector + '{');
  expect(i, `${selector} should exist`).toBeGreaterThan(-1);
  return css.slice(i + selector.length + 1, css.indexOf('}', i));
}

/**
 * The flat `background:#rrggbb` a selector ends up with, or null.
 *
 * Checks every rule with that exact selector and takes the last one to
 * set one, because the cascade does. Returns null when none do, which
 * is what the "nothing is darkened" block is asserting.
 */
function bodyOverride(selector: string): string | null {
  let from = 0, found: string | null = null;
  for (;;) {
    const i = css.indexOf(selector + '{', from);
    if (i === -1) return found;
    from = i + 1;
    const m = css.slice(i, css.indexOf('}', i))
      .match(/background:\s*(#[0-9a-fA-F]{6})/);
    if (m) found = m[1];
  }
}

/**
 * Every rule whose selector mentions a Champion card.
 *
 * Anchored on the selector text and walked forward to its own `{`,
 * NOT on a preceding `}`: the first version required one, so every
 * rule introduced by a comment -- which is most of them in this file
 * -- was skipped, and a box-shadow added back to the sparkle overlay
 * went unnoticed.
 */
function champRules() {
  const out: { selector: string; body: string }[] = [];
  for (const m of css.matchAll(/\.bcard\.champ[^{};/]*\{/g)) {
    const i = m.index! + m[0].length;
    out.push({ selector: m[0].slice(0, -1).trim(),
               body: css.slice(i, css.indexOf('}', i)) });
  }
  expect(out.length, 'Champion rules should exist').toBeGreaterThan(1);
  return out;
}

/** a game with Champions, and one without */
function champGame(seed = 4): V23State {
  return newGame(seed, { boundChampions: 3 });
}
/** deploy until the named card is on the board */
function deployUntil(g: V23State, want: string): V23State {
  let s = g, n = 0;
  while (s.phase === 'convergence' && n++ < 400) {
    if (s.pending) { s = apply(s, { kind: 'skip' }); continue; }
    if (s.cells.includes(want)) return s;
    const d = deployments(s).find((x) => x.card === want)
      ?? deployments(s)[0];
    s = apply(s, { kind: 'deploy', ...d });
  }
  return s;
}

describe('nothing is darkened', () => {
  it('leaves both players the same card body', () => {
    // An earlier pass darkened P2 relative to P1 (L* 5.0 against 15.5)
    // and darkened Champions below both. The designer rejected it, so
    // this is a guard against reintroducing it, not a preference.
    expect(bodyOverride('.bcard.p1'), 'P1 body must not be re-tinted')
      .toBeNull();
    expect(bodyOverride('.bcard.p2'), 'P2 body must not be re-tinted')
      .toBeNull();
    expect(bodyOverride('.bcard.champ'),
           'a Champion body must not be re-tinted').toBeNull();
    // the shared body is still the only one
    expect(bodyOverride('.bcard')).toBe('#0f1117');
  });

  it('leaves the portrait, the name bar and the ability rows alone',
     () => {
    // the scrim over the portrait was the largest part of the old
    // darkening and the easiest to reach for again
    expect(css, 'no scrim over a Champion portrait')
      .not.toContain('.bcard.champ .bc-portrait::before');
    for (const sel of ['.bcard.champ .bc-name',
                       '.bcard.champ .bc-row.i',
                       '.bcard.champ .bc-row.ii']) {
      expect(css, `${sel} must not exist`).not.toContain(sel);
    }
    // and no filter anywhere in the Champion rules
    for (const sel of champRules()) {
      expect(sel.body, `${sel.selector} must not filter`)
        .not.toMatch(/filter:/);
    }
  });

  it('adds light rather than taking it away', () => {
    // every colour the sparkle introduces is brighter than the card
    // body it sits on, so the card can only get lighter
    const body = luminance('#0f1117');
    const colours = [...css.matchAll(
      /rgba\((\d+),\s*(\d+),\s*(\d+),\s*\.?\d+\)/g)]
      .filter((m) => css.slice(Math.max(0, m.index! - 900), m.index!)
        .includes('.bcard.champ'))
      .map((m) => [+m[1], +m[2], +m[3]] as const);
    expect(colours.length, 'the sparkle has colours')
      .toBeGreaterThanOrEqual(3);
    for (const [r, g, b] of colours) {
      const hex = '#' + [r, g, b]
        .map((v) => v.toString(16).padStart(2, '0')).join('');
      expect(luminance(hex), `rgb(${r},${g},${b}) must be a highlight`)
        .toBeGreaterThan(body);
    }
  });

  it('marks a Champion with the sparkle and nothing structural', () => {
    // no rim either: `.cell.chosen` owns box-shadow at cell level and
    // `.v23 .cell.commandable .bcard` owns it at card level, so a rim
    // would have had to outrank one of them. Selection and
    // commandability matter more than Champion status.
    for (const { selector, body } of champRules()) {
      expect(body, `${selector} must not add a box-shadow`)
        .not.toContain('box-shadow');
    }
    expect(css).toContain('.v23 .cell.commandable .bcard');
  });
});

describe('the sparkle', () => {
  it('runs only while the protection is live', () => {
    // a Champion whose protection has expired is still a Champion --
    // permanent information -- but it stops being lit
    expect(rule('.bcard.champ.live::after'), 'live must animate')
      .toContain('animation:champtwinkle');
    // a Champion whose protection has expired gets no sparkle at all.
    // Every Champion rule is scoped to .live, so there is nothing to
    // switch off -- which is checked rather than assumed, because a
    // bare `.bcard.champ` rule would also catch the spent ones.
    for (const { selector } of champRules()) {
      expect(selector, `${selector} must be scoped to .live`)
        .toContain('.live');
    }
    expect(css, 'and no rule targets the spent state')
      .not.toContain('.bcard.champ.spent');
    expect(css, 'and the glint is live-only')
      .toContain('.bcard.champ.live .bc-portrait::after');
  });

  it('is slight: slow, and not opaque', () => {
    const glint = rule('.bcard.champ.live .bc-portrait::after');
    expect(glint, 'the glint is an animation on that rule')
      .toMatch(/animation:champglint \d/);
    expect(css, 'and the keyframes exist')
      .toContain('@keyframes champglint');
    const secs = Number(glint.match(/animation:champglint (\d\.\d)s/)![1]);
    expect(secs, 'a fast sweep is a strobe, not a sparkle')
      .toBeGreaterThanOrEqual(4);
    // the brightest stop of the sweep stays under full white
    const peak = Math.max(...[...css.matchAll(
      /rgba\(255,\s*255,\s*255,\s*\.(\d+)\)/g)].map((m) =>
      Number(`0.${m[1]}`)));
    expect(peak, 'no full-strength white flash').toBeLessThan(0.6);
  });

  it('stops moving for anyone who has asked it to', () => {
    const q = css.lastIndexOf('@media (prefers-reduced-motion: reduce)');
    expect(q, 'a reduced-motion guard must exist').toBeGreaterThan(-1);
    const block = css.slice(q, css.indexOf('\n}', q));
    expect(block).toContain('.bcard.champ.live::after');
    expect(block).toContain('animation:none');
    // but the Champion is still marked -- motion was the decoration,
    // the rim is the information
    expect(block).toMatch(/opacity:\.?\d/);
  });

  it('scales its specks from the cell, like everything else on the card',
     () => {
    // a px radius would be a speck at 400px and a blob at 84px; this
    // build has shipped three fixed-px bugs inside --cell layouts
    const live = rule('.bcard.champ.live::after');
    const stops = [...live.matchAll(/calc\(var\(--cell\)\*\.\d+\)/g)];
    expect(stops.length, 'every speck radius derives from --cell')
      .toBeGreaterThanOrEqual(6);
    expect(live).not.toMatch(/circle at [^)]*\)[^;]*\b\d+px/);
  });
});

describe('the engine and the card agree on who is a Champion', () => {
  it('marks a designated Champion and nothing else', () => {
    const g = champGame();
    const champs = [...g.champions[0], ...g.champions[1]];
    expect(champs, 'three each').toHaveLength(6);
    // the WHOLE board, so six Champions and six plain cards are on it
    let s = g, n = 0;
    while (s.phase === 'convergence' && n++ < 400) {
      s = s.pending ? apply(s, { kind: 'skip' })
        : apply(s, { kind: 'deploy', ...deployments(s)[0] });
    }
    expect(s.cells.filter(Boolean)).toHaveLength(12);
    let marked = 0, plain = 0;
    for (const id of s.cells) {
      if (!id) continue;
      const html = renderToStaticMarkup(createElement(BattleCard,
        { g: s, id, owner: s.owner[id] }));
      if (isChampion(s, id)) {
        expect(html, `${s.defs[id].name} is a Champion`)
          .toContain('champ');
        marked++;
      } else {
        expect(html, `${s.defs[id].name} is not`).not.toContain('champ');
        plain++;
      }
    }
    expect(marked, 'some Champions were on the board')
      .toBeGreaterThan(0);
    expect(plain, 'and some plain cards, for contrast')
      .toBeGreaterThan(0);
  });

  it('is lit during Convergence and unlit after it', () => {
    const g = champGame();
    const id = g.champions[0][0];
    const conv = deployUntil(g, id);
    expect(conv.phase).toBe('convergence');
    const a = renderToStaticMarkup(createElement(BattleCard,
      { g: conv, id, owner: conv.owner[id] }));
    expect(a, 'protected, so lit').toContain('champ live');

    // play out Convergence; protection expires with the phase
    let dom = conv, n = 0;
    while (dom.phase === 'convergence' && n++ < 400) {
      dom = dom.pending ? apply(dom, { kind: 'skip' })
        : apply(dom, { kind: 'deploy', ...deployments(dom)[0] });
    }
    expect(dom.phase).toBe('dominion');
    const b = renderToStaticMarkup(createElement(BattleCard,
      { g: dom, id, owner: dom.owner[id] }));
    expect(b, 'still a Champion').toContain('champ');
    expect(b, 'but no longer lit').toContain('champ spent');
    expect(b).not.toContain('champ live');
  });

  it('marks no card at all when the variant is off', () => {
    const g = newGame(4, { boundChampions: 0 });
    const s = deployUntil(g, g.hands[0][0]);
    for (const id of s.cells) {
      if (!id) continue;
      expect(isChampion(s, id)).toBe(false);
      const html = renderToStaticMarkup(createElement(BattleCard,
        { g: s, id, owner: s.owner[id] }));
      expect(html).not.toContain('champ');
    }
  });
});

describe('a Champion in hand is a Champion', () => {
  it('is marked before it is deployed', () => {
    // you cannot plan to deploy one into danger on purpose if the hand
    // does not say which they are
    expect(app).toContain("isChampion(game, cid) ? ' champ' : ''");
    expect(app).toContain('handchamp');
    expect(css).toContain('.slot.champ');
    expect(css).toContain('.handchamp');
  });

  it('says what the protection means on the pre-deploy panel', () => {
    expect(app).toContain('peekchamp');
    expect(app).toContain('cannot be captured during Convergence');
    expect(app).toContain('protection has expired');
    expect(css).toContain('.peekchamp');
  });

  it('renders no champion marker in a game without the variant', () => {
    // V23App starts with boundChampions: 0
    const html = renderToStaticMarkup(createElement(V23App));
    expect(html).not.toContain('handchamp');
    expect(html).not.toContain('slot champ');
  });
});
