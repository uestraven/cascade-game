#!/usr/bin/env python3
"""
Validates the REVISED spec: uniform/budgeted 1-10, corner locked by rule,
ABBAABBA, cap=1 -- and compares all three tie-breakers, including whether
each tie-breaker is itself seat-neutral.

Note on units: a side-sum budget of 12 was calibrated for a 1-5 range
(mean face 3). In a 1-10 range the equivalent budgets are ~20 / ~24.
Both are tested.
"""

import itertools
import random
from collections import Counter

from sim import (make_dist, make_card, resolve, POLICIES, BLOCK, NS,
                 budget_pool, edge_stats, pct)

ABBAABBA = [0, 1, 1, 0, 0, 1, 1, 0]
CORNER = 0

POOL = {}
for tot in (12, 14, 20, 24):
    lo_hi = (1, 5) if tot <= 14 else (1, 10)
    POOL[tot] = budget_pool(tot, lo_hi[0], lo_hi[1])


def hand_builder(kind):
    """Returns f(rng, n) -> list of side-tuples."""
    if kind == 'uniform(1,10)':
        return lambda rng, n: [tuple(rng.randint(1, 10) for _ in range(4))
                               for _ in range(n)]
    if kind == 'flat budget20':
        return lambda rng, n: [rng.choice(POOL[20]) for _ in range(n)]
    if kind == 'tiers 24+20x3':
        def f(rng, n):
            h = [rng.choice(POOL[24])] + [rng.choice(POOL[20])
                                          for _ in range(n - 1)]
            rng.shuffle(h)
            return h
        return f
    if kind == 'tiers 14+12x3 (1-5)':
        def f(rng, n):
            h = [rng.choice(POOL[14])] + [rng.choice(POOL[12])
                                          for _ in range(n - 1)]
            rng.shuffle(h)
            return h
        return f
    if kind == 'flat budget12 (1-5)':
        return lambda rng, n: [rng.choice(POOL[12]) for _ in range(n)]
    raise ValueError(kind)


ELEMS = ('Fire', 'Water', 'Earth', 'Air', 'Lightning', 'Ice', 'Shadow', 'Light')


def build_hand(rng, builder, n, elem_frac):
    sides = builder(rng, n)
    return [(s, rng.choice(ELEMS) if (elem_frac and rng.random() < elem_frac)
             else None) for s in sides]


def play(rng, builder, elem_frac, bonus, cap, policy, order, blocked=CORNER):
    board = [None] * NS
    board[blocked] = BLOCK
    empties = [i for i in range(NS) if i != blocked]
    n1 = sum(1 for o in order if o == 0)
    hands = [build_hand(rng, builder, n1, elem_frac),
             build_hand(rng, builder, len(order) - n1, elem_frac)]
    pick = POLICIES[policy]
    caps = [0, 0]
    for owner in order:
        i, cell = pick(board, empties, hands, owner, cap, bonus, rng)
        card = hands[owner].pop(i)
        empties.remove(cell)
        caps[owner] += resolve(board, cell, card, owner, cap, bonus)
    cnt = [0, 0]
    power = [0, 0]
    face = [0, 0]
    for e in board:
        if e is not None and e is not BLOCK:
            o = e[2]
            cnt[o] += 1
            power[o] += sum(e[0])
            face[o] = max(face[o], max(e[0]))
    return cnt, power, face, caps


TBS = ('power', 'caps', 'face')


def run(games, builder, elem_frac, bonus, cap, policy, order, seed=606):
    rng = random.Random(seed)
    a = Counter()
    for _ in range(games):
        cnt, power, face, caps = play(rng, builder, elem_frac, bonus, cap,
                                      policy, order)
        if cnt[0] != cnt[1]:
            w = 0 if cnt[0] > cnt[1] else 1
            a[f'p{w+1}'] += 1
            for tb in TBS:
                a[f'{tb}_p{w+1}'] += 1
        else:
            a['dr'] += 1
            for tb, vals in (('power', power), ('caps', caps), ('face', face)):
                if vals[0] != vals[1]:
                    a[f'{tb}_p{1 if vals[0] > vals[1] else 2}'] += 1
                    # also record who won among TIED games only
                    a[f'{tb}_tiedwin_p{1 if vals[0] > vals[1] else 2}'] += 1
                else:
                    a[f'{tb}_dr'] += 1
    n = games
    return {k: v / n for k, v in a.items()}, a


def main():
    GAMES = 20000
    G2 = 5000
    SYSTEMS = ['uniform(1,10)', 'flat budget20', 'tiers 24+20x3',
               'flat budget12 (1-5)', 'tiers 14+12x3 (1-5)']

    print("=" * 88)
    print("A. EDGE STATS: BUDGET UNITS MATTER")
    print("=" * 88)
    print("   A budget of 12 in a 1-10 range is NOT the same card as budget 12 in 1-5.")
    print(f"{'distribution':<22}{'legal cards':>13}{'att wins':>10}{'tie':>8}")
    for dn in ('uniform(1,10)', 'budget(12,1,10)', 'budget(20,1,10)',
               'budget(24,1,10)', 'uniform(1,5)', 'budget(12,1,5)'):
        dd = make_dist(dn)
        w, t, l = edge_stats(dd, 0.0, 0, trials=200000)
        nc = ''
        if dn.startswith('budget'):
            k = tuple(int(x) for x in dn[dn.index('(') + 1:-1].split(','))
            from sim import POOLS
            nc = str(len(POOLS[k]))
        print(f"{dn:<22}{nc:>13}{pct(w):>10}{pct(t):>8}")

    print()
    print("=" * 88)
    print("B. REVISED SPEC: DRAW RATE BY VALUE SYSTEM  [corner, ABBAABBA, cap=1, e+2]")
    print("=" * 88)
    print(f"{'value system':<24}{'policy':<9}{'P1':>7}{'draw':>8}{'P2':>7}"
          f"{'P2 edge':>9}")
    for sysname in SYSTEMS:
        b = hand_builder(sysname)
        for pol, g in (('greedy', GAMES), ('greedy2', G2)):
            r, _ = run(g, b, 1.0, 2, 1, pol, ABBAABBA)
            print(f"{sysname:<24}{pol:<9}{pct(r.get('p1',0)):>7}"
                  f"{pct(r.get('dr',0)):>8}{pct(r.get('p2',0)):>7}"
                  f"{pct(r.get('p2',0)-r.get('p1',0)):>9}")
        print()

    print("=" * 88)
    print("C. TIE-BREAKER COMPARISON  [residual draw rate]")
    print("=" * 88)
    print(f"{'value system':<24}{'policy':<9}{'raw draw':>10}"
          f"{'power':>9}{'caps':>9}{'face':>9}")
    for sysname in SYSTEMS:
        b = hand_builder(sysname)
        for pol, g in (('greedy', GAMES), ('greedy2', G2)):
            r, _ = run(g, b, 1.0, 2, 1, pol, ABBAABBA)
            print(f"{sysname:<24}{pol:<9}{pct(r.get('dr',0)):>10}"
                  f"{pct(r.get('power_dr',0)):>9}{pct(r.get('caps_dr',0)):>9}"
                  f"{pct(r.get('face_dr',0)):>9}")
        print()

    print("=" * 88)
    print("D. IS EACH TIE-BREAKER SEAT-NEUTRAL?")
    print("=" * 88)
    print("   Among DRAWN games only: which seat does the tie-break hand the win to?")
    print("   (50/50 = neutral. P1 holds turns 4+5, the capture peak, so 'caps'")
    print("    is the one most at risk of systematic bias.)")
    print()
    print(f"{'value system':<24}{'policy':<9}{'tie-break':<8}"
          f"{'P1 of tied':>12}{'P2 of tied':>12}{'unresolved':>12}")
    for sysname in SYSTEMS:
        b = hand_builder(sysname)
        for pol, g in (('greedy', GAMES), ('greedy2', G2)):
            r, raw = run(g, b, 1.0, 2, 1, pol, ABBAABBA)
            tied = raw['dr']
            if tied == 0:
                continue
            for tb in TBS:
                w1 = raw.get(f'{tb}_tiedwin_p1', 0)
                w2 = raw.get(f'{tb}_tiedwin_p2', 0)
                un = raw.get(f'{tb}_dr', 0)
                print(f"{sysname:<24}{pol:<9}{tb:<8}"
                      f"{pct(w1/tied):>12}{pct(w2/tied):>12}{pct(un/tied):>12}")
            print()

    print("=" * 88)
    print("E. FINAL SEAT EDGE AFTER EACH TIE-BREAK IS APPLIED")
    print("=" * 88)
    print(f"{'value system':<24}{'policy':<9}{'tie-break':<8}{'P1':>8}{'P2':>8}"
          f"{'P2 edge':>9}{'draw':>8}")
    for sysname in SYSTEMS:
        b = hand_builder(sysname)
        for pol, g in (('greedy', GAMES), ('greedy2', G2)):
            r, _ = run(g, b, 1.0, 2, 1, pol, ABBAABBA)
            for tb in TBS:
                p1 = r.get(f'{tb}_p1', 0)
                p2 = r.get(f'{tb}_p2', 0)
                dr = r.get(f'{tb}_dr', 0)
                print(f"{sysname:<24}{pol:<9}{tb:<8}{pct(p1):>8}{pct(p2):>8}"
                      f"{pct(p2-p1):>9}{pct(dr):>8}")
            print()

    print("=" * 88)
    print("F. ELEMENT BONUS UNDER THE REVISED SPEC  [tiers 24+20x3, corner]")
    print("=" * 88)
    print(f"{'bonus':<7}{'policy':<9}{'P1':>7}{'draw':>8}{'P2':>7}{'P2 edge':>9}")
    b = hand_builder('tiers 24+20x3')
    for bonus in (0, 1, 2, 3):
        for pol, g in (('greedy', GAMES), ('greedy2', G2)):
            r, _ = run(g, b, 1.0, bonus, 1, pol, ABBAABBA)
            print(f"{bonus:<7}{pol:<9}{pct(r.get('p1',0)):>7}"
                  f"{pct(r.get('dr',0)):>8}{pct(r.get('p2',0)):>7}"
                  f"{pct(r.get('p2',0)-r.get('p1',0)):>9}")


if __name__ == '__main__':
    main()
