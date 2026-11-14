/**
 * The six leaders. Port of play.PlayGame's ability resolution, proved
 * equivalent by test/leaders.diff.test.ts.
 *
 * Activation is a FREE once-per-match action (Model 1 co-cast): you still
 * place a card on that turn, so the board always fills, draws stay
 * impossible, and no tie-breaker is needed. Measured cost asymmetry between
 * seats under this model is +/-1 point, against +14 to +21 when activation
 * consumed a placement.
 *
 * Measured balance at the shipping settings (net value / mirror skew):
 *   PRINCE     +13.7 / -6.7   peaked mid-game, the template for a fair one
 *   TANTALUS   +17.6 / -1.3
 *   LETO        +0.0 / +0.6   denial; value invisible to the bots
 *   ABYSSAL      n/a          information; unmeasurable in simulation
 *   LOVER      +29.9 / -27.5  deliberately the strongest pick
 *   SCAVENGER   rotation only; the cascading version ran +49 / -94
 */

import {
  CASCADE_CAP, ELEMENT_BONUS, NEIGHBOURS, NCELLS, OPPOSITE,
  type Board, type Card,
  beats, cascade, rotateCW, weaken,
} from './engine';

export type LeaderId =
  | 'PRINCE' | 'LOVER' | 'TANTALUS' | 'ABYSSAL' | 'SCAVENGER' | 'LETO';

export const LEADERS: readonly LeaderId[] = [
  'PRINCE', 'LOVER', 'TANTALUS', 'ABYSSAL', 'SCAVENGER', 'LETO',
];

/** Must match gen_leader_fixture.py. */
export const LEADER_NUM: Record<LeaderId, number> = {
  PRINCE: 1, LOVER: 2, TANTALUS: 3, ABYSSAL: 4, SCAVENGER: 5, LETO: 6,
};

export const BLURB: Record<LeaderId, string> = {
  PRINCE: '+1 to your faces when attacking, for your next 2 placements',
  LOVER: 'swap two adjacent cards you own — both then attack their neighbours',
  TANTALUS: 'an enemy card loses 1 from every face (min 1); your neighbours then strike it',
  ABYSSAL: "reveal the opponent's hand for the rest of the match",
  SCAVENGER: 'rotate any card 90° clockwise (no attack follows)',
  LETO: 'freeze any card: it keeps its owner but can never be captured',
};

/** How the player picks a target. */
export const TARGETING: Record<LeaderId, 'none' | 'enemy' | 'any' | 'pair'> = {
  PRINCE: 'none',
  ABYSSAL: 'none',
  TANTALUS: 'enemy',
  SCAVENGER: 'any',
  LETO: 'any',
  LOVER: 'pair',
};

/** Mutable per-player leader state. */
export interface LeaderState {
  leader: LeaderId | null;
  used: boolean;
  /** Placements still covered by the Prince aura. */
  auraLeft: number;
  /** This player can see the opponent's hand. */
  seesOpponentHand: boolean;
}

export const newLeaderState = (leader: LeaderId | null): LeaderState => ({
  leader, used: false, auraLeft: 0, seesOpponentHand: false,
});

/** Offence-only modifier; never written back to card data. */
export const attackBonus = (s: LeaderState): number =>
  s.auraLeft > 0 ? 1 : 0;

export type Payload = number | [number, number] | null;

export interface LeaderContext {
  board: Board;
  frozen: number;
  player: number;
  states: [LeaderState, LeaderState];
}

/** Every legal activation for the player to move, as payloads. */
export function leaderOptions(ctx: LeaderContext): Payload[] {
  const me = ctx.states[ctx.player];
  if (!me.leader || me.used) return [];
  const { board, frozen, player } = ctx;
  const live = board.own[0] | board.own[1];

  switch (me.leader) {
    case 'PRINCE':
    case 'ABYSSAL':
      return [null];
    case 'TANTALUS': {
      const out: number[] = [];
      for (let t = 0; t < NCELLS; t++) {
        if ((board.own[1 - player] >>> t) & 1) out.push(t);
      }
      return out;
    }
    case 'SCAVENGER': {
      const out: number[] = [];
      for (let t = 0; t < NCELLS; t++) if ((live >>> t) & 1) out.push(t);
      return out;
    }
    case 'LETO': {
      const out: number[] = [];
      for (let t = 0; t < NCELLS; t++) {
        if (((live >>> t) & 1) && !((frozen >>> t) & 1)) out.push(t);
      }
      return out;
    }
    case 'LOVER': {
      const out: [number, number][] = [];
      for (let a = 0; a < NCELLS; a++) {
        if (((board.own[player] >>> a) & 1) === 0) continue;
        for (let side = 0; side < 4; side++) {
          const nb = NEIGHBOURS[a][side];
          if (nb > a && ((board.own[player] >>> nb) & 1)) out.push([a, nb]);
        }
      }
      return out;
    }
  }
}

export interface LeaderResult {
  captured: number;
  /** Capture waves, for the same animation path a placement uses. */
  waves: number[];
  /** New frozen mask (Leto). */
  frozen: number;
}

/**
 * Resolve an activation. Mutates `ctx.board`, `ctx.states`, and returns the
 * new frozen mask. The caller owns cloning.
 */
export function applyLeader(ctx: LeaderContext,
                            payload: Payload): LeaderResult {
  const { board, player } = ctx;
  const me = ctx.states[player];
  const kind = me.leader!;
  me.used = true;
  let frozen = ctx.frozen;
  const opts = { cap: CASCADE_CAP, bonus: ELEMENT_BONUS,
                 attackBonus: attackBonus(me), protectedMask: frozen };

  switch (kind) {
    case 'PRINCE':
      me.auraLeft = 2;
      return { captured: 0, waves: [], frozen };

    case 'ABYSSAL':
      me.seesOpponentHand = true;
      return { captured: 0, waves: [], frozen };

    case 'LETO':
      frozen |= 1 << (payload as number);
      return { captured: 0, waves: [], frozen };

    case 'SCAVENGER': {
      const cell = payload as number;
      board.cards[cell] = rotateCW(board.cards[cell]);
      // Rotation only. The cascading variant measured +49% net and a -94%
      // mirror skew, so it is not the shipping behaviour.
      return { captured: 0, waves: [], frozen };
    }

    case 'LOVER': {
      const [a, b] = payload as [number, number];
      const tmp = board.cards[a];
      board.cards[a] = board.cards[b];
      board.cards[b] = tmp;
      const ra = cascade(board, 1 << a, player, opts);
      const rb = cascade(board, 1 << b, player, opts);
      return {
        captured: ra.captured + rb.captured,
        waves: [...ra.waves, ...rb.waves],
        frozen,
      };
    }

    case 'TANTALUS': {
      const target = payload as number;
      board.cards[target] = weaken(board.cards[target]);
      if ((frozen >>> target) & 1) {
        return { captured: 0, waves: [], frozen };
      }
      // Depth 0, and only this player's neighbours attempt the capture.
      for (let side = 0; side < 4; side++) {
        const src = NEIGHBOURS[target][side];
        if (src < 0) continue;
        if (((board.own[player] >>> src) & 1) === 0) continue;
        if (beats(board.cards[src], OPPOSITE[side], board.cards[target],
                  ELEMENT_BONUS, attackBonus(me))) {
          board.own[player] |= 1 << target;
          board.own[1 - player] &= ~(1 << target);
          return { captured: 1, waves: [1 << target], frozen };
        }
      }
      return { captured: 0, waves: [], frozen };
    }
  }
}

/** Called after each placement so the Prince aura expires on schedule. */
export function tickAura(s: LeaderState): void {
  if (s.auraLeft > 0) s.auraLeft--;
}

/** Reveal 4 of 6; both players pick blind, re-drawing on a collision. */
export const REVEAL_COUNT = 4;
