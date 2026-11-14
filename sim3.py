#!/usr/bin/env python3
"""
Validation of the finalised spec:
  8 cells (P1 locks one), ABBAABBA order, cap=1,
  values 1-5 under a side-sum budget of 12, element bonus +1.

Checks:
  A. Does the ABBAABBA balance fix TRANSFER to the new value system?
  B. What is the draw rate, and does a tie-break fix it?
  C. Edge statistics for the actual chosen distributions.
"""

import random
from collections import Counter

from sim import (make_dist, make_card, resolve, POLICIES, BLOCK, NS, TOPO,
                 BEATS, OPPSIDE, edge_stats, budget_pool, POOLS, pct)

ORDERS = {
    'ABABABAB': [0, 1, 0, 1, 0, 1, 0, 1],
    'ABBAABBA': [0, 1, 1, 0, 0, 1, 1, 0],
}


def play_full(rng, blocked, dist, elem_frac, bonus, cap, policy, order):
    board = [None] * NS
    board[blocked] = BLOCK
    empties = [i for i in range(NS) if i != blocked]
    hands = [[make_card(rng, dist, elem_frac) for _ in range(4)],
             [make_card(rng, dist, elem_frac) for _ in range(4)]]
    pick = POLICIES[policy]
    final_caps = 0
    opp_before = 0
    for t, owner in enumerate(order):
        if t == len(order) - 1:
            c = [0, 0]
            for e in board:
                if e is not None and e is not BLOCK:
                    c[e[2]] += 1
            opp_before = c[1 - owner]
        i, cell = pick(board, empties, hands, owner, cap, bonus, rng)
        card = hands[owner].pop(i)
        empties.remove(cell)
        caps = resolve(board, cell, card, owner, cap, bonus)
        if t == len(order) - 1:
            final_caps = caps
    cnt = [0, 0]
    power = [0, 0]
    for e in board:
        if e is not None and e is not BLOCK:
            cnt[e[2]] += 1
            power[e[2]] += sum(e[0])
    if cnt[0] != cnt[1]:
        winner = 0 if cnt[0] > cnt[1] else 1
        tb = None
    else:
        winner = -1
        # tie-break on total power of owned cards
        tb = 0 if power[0] > power[1] else (1 if power[1] > power[0] else -1)
    return winner, tb, final_caps, opp_before


def run_spec(games, blocked, dist, elem_frac, bonus, cap, policy, order, seed=2024):
    rng = random.Random(seed)
    a = Counter()
    tot_caps = 0
    for _ in range(games):
        w, tb, fc, ob = play_full(rng, blocked, dist, elem_frac, bonus, cap,
                                  policy, order)
        a['p1' if w == 0 else ('p2' if w == 1 else 'dr')] += 1
        if w == -1:
            a['tb_p1' if tb == 0 else ('tb_p2' if tb == 1 else 'tb_dr')] += 1
        tot_caps += fc
        if ob > 0 and fc == ob:
            a['sweep'] += 1
    n = games
    p1, dr, p2 = a['p1'] / n, a['dr'] / n, a['p2'] / n
    # after power tie-break
    p1b = (a['p1'] + a['tb_p1']) / n
    p2b = (a['p2'] + a['tb_p2']) / n
    drb = a['tb_dr'] / n
    return dict(p1=p1, dr=dr, p2=p2, p1b=p1b, p2b=p2b, drb=drb,
                caps=tot_caps / n, sweep=a['sweep'] / n)


def main():
    GAMES = 20000
    G2 = 4000

    print("=" * 84)
    print("A. EDGE STATS FOR THE CHOSEN DISTRIBUTIONS")
    print("=" * 84)
    print(f"{'distribution':<20}{'elem':>6}{'bonus':>7}{'att wins':>10}"
          f"{'TIE (wall)':>12}{'legal cards':>13}")
    specs = [('uniform(1,5)', 0.0, 0), ('uniform(1,5)', 1.0, 1),
             ('budget(12,1,5)', 0.0, 0), ('budget(12,1,5)', 1.0, 1),
             ('budget(12,1,5)', 1.0, 2),
             ('budget(14,1,5)', 0.0, 0), ('budget(10,1,5)', 0.0, 0),
             ('uniform(1,10)', 0.0, 0), ('budget(20,1,10)', 1.0, 2)]
    for dn, ef, bn in specs:
        dd = make_dist(dn)
        w, t, l = edge_stats(dd, ef, bn)
        nc = ''
        if dn.startswith('budget'):
            k = tuple(int(x) for x in dn[dn.index('(') + 1:-1].split(','))
            nc = str(len(POOLS[k]))
        print(f"{dn:<20}{ef:>6.1f}{bn:>7}{pct(w):>10}{pct(t):>12}{nc:>13}")

    print()
    print("=" * 84)
    print("B. DOES THE ABBAABBA FIX TRANSFER?  [cap=1, budget(12,1,5), elem +1]")
    print("=" * 84)
    d_new = make_dist('budget(12,1,5)')
    d_old = make_dist('uniform(1,10)')
    print(f"{'value system':<26}{'topology':<9}{'order':<10}{'policy':<9}"
          f"{'P1':>7}{'draw':>7}{'P2':>7}{'P2 edge':>9}")
    for label, dd, ef, bn in (('budget(12,1,5) elem+1', d_new, 1.0, 1),
                              ('uniform(1,10) no elem', d_old, 0.0, 0)):
        for tname, bidx in TOPO.items():
            for oname, order in ORDERS.items():
                for pol, g in (('greedy', GAMES), ('greedy2', G2)):
                    r = run_spec(g, bidx, dd, ef, bn, 1, pol, order)
                    print(f"{label:<26}{tname:<9}{oname:<10}{pol:<9}"
                          f"{pct(r['p1']):>7}{pct(r['dr']):>7}{pct(r['p2']):>7}"
                          f"{pct(r['p2']-r['p1']):>9}")
            print()

    print("=" * 84)
    print("C. DRAW RATE AND POWER TIE-BREAK  [ABBAABBA, cap=1]")
    print("=" * 84)
    print(f"{'value system':<26}{'topology':<9}{'policy':<9}{'raw draw':>10}"
          f"{'draw after TB':>15}{'P1 final':>10}{'P2 final':>10}")
    for label, dd, ef, bn in (('budget(12,1,5) elem+1', d_new, 1.0, 1),
                              ('uniform(1,10) no elem', d_old, 0.0, 0)):
        for tname, bidx in TOPO.items():
            for pol, g in (('greedy', GAMES), ('greedy2', G2)):
                r = run_spec(g, bidx, dd, ef, bn, 1, pol, ORDERS['ABBAABBA'])
                print(f"{label:<26}{tname:<9}{pol:<9}{pct(r['dr']):>10}"
                      f"{pct(r['drb']):>15}{pct(r['p1b']):>10}{pct(r['p2b']):>10}")
        print()

    print("=" * 84)
    print("D. CASCADE ACTIVITY UNDER 1-5 vs 1-10  [ABBAABBA, corner, cap=1]")
    print("=" * 84)
    print(f"{'value system':<26}{'policy':<9}{'avg T8 caps':>13}{'T8 sweep':>10}")
    for label, dd, ef, bn in (('budget(12,1,5) elem+1', d_new, 1.0, 1),
                              ('uniform(1,5) elem+1', make_dist('uniform(1,5)'), 1.0, 1),
                              ('uniform(1,10) no elem', d_old, 0.0, 0),
                              ('budget(20,1,10) elem+2', make_dist('budget(20,1,10)'), 1.0, 2)):
        for pol, g in (('greedy', GAMES), ('greedy2', G2)):
            r = run_spec(g, 0, dd, ef, bn, 1, pol, ORDERS['ABBAABBA'])
            print(f"{label:<26}{pol:<9}{r['caps']:>13.2f}{pct(r['sweep']):>10}")

    print()
    print("=" * 84)
    print("E. BUDGET TOTAL SWEEP  [1-5 range, how much does the budget bite?]")
    print("=" * 84)
    print(f"{'budget total':<16}{'legal cards':>13}{'tie rate':>11}"
          f"{'P2 edge (greedy)':>19}{'draw':>8}")
    for total in (8, 10, 12, 14, 16):
        dn = f'budget({total},1,5)'
        dd = make_dist(dn)
        k = (total, 1, 5)
        w, t, l = edge_stats(dd, 1.0, 1)
        r = run_spec(GAMES, 0, dd, 1.0, 1, 1, 'greedy', ORDERS['ABBAABBA'])
        print(f"{dn:<16}{len(POOLS[k]):>13}{pct(t):>11}"
              f"{pct(r['p2']-r['p1']):>19}{pct(r['dr']):>8}")


if __name__ == '__main__':
    main()
