#!/usr/bin/env python3
"""
1. Can we keep the weak-flank guarantee AND a working power tie-break?
   Candidates: flat budget, loose budget band, explicit weak-flank rule,
   unconstrained.
2. Skill-robust 9-cell order search: rank all 126 orders by WORST-CASE
   |seat edge| across greedy and 1-ply, not by greedy alone.
"""

import itertools
import random
from collections import Counter

from sim import (resolve, POLICIES, BLOCK, NS, pct)

ABBAABBA = [0, 1, 1, 0, 0, 1, 1, 0]
CORNER = 0
ELEMS = ('Fire', 'Water', 'Earth', 'Air', 'Lightning', 'Ice', 'Shadow', 'Light')

ALL = list(itertools.product(range(1, 11), repeat=4))

CARD_SETS = {
    'unconstrained 1-10':   [t for t in ALL],
    'flat budget 20':       [t for t in ALL if sum(t) == 20],
    'loose budget 18-22':   [t for t in ALL if 18 <= sum(t) <= 22],
    'weak-flank min<=3':    [t for t in ALL if min(t) <= 3],
    'weak-flank min<=3 +band': [t for t in ALL if min(t) <= 3 and 16 <= sum(t) <= 24],
    'tiers 20/24':          None,  # handled specially
}
POOL20 = [t for t in ALL if sum(t) == 20]
POOL24 = [t for t in ALL if sum(t) == 24]


def builder_for(name):
    if name == 'tiers 20/24':
        def f(rng, n):
            h = [rng.choice(POOL24)] + [rng.choice(POOL20) for _ in range(n - 1)]
            rng.shuffle(h)
            return h
        return f
    pool = CARD_SETS[name]
    return lambda rng, n: [rng.choice(pool) for _ in range(n)]


def build_hand(rng, builder, n, elem_frac):
    return [(s, rng.choice(ELEMS) if (elem_frac and rng.random() < elem_frac)
             else None) for s in builder(rng, n)]


def play(rng, builder, elem_frac, bonus, cap, policy, order, blocked):
    board = [None] * NS
    cells = list(range(NS))
    if blocked is not None:
        board[blocked] = BLOCK
        cells.remove(blocked)
    empties = cells[:]
    n1 = sum(1 for o in order if o == 0)
    hands = [build_hand(rng, builder, n1, elem_frac),
             build_hand(rng, builder, len(order) - n1, elem_frac)]
    pick = POLICIES[policy]
    for owner in order:
        i, cell = pick(board, empties, hands, owner, cap, bonus, rng)
        card = hands[owner].pop(i)
        empties.remove(cell)
        resolve(board, cell, card, owner, cap, bonus)
    cnt = [0, 0]
    power = [0, 0]
    for e in board:
        if e is not None and e is not BLOCK:
            cnt[e[2]] += 1
            power[e[2]] += sum(e[0])
    return cnt, power


def run(games, builder, elem_frac, bonus, cap, policy, order, blocked, seed=4242):
    rng = random.Random(seed)
    a = Counter()
    for _ in range(games):
        cnt, power = play(rng, builder, elem_frac, bonus, cap, policy, order,
                          blocked)
        if cnt[0] != cnt[1]:
            w = 1 if cnt[1] > cnt[0] else 0
            a[f'p{w+1}'] += 1
            a[f'tb_p{w+1}'] += 1
        else:
            a['dr'] += 1
            if power[0] != power[1]:
                a[f'tb_p{1 if power[0] > power[1] else 2}'] += 1
            else:
                a['tb_dr'] += 1
    n = games
    return {k: v / n for k, v in a.items()}


def main():
    GAMES = 20000
    G2 = 5000

    print("=" * 92)
    print("A. CAN WE KEEP THE WEAK FLANK *AND* A WORKING POWER TIE-BREAK?")
    print("=" * 92)
    print("   'weak flank' = the card has at least one face a neighbour can beat.")
    print("   A tie-break on total power needs power sums to VARY.")
    print()
    hdr = (f"{'card set':<26}{'legal':>8}{'guaranteed':>12}{'mean':>7}"
           f"{'power sd':>10}")
    print(hdr)
    for name in ('unconstrained 1-10', 'flat budget 20', 'loose budget 18-22',
                 'weak-flank min<=3', 'weak-flank min<=3 +band', 'tiers 20/24'):
        if name == 'tiers 20/24':
            pool = POOL20 + POOL24
        else:
            pool = CARD_SETS[name]
        n = len(pool)
        guaranteed = sum(1 for t in pool if min(t) <= 3) / n
        sums = [sum(t) for t in pool]
        mean = sum(sums) / n
        sd = (sum((s - mean) ** 2 for s in sums) / n) ** 0.5
        print(f"{name:<26}{n:>8}{pct(guaranteed):>12}{mean:>7.1f}{sd:>10.2f}")
    print("   ('guaranteed' = share of the legal set that HAS a weak flank;")
    print("    100% means the rule enforces it for every card.)")

    print()
    print("=" * 92)
    print("B. SEAT EDGE AND POWER TIE-BREAK EFFICACY  [corner, ABBAABBA, cap=1, e+2]")
    print("=" * 92)
    print(f"{'card set':<26}{'policy':<9}{'P1':>7}{'draw':>8}{'P2':>7}"
          f"{'P2 edge':>9}{'draw after TB':>15}{'P2 edge after':>15}")
    for name in ('unconstrained 1-10', 'flat budget 20', 'loose budget 18-22',
                 'weak-flank min<=3', 'weak-flank min<=3 +band', 'tiers 20/24'):
        b = builder_for(name)
        for pol, g in (('greedy', GAMES), ('greedy2', G2)):
            r = run(g, b, 1.0, 2, 1, pol, ABBAABBA, CORNER)
            p1, p2, dr = r.get('p1', 0), r.get('p2', 0), r.get('dr', 0)
            t1, t2, td = r.get('tb_p1', 0), r.get('tb_p2', 0), r.get('tb_dr', 0)
            print(f"{name:<26}{pol:<9}{pct(p1):>7}{pct(dr):>8}{pct(p2):>7}"
                  f"{pct(p2-p1):>9}{pct(td):>15}{pct(t2-t1):>15}")
        print()

    print("=" * 92)
    print("C. SKILL-ROBUST 9-CELL ORDER SEARCH (5/4 split, draws impossible)")
    print("=" * 92)
    print("   Screening all 126 orders at 1-ply, then ranking by WORST-CASE")
    print("   |edge| across greedy and 1-ply. [weak-flank min<=3, cap=1, e+2]")
    print()
    b = builder_for('weak-flank min<=3')
    rows = []
    for combo in itertools.combinations(range(9), 4):
        order = [1 if i in combo else 0 for i in range(9)]
        rg = run(700, b, 1.0, 2, 1, 'greedy', order, None)
        eg = rg.get('p2', 0) - rg.get('p1', 0)
        if abs(eg) > 0.22:            # prune hopeless orders before the slow pass
            continue
        r2 = run(400, b, 1.0, 2, 1, 'greedy2', order, None)
        e2 = r2.get('p2', 0) - r2.get('p1', 0)
        rows.append((max(abs(eg), abs(e2)), eg, e2,
                     ''.join('AB'[o] for o in order)))
    rows.sort()
    print(f"{'order':<13}{'greedy edge':>13}{'1-ply edge':>13}{'worst case':>13}")
    for w, eg, e2, s in rows[:12]:
        print(f"{s:<13}{pct(eg):>13}{pct(e2):>13}{pct(w):>13}")
    print(f"   [{len(rows)} orders survived the greedy screen of 126]")

    if rows:
        print()
        print("=" * 92)
        print("D. REFINED: best skill-robust 9-cell orders at full sample")
        print("=" * 92)
        print(f"{'order':<13}{'policy':<9}{'P1':>8}{'P2':>8}{'P2 edge':>9}")
        for w, eg, e2, s in rows[:4]:
            order = [0 if ch == 'A' else 1 for ch in s]
            for pol, g in (('greedy', GAMES), ('greedy2', G2)):
                r = run(g, b, 1.0, 2, 1, pol, order, None)
                print(f"{s:<13}{pol:<9}{pct(r.get('p1',0)):>8}"
                      f"{pct(r.get('p2',0)):>8}"
                      f"{pct(r.get('p2',0)-r.get('p1',0)):>9}")
            print()


if __name__ == '__main__':
    main()
