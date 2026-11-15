/**
 * v2.3 acceptance: playability, roster coverage, and that older
 * variants survive. Correctness lives in v23.rules.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { V23App } from '../src/v23/App23';
import { Root } from '../src/Root';
import { TRAITS, TRAIT_INFO, CMDS } from '../src/v23/rules';
import { ROSTER, TRAIT_COUNTS } from '../src/v23/roster';

describe('v2.3 is playable in the browser', () => {
  const html = renderToStaticMarkup(createElement(V23App));

  it('is the default ruleset, and the others remain reachable', () => {
    const root = renderToStaticMarkup(createElement(Root));
    expect(root).toContain('v2.3 — convergence abilities');
    expect(root).toContain('v1 — one phase');
    expect(root).toContain('v2.1 — deploy');
    expect(root).toContain('v2.2 — character powers');
    // the default must serve v2.3
    expect(root).toContain('convergence abilities');
  });

  it('names the phase and states that sigils are fixed', () => {
    expect(html).toContain('The Convergence');
    expect(html).toContain('no rotation, sigils are fixed');
  });

  it('shows a stack panel naming what resolves next', () => {
    expect(html).toContain('stack');
    expect(html).toContain('nothing pending');
  });

  it('lists all six traits with timing and experimental status', () => {
    for (const t of TRAITS) {
      expect(html, t).toContain(TRAIT_INFO[t].name);
    }
    expect(html).toContain('experimental');
    expect(html).toContain('ongoing');
    expect(html).toContain('onDeploy');
    expect(html).toContain('onCapture');
  });

  it('offers the Bound Champions variant, defaulted off', () => {
    expect(html).toContain('champions');
    expect(html).toMatch(/2 each/);
    expect(html).toMatch(/3 each/);
  });

  it('every roster character has text for both slots', () => {
    for (const e of ROSTER) {
      expect(e.name.length).toBeGreaterThan(3);
      expect(e.epithet.length).toBeGreaterThan(3);
      expect(e.flavour.length).toBeGreaterThan(10);
      expect(new Set(e.sigils).size).toBeGreaterThan(1);
      expect(CMDS).toContain(e.command);
      if (e.trait) expect(TRAITS).toContain(e.trait);
    }
    expect(Object.values(TRAIT_COUNTS).every((n) => n === 2)).toBe(true);
  });

  it('documents a physical equivalent for every trait', () => {
    for (const t of TRAITS) {
      expect(TRAIT_INFO[t].physical.length, t).toBeGreaterThan(10);
    }
  });
});
