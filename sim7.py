#!/usr/bin/env python3
"""
T9 sweep risk on the FULL 3x3 board under AABBAABBA.

Theoretical ceiling: a depth-1 cascade launched from the centre reaches
4 immediate neighbours (the edge-midpoints) plus all 4 corners on the
second wave = 8 captures, i.e. the whole board. P1 holds T9.

Measures:
  - distribution of T9 captures
  - sweep rate (T9 takes every opponent card)
  - how often the centre is still empty at T9
  - which turn the centre is actually claimed on  (center-denial hypothesis)
  - how often T9 changes the leader
"""

import itertools
import random
from collections import Counter

from sim import resolve, POLICIES, NS, pct

AABBAABBA = [0, 0, 1, 1, 0, 0, 1, 1, 0]
CENTER = 4
ELEMS = ('Fire', 'Water', 'Earth', 'Air', 'Lightning', 'Ice', 'Shadow', 'Light')

WEAK_FLANK = [t for t in itertools.product(range(1, 11), repeat=4) if min(t) <= 3]


def build_hand(rng, n, elem_frac=1.0):
    return [(rng.choice(WEAK_FLANK),
             rng.choice(ELEMS) if rng.random() < elem_frac else None)
            for _ in range(n)]


def play(rng, bonus, cap, policy, order):
    board = [None] * NS
    empties = list(range(NS))
    n1 = sum(1 for o in order if o == 0)
    hands = [build_hand(rng, n1), build_hand(rng, len(order) - n1)]
    pick = POLICIES[policy]
    center_turn = None
    last = len(order) - 1
    info = {}
    for t, owner in enumerate(order):
        if t == last:
            c = [0, 0]
            for e in board:
                if e is not None:
                    c[e[2]] += 1
            info['opp_before'] = c[1 - owner]
            info['lead_before'] = (0 if c[0] > c[1] else (1 if c[1] > c[0] else -1))
            info['center_open'] = (board[CENTER] is None)
        i, cell = pick(board, empties, hands, owner, cap, bonus, rng)
        card = hands[owner].pop(i)
        empties.remove(cell)
        caps = resolve(board, cell, card, owner, cap, bonus)
        if center_turn is None and cell == CENTER:
            center_turn = t + 1
        if t == last:
            info['t9_caps'] = caps
            info['t9_at_center'] = (cell == CENTER)
    cnt = [0, 0]
    for e in board:
        if e is not None:
            cnt[e[2]] += 1
    info['winner'] = 0 if cnt[0] > cnt[1] else (1 if cnt[1] > cnt[0] else -1)
    info['center_turn'] = center_turn
    return info


def run(games, bonus, cap, policy, order, seed=8080):
    rng = random.Random(seed)
    hist = Counter()
    cturn = Counter()
    a = Counter()
    for _ in range(games):
        r = play(rng, bonus, cap, policy, order)
        hist[r['t9_caps']] += 1
        cturn[r['center_turn']] += 1
        a['p1' if r['winner'] == 0 else ('p2' if r['winner'] == 1 else 'dr')] += 1
        a['caps'] += r['t9_caps']
        if r['opp_before'] > 0 and r['t9_caps'] == r['opp_before']:
            a['sweep'] += 1
        if r['center_open']:
            a['center_open'] += 1
        if r['t9_at_center']:
            a['t9_center'] += 1
        if r['lead_before'] != r['winner']:
            a['flipped'] += 1
    n = games
    return hist, cturn, {k: (v / n if k != 'caps' else v / n)
                         for k, v in a.items()}, n


def main():
    GAMES = 20000
    G2 = 3000

    print("=" * 86)
    print("A. T9 CAPTURE DISTRIBUTION, FULL 3x3, AABBAABBA  [weak-flank, e+2]")
    print("=" * 86)
    print("   Theoretical depth-1 ceiling from the centre = 8 (whole board).")
    print()
    print(f"{'cap':>5}{'policy':<9}" + "".join(f"{k:>7}" for k in range(9))
          + f"{'mean':>8}{'sweep':>8}")
    for cap in (1, 2, 99):
        for pol, g in (('greedy', GAMES), ('greedy2', G2)):
            hist, cturn, a, n = run(g, 2, cap, pol, AABBAABBA)
            capn = 'inf' if cap == 99 else str(cap)
            row = "".join(f"{100*hist.get(k,0)/n:6.1f}%" for k in range(9))
            print(f"{capn:>5}{pol:<9}{row}{a['caps']:>8.2f}"
                  f"{pct(a.get('sweep',0)):>8}")
        print()

    print("=" * 86)
    print("B. THE CENTRE-DENIAL HYPOTHESIS")
    print("=" * 86)
    print("   Which turn is the centre cell (cell 5) first claimed on?")
    print()
    print(f"{'cap':>5}{'policy':<9}" + "".join(f"{'T'+str(k):>7}" for k in range(1, 10))
          + f"{'open at T9':>12}{'T9 at ctr':>11}")
    for cap in (1, 99):
        for pol, g in (('greedy', GAMES), ('greedy2', G2)):
            hist, cturn, a, n = run(g, 2, cap, pol, AABBAABBA)
            capn = 'inf' if cap == 99 else str(cap)
            row = "".join(f"{100*cturn.get(k,0)/n:6.1f}%" for k in range(1, 10))
            print(f"{capn:>5}{pol:<9}{row}{pct(a.get('center_open',0)):>12}"
                  f"{pct(a.get('t9_center',0)):>11}")
        print()

    print("=" * 86)
    print("C. HOW DECISIVE IS T9?")
    print("=" * 86)
    print(f"{'cap':>5}{'policy':<9}{'P1 win':>9}{'P2 win':>9}{'P2 edge':>9}"
          f"{'T9 flips leader':>18}")
    for cap in (1, 2, 99):
        for pol, g in (('greedy', GAMES), ('greedy2', G2)):
            hist, cturn, a, n = run(g, 2, cap, pol, AABBAABBA)
            capn = 'inf' if cap == 99 else str(cap)
            print(f"{capn:>5}{pol:<9}{pct(a.get('p1',0)):>9}{pct(a.get('p2',0)):>9}"
                  f"{pct(a.get('p2',0)-a.get('p1',0)):>9}"
                  f"{pct(a.get('flipped',0)):>18}")
        print()

    print("=" * 86)
    print("D. CONTROL: same board, strict alternation (ABABABABA)")
    print("=" * 86)
    print("   Confirms the order is what balances it, not the board.")
    print(f"{'policy':<9}{'P1 win':>9}{'P2 win':>9}{'P2 edge':>9}"
          f"{'mean T9 caps':>14}")
    ABAB = [0, 1, 0, 1, 0, 1, 0, 1, 0]
    for pol, g in (('greedy', GAMES), ('greedy2', G2)):
        hist, cturn, a, n = run(g, 2, 1, pol, ABAB)
        print(f"{pol:<9}{pct(a.get('p1',0)):>9}{pct(a.get('p2',0)):>9}"
              f"{pct(a.get('p2',0)-a.get('p1',0)):>9}{a['caps']:>14.2f}")


if __name__ == '__main__':
    main()
