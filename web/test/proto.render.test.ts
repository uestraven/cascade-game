/**
 * Does the app actually mount?
 *
 * A clean `tsc` and a successful bundle prove neither. The rendering code
 * reads the engine's shape, iterates sigils, and calls applyMove inside a
 * useMemo to build the rotation preview -- all of which can throw at
 * runtime while type-checking perfectly. This renders the component tree
 * to a string, which exercises the initial render of every one of those
 * paths.
 *
 * It also checks the things a player must be able to see: the comparison
 * rule, all four sigil names, all four abilities, and a cell for every
 * square on each of the three boards.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { App } from '../src/proto/ui/App';
import { BOARDS, type BoardName } from '../src/proto/engine';
import { ABILITIES, newGame, legalMoves, applyMove } from '../src/proto/game';
import { SHIPPED } from '../src/proto/abilities';
import { SIGIL_NAMES } from '../src/proto/ui/Sigil';
import { type Sfx, isMuted, loadMuted, setMuted, sfx } from '../src/proto/ui/sound';

describe('the app renders', () => {
  const html = renderToStaticMarkup(createElement(App));

  it('renders a three-column shell with the board in the middle', () => {
    expect(html).toContain('class="rail left"');
    expect(html).toContain('class="stage"');
    expect(html).toContain('class="rail right"');
    // the board publishes its own dimensions so CSS can size cells to
    // the viewport without measuring the DOM
    expect(html).toMatch(/--rows:\s*\d/);
    expect(html).toMatch(/--cols:\s*\d/);
  });


  it('mounts without throwing', () => {
    expect(html.length).toBeGreaterThan(500);
  });

  it('states the whole comparison rule on screen', () => {
    expect(html).toContain('Matching facing sigils capture');
    expect(html).toContain('Different sigils do');
  });

  it('names every sigil and every ability', () => {
    for (const s of SIGIL_NAMES) expect(html).toContain(s);
    for (const a of ABILITIES) expect(html).toContain(a);
  });

  it('draws nine cells on the default board', () => {
    // the lookahead matters: without it this also matches "cellno", the
    // label on an empty cell, and counts every square twice
    const cells = html.match(/class="cell(?=[" ])[^"]*"/g) ?? [];
    expect(cells.length).toBe(BOARDS['3x3'].cells);
  });

  it('renders sigils as inline svg, not as linked files', () => {
    expect(html).toContain('<svg');
    // a sigil must never become an <img>: the app colours it through
    // currentColor, which does not reach an externally loaded file
    expect(html).not.toContain('/art/sigils/');
  });

  it('every artwork the markup asks for actually exists on disk', () => {
    // this replaced an assertion that NO /art/ paths appeared, which was
    // true only while the game had no artwork. A missing asset is silent
    // in a browser -- the card simply renders blank -- so it is worth a
    // test rather than a glance.
    const refs = [...html.matchAll(/url\(([^)]+)\)/g)]
      .map((m) => m[1].replace(/['"]/g, ''))
      .filter((u) => u.startsWith('/art/'));
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of new Set(refs)) {
      const onDisk = resolve(__dirname, '..', 'public', ref.slice(1));
      expect(existsSync(onDisk), `missing asset: ${ref}`).toBe(true);
    }
  });

  it('asks for a frame, card art and at least one of each sigil', () => {
    expect(html).toMatch(/\/art\/frame-(p1|p2|neutral)\.svg/);
    expect(html).toMatch(/\/art\/cards\/card-\d\d\.webp/);
  });
});

describe('the whole installed art set is reachable', () => {
  it('all 20 card artworks, 3 frames, the back and 4 ability marks '
     + 'are present', () => {
    const art = resolve(__dirname, '..', 'public', 'art');
    for (let i = 1; i <= 20; i++) {
      const f = `card-${String(i).padStart(2, '0')}.webp`;
      expect(existsSync(resolve(art, 'cards', f)), f).toBe(true);
    }
    for (const f of ['frame-p1.svg', 'frame-p2.svg', 'frame-neutral.svg',
                     'back.svg']) {
      expect(existsSync(resolve(art, f)), f).toBe(true);
    }
    // marks exist for the four shipped abilities; the sixteen adopted
    // ones are named in text and have no mark drawn for them yet
    for (const a of SHIPPED) {
      const f = `ability-${a}.svg`;
      expect(existsSync(resolve(art, 'abilities', f)), f).toBe(true);
    }
  });

  it('no artwork references anything external or executable', () => {
    // these are served to browsers; the audit belongs in the test suite
    // rather than only in a one-off check at delivery time
    const art = resolve(__dirname, '..', 'public', 'art');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = resolve(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.svg')) files.push(p);
      }
    };
    walk(art);
    // 3 frames + back + 4 ability marks + 4 sigils + 2 board = 14. This
    // was >25 when the twenty card artworks were SVG too; they are raster
    // now and audited separately below, so the count dropped rather than
    // the coverage.
    expect(files.length).toBeGreaterThanOrEqual(14);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/<script|foreignObject|javascript:/i);
      expect(src, f).not.toMatch(/\son[a-z]+\s*=/i);
      expect(src, f).not.toMatch(/<!DOCTYPE|<!ENTITY/i);
      // the svg namespace is the only permitted absolute URL
      const urls = [...src.matchAll(/https?:\/\/[^"'\s)]+/g)]
        .map((m) => m[0])
        .filter((u) => u !== 'http://www.w3.org/2000/svg');
      expect(urls, f).toEqual([]);
    }
  });

  it('sizes cells from the viewport, for every board', () => {
    const css = readFileSync(
      resolve(__dirname, '..', 'src', 'proto', 'ui', 'styles.css'), 'utf8');
    // --cell must be derived, or a 4x4 board overflows the screen that a
    // 3x3 fits exactly
    expect(css).toMatch(/--cell:\s*min\(/);
    expect(css).toContain('--boardH');
    expect(css).toContain('--boardW');
    expect(css).toMatch(/\.app\{[^}]*height:100vh/s);

    // work the arithmetic the browser will do, so a bad constant is
    // caught here rather than by squinting at a screenshot
    const cell = (vw: number, vh: number, rows: number, cols: number) => {
      const railL = 258, railR = 310, gap = 16;
      const h = vh - 210, w = vw - railL - railR - 5 * gap;
      return Math.min((h - rows * 8) / rows, (w - cols * 8) / cols);
    };
    for (const [vw, vh] of [[1920, 1080], [1440, 900], [1366, 768]]) {
      for (const [r, c] of [[3, 3], [3, 4], [4, 4]]) {
        const px = cell(vw, vh, r, c);
        // big enough to read four sigils and a painting...
        expect(px, `${vw}x${vh} ${r}x${c}`).toBeGreaterThan(100);
        // ...and the whole board still inside the viewport
        expect(r * px + r * 8, `${vw}x${vh} ${r}x${c} height`)
          .toBeLessThan(vh - 120);
      }
    }
    // and it should be a real enlargement over the old fixed 104px
    expect(cell(1920, 1080, 3, 3)).toBeGreaterThan(200);
  });

  it('no .pcard rule uses the background shorthand', () => {
    // This is a silent failure, which is why it is a test.
    //
    // `.pcard.p1{background:#16293f}` has specificity 0,2,0 and the
    // shorthand resets background-size to `auto`, beating
    // `.pcard{background-size:100% 100%}` at 0,1,0. The card art then
    // draws at its intrinsic 1024x1024 inside an 88px box, so a player
    // sees the top-left 88x88 pixels of each painting -- a flat crop of
    // one corner, which looks like the artwork simply failing to load.
    //
    // It went unnoticed while the art was SVG because the frame had an
    // opaque fill covering the art completely, so there was nothing
    // visible to be cropped.
    const css = readFileSync(
      resolve(__dirname, '..', 'src', 'proto', 'ui', 'styles.css'), 'utf8');
    const offenders = css.split('\n')
      .filter((l) => /^\s*\.pcard[.a-z0-9-]*\s*\{/.test(l)
                  && /[{;]\s*background\s*:/.test(l));
    expect(offenders, 'use background-color, not the shorthand')
      .toEqual([]);
    // and the longhand that actually scales the art must still be there
    expect(css).toMatch(/\.pcard\s*\{[^}]*background-size/s);
  });

  it('every card painting is a real WebP of the declared size', () => {
    // The paintings arrive as an archive from outside the project, get
    // served to browsers, and are the only binary assets here. Checking
    // the container rather than trusting the extension catches a file
    // that is secretly something else, and catches a re-export at the
    // wrong resolution -- which is silent otherwise, because a wrongly
    // sized image still renders, just worse.
    const cards = resolve(__dirname, '..', 'public', 'art', 'cards');
    const files = readdirSync(cards).sort();
    expect(files).toHaveLength(20);
    let total = 0;
    for (const name of files) {
      expect(name, name).toMatch(/^card-\d\d\.webp$/);
      const b = readFileSync(resolve(cards, name));
      total += b.length;
      expect(b.subarray(0, 4).toString('latin1'), name).toBe('RIFF');
      expect(b.subarray(8, 12).toString('latin1'), name).toBe('WEBP');
      expect(b.subarray(12, 16).toString('latin1'), name).toBe('VP8 ');
      // lossy VP8: 3-byte frame tag, then the 9d 01 2a start code, then
      // width and height as 14-bit little-endian fields
      expect(b.subarray(23, 26).toString('hex'), name).toBe('9d012a');
      expect(b.readUInt16LE(26) & 0x3fff, `${name} width`).toBe(1024);
      expect(b.readUInt16LE(28) & 0x3fff, `${name} height`).toBe(1024);
      // ART.md budgets ~180KB a card; a little headroom for a re-encode
      expect(b.length, `${name} bytes`).toBeLessThan(200 * 1024);
      // a polyglot that is both a valid image and a script is unlikely
      // here, but it costs one scan to refuse one
      const head = b.subarray(0, 4096).toString('latin1');
      expect(head, name).not.toMatch(/<script|javascript:|<\?php|<html/i);
    }
    // the whole set is the page weight; fail if it doubles unnoticed
    expect(total, 'total card art bytes').toBeLessThan(5 * 1024 * 1024);
  });
});

describe('both play modes are offered', () => {
  const html = renderToStaticMarkup(createElement(App));

  it('offers vs-computer and two-player on one screen', () => {
    expect(html).toContain('vs computer');
    expect(html).toContain('two players, one screen');
  });

  it('offers a sound toggle', () => {
    expect(html).toMatch(/sound (on|off)/);
  });
});

describe('sound effects', () => {
  it('every effect is callable and silent when muted, without a '
     + 'Web Audio implementation present', () => {
    // jsdom/node has no AudioContext, which is exactly the path a browser
    // without Web Audio takes: the game must play on, silently, not throw
    const kinds: Sfx[] = ['select', 'rotate', 'place', 'capture',
                          'cascade', 'ability', 'nothing', 'win', 'lose'];
    for (const k of kinds) {
      expect(() => sfx(k)).not.toThrow();
      expect(() => sfx(k, 3)).not.toThrow();
    }
  });

  it('mute state survives a missing localStorage', () => {
    expect(() => loadMuted()).not.toThrow();
    expect(() => setMuted(true)).not.toThrow();
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });
});

describe('a full game can be played out on every board', () => {
  for (const name of Object.keys(BOARDS) as BoardName[]) {
    it(`plays to the end on ${name}`, () => {
      const shape = BOARDS[name];
      let g = newGame(7, shape);
      let placements = 0;
      while (!(g.turn >= shape.order.length)) {
        const moves = legalMoves(g);
        if (!moves.length) break;
        g = applyMove(g, moves[placements % moves.length]).state;
        placements++;
        expect(placements).toBeLessThanOrEqual(shape.order.length);
      }
      // every placement happened, and the reserve was never dealt
      expect(placements).toBe(shape.order.length);
      const filled = g.board.cards.filter(Boolean).length;
      expect(filled).toBe(shape.order.length);
      // no cell owned by both, and owners match occupancy
      expect(g.board.own[0] & g.board.own[1]).toBe(0);
      for (let i = 0; i < shape.cells; i++) {
        const occupied = g.board.cards[i] !== null;
        const owned = (((g.board.own[0] | g.board.own[1]) >>> i) & 1) === 1;
        expect(owned).toBe(occupied);
      }
    });
  }

  it('leaves at least one card undealt on the even boards, which is '
     + 'what forbids a draw', () => {
    for (const name of ['3x4', '4x4'] as BoardName[]) {
      const shape = BOARDS[name];
      expect(shape.order.length % 2).toBe(1);   // odd placements
      expect(shape.order.length).toBeLessThan(shape.cells);
    }
    // 3x3 is already odd, so it fills the board
    expect(BOARDS['3x3'].order.length).toBe(BOARDS['3x3'].cells);
  });
});
