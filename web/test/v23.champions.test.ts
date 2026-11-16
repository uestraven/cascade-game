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
 * The `background:#rrggbb` that a selector ends up with.
 *
 * Searches every rule with that exact selector and takes the last one
 * to set a flat background, because the cascade does: `.bcard.p1`
 * appears twice, once for its border and once, later, for its body.
 */
function bodyColour(selector: string) {
  let from = 0, found: string | null = null, seen = 0;
  for (;;) {
    const i = css.indexOf(selector + '{', from);
    if (i === -1) break;
    seen++;
    from = i + 1;
    const m = css.slice(i, css.indexOf('}', i))
      .match(/background:\s*(#[0-9a-fA-F]{6})/);
    if (m) found = m[1];
  }
  expect(seen, `${selector} should exist`).toBeGreaterThan(0);
  expect(found, `${selector} should set a flat background`).not.toBeNull();
  return found!;
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

describe('the card body carries ownership, red the darker', () => {
  it('gives the two players different bodies, not just borders', () => {
    const p1 = bodyColour('.bcard.p1');
    const p2 = bodyColour('.bcard.p2');
    expect(p1, 'the two must differ at all').not.toBe(p2);
    // red darker, as asked
    expect(Lstar(p2), `p2 ${p2} must be darker than p1 ${p1}`)
      .toBeLessThan(Lstar(p1));
    // and far enough apart to read across a table, not just in a diff
    expect(Lstar(p1) - Lstar(p2),
           `dL* ${(Lstar(p1) - Lstar(p2)).toFixed(1)} is too subtle`)
      .toBeGreaterThan(6);
  });

  it('keeps every on-card text colour legible on both bodies', () => {
    // darkening a card is worthless if it costs the ability text
    for (const bg of [bodyColour('.bcard.p1'), bodyColour('.bcard.p2'),
                      bodyColour('.bcard.champ')]) {
      for (const [fg, label] of [['#f4f7fc', 'card name'],
                                 ['#ccd4e2', 'ability one-liner'],
                                 ['#6fd3a8', 'Convergence label'],
                                 ['#ffd84a', 'Dominion label']] as const) {
        expect(contrast(bg, fg), `${label} on ${bg}`)
          .toBeGreaterThan(4.5);
      }
    }
  });
});

describe('a Champion is darker than either player\'s cards', () => {
  it('measurably, for both players', () => {
    const champ = bodyColour('.bcard.champ');
    for (const sel of ['.bcard.p1', '.bcard.p2']) {
      expect(Lstar(champ), `${champ} vs ${sel}`)
        .toBeLessThan(Lstar(bodyColour(sel)));
    }
  });

  it('does not rest on darkness alone, which has no room for red', () => {
    // P2's body is already near black, so a P2 Champion can only be a
    // few L* darker. The portrait scrim, the rim and the sparkle carry
    // it; this asserts those exist rather than trusting the tint.
    const champ = bodyColour('.bcard.champ');
    const gap = Lstar(bodyColour('.bcard.p2')) - Lstar(champ);
    expect(gap, 'the red gap really is small').toBeLessThan(6);
    // so the other three cues must be present
    expect(css, 'a scrim over the portrait')
      .toContain('.bcard.champ .bc-portrait::before');
    expect(css, 'a gold rim').toMatch(/\.bcard\.champ\.live::after\{/);
    expect(css, 'and the sparkle').toContain('champtwinkle');
  });

  it('puts the rim on the card, where it is not painted over', () => {
    // the regression: `inset` box-shadow on .cell, covered entirely by
    // .bcard at inset:0
    expect(rule('.bcard.champ.live::after')).toContain('inset 0 0 0 2px');
    // the overlay sits above every row background
    const base = rule('.bcard.champ::after');
    expect(base).toMatch(/z-index:[6-9]/);
    expect(base).toContain('pointer-events:none');
  });

  it('never takes box-shadow on .bcard itself', () => {
    // `.v23 .cell.commandable .bcard` owns that property at the same
    // specificity, and whichever came last would silently eat the
    // other. Seeing that a card is commandable matters more.
    expect(css).toContain('.v23 .cell.commandable .bcard');
    for (const sel of ['.bcard.champ{', '.bcard.champ.live{',
                       '.bcard.champ.spent{']) {
      const i = css.indexOf(sel);
      if (i === -1) continue;
      expect(css.slice(i, css.indexOf('}', i)), `${sel} box-shadow`)
        .not.toContain('box-shadow');
    }
  });
});

describe('the sparkle', () => {
  it('runs only while the protection is live', () => {
    // a Champion whose protection has expired is still a Champion --
    // permanent information -- but it stops being lit
    expect(rule('.bcard.champ.live::after'), 'live must animate')
      .toContain('animation:champtwinkle');
    expect(rule('.bcard.champ.spent::after'), 'spent must not animate')
      .not.toContain('animation');
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
