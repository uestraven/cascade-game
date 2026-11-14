/**
 * Differential test for leader resolution against play.PlayGame.
 *
 * Regenerate with:  python3 gen_leader_fixture.py 20000
 */

import { describe, expect, it } from 'vitest';

import fixture from './fixtures/leaders.json';
import { NCELLS, type Board } from '../src/engine';
import {
  LEADERS, LEADER_NUM, TARGETING, type LeaderId, type Payload,
  applyLeader, leaderOptions, newLeaderState,
} from '../src/leaders';

type Row = [
  number[], number, number, number,   // cards9, own0, own1, frozen
  number, number, Payload, number,    // leaderId, player, payload, auraLeft
  number, number, number,             // expCaptured, expOwn0, expOwn1
  number[], number, number, number,   // expCards9, expFrozen, expAura, expRev
];

const cases = fixture.cases as unknown as Row[];
const NAME_OF: Record<number, LeaderId> = Object.fromEntries(
  LEADERS.map((l) => [LEADER_NUM[l], l]),
) as Record<number, LeaderId>;

describe('leader fixture integrity', () => {
  it('agrees with the oracle on leader ids', () => {
    expect(fixture.leaderIds).toEqual(LEADER_NUM);
  });

  it('covers every leader, with real captures among them', () => {
    const seen = new Set(cases.map((r) => r[4]));
    expect(seen.size).toBe(LEADERS.length);
    const captures = cases.filter((r) => r[8] > 0).length;
    expect(captures / cases.length).toBeGreaterThan(0.03);
  });
});

describe('leaders.ts matches play.PlayGame', () => {
  it('resolves every activation identically', () => {
    const failures: string[] = [];

    for (let i = 0; i < cases.length; i++) {
      const [
        cards, own0, own1, frozen, leaderId, player, payload, auraLeft,
        expCaptured, expOwn0, expOwn1, expCards, expFrozen, expAura, expRev,
      ] = cases[i];

      const leader = NAME_OF[leaderId];
      const board: Board = { cards: cards.slice(), own: [own0, own1] };
      const states: [ReturnType<typeof newLeaderState>,
                     ReturnType<typeof newLeaderState>] = [
        newLeaderState(player === 0 ? leader : null),
        newLeaderState(player === 1 ? leader : null),
      ];
      states[player].auraLeft = auraLeft;

      const ctx = { board, frozen, player, states };
      const got = applyLeader(ctx, payload);

      const mismatch =
        got.captured !== expCaptured ||
        board.own[0] !== expOwn0 ||
        board.own[1] !== expOwn1 ||
        got.frozen !== expFrozen ||
        states[player].auraLeft !== expAura ||
        (states[player].seesOpponentHand ? 1 : 0) !== expRev ||
        board.cards.some((c, k) => c !== expCards[k]);

      if (mismatch) {
        failures.push(
          `case ${i}: ${leader} player=${player} payload=${JSON.stringify(payload)} ` +
          `aura=${auraLeft} frozen=${frozen}\n` +
          `  captured got ${got.captured} want ${expCaptured}\n` +
          `  own      got [${board.own}] want [${expOwn0},${expOwn1}]\n` +
          `  cards    got [${board.cards}] want [${expCards}]\n` +
          `  frozen   got ${got.frozen} want ${expFrozen}\n` +
          `  aura     got ${states[player].auraLeft} want ${expAura}`,
        );
        if (failures.length >= 5) break;
      }
    }
    expect(failures.join('\n\n')).toBe('');
  });

  it('offers the same options as the oracle chose from', () => {
    // Every fixture payload must appear in our own option list.
    for (let i = 0; i < cases.length; i += 3) {
      const [cards, own0, own1, frozen, leaderId, player, payload] = cases[i];
      const leader = NAME_OF[leaderId];
      const board: Board = { cards: cards.slice(), own: [own0, own1] };
      const states = [
        newLeaderState(player === 0 ? leader : null),
        newLeaderState(player === 1 ? leader : null),
      ] as [ReturnType<typeof newLeaderState>,
            ReturnType<typeof newLeaderState>];
      const opts = leaderOptions({ board, frozen, player, states });
      const match = opts.some((o) => JSON.stringify(o) === JSON.stringify(payload));
      expect(match, `case ${i} ${leader} payload ${JSON.stringify(payload)}`)
        .toBe(true);
    }
  });
});

describe('leader rules that must hold by construction', () => {
  it('never activates twice', () => {
    const board: Board = {
      cards: new Array(NCELLS).fill(0x12345), own: [0b111, 0b111000],
    };
    const states = [newLeaderState('LETO'), newLeaderState(null)] as [
      ReturnType<typeof newLeaderState>, ReturnType<typeof newLeaderState>];
    const ctx = { board, frozen: 0, player: 0, states };
    expect(leaderOptions(ctx).length).toBeGreaterThan(0);
    applyLeader(ctx, 0);
    expect(leaderOptions(ctx)).toHaveLength(0);
  });

  it('Leto never offers an already-frozen cell', () => {
    const board: Board = {
      cards: new Array(NCELLS).fill(0x12345), own: [0b111, 0b111000],
    };
    const states = [newLeaderState('LETO'), newLeaderState(null)] as [
      ReturnType<typeof newLeaderState>, ReturnType<typeof newLeaderState>];
    const opts = leaderOptions({ board, frozen: 0b101, player: 0, states });
    expect(opts).not.toContain(0);
    expect(opts).not.toContain(2);
    expect(opts).toContain(1);
  });

  it('Tantalus only ever targets enemy cards', () => {
    for (const row of cases) {
      if (row[4] !== LEADER_NUM.TANTALUS) continue;
      const [, own0, own1, , , player, payload] = row;
      const enemyMask = player === 0 ? own1 : own0;
      expect((enemyMask >>> (payload as number)) & 1).toBe(1);
    }
  });

  it('Lover only ever swaps two cells the mover owns', () => {
    for (const row of cases) {
      if (row[4] !== LEADER_NUM.LOVER) continue;
      const [, own0, own1, , , player, payload] = row;
      const mine = player === 0 ? own0 : own1;
      const [a, b] = payload as [number, number];
      expect((mine >>> a) & 1).toBe(1);
      expect((mine >>> b) & 1).toBe(1);
    }
  });

  it('Scavenger and Leto never capture anything', () => {
    for (const row of cases) {
      if (row[4] === LEADER_NUM.SCAVENGER || row[4] === LEADER_NUM.LETO) {
        expect(row[8]).toBe(0);
      }
    }
  });

  it('frozen cells survive every ability in the fixture', () => {
    for (const row of cases) {
      const frozen = row[3];
      if (!frozen) continue;
      const [, own0, own1, , , player] = row;
      const [, , , , , , , , , expOwn0, expOwn1] = row;
      // ownership of frozen cells must be unchanged
      expect(expOwn0 & frozen).toBe(own0 & frozen);
      expect(expOwn1 & frozen).toBe(own1 & frozen);
    }
  });

  it('declares a targeting mode for every leader', () => {
    for (const l of LEADERS) expect(TARGETING[l]).toBeTruthy();
  });
});
