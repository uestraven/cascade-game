#!/usr/bin/env python3
"""
Is any leader worth the placement it costs?

For each leader and each legal activation slot, the owning player fires it
on that turn and plays greedily otherwise; the opponent has no leader.
Compared against the no-leader baseline. The activation slot is swept rather
than chosen greedily, because Prince and Disrupter have no immediate capture
payoff and a greedy agent would never pick them -- sweeping gives each
leader its BEST-CASE value, an upper bound.

Win rates are reported after the power tie-break, since activating leaves
8 cards on 9 cells and raw draws return.
"""

import random
from collections import Counter

import engine as E
import leaders as L

P1_SLOTS = [i for i, p in enumerate(E.TURN_ORDER) if p == 0]   # 0 1 4 5 8
P2_SLOTS = [i for i, p in enumerate(E.TURN_ORDER) if p == 1]   # 2 3 6 7
GAMES = 6000


def run(games, leaders, slots, seed=9001):
    """slots = (p1_activate_turn_or_None, p2_activate_turn_or_None)"""
    rng = random.Random(seed)
    a = Counter()
    for _ in range(games):
        hands = E.deal(rng)
        game = L.play_match(hands, leaders,
                            (L.make_policy(slots[0]), L.make_policy(slots[1])),
                            rng)
        raw, tb = game.result()
        a['raw_dr' if raw == -1 else f'raw_p{raw+1}'] += 1
        a['tb_dr' if tb == -1 else f'tb_p{tb+1}'] += 1
        a['used1'] += 1 if game.used[0] else 0
        a['used2'] += 1 if game.used[1] else 0
    n = games
    return {k: v / n for k, v in a.items()}


def pct(x):
    return f"{100*x:5.1f}%"


def main():
    print("=" * 94)
    print("A. BASELINE: no leaders, board fills 5/4")
    print("=" * 94)
    base = run(GAMES, (None, None), (None, None))
    b1, b2 = base.get('tb_p1', 0), base.get('tb_p2', 0)
    print(f"   P1 {pct(b1)}   draw {pct(base.get('raw_dr',0))}   P2 {pct(b2)}"
          f"   edge {pct(b2-b1)}")
    print()

    print("=" * 94)
    print("B. P1 ACTIVATES  (P2 has no leader). Net value vs baseline P1 win rate.")
    print("=" * 94)
    print(f"{'leader':<12}{'slot':<7}{'fired':>8}{'raw draw':>10}"
          f"{'P1 win':>9}{'P2 win':>9}{'net value':>11}")
    best = {}
    for kind in L.ALL_LEADERS:
        for s in P1_SLOTS:
            r = run(GAMES, (kind, None), (s, None))
            p1 = r.get('tb_p1', 0)
            net = p1 - b1
            print(f"{kind:<12}T{s+1:<6}{pct(r.get('used1',0)):>8}"
                  f"{pct(r.get('raw_dr',0)):>10}{pct(p1):>9}"
                  f"{pct(r.get('tb_p2',0)):>9}{pct(net):>11}")
            if kind not in best or net > best[kind][1]:
                best[kind] = (s, net)
        print()

    print("=" * 94)
    print("C. P2 ACTIVATES  (P1 has no leader). Net value vs baseline P2 win rate.")
    print("=" * 94)
    print(f"{'leader':<12}{'slot':<7}{'fired':>8}{'raw draw':>10}"
          f"{'P1 win':>9}{'P2 win':>9}{'net value':>11}")
    best2 = {}
    for kind in L.ALL_LEADERS:
        for s in P2_SLOTS:
            r = run(GAMES, (None, kind), (None, s))
            p2 = r.get('tb_p2', 0)
            net = p2 - b2
            print(f"{kind:<12}T{s+1:<6}{pct(r.get('used2',0)):>8}"
                  f"{pct(r.get('raw_dr',0)):>10}{pct(r.get('tb_p1',0)):>9}"
                  f"{pct(p2):>9}{pct(net):>11}")
            if kind not in best2 or net > best2[kind][1]:
                best2[kind] = (s, net)
        print()

    print("=" * 94)
    print("D. SUMMARY: best-case net value of each leader")
    print("=" * 94)
    print(f"{'leader':<12}{'P1 best slot':>14}{'P1 net':>10}"
          f"{'P2 best slot':>15}{'P2 net':>10}")
    for kind in L.ALL_LEADERS:
        s1, n1 = best[kind]
        s2, n2 = best2[kind]
        print(f"{kind:<12}{'T'+str(s1+1):>14}{pct(n1):>10}"
              f"{'T'+str(s2+1):>15}{pct(n2):>10}")
    print()
    print("   Negative net value = the ability is not worth the placement it")
    print("   costs, even fired on its best possible turn.")

    print()
    print("=" * 94)
    print("E. MIRROR MATCHES: both players hold the same leader, best slots")
    print("=" * 94)
    print(f"{'leader':<12}{'slots':<12}{'raw draw':>10}{'P1 win':>9}"
          f"{'P2 win':>9}{'edge':>9}")
    for kind in L.ALL_LEADERS:
        s1 = best[kind][0]
        s2 = best2[kind][0]
        r = run(GAMES, (kind, kind), (s1, s2))
        p1, p2 = r.get('tb_p1', 0), r.get('tb_p2', 0)
        print(f"{kind:<12}{'T'+str(s1+1)+'/T'+str(s2+1):<12}"
              f"{pct(r.get('raw_dr',0)):>10}{pct(p1):>9}{pct(p2):>9}"
              f"{pct(p2-p1):>9}")


if __name__ == '__main__':
    main()
