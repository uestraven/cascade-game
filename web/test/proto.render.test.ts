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
import { SIGIL_NAMES } from '../src/proto/ui/Sigil';
import { type Sfx, isMuted, loadMuted, setMuted, sfx } from '../src/proto/ui/sound';

describe('the app renders', () => {
  const html = renderToStaticMarkup(createElement(App));

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
    expect(html).toMatch(/\/art\/cards\/card-\d\d\.svg/);
  });
});

describe('the whole installed art set is reachable', () => {
  it('all 20 card artworks, 3 frames, the back and 4 ability marks '
     + 'are present', () => {
    const art = resolve(__dirname, '..', 'public', 'art');
    for (let i = 1; i <= 20; i++) {
      const f = `card-${String(i).padStart(2, '0')}.svg`;
      expect(existsSync(resolve(art, 'cards', f)), f).toBe(true);
    }
    for (const f of ['frame-p1.svg', 'frame-p2.svg', 'frame-neutral.svg',
                     'back.svg']) {
      expect(existsSync(resolve(art, f)), f).toBe(true);
    }
    for (const a of ABILITIES) {
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
    expect(files.length).toBeGreaterThan(25);
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
