#!/usr/bin/env python3
"""
1. Tie-break options (the power tie-break is broken by a strict budget).
2. Exhaustive search of turn orders on the 8-cell board (4/4).
3. Exhaustive search of turn orders on the 9-cell board (5/4) where draws
   are structurally impossible.
"""

import itertools
import random
import time
from collections import Counter

from sim import (make_dist, make_card, resolve, POLICIES, BLOCK, NS, TOPO, pct)


def play_generic(rng, blocked, dist, elem_frac, bonus, cap, policy, order):
    """order is a list of owner indices, len == number of playable cells."""
    board = [None] * NS
    cells = list(range(NS))
    if blocked is not None:
        board[blocked] = BLOCK
        cells.remove(blocked)
    empties = cells[:]
    n1 = sum(1 for o in order if o == 0)
    n2 = len(order) - n1
    hands = [[make_card(rng, dist, elem_frac) for _ in range(n1)],
             [make_card(rng, dist, elem_frac) for _ in range(n2)]]
    pick = POLICIES[policy]
    caps_total = [0, 0]
    for owner in order:
        i, cell = pick(board, empties, hands, owner, cap, bonus, rng)
        card = hands[owner].pop(i)
        empties.remove(cell)
        caps_total[owner] += resolve(board, cell, card, owner, cap, bonus)
    cnt = [0, 0]
    power = [0, 0]
    maxface = [0, 0]
    for e in board:
        if e is not None and e is not BLOCK:
            cnt[e[2]] += 1
            power[e[2]] += sum(e[0])
            maxface[e[2]] = max(maxface[e[2]], max(e[0]))
    return cnt, power, maxface, caps_total


def run_generic(games, blocked, dist, elem_frac, bonus, cap, policy, order,
                seed=31337):
    rng = random.Random(seed)
    a = Counter()
    for _ in range(games):
        cnt, power, maxface, caps = play_generic(rng, blocked, dist, elem_frac,
                                                 bonus, cap, policy, order)
        if cnt[0] != cnt[1]:
            a['p1' if cnt[0] > cnt[1] else 'p2'] += 1
            a['tb_power_p1' if cnt[0] > cnt[1] else 'tb_power_p2'] += 1
            a['tb_caps_p1' if cnt[0] > cnt[1] else 'tb_caps_p2'] += 1
            a['tb_face_p1' if cnt[0] > cnt[1] else 'tb_face_p2'] += 1
        else:
            a['dr'] += 1
            # tie-break candidates
            if power[0] != power[1]:
                a['tb_power_p1' if power[0] > power[1] else 'tb_power_p2'] += 1
            else:
                a['tb_power_dr'] += 1
            if caps[0] != caps[1]:
                a['tb_caps_p1' if caps[0] > caps[1] else 'tb_caps_p2'] += 1
            else:
                a['tb_caps_dr'] += 1
            if maxface[0] != maxface[1]:
                a['tb_face_p1' if maxface[0] > maxface[1] else 'tb_face_p2'] += 1
            else:
                a['tb_face_dr'] += 1
    n = games
    return {k: v / n for k, v in a.items()}


def main():
    GAMES = 20000
    d_budget = make_dist('budget(12,1,5)')
    d_mixed_pool = None
    d_uni10 = make_dist('uniform(1,10)')
    ABBAABBA = [0, 1, 1, 0, 0, 1, 1, 0]

    # ---- mixed-rarity budget: 12 (common) or 14 (rare) -------------------
    from sim import budget_pool
    pool12 = budget_pool(12, 1, 5)
    pool14 = budget_pool(14, 1, 5)

    def d_mixed(rng):
        return rng.choice(pool14 if rng.random() < 0.25 else pool12)

    print("=" * 86)
    print("A. TIE-BREAK OPTIONS  [ABBAABBA, cap=1, corner locked]")
    print("=" * 86)
    print("   'power' = total of all 4 faces of cards you own")
    print("   'caps'  = cumulative captures made over the match")
    print("   'face'  = highest single face value among cards you own")
    print()
    print(f"{'value system':<24}{'policy':<9}{'raw draw':>10}"
          f"{'power':>9}{'caps':>9}{'face':>9}   <- residual draw rate")
    for label, dd, ef, bn in (('budget(12,1,5) e+1', d_budget, 1.0, 1),
                              ('mixed 12/14 e+1', d_mixed, 1.0, 1),
                              ('uniform(1,10) e0', d_uni10, 0.0, 0)):
        for pol, g in (('greedy', GAMES), ('greedy2', 4000)):
            r = run_generic(g, 0, dd, ef, bn, 1, pol, ABBAABBA)
            print(f"{label:<24}{pol:<9}{pct(r.get('dr',0)):>10}"
                  f"{pct(r.get('tb_power_dr',0)):>9}{pct(r.get('tb_caps_dr',0)):>9}"
                  f"{pct(r.get('tb_face_dr',0)):>9}")

    print()
    print("=" * 86)
    print("B. FAIRNESS OF EACH TIE-BREAK  [budget(12,1,5) e+1, ABBAABBA, corner]")
    print("=" * 86)
    print(f"{'policy':<9}{'tie-break':<10}{'P1':>8}{'P2':>8}{'draw':>8}{'P2 edge':>9}")
    for pol, g in (('greedy', GAMES), ('greedy2', 4000)):
        r = run_generic(g, 0, d_budget, 1.0, 1, 1, pol, ABBAABBA)
        for tb in ('power', 'caps', 'face'):
            p1 = r.get(f'tb_{tb}_p1', 0)
            p2 = r.get(f'tb_{tb}_p2', 0)
            dr = r.get(f'tb_{tb}_dr', 0)
            print(f"{pol:<9}{tb:<10}{pct(p1):>8}{pct(p2):>8}{pct(dr):>8}"
                  f"{pct(p2-p1):>9}")

    # ---- order searches --------------------------------------------------
    t0 = time.time()
    SEARCH_GAMES = 700

    print()
    print("=" * 86)
    print(f"C. EXHAUSTIVE ORDER SEARCH, 8 CELLS (4/4)  [{SEARCH_GAMES} games/order,"
          f" budget(12,1,5) e+1, corner, cap=1]")
    print("=" * 86)
    results8 = []
    for combo in itertools.combinations(range(8), 4):
        order = [0 if i in combo else 1 for i in range(8)]
        if order[0] != 0:
            continue  # fix P1 as the opener by convention
        r = run_generic(SEARCH_GAMES, 0, d_budget, 1.0, 1, 1, 'greedy', order)
        edge = r.get('p2', 0) - r.get('p1', 0)
        results8.append((abs(edge), edge, r.get('dr', 0), ''.join('AB'[o] for o in order)))
    results8.sort()
    print(f"{'order':<12}{'P2 edge':>10}{'draw':>8}")
    for ae, e, dr, s in results8[:8]:
        print(f"{s:<12}{pct(e):>10}{pct(dr):>8}")
    print("   ... worst:")
    for ae, e, dr, s in results8[-3:]:
        print(f"{s:<12}{pct(e):>10}{pct(dr):>8}")
    print(f"   [{len(results8)} orders, {time.time()-t0:.0f}s]")

    t1 = time.time()
    print()
    print("=" * 86)
    print(f"D. EXHAUSTIVE ORDER SEARCH, 9 CELLS (5/4, NO OBSTACLE, DRAWS IMPOSSIBLE)")
    print(f"   [{SEARCH_GAMES} games/order, budget(12,1,5) e+1, cap=1, greedy]")
    print("=" * 86)
    results9 = []
    for combo in itertools.combinations(range(9), 4):
        order = [1 if i in combo else 0 for i in range(9)]   # P2 gets 4 slots
        r = run_generic(SEARCH_GAMES, None, d_budget, 1.0, 1, 1, 'greedy', order)
        edge = r.get('p2', 0) - r.get('p1', 0)
        results9.append((abs(edge), edge, ''.join('AB'[o] for o in order)))
    results9.sort()
    print(f"{'order':<13}{'P2 edge':>10}   (P1 plays 5 cards, P2 plays 4)")
    for ae, e, s in results9[:10]:
        print(f"{s:<13}{pct(e):>10}")
    print("   ... worst:")
    for ae, e, s in results9[-3:]:
        print(f"{s:<13}{pct(e):>10}")
    print(f"   [{len(results9)} orders, {time.time()-t1:.0f}s]")

    # ---- refine the best 9-cell candidates -------------------------------
    print()
    print("=" * 86)
    print("E. REFINED: top 9-cell orders at full sample, both policies")
    print("=" * 86)
    print(f"{'order':<13}{'policy':<9}{'P1':>8}{'P2':>8}{'P2 edge':>9}")
    cands = [s for ae, e, s in results9[:5]]
    for s in cands:
        order = [0 if ch == 'A' else 1 for ch in s]
        for pol, g in (('greedy', GAMES), ('greedy2', 4000)):
            r = run_generic(g, None, d_budget, 1.0, 1, 1, pol, order)
            print(f"{s:<13}{pol:<9}{pct(r.get('p1',0)):>8}{pct(r.get('p2',0)):>8}"
                  f"{pct(r.get('p2',0)-r.get('p1',0)):>9}")

    print()
    print("=" * 86)
    print("F. TOPOLOGY EXPLOITABILITY  [ABBAABBA, who should pick the locked cell?]")
    print("=" * 86)
    print(f"{'value system':<24}{'policy':<9}{'center':>9}{'corner':>9}{'edgemid':>9}"
          f"   <- P2 edge")
    for label, dd, ef, bn in (('budget(12,1,5) e+1', d_budget, 1.0, 1),
                              ('uniform(1,10) e0', d_uni10, 0.0, 0)):
        for pol, g in (('greedy', GAMES), ('greedy2', 4000)):
            row = []
            for tname, bidx in (('center', 4), ('corner', 0), ('edgemid', 1)):
                r = run_generic(g, bidx, dd, ef, bn, 1, pol, ABBAABBA)
                row.append(r.get('p2', 0) - r.get('p1', 0))
            print(f"{label:<24}{pol:<9}" + "".join(pct(x).rjust(9) for x in row))
    print()
    print("   P1 picks the cell, so P1 picks the most negative column.")


if __name__ == '__main__':
    main()
