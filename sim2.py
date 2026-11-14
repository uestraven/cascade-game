#!/usr/bin/env python3
"""
Follow-up experiments:
  I.   Is the seat advantage caused by the FIRST move or the LAST move?
       Isolated by holding hands equal (4/4) and varying only turn order.
  II.  Captures by turn index - where does the advantage actually accrue?
  III. Element decisiveness: how often does the wheel overturn raw values?
  IV.  Draw rate and tie-break options.
"""

import random
from collections import Counter

from sim import (make_dist, make_card, resolve, copy_board, POLICIES,
                 BLOCK, NS, TOPO, BEATS, ELEMENTS, OPPSIDE, pct)

ORDERS = {
    'ABABABAB  (P1 first, P2 last)': [0, 1, 0, 1, 0, 1, 0, 1],
    'ABBAABBA  (P1 first, P1 last)': [0, 1, 1, 0, 0, 1, 1, 0],
    'ABBABAAB  (Thue-Morse, P2 last)': [0, 1, 1, 0, 1, 0, 0, 1],
    'ABBABAAB rev (P1 last)': [0, 1, 1, 0, 1, 0, 1, 0],
}


def play_order(rng, blocked, dist, elem_frac, bonus, cap, policy, order):
    board = [None] * NS
    board[blocked] = BLOCK
    empties = [i for i in range(NS) if i != blocked]
    hands = [[make_card(rng, dist, elem_frac) for _ in range(4)],
             [make_card(rng, dist, elem_frac) for _ in range(4)]]
    pick = POLICIES[policy]
    caps_by_turn = []
    for t, owner in enumerate(order):
        i, cell = pick(board, empties, hands, owner, cap, bonus, rng)
        card = hands[owner].pop(i)
        empties.remove(cell)
        caps = resolve(board, cell, card, owner, cap, bonus)
        caps_by_turn.append((owner, caps))
    cnt = [0, 0]
    for e in board:
        if e is not None and e is not BLOCK:
            cnt[e[2]] += 1
    winner = 0 if cnt[0] > cnt[1] else (1 if cnt[1] > cnt[0] else -1)
    return winner, cnt, caps_by_turn


def run_order(games, blocked, dist, cap, policy, order, seed=777,
              elem_frac=0.0, bonus=0):
    rng = random.Random(seed)
    agg = Counter()
    turn_caps = [0.0] * 8
    for _ in range(games):
        w, cnt, cbt = play_order(rng, blocked, dist, elem_frac, bonus, cap,
                                 policy, order)
        agg['p1' if w == 0 else ('p2' if w == 1 else 'dr')] += 1
        for t, (own, c) in enumerate(cbt):
            turn_caps[t] += c
    n = games
    return (agg['p1'] / n, agg['dr'] / n, agg['p2'] / n,
            [x / n for x in turn_caps])


def element_decisiveness(dist, bonus, trials=400000, seed=5):
    """Fraction of ALL edges where the element bonus changes the outcome."""
    rng = random.Random(seed)
    changed = 0
    applicable = 0
    for _ in range(trials):
        a = make_card(rng, dist, 1.0)
        b = make_card(rng, dist, 1.0)
        d = rng.randrange(4)
        av0 = a[0][d]
        bv0 = b[0][OPPSIDE[d]]
        av, bv = av0, bv0
        rel = 0
        if b[1] in BEATS[a[1]]:
            av += bonus
            rel = 1
        elif a[1] in BEATS[b[1]]:
            bv += bonus
            rel = 1
        applicable += rel
        o0 = (av0 > bv0) - (av0 < bv0)
        o1 = (av > bv) - (av < bv)
        if o0 != o1:
            changed += 1
    return changed / trials, applicable / trials


def main():
    d = make_dist('uniform(1,10)')
    GAMES = 20000
    G2 = 4000

    print("=" * 80)
    print("I. FIRST MOVE vs LAST MOVE  [corner locked, 8 cells, 4 cards each, cap=1]")
    print("=" * 80)
    print(f"{'turn order':<34}{'policy':<10}{'P1 win':>9}{'draw':>8}{'P2 win':>9}{'P2 edge':>10}")
    for label, order in ORDERS.items():
        for pol, g in (('greedy', GAMES), ('greedy2', G2)):
            p1, dr, p2, _ = run_order(g, 0, d, 1, pol, order)
            print(f"{label:<34}{pol:<10}{pct(p1):>9}{pct(dr):>8}{pct(p2):>9}"
                  f"{pct(p2-p1):>10}")
        print()

    print("=" * 80)
    print("II. AVERAGE CAPTURES BY TURN  [corner locked, cap=1, alternating]")
    print("=" * 80)
    p1, dr, p2, tc = run_order(GAMES, 0, d, 1, 'greedy', ORDERS['ABABABAB  (P1 first, P2 last)'])
    print(f"{'turn':<8}{'player':<9}{'avg captures':>14}")
    for t, v in enumerate(tc):
        owner = 'P1' if t % 2 == 0 else 'P2'
        print(f"{t+1:<8}{owner:<9}{v:>14.3f}")
    print(f"\n   P1 total captures/game: {sum(tc[0::2]):.2f}")
    print(f"   P2 total captures/game: {sum(tc[1::2]):.2f}")

    print()
    print("=" * 80)
    print("III. ELEMENT DECISIVENESS  (fraction of all edges whose winner changes)")
    print("=" * 80)
    print(f"{'distribution':<18}{'bonus':>6}{'edges w/ relation':>20}{'outcome changed':>18}")
    for dn in ('uniform(1,10)', 'uniform(1,6)', 'uniform(1,5)'):
        dd = make_dist(dn)
        for bonus in (1, 2, 3, 4):
            ch, app = element_decisiveness(dd, bonus)
            print(f"{dn:<18}{bonus:>6}{pct(app):>20}{pct(ch):>18}")

    print()
    print("=" * 80)
    print("IV. DRAW RATE / TIE-BREAK  [cap=1, uniform(1,10)]")
    print("=" * 80)
    print(f"{'topology':<10}{'policy':<10}{'draw':>8}{'P1+draws':>11}{'P2 win':>9}"
          f"{'  <- if P1 wins ties'}")
    for name, bidx in TOPO.items():
        for pol, g in (('greedy', GAMES), ('greedy2', G2)):
            p1, dr, p2, _ = run_order(g, bidx, d, 1, pol,
                                      ORDERS['ABABABAB  (P1 first, P2 last)'])
            print(f"{name:<10}{pol:<10}{pct(dr):>8}{pct(p1+dr):>11}{pct(p2):>9}")

    print()
    print("=" * 80)
    print("V. ODD BOARD (no obstacle, 9 cells, 5/4 cards) - draws impossible")
    print("=" * 80)
    print("   P1 places 5 (turns 1,3,5,7,9), P2 places 4.")
    from sim import run as run_std
    for cap in (0, 1, 2, 99):
        # emulate 9-cell board by blocking nothing: use a sentinel outside range
        board_games = 20000
        rng = random.Random(99)
        agg = Counter()
        for _ in range(board_games):
            board = [None] * NS
            empties = list(range(NS))
            hands = [[make_card(rng, d, 0.0) for _ in range(5)],
                     [make_card(rng, d, 0.0) for _ in range(4)]]
            pick = POLICIES['greedy']
            for t in range(9):
                owner = t % 2
                i, cell = pick(board, empties, hands, owner, cap, 0, rng)
                card = hands[owner].pop(i)
                empties.remove(cell)
                resolve(board, cell, card, owner, cap, 0)
            cnt = [0, 0]
            for e in board:
                if e is not None:
                    cnt[e[2]] += 1
            agg['p1' if cnt[0] > cnt[1] else 'p2'] += 1
        n = board_games
        capn = 'inf' if cap == 99 else str(cap)
        print(f"   cap={capn:<4} P1 win {pct(agg['p1']/n)}   P2 win {pct(agg['p2']/n)}")


if __name__ == '__main__':
    main()
