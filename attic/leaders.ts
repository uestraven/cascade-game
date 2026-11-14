/**
 * Leaders: one chosen before the game, used once, free (it does not cost
 * your placement, so the board still fills and draws stay impossible).
 *
 * Four different SHAPES rather than four variations on one idea:
 *
 *   PRINCE    mass swing      every card you control attacks again, now
 *   TANTALUS  comeback valve  the same, but only while you are behind
 *   LOVER     setup payoff    only if you have three cards sharing an
 *                             element; then all of them attack
 *   LETO      rule pivot      from now on your cascades may start from any
 *                             card you control
 *
 * Measured, holder win rate with seats swapped against a 50.3% neutral:
 *
 *                      unbarred        barred from the final turn
 *   PRINCE             +15.1           +4.2   (fires 10% of games)
 *   TANTALUS           +18.0           +3.8   (fires  9%)
 *   LOVER               +0.8           +1.0   (fires  3%)
 *   LETO                +4.6           +4.6   (always fires, turn 1-2)
 *
 * Unbarred, three of the four detonate on turn 9 in ~78% of games: the
 * board fills monotonically, so later is always better and timing is not
 * really a choice. Barring the last turn balances them but the bot then
 * mostly declines to use them at all -- balance by absence. Both versions
 * ship behind a toggle because this is the layer where the bots have been
 * least useful and a table will read it better than another sweep.
 */

import {
  ELEMENTS, NB, NCELLS, OPPSIDE, ORDER, type Board, type CaptureEvent,
  beats, popcount,
} from './engine';

export type LeaderId = 'PRINCE' | 'TANTALUS' | 'LOVER' | 'LETO';

export const LEADER_IDS: readonly LeaderId[] =
  ['PRINCE', 'TANTALUS', 'LOVER', 'LETO'];

export interface LeaderDef {
  shape: string;
  text: string;
  /** when it may be used, in plain words */
  condition: string;
  measured: string;
}

export const LEADERS: Record<LeaderId, LeaderDef> = {
  PRINCE: {
    shape: 'mass swing',
    text: 'Every card you control attacks its neighbours again, right now.',
    condition: 'any time you control at least one card',
    measured: '+15.1 unbarred · +4.2 barred',
  },
  TANTALUS: {
    shape: 'comeback valve',
    text: 'Every card you control attacks its neighbours again, right now.',
    condition: 'only while you control fewer cells than your opponent',
    measured: '+18.0 unbarred · +3.8 barred',
  },
  LOVER: {
    shape: 'setup payoff',
    text: 'Every card you control showing your chosen element attacks its neighbours.',
    condition: 'only if three or more of your cards share an element',
    measured: '+0.8 unbarred · fires in 3% of games',
  },
  LETO: {
    shape: 'rule pivot',
    text: 'From now on, your cascades may start from any card you control — not only the card you just placed.',
    condition: 'any time',
    measured: '+4.6 · always used, almost always on turn 1–2',
  },
};

/** Largest group of cells you control that all show the same element. */
export function bestCluster(b: Board, player: number):
    { element: number; mask: number; size: number } {
  let best = { element: 0, mask: 0, size: 0 };
  for (const e of ELEMENTS) {
    let mask = 0;
    for (let i = 0; i < NCELLS; i++) {
      const c = b.cards[i];
      if (((b.own[player] >>> i) & 1) && c && c.includes(e)) mask |= 1 << i;
    }
    const size = popcount(mask);
    if (size > best.size) best = { element: e, mask, size };
  }
  return best;
}

export function canFire(
  id: LeaderId, b: Board, player: number, turn: number, barFinal: boolean,
): boolean {
  if (barFinal && turn === ORDER.length - 1) return false;
  switch (id) {
    case 'PRINCE':
      return popcount(b.own[player]) > 0;
    case 'TANTALUS':
      return popcount(b.own[player]) < popcount(b.own[1 - player]);
    case 'LOVER':
      return bestCluster(b, player).size >= 3;
    case 'LETO':
      return true;
  }
}

/** Why you can't use it yet, for the UI. */
export function blockedReason(
  id: LeaderId, b: Board, player: number, turn: number, barFinal: boolean,
): string | null {
  if (barFinal && turn === ORDER.length - 1) {
    return 'not on your final placement';
  }
  if (id === 'TANTALUS' &&
      popcount(b.own[player]) >= popcount(b.own[1 - player])) {
    return 'only while you are behind';
  }
  if (id === 'LOVER') {
    const c = bestCluster(b, player);
    if (c.size < 3) return `need 3 cards sharing an element (best: ${c.size})`;
  }
  if (id === 'PRINCE' && popcount(b.own[player]) === 0) {
    return 'you control no cards yet';
  }
  return null;
}

/** One outward wave from every cell in `mask`, all captures to `player`. */
export function waveFrom(b: Board, mask: number, player: number,
                         trace?: CaptureEvent[]): number[] {
  const opp = 1 - player;
  let newly = 0;
  for (let src = 0; src < NCELLS; src++) {
    if (((mask >>> src) & 1) === 0) continue;
    const sc = b.cards[src];
    if (!sc) continue;
    for (let d = 0; d < 4; d++) {
      const t = NB[src][d];
      if (t < 0) continue;
      const tc = b.cards[t];
      if (!tc || ((b.own[opp] >>> t) & 1) === 0) continue;
      if (beats(sc[d], tc[OPPSIDE[d]])) {
        if (((newly >>> t) & 1) === 0 && trace) {
          trace.push({ wave: 0, src, target: t,
                       attacker: sc[d], defender: tc[OPPSIDE[d]], side: d });
        }
        newly |= 1 << t;
      }
    }
  }
  if (!newly) return [];
  b.own[player] |= newly;
  b.own[opp] &= ~newly;
  return [newly];
}

export interface LeaderResult {
  captured: number;
  waves: number[];
  /** Leto only: the cascade-origin pivot is now unlocked. */
  pivot: boolean;
}

/** Mutates `b`. The caller owns cloning. */
export function fireLeader(id: LeaderId, b: Board, player: number,
                           trace?: CaptureEvent[]): LeaderResult {
  switch (id) {
    case 'PRINCE':
    case 'TANTALUS': {
      const waves = waveFrom(b, b.own[player], player, trace);
      return { captured: waves.reduce((n, w) => n + popcount(w), 0),
               waves, pivot: false };
    }
    case 'LOVER': {
      const { mask } = bestCluster(b, player);
      const waves = waveFrom(b, mask, player, trace);
      return { captured: waves.reduce((n, w) => n + popcount(w), 0),
               waves, pivot: false };
    }
    case 'LETO':
      return { captured: 0, waves: [], pivot: true };
  }
}
