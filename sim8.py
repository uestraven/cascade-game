#!/usr/bin/env python3
"""
Quantifies the two structural consequences of the new specs, independent of
any particular leader ability:

1. THE COST ENGINE. Spending a placement on a leader means the board no
   longer fills. If exactly one player does it, 8 cards sit on 9 cells and
   a 4-4 DRAW becomes reachable again -- the thing the 9-cell board was
   chosen to make impossible. Measured per forfeit slot, since forfeiting
   turn 1 and turn 9 are very different decisions.

2. CONSTRUCTED CUBES. The weak-flank rule guarantees ONE soft side, not a
   power ceiling: 3/10/10/10 is legal. A 15-card cube of such cards is
   legal too. Measured: optimised cube vs random cube, and whether a
   cube-level face budget restores parity.
"""

import itertools
import random
from collections import Counter

import engine as E

BASE_ORDER = E.TURN_ORDER                      # A A B B A A B B A
P1_SLOTS = [i for i, p in enumerate(BASE_ORDER) if p == 0]
P2_SLOTS = [i for i, p in enumerate(BASE_ORDER) if p == 1]

SORTED_BY_POWER = sorted(E.LEGAL_FACES, key=lambda t: -sum(t))
POWER_CUBE_FACES = SORTED_BY_POWER[:15]


def make_cube(rng, kind, size=15, budget=None):
    """A player's constructed roster of `size` cards."""
    if kind == 'random':
        faces = [rng.choice(E.LEGAL_FACES) for _ in range(size)]
    elif kind == 'power':
        faces = list(POWER_CUBE_FACES)
    elif kind == 'budget':
        # greedily pick the strongest cards that keep the cube under budget
        faces = []
        total = 0
        for t in SORTED_BY_POWER:
            if len(faces) == size:
                break
            remaining_slots = size - len(faces) - 1
            if total + sum(t) + remaining_slots * 4 <= budget:
                faces.append(t)
                total += sum(t)
        while len(faces) < size:
            faces.append(min(E.LEGAL_FACES, key=sum))
    else:
        raise ValueError(kind)
    return [E.make_card(*f, rng.randint(1, 8)) for f in faces]


def deal_from_cubes(rng, cube1, cube2, n1=5, n2=4):
    return (rng.sample(cube1, n1), rng.sample(cube2, n2))


def play(rng, hands, order, policies, cap=1, bonus=2):
    game = E.Game(hands, order, cap, bonus)
    while not game.is_over():
        i, cell = policies[game.to_move](game, rng)
        game.play(i, cell)
    return game


def outcome(board):
    """(winner_by_cards, winner_after_power_tiebreak) ; -1 means still drawn."""
    a, b = board.count(0), board.count(1)
    if a != b:
        w = 0 if a > b else 1
        return w, w
    pa = sum(sum(E.faces(board.cards[i])) for i in range(9)
             if board.owner_of(i) == 0)
    pb = sum(sum(E.faces(board.cards[i])) for i in range(9)
             if board.owner_of(i) == 1)
    if pa == pb:
        return -1, -1
    return -1, (0 if pa > pb else 1)


def run(games, order, n1, n2, cube_kinds=('random', 'random'), budget=None,
        policy=E.policy_greedy, seed=5150):
    rng = random.Random(seed)
    a = Counter()
    for _ in range(games):
        c1 = make_cube(rng, cube_kinds[0], budget=budget)
        c2 = make_cube(rng, cube_kinds[1], budget=budget)
        hands = deal_from_cubes(rng, c1, c2, n1, n2)
        game = play(rng, hands, order, (policy, policy))
        raw, tb = outcome(game.board)
        a['raw_p1' if raw == 0 else ('raw_p2' if raw == 1 else 'raw_dr')] += 1
        a['tb_p1' if tb == 0 else ('tb_p2' if tb == 1 else 'tb_dr')] += 1
    n = games
    return {k: v / n for k, v in a.items()}


def pct(x):
    return f"{100*x:5.1f}%"


def main():
    GAMES = 12000
    G2 = 2500

    print("=" * 90)
    print("A. BASELINE  (no leader used, board fills, 5/4)")
    print("=" * 90)
    for pol, lab, g in ((E.policy_greedy, 'greedy', GAMES),
                        (E.policy_lookahead, '1-ply', G2)):
        r = run(g, BASE_ORDER, 5, 4, policy=pol)
        print(f"   {lab:<8} P1 {pct(r.get('raw_p1',0))}  "
              f"draw {pct(r.get('raw_dr',0))}  P2 {pct(r.get('raw_p2',0))}  "
              f"edge {pct(r.get('raw_p2',0)-r.get('raw_p1',0))}")

    print()
    print("=" * 90)
    print("B. THE COST ENGINE: one player spends a placement on their leader")
    print("=" * 90)
    print("   The forfeited slot is removed from the turn order. 8 cards on")
    print("   9 cells => a 4-4 split is reachable => draws return.")
    print()
    print(f"{'who forfeits':<16}{'slot':<8}{'cards':<8}{'P1':>8}{'DRAW':>8}"
          f"{'P2':>8}{'edge':>8}{'draw after power TB':>22}")
    for who, slots in ((0, P1_SLOTS), (1, P2_SLOTS)):
        for s in slots:
            order = tuple(p for i, p in enumerate(BASE_ORDER) if i != s)
            n1 = sum(1 for p in order if p == 0)
            n2 = len(order) - n1
            r = run(GAMES, order, n1, n2)
            print(f"{'P1' if who == 0 else 'P2':<16}T{s+1:<7}{n1}/{n2:<6}"
                  f"{pct(r.get('raw_p1',0)):>8}{pct(r.get('raw_dr',0)):>8}"
                  f"{pct(r.get('raw_p2',0)):>8}"
                  f"{pct(r.get('raw_p2',0)-r.get('raw_p1',0)):>8}"
                  f"{pct(r.get('tb_dr',0)):>22}")
        print()

    print("   Both players forfeit one placement (7 cards, odd -> no draws):")
    order = tuple(p for i, p in enumerate(BASE_ORDER)
                  if i not in (P1_SLOTS[2], P2_SLOTS[1]))
    n1 = sum(1 for p in order if p == 0)
    r = run(GAMES, order, n1, len(order) - n1)
    print(f"      order {''.join('AB'[p] for p in order)}  "
          f"{n1}/{len(order)-n1}  P1 {pct(r.get('raw_p1',0))}  "
          f"draw {pct(r.get('raw_dr',0))}  P2 {pct(r.get('raw_p2',0))}  "
          f"edge {pct(r.get('raw_p2',0)-r.get('raw_p1',0))}")

    print()
    print("=" * 90)
    print("C. CONSTRUCTED CUBES: does the weak-flank rule cap power?")
    print("=" * 90)
    mx = POWER_CUBE_FACES[0]
    print(f"   Strongest legal card: {mx} (sum {sum(mx)}), min face "
          f"{min(mx)} satisfies the rule.")
    print(f"   A 15-card optimised cube totals "
          f"{sum(sum(t) for t in POWER_CUBE_FACES)} face points.")
    rngx = random.Random(0)
    rand_totals = [sum(sum(t) for t in
                       (rngx.choice(E.LEGAL_FACES) for _ in range(15)))
                   for _ in range(2000)]
    print(f"   A random 15-card cube averages "
          f"{sum(rand_totals)/len(rand_totals):.0f} face points.")
    print()
    print(f"{'P1 cube':<12}{'P2 cube':<12}{'budget':<9}{'P1 win':>9}"
          f"{'draw':>8}{'P2 win':>9}{'  <- P2 holds the optimised cube'}")
    for kinds, budget, note in ((('random', 'random'), None, ''),
                                (('random', 'power'), None, ''),
                                (('power', 'power'), None, ''),
                                (('random', 'budget'), 300, ''),
                                (('budget', 'budget'), 300, '')):
        r = run(GAMES, BASE_ORDER, 5, 4, cube_kinds=kinds, budget=budget)
        b = str(budget) if budget else '-'
        print(f"{kinds[0]:<12}{kinds[1]:<12}{b:<9}"
              f"{pct(r.get('raw_p1',0)):>9}{pct(r.get('raw_dr',0)):>8}"
              f"{pct(r.get('raw_p2',0)):>9}")

    print()
    print("=" * 90)
    print("D. TANTALUS ENCODING HAZARD")
    print("=" * 90)
    print("   'reduce all faces by 1' with no floor: a 1/1/1/1 card becomes")
    print("   0/0/0/0. With element 0 the packed card is 0, which engine.py")
    print("   uses as the EMPTY-CELL sentinel. The card would vanish.")
    c = E.make_card(1, 1, 1, 1, E.NO_ELEMENT)
    print(f"   make_card(1,1,1,1, no element) packs to {c} "
          f"-> {'COLLIDES with empty' if c == 0 else 'distinct'}")
    print(f"   faces 1/1/1/1 count in the legal pool: "
          f"{sum(1 for t in E.LEGAL_FACES if t == (1,1,1,1))}")
    print("   => Tantalus needs an explicit floor of 1 per face.")


if __name__ == '__main__':
    main()
