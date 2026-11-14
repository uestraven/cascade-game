#!/usr/bin/env python3
"""
Model 1 (free co-cast) says the ability is cast "immediately before OR after
placing a card". sim10 only measured BEFORE. The player chooses, so the true
optimum is max(before, after) -- and for Lover and Tantalus, casting AFTER
should be strictly better, because the placement adds a card (and possibly
captures some) before the ability picks its target.

This sweeps both orderings for every leader at every legal slot.
"""

import random
from collections import Counter

import engine as E
import leaders as L

P1_SLOTS = [i for i, p in enumerate(E.TURN_ORDER) if p == 0]
P2_SLOTS = [i for i, p in enumerate(E.TURN_ORDER) if p == 1]
GAMES = 4000


def fire(game, rng):
    """Pick and apply the best available leader action. True if it fired."""
    opts = game.leader_actions()
    if not opts:
        return False
    best, ties = -1, []
    for a in opts:
        probe = game.copy()
        got = probe.apply_leader(a[1], rng)
        if got > best:
            best, ties = got, [a]
        elif got == best:
            ties.append(a)
    game.apply_leader(rng.choice(ties)[1], rng)
    return True


def play_cocast(hands, leaders, schedule, order_mode, rng):
    """order_mode: 'before' or 'after' the placement on the scheduled turn."""
    game = L.LeaderGame(hands, leaders, E.TURN_ORDER)
    fired = [False, False]
    while not game.is_over():
        p = game.to_move
        due = schedule[p] is not None and game.turn == schedule[p] \
            and not game.used[p]

        if due and order_mode == 'before':
            fired[p] |= fire(game, rng)

        action = L.greedy_action(game, rng, game.placements())
        game.act(action, rng)

        if due and order_mode == 'after':
            # the turn counter already advanced; apply for the same player
            saved, game.turn = game.turn, schedule[p]
            fired[p] |= fire(game, rng)
            game.turn = saved
    return game, fired


def run(games, leaders, schedule, order_mode, seed=777):
    rng = random.Random(seed)
    a = Counter()
    for _ in range(games):
        game, fired = play_cocast(E.deal(rng), leaders, schedule, order_mode,
                                  rng)
        _, tb = game.result()
        a['tb_dr' if tb == -1 else f'tb_p{tb+1}'] += 1
        a['fired1'] += 1 if fired[0] else 0
        a['fired2'] += 1 if fired[1] else 0
    n = games
    return {k: v / n for k, v in a.items()}


def pct(x):
    return f"{100*x:5.1f}%"


def main():
    base = run(GAMES, (None, None), (None, None), 'before')
    b = (base.get('tb_p1', 0), base.get('tb_p2', 0))
    print("=" * 96)
    print("BASELINE, no leaders")
    print("=" * 96)
    print(f"   P1 {pct(b[0])}   P2 {pct(b[1])}   edge {pct(b[1]-b[0])}")
    print()

    print("=" * 96)
    print("CO-CAST ORDERING SWEEP: net value of firing BEFORE vs AFTER the placement")
    print("=" * 96)
    print(f"{'leader':<11}{'owner':<6}{'slot':<6}"
          f"{'fired B':>9}{'net B':>9}{'fired A':>9}{'net A':>9}{'best':>8}")
    best = {}
    for kind in L.ALL_LEADERS:
        for who, slots in ((0, P1_SLOTS), (1, P2_SLOTS)):
            for s in slots:
                sched = (s, None) if who == 0 else (None, s)
                lead = (kind, None) if who == 0 else (None, kind)
                row = {}
                for mode in ('before', 'after'):
                    r = run(GAMES, lead, sched, mode)
                    mine = r.get(f'tb_p{who+1}', 0)
                    row[mode] = (mine - b[who], r.get(f'fired{who+1}', 0))
                nb, fb = row['before']
                na, fa = row['after']
                pick = 'after' if na > nb else 'before'
                print(f"{kind:<11}{'P1' if who == 0 else 'P2':<6}T{s+1:<5}"
                      f"{pct(fb):>9}{pct(nb):>9}{pct(fa):>9}{pct(na):>9}"
                      f"{pick:>8}")
                key = (kind, who)
                cand = (max(nb, na), s, pick)
                if key not in best or cand[0] > best[key][0]:
                    best[key] = cand
            print()

    print("=" * 96)
    print("OPTIMAL FIRING SLOT PER LEADER (Model 1, co-cast)")
    print("=" * 96)
    print(f"{'leader':<11}{'P1 slot':>9}{'P1 cast':>9}{'P1 net':>9}"
          f"{'P2 slot':>10}{'P2 cast':>9}{'P2 net':>9}{'asym':>8}")
    for kind in L.ALL_LEADERS:
        n1, s1, m1 = best[(kind, 0)]
        n2, s2, m2 = best[(kind, 1)]
        print(f"{kind:<11}{'T'+str(s1+1):>9}{m1:>9}{pct(n1):>9}"
              f"{'T'+str(s2+1):>10}{m2:>9}{pct(n2):>9}{pct(n1-n2):>8}")

    print()
    print("=" * 96)
    print("MIRROR MATCHES at the optimal slots and orderings")
    print("=" * 96)
    print(f"{'leader':<11}{'config':<18}{'P1 win':>9}{'P2 win':>9}"
          f"{'edge':>9}{'vs base':>10}")
    for kind in L.ALL_LEADERS:
        n1, s1, m1 = best[(kind, 0)]
        n2, s2, m2 = best[(kind, 1)]
        # both orderings must match in one run; use P1's preferred ordering
        r = run(GAMES, (kind, kind), (s1, s2), m1)
        p1, p2 = r.get('tb_p1', 0), r.get('tb_p2', 0)
        cfg = f"T{s1+1}/T{s2+1} {m1}"
        print(f"{kind:<11}{cfg:<18}{pct(p1):>9}{pct(p2):>9}"
              f"{pct(p2-p1):>9}{pct((p2-p1)-(b[1]-b[0])):>10}")


if __name__ == '__main__':
    main()
