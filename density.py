#!/usr/bin/env python3
"""
What happens if EVERY card carries an ability?

The balance half of this question is already answered and the answer is
"nothing much": a deck of twelve ability cards beats one with none only
54% of the time, and density-matched decks showed no trend. The five-card
cap was always a legibility rule rather than a balance patch.

So this measures the things that are actually at stake:

  A  DECISION LOAD. The honest cost of 100% density. Branching factor is
     the count of distinct (card, rotation, cell, ability option) choices
     a player faces on a turn. If that number explodes, "abilities stay
     highlights instead of homework" stops being a slogan and starts
     being a measurement.

  B  WHETHER THE DECK SOLVES. This is the real prize and the real risk.
     Cascade has failed six times to find deckbuilding depth, because all
     1,680 cards are equally strong -- they differ only in which element
     sits on which edge. Abilities are the one component that measurably
     differs, from 49.0% to 60.0%. So making every card an ability card
     is the first proposal that could make choosing a deck matter.
     It also means a deck of nothing but the best abilities might simply
     win, which is what this section tests.

Seats are swapped throughout, and both players run the same density in
section A, so a seat effect cannot be read as a density effect.
"""

import random
import sys
from collections import Counter

import v3
import v3_abilities as A
from v3 import ELEMENTS, NCELLS, ORDER, pct

import ability_power as P

ALL13 = [a for a in A.ABIL]
# the four measured hottest under the shipped rules
TOP4 = ['gust', 'beacon', 'tide', 'cyclone']
# the four measured closest to neutral
PRICED4 = ['upheaval', 'conduit', 'glaciate', 'eclipse']


def hand(rng, n, density, pool):
    """n cards, each carrying an ability from `pool` with prob `density`."""
    return [A.make_card(rng, rng.choice(pool) if rng.random() < density
                        else None)
            for _ in range(n)]


def play(rng, densities, pools, smarts, count_branch=False):
    hands = [hand(rng, P.HANDS[p], densities[p], pools[p]) for p in (0, 1)]
    cards = [None] * NCELLS
    own = [0, 0]
    A.PLAYED[0].clear()
    A.PLAYED[1].clear()
    placed = [0, 0]
    branch = [0, 0]
    turns = [0, 0]
    caps = 0
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = v3.cap_for_turn(turn)
        if count_branch:
            branch[p] += len(P.moves(cards, own, hands, p, empties,
                                     placed[p]))
            turns[p] += 1
        mv = P.pick(cards, own, hands, p, empties, cap, placed[p], rng,
                    smarts[p])
        caps += P.apply_move(cards, own, hands, p, mv, cap, placed[p], rng)
        placed[p] += 1
    score = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    bf = [branch[p] / max(turns[p], 1) for p in (0, 1)]
    return score, caps, bf


def sweep(games, density, pool, seed=4242):
    rng = random.Random(seed)
    p1 = n = caps = close = 0
    bf = 0.0
    for _ in range(games):
        s, c, b = play(rng, (density, density), (pool, pool),
                       [False, False], count_branch=True)
        n += 1
        caps += c
        bf += (b[0] + b[1]) / 2
        if s[0] > s[1]:
            p1 += 1
        if abs(s[0] - s[1]) == 1:
            close += 1
    return p1 / n, caps / n, close / n, bf / n


def depth(games, density, pool, seed=22):
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for smart in (0, 1):
            sm = [False, False]
            sm[smart] = True
            s, _, _ = play(rng, (density, density), (pool, pool), sm)
            n += 1
            if (s[0] > s[1]) == (smart == 0):
                w += 1
    return w / n


def duel(games, pa, pb, seed=777):
    """Pool A's win rate against pool B, both at 100% density, seats
    swapped."""
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for seat in (0, 1):
            pools = [pb, pb]
            pools[seat] = pa
            s, _, _ = play(rng, (1.0, 1.0), pools, [False, False])
            n += 1
            if (s[0] > s[1]) == (seat == 0):
                w += 1
    return w / n


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 400

    print("=" * 76)
    print("A. DENSITY SWEEP -- both players matched, all 13 abilities")
    print("=" * 76)
    print(f"  {G} games per row, {G} more for depth")
    print(f"  {'ability density':<17}{'P1 win':>9}{'seat edge':>11}"
          f"{'caps':>7}{'1-card':>9}{'depth':>8}{'choices/turn':>14}")
    base_bf = None
    for d in (0.0, 0.25, 0.5, 0.75, 1.0):
        p1, caps, close, bf = sweep(G, d, ALL13)
        dp = depth(max(G // 2, 200), d, ALL13)
        if d == 0.0:
            base_bf = bf
        print(f"  {pct(d):<17}{pct(p1):>9}{pct(abs(p1 - 0.5)):>11}"
              f"{caps:>7.2f}{pct(close):>9}{pct(dp):>8}{bf:>14.0f}")
    print()
    print(f"  Branching factor at 0% density is the floor: every turn you")
    print(f"  still choose a card, a rotation and a cell.")

    print()
    print("=" * 76)
    print("B. DOES THE DECK SOLVE?  100% density, pool against pool")
    print("=" * 76)
    print("  If 'best abilities' beats 'all 13' by much, then making every")
    print("  card an ability card hands the game to whoever reads this")
    print("  table -- deckbuilding becomes real and immediately solved.")
    print()
    rows = [
        ('the 4 hottest vs all 13', TOP4, ALL13),
        ('the 4 priced vs all 13', PRICED4, ALL13),
        ('the 4 hottest vs the 4 priced', TOP4, PRICED4),
        ('all 13 vs all 13 (control)', ALL13, ALL13),
    ]
    for label, pa, pb in rows:
        w = duel(G, pa, pb)
        print(f"  {label:<34}{pct(w):>8}")
    print()
    print(f"  hottest four: {', '.join(TOP4)}")
    print(f"  priced four:  {', '.join(PRICED4)}")


if __name__ == '__main__':
    main()
