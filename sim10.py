#!/usr/bin/env python3
"""
Cost engine vs free activation.

Under the spec, activating consumes a placement. Measured consequence: the
same leader is worth 3-16x more to P1 than to P2, because P2 surrenders 25%
of their board presence instead of 20% and their slots sit in the expensive
part of the curve.

This tests the alternative: activation is a FREE once-per-game action. The
player still places on that turn, so the board fills (9 cards), draws stay
impossible, and no tie-break is needed. If the cost was the problem, mirror
matches should return to the ~51/49 baseline.
"""

import random
from collections import Counter

import engine as E
import leaders as L

P1_SLOTS = [i for i, p in enumerate(E.TURN_ORDER) if p == 0]
P2_SLOTS = [i for i, p in enumerate(E.TURN_ORDER) if p == 1]
GAMES = 5000


def play_free(hands, leaders, schedule, rng, cap=E.CASCADE_CAP,
              bonus=E.ELEMENT_BONUS):
    """Leader fires as a FREE action; the player still places that turn."""
    game = L.LeaderGame(hands, leaders, E.TURN_ORDER, cap, bonus)
    fired = [False, False]
    while not game.is_over():
        p = game.to_move
        if schedule[p] is not None and game.turn == schedule[p] \
                and not game.used[p]:
            opts = game.leader_actions()
            if opts:
                best, ties = -1, []
                for a in opts:
                    probe = game.copy()
                    got = probe.apply_leader(a[1], rng)
                    if got > best:
                        best, ties = got, [a]
                    elif got == best:
                        ties.append(a)
                chosen = rng.choice(ties)
                game.apply_leader(chosen[1], rng)
                fired[p] = True
                # turn is NOT consumed: fall through to a placement
        action = L.greedy_action(game, rng, game.placements())
        game.act(action, rng)
    return game, fired


def run_free(games, leaders, schedule, seed=1234):
    rng = random.Random(seed)
    a = Counter()
    for _ in range(games):
        hands = E.deal(rng)
        game, fired = play_free(hands, leaders, schedule, rng)
        raw, tb = game.result()
        a['raw_dr' if raw == -1 else f'raw_p{raw+1}'] += 1
        a['tb_dr' if tb == -1 else f'tb_p{tb+1}'] += 1
        a['fired1'] += 1 if fired[0] else 0
        a['fired2'] += 1 if fired[1] else 0
    n = games
    return {k: v / n for k, v in a.items()}


def pct(x):
    return f"{100*x:5.1f}%"


def main():
    print("=" * 96)
    print("A. BASELINE, free-activation harness, no leaders")
    print("=" * 96)
    base = run_free(GAMES, (None, None), (None, None))
    b1, b2 = base.get('tb_p1', 0), base.get('tb_p2', 0)
    print(f"   P1 {pct(b1)}   draw {pct(base.get('raw_dr',0))}   P2 {pct(b2)}"
          f"   edge {pct(b2-b1)}")

    print()
    print("=" * 96)
    print("B. FREE ACTIVATION: net value by slot  (opponent has no leader)")
    print("=" * 96)
    print(f"{'leader':<12}{'owner':<7}{'slot':<7}{'fired':>8}{'draw':>8}"
          f"{'P1 win':>9}{'P2 win':>9}{'net value':>11}")
    best = {}
    for kind in L.ALL_LEADERS:
        for who, slots in ((0, P1_SLOTS), (1, P2_SLOTS)):
            for s in slots:
                sched = (s, None) if who == 0 else (None, s)
                lead = (kind, None) if who == 0 else (None, kind)
                r = run_free(GAMES, lead, sched)
                p1, p2 = r.get('tb_p1', 0), r.get('tb_p2', 0)
                mine = p1 if who == 0 else p2
                net = mine - (b1 if who == 0 else b2)
                print(f"{kind:<12}{'P1' if who == 0 else 'P2':<7}"
                      f"T{s+1:<6}{pct(r.get(f'fired{who+1}',0)):>8}"
                      f"{pct(r.get('raw_dr',0)):>8}{pct(p1):>9}{pct(p2):>9}"
                      f"{pct(net):>11}")
                key = (kind, who)
                if key not in best or net > best[key][1]:
                    best[key] = (s, net)
            print()

    print("=" * 96)
    print("C. MIRROR MATCHES: both hold the same leader, each at its best slot")
    print("=" * 96)
    print("   This is the test that matters. If the cost engine was the")
    print("   problem, free activation should restore the ~51/49 baseline.")
    print()
    print(f"{'leader':<12}{'slots':<12}{'draw':>8}{'P1 win':>9}{'P2 win':>9}"
          f"{'edge':>9}{'vs baseline':>13}")
    for kind in L.ALL_LEADERS:
        s1 = best[(kind, 0)][0]
        s2 = best[(kind, 1)][0]
        r = run_free(GAMES, (kind, kind), (s1, s2))
        p1, p2 = r.get('tb_p1', 0), r.get('tb_p2', 0)
        print(f"{kind:<12}{'T'+str(s1+1)+'/T'+str(s2+1):<12}"
              f"{pct(r.get('raw_dr',0)):>8}{pct(p1):>9}{pct(p2):>9}"
              f"{pct(p2-p1):>9}{pct((p2-p1)-(b2-b1)):>13}")

    print()
    print("=" * 96)
    print("D. SUMMARY: leader value, cost engine vs free activation")
    print("=" * 96)
    print(f"{'leader':<12}{'free: P1 net':>14}{'free: P2 net':>14}"
          f"{'asymmetry':>12}")
    for kind in L.ALL_LEADERS:
        n1 = best[(kind, 0)][1]
        n2 = best[(kind, 1)][1]
        print(f"{kind:<12}{pct(n1):>14}{pct(n2):>14}{pct(n1-n2):>12}")
    print()
    print("   'asymmetry' = how much more the same leader is worth to P1")
    print("   than to P2. Under the cost engine this ran +20 to +26 points.")


if __name__ == '__main__':
    main()
