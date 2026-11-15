import { describe, expect, it } from 'vitest';
import { type V23State, CELLS, NB, alliesAdjacent, apply, captureBlocked,
  cellOf, deployments, dominionCommands, isOver, mustPass, newGame,
} from '../src/v23/rules';

/** Recompute protection from first principles, independently of rules.ts */
function trueAllies(g: V23State, id: string): number {
  const cell = g.cells.indexOf(id);
  if (cell < 0) return -1;
  const me = g.owner[id];
  let n = 0;
  for (const t of NB[cell]) {
    if (t < 0) continue;
    const o = g.cells[t];
    if (o && g.owner[o] === me) n++;
  }
  return n;
}

function audit(g: V23State, trail: string[]): void {
  // board integrity: no card in two cells, no card on the board twice
  const seen = new Map<string, number>();
  for (let i = 0; i < CELLS; i++) {
    const id = g.cells[i];
    if (!id) continue;
    expect(seen.has(id), `${id} appears twice: ${trail.join(' | ')}`)
      .toBe(false);
    seen.set(id, i);
  }
  for (const [id, cell] of seen) {
    expect(cellOf(g, id), `cellOf disagrees for ${id}`).toBe(cell);
    // the invariant the designer reported broken
    const real = trueAllies(g, id);
    const engine = alliesAdjacent(g, id);
    expect(engine, `ally count wrong for ${id}: ${trail.join(' | ')}`)
      .toBe(real);
    if (g.defs[id].trait === 'sanctuary' && g.phase === 'convergence') {
      const blocked = !!captureBlocked(g, id);
      const shouldBlock = real >= 2
        || g.champions[g.owner[id]].includes(id);
      expect(blocked,
why(id, real, blocked, shouldBlock, trail)).toBe(shouldBlock);
    }
  }
}
const why = (id: string, real: number, got: boolean, want: boolean,
             trail: string[]) =>
  `Sanctuary on ${id}: ${real} live allies, protected=${got}, `
  + `expected=${want}\n  ${trail.slice(-6).join('\n  ')}`;

describe('hunting the Sanctuary report', () => {
  for (const champs of [0, 2] as const) {
    it(`protection always matches the live ally count (champions=${champs})`,
       () => {
      for (let seed = 0; seed < 120; seed++) {
        let g = newGame(seed, { boundChampions: champs });
        const trail: string[] = [];
        let guard = 0;
        while (!isOver(g) && guard++ < 300) {
          audit(g, trail);
          if (g.pending) {
            const o = g.pending.options;
            const pick = o[(seed + guard) % o.length];
            const useSkip = g.pending.optional && (seed + guard) % 4 === 0;
            trail.push(useSkip ? `skip ${g.pending.kind}`
              : `${g.pending.kind}: ${pick.label}`);
            g = apply(g, useSkip ? { kind: 'skip' }
              : { kind: 'choose', option: pick.id });
          } else if (g.phase === 'convergence') {
            const d = deployments(g);
            const m = d[(seed * 7 + guard * 13) % d.length];
            trail.push(`deploy ${g.defs[m.card].name} -> ${m.cell}`);
            g = apply(g, { kind: 'deploy', ...m });
          } else if (mustPass(g)) {
            trail.push('pass');
            g = apply(g, { kind: 'pass' });
          } else {
            const c = dominionCommands(g);
            const k = c[(seed + guard) % c.length];
            trail.push(`command ${k.kind} @${k.cell}`);
            g = apply(g, { kind: 'command', cmd: k });
          }
        }
        audit(g, trail);
      }
    });
  }
});
