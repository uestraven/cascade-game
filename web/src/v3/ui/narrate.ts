/**
 * Turns a resolution into sentences a player can read.
 *
 * The log used to say "captured 2", which tells you the score changed but
 * not why. Every line here names the actual matchup, so a new player can
 * learn the wheel from watching the game rather than from the table.
 */

import { NAMES, ORDER, type CaptureEvent } from '../engine';
import { ABILITIES, type AbilityId, type Option } from '../game';

const SIDE = ['up', 'right', 'down', 'left'];

export interface Line {
  text: string;
  kind: 'place' | 'capture' | 'chain' | 'ability' | 'result';
  cells?: number[];
}

/** "Fire beat Ice, taking cell 1" */
export const captureLine = (e: CaptureEvent): Line => ({
  kind: e.wave === 0 ? 'capture' : 'chain',
  cells: [e.target],
  text: `${NAMES[e.attacker]} beat ${NAMES[e.defender]} ${SIDE[e.side]}` +
        ` from ${e.src} — took cell ${e.target}`,
});

export function optionLine(ability: AbilityId, opt: Option): Line | null {
  if (!opt) return null;
  const name = ability.toUpperCase();
  const where = 'cell' in opt ? ` on cell ${opt.cell}` : '';
  return {
    kind: 'ability',
    cells: 'cell' in opt ? [opt.cell] : undefined,
    text: `${name}${where} — ${ABILITIES[ability].text}`,
  };
}

export function narrate(
  who: string, cell: number, cardName: string, spin: number,
  events: CaptureEvent[], ability: AbilityId | null, opt: Option,
): Line[] {
  const out: Line[] = [];
  const turned = spin ? ` turned ${spin * 90}°` : ' as drawn';
  out.push({
    kind: 'place',
    cells: [cell],
    text: `${who} placed ${cardName}${turned} on cell ${cell}`,
  });
  if (ability && opt) {
    const l = optionLine(ability, opt);
    if (l) out.push(l);
  }
  const waves = new Map<number, CaptureEvent[]>();
  for (const e of events) {
    if (!waves.has(e.wave)) waves.set(e.wave, []);
    waves.get(e.wave)!.push(e);
  }
  for (const [w, list] of [...waves.entries()].sort((a, b) => a[0] - b[0])) {
    if (w > 0) {
      out.push({
        kind: 'chain',
        cells: list.map((e) => e.target),
        text: `the chain spreads — wave ${w + 1}`,
      });
    }
    for (const e of list) out.push(captureLine(e));
  }
  if (!events.length) {
    out.push({ kind: 'result', text: 'nothing was taken' });
  }
  return out;
}


export const turnLabel = (turn: number, mySeat: number): string => {
  if (turn >= ORDER.length) return 'game over';
  const mine = ORDER[turn] === mySeat;
  return `turn ${turn + 1} of ${ORDER.length} — ${mine ? 'yours' : 'the bot'}`;
};
