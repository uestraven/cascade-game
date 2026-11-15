/**
 * Sigil identity: colour, medallion, and independence from everything
 * else the interface colours.
 *
 * The rule being protected: a sigil's colour means exactly one thing —
 * which symbol it is. It must not move with ownership, with the
 * character carrying it, or with the phase, and it must not dim when a
 * Convergence trait expires, because matching still decides captures in
 * Dominion.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SIGIL_NAMES, SIGIL_PALETTE, sigilColor } from '../src/proto/ui/Sigil';
import { BattleCard } from '../src/v23/BattleCard';
import {
  type V23State, apply, deployments, newGame,
} from '../src/v23/rules';

const css = readFileSync(
  resolve(__dirname, '..', 'src', 'proto', 'ui', 'styles.css'), 'utf8');

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = (r: number, g: number, b: number) =>
  0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const hex = (h: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as
    [number, number, number];
const ratio = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function full(): V23State {
  let g = newGame(5);
  let k = 0;
  while (g.phase === 'convergence' && k++ < 200) {
    g = g.pending ? apply(g, { kind: 'skip' })
      : apply(g, { kind: 'deploy', ...deployments(g)[0] });
  }
  return g;
}

describe('the arcane palette', () => {
  it('assigns one permanent colour per symbol', () => {
    expect(Object.keys(SIGIL_PALETTE).sort())
      .toEqual([...SIGIL_NAMES].sort());
    const colours = SIGIL_NAMES.map((n) => SIGIL_PALETTE[n].color);
    expect(new Set(colours).size, 'all four differ').toBe(4);
    for (const c of colours) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    // the specified values
    expect(SIGIL_PALETTE.gyre.color).toBe('#C9AAFF');   // Fleur-de-lis
    expect(SIGIL_PALETTE.crux.color).toBe('#F1D79E');   // Cross Potent
    expect(SIGIL_PALETTE.halo.color).toBe('#7BD8B5');   // Ouroboros
    expect(SIGIL_PALETTE.ward.color).toBe('#99CEFF');   // Crystal
  });

  it('never collides with ownership, trait or command colouring', () => {
    // p1 blue, p2 orange, trait green, command gold
    const reserved = ['#4a9eff', '#ff7043', '#6fd3a8', '#ffd84a'];
    for (const n of SIGIL_NAMES) {
      const c = SIGIL_PALETTE[n].color.toLowerCase();
      expect(reserved, `${n} must not reuse a system colour`)
        .not.toContain(c);
    }
  });

  it('clears 4.5:1 on the medallion even under a white blowout', () => {
    // 94% of #0D1424 over the brightest possible pixel behind it
    const disc = hex('#0D1424');
    const eff = disc.map((v) => 0.94 * v + 0.06 * 255) as
      [number, number, number];
    const bg = lum(...eff);
    for (const n of SIGIL_NAMES) {
      const r = ratio(lum(...hex(SIGIL_PALETTE[n].color)), bg);
      expect(r, `${n} on a blown-out portrait`).toBeGreaterThan(4.5);
    }
  });

  it('documents that two pairs need silhouette, not colour, in '
     + 'greyscale', () => {
    // Ouroboros and Crystal are 1.5% apart in luminance: the shapes
    // must carry that distinction, which is why the shape description
    // is part of the palette
    const l = (n: typeof SIGIL_NAMES[number]) =>
      lum(...hex(SIGIL_PALETTE[n].color));
    expect(Math.abs(l('halo') - l('ward')) * 100).toBeLessThan(8);
    for (const n of SIGIL_NAMES) {
      expect(SIGIL_PALETTE[n].shape.length, `${n} shape described`)
        .toBeGreaterThan(8);
    }
  });
});

describe('the medallion guarantees its own contrast', () => {
  it('is 94% opaque, rimmed, and shadowed', () => {
    const block = css.slice(css.indexOf('.bc-sigil{'),
                            css.indexOf('.bc-sigil > .sigil{'));
    expect(block, 'near-opaque disc').toContain('rgba(13,20,36,.94)');
    expect(block, '1px rim').toContain('0 0 0 1px #8995AD');
    expect(block, 'outer shadow').toContain('0 2px 3px rgba(0,0,0,.65)');
  });

  it('sits the glyph inside the specified 75-80% band', () => {
    const g = css.slice(css.indexOf('.bc-sigil > .sigil{'));
    const m = /width:(\d+)%/.exec(g.slice(0, 80));
    expect(m, 'glyph width is set').toBeTruthy();
    const pct = Number(m![1]);
    expect(pct).toBeGreaterThanOrEqual(75);
    expect(pct).toBeLessThanOrEqual(80);
  });

  it('has no animation on the sigils', () => {
    const block = css.slice(css.indexOf('.bc-sigil{'),
                            css.indexOf('.bc-sigil.n{'));
    expect(block).not.toContain('animation');
    expect(block).not.toContain('transition');
  });
});

describe('sigil colour is independent of game state', () => {
  it('the same symbol renders the same colour on both players\' cards',
     () => {
    const g = full();
    const seen = new Map<number, Set<string>>();
    for (const id of g.cells) {
      if (!id) continue;
      const html = renderToStaticMarkup(createElement(
        BattleCard, { g, id, owner: g.owner[id] }));
      g.defs[id].sigils.forEach((s) => {
        const c = sigilColor(s);
        expect(html, `sigil ${s} colour present`).toContain(c);
        if (!seen.has(s)) seen.set(s, new Set());
        seen.get(s)!.add(c);
      });
    }
    // every symbol seen resolved to exactly one colour across all owners
    for (const [s, cs] of seen) {
      expect(cs.size, `symbol ${s} must have one colour`).toBe(1);
    }
    expect(seen.size, 'several symbols appeared').toBeGreaterThan(2);
  });

  it('does not change when the phase moves to Dominion', () => {
    const g = full();
    const id = g.cells.find(Boolean)!;
    const conv = renderToStaticMarkup(createElement(
      BattleCard, { g, id, owner: g.owner[id] }));
    const dom = renderToStaticMarkup(createElement(
      BattleCard, { g: { ...g, phase: 'dominion' }, id,
                    owner: g.owner[id] }));
    for (const s of g.defs[id].sigils) {
      const c = sigilColor(s);
      expect(conv, `${c} in Convergence`).toContain(c);
      expect(dom, `${c} still in Dominion`).toContain(c);
    }
    // and the socket itself is not dimmed with the expired trait
    expect(css.slice(css.indexOf('.bc-row.i.expired{'), 200))
      .not.toContain('.bc-sigil');
  });
});
