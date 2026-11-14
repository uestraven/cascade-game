#!/usr/bin/env python3
"""
Differential fixture for LEADER resolution.

Drives play.PlayGame -- the shipping Python implementation of the six
leaders -- over random positions and records what each ability does, so the
TypeScript port can be proved equivalent rather than assumed equivalent.

Shipping semantics (the ones the balance sweeps landed on):
    PRINCE     +1 attack for your next 2 placements
    LOVER      swap two adjacent cells you own, cascade from A then B
    TANTALUS   -1 all faces (floor 1), then only YOUR neighbours strike it
    ABYSSAL    reveal the opponent's hand
    SCAVENGER  rotate 90 clockwise, no cascade
    LETO       freeze: owner keeps the card, it can never be captured

    python3 gen_leader_fixture.py [count] [outfile]
"""

import json
import random
import sys

import engine as E
import leaders as L
import newleaders as N
import play as P

LEADER_IDS = {
    L.PRINCE: 1, L.LOVER: 2, L.TANTALUS: 3,
    P.ABYSSAL: 4, N.SCAVENGER: 5, N.LETO: 6,
}

# A turn index owned by each player, so to_move resolves correctly.
TURN_FOR = {0: 0, 1: 2}
assert E.TURN_ORDER[0] == 0 and E.TURN_ORDER[2] == 1


def setup(rng):
    """Random board, a player to act, and a frozen mask."""
    board = E.Board()
    n_placed = rng.randrange(1, 10)
    for cell in rng.sample(range(E.NCELLS), n_placed):
        board.cards[cell] = E.random_card(rng, with_element=rng.random() < 0.8)
        board.own[rng.randrange(2)] |= 1 << cell

    frozen = 0
    if rng.random() < 0.25:
        for cell in rng.sample(range(E.NCELLS), rng.randint(1, 2)):
            if board.cards[cell]:
                frozen |= 1 << cell
    return board, rng.randrange(2), frozen


def make_game(board, player, frozen, leader, aura_left):
    hands = [[E.random_card(random.Random(1)) for _ in range(2)],
             [E.random_card(random.Random(2)) for _ in range(2)]]
    leaders = [None, None]
    leaders[player] = leader
    g = P.PlayGame(hands, tuple(leaders), P.RULES)
    g.board.cards = board.cards[:]
    g.board.own = [board.own[0], board.own[1]]
    g.frozen = frozen
    g.aura_left = [0, 0]
    g.aura_left[player] = aura_left
    g.turn = TURN_FOR[player]
    return g


def build(count, seed=777001):
    rng = random.Random(seed)
    rows = []
    kinds = list(LEADER_IDS)
    while len(rows) < count:
        board, player, frozen = setup(rng)
        leader = rng.choice(kinds)
        aura_left = rng.choice([0, 0, 0, 1, 2])

        probe = make_game(board, player, frozen, leader, aura_left)
        opts = probe.leader_actions()
        if not opts:
            continue
        payload = rng.choice(opts)[1]

        g = make_game(board, player, frozen, leader, aura_left)
        captured = g.apply_leader(payload, rng)

        if payload is None:
            enc = None
        elif isinstance(payload, tuple):
            enc = list(payload)
        else:
            enc = payload

        rows.append([
            board.cards[:], board.own[0], board.own[1], frozen,
            LEADER_IDS[leader], player, enc, aura_left,
            captured, g.board.own[0], g.board.own[1],
            g.board.cards[:], g.frozen, g.aura_left[player],
            1 if g.revealed[1 - player] else 0,
        ])
    return rows


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 20000
    out = (sys.argv[2] if len(sys.argv) > 2
           else 'web/test/fixtures/leaders.json')
    rows = build(count)

    payload = {
        'format': 1,
        'generator': 'play.PlayGame',
        'leaderIds': LEADER_IDS,
        'schema': ['cards9', 'own0', 'own1', 'frozen', 'leaderId', 'player',
                   'payload', 'auraLeft', 'expCaptured', 'expOwn0', 'expOwn1',
                   'expCards9', 'expFrozen', 'expAuraLeft', 'expRevealed'],
        'cases': rows,
    }
    with open(out, 'w') as f:
        json.dump(payload, f, separators=(',', ':'))

    by_leader = {}
    for r in rows:
        by_leader[r[4]] = by_leader.get(r[4], 0) + 1
    names = {v: k for k, v in LEADER_IDS.items()}
    captures = sum(1 for r in rows if r[8] > 0)
    print(f"wrote {out}")
    print(f"  cases          {len(rows)}")
    print(f"  with captures  {captures} ({100*captures/len(rows):.1f}%)")
    for lid in sorted(by_leader):
        print(f"  {names[lid]:<10} {by_leader[lid]}")


if __name__ == '__main__':
    main()
