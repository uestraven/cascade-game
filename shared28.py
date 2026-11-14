#!/usr/bin/env python3
"""
The one-deck format: 28 shared cards, 4 each, every card an ability.

The deck-solving risk measured earlier does not apply here, because
nobody chooses a deck -- unequal abilities become variance rather than a
dominant strategy. So this measures the things the format does change,
and the first is structural rather than a matter of taste.

  4 + 4 = 8 PLACEMENTS ON NINE CELLS.

Cascade's "a draw is impossible" guarantee came from nine cards filling
nine cells: an odd number cannot split evenly. Eight cards can split
4-4. So:

  A  how often does the game actually end in a draw?
  B  turn order. Eight placements alternating means PLAYER 2 moves last,
     and the final placement is the swingiest in the game. The current
     5/4 split with six cards for P2 exists specifically to price first-
     move advantage; that mechanism is gone here.
  C  is the winner decided by who drew the better abilities? With a
     shared deck and unequal abilities, that is the cost of the format.
"""

import itertools
import random
import sys
from collections import Counter

import v3
import v3_abilities as A
from v3 import NCELLS, pct

import ability_power as P

# Turn orders worth testing for this format.
#   ABABABAB  strict alternation -- hands P2 the last word
#   ABBAABBA  the balanced 8-move sequence measured earlier at +2.2%;
#             it ends on A, so P1 moves last, and it alternates who gets
#             the last word inside each pair
#   ABABABABA the shipped 9-move order, which needs 4 and 5 cards and is
#             the only one of the three that cannot draw
ORDERS = {
    'ABABABAB': ((0, 1, 0, 1, 0, 1, 0, 1), (4, 4)),
    'ABBAABBA': ((0, 1, 1, 0, 0, 1, 1, 0), (4, 4)),
    'ABABABABA': ((0, 1, 0, 1, 0, 1, 0, 1, 0), (5, 4)),
}
ORDER8 = ORDERS['ABABABAB'][0]
HANDS4 = (4, 4)
DECK = 28

# every card carries an ability; 28 cards over 13 abilities is about two
# each, which is what "some good, some just ok" looks like in a deck
POOL = [a for a in A.ABIL]

# measured contribution (greedy minus never) from the lure tests. Only
# the abilities actually measured on that axis are listed; the rest are
# excluded from section C rather than guessed at.
CONTRIB = {
    'gust': 8.0, 'beacon': 7.0, 'tide': 5.0, 'arc': 3.5, 'umbra': 3.1,
    'eclipse': 1.8, 'glaciate': 1.7, 'conduit': 1.0,
    'upheaval': -2.0, 'scorch': -5.3,
}
TOP3 = {'gust', 'beacon', 'tide'}


def build_deck(rng):
    """28 distinct cards, each with an ability, dealt round-robin from the
    pool so the mix is even rather than random."""
    deck = []
    for i in range(DECK):
        deck.append(A.make_card(rng, POOL[i % len(POOL)]))
    rng.shuffle(deck)
    return deck


def play(rng, smarts, mute_final, order=None, hands_n=None):
    order = order or ORDER8
    hands_n = hands_n or HANDS4
    deck = build_deck(rng)
    hands = [deck[:hands_n[0]],
             deck[hands_n[0]:hands_n[0] + hands_n[1]]]
    cards = [None] * NCELLS
    own = [0, 0]
    A.PLAYED[0].clear()
    A.PLAYED[1].clear()
    placed = [0, 0]
    for turn, p in enumerate(order):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        last = turn == len(order) - 1
        cap = (v3.FINAL_CASCADE_CAP if (last and mute_final)
               else v3.CASCADE_CAP)
        mv = P.pick(cards, own, hands, p, empties, cap, placed[p], rng,
                    smarts[p])
        P.apply_move(cards, own, hands, p, mv, cap, placed[p], rng)
        placed[p] += 1
    return ([bin(own[0]).count('1'), bin(own[1]).count('1')],
            [hands[0], hands[1]], deck)


def run(games, mute_final, seed=4242, order=None, hands_n=None):
    rng = random.Random(seed)
    draws = p1 = p2 = n = 0
    margins = Counter()
    for _ in range(games):
        s, _, _ = play(rng, [False, False], mute_final, order, hands_n)
        n += 1
        margins[s[0] - s[1]] += 1
        if s[0] == s[1]:
            draws += 1
        elif s[0] > s[1]:
            p1 += 1
        else:
            p2 += 1
    return draws / n, p1 / n, p2 / n, margins


def depth(games, mute_final, seed=22, order=None, hands_n=None):
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for smart in (0, 1):
            sm = [False, False]
            sm[smart] = True
            s, _, _ = play(rng, sm, mute_final, order, hands_n)
            n += 1
            if s[0] == s[1]:
                continue          # a draw informs neither side
            if (s[0] > s[1]) == (smart == 0):
                w += 1
    return w / max(n, 1)


def luck(games, mute_final, seed=7):
    """Does the player dealt the better abilities win?"""
    rng = random.Random(seed)
    by_gap = {}
    by_top = {}
    for _ in range(games):
        # play() returns the deck it dealt, so the opening hands are
        # deck[:4] and deck[4:8]
        s, _, deck = play(rng, [False, False], mute_final)
        h0, h1 = deck[:4], deck[4:8]
        if s[0] == s[1]:
            continue
        winner = 0 if s[0] > s[1] else 1
        c0 = sum(CONTRIB.get(A.abil(c), 0.0) for c in h0)
        c1 = sum(CONTRIB.get(A.abil(c), 0.0) for c in h1)
        gap = round((c0 - c1) / 5.0) * 5          # bucket to 5-point bins
        d = by_gap.setdefault(gap, [0, 0])
        d[1] += 1
        if winner == 0:
            d[0] += 1
        t0 = sum(1 for c in h0 if A.abil(c) in TOP3)
        t1 = sum(1 for c in h1 if A.abil(c) in TOP3)
        d2 = by_top.setdefault(t0 - t1, [0, 0])
        d2[1] += 1
        if winner == 0:
            d2[0] += 1
    return by_gap, by_top


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 1500

    print("=" * 74)
    print("A. TURN ORDER -- who moves last, and can it draw?")
    print("=" * 74)
    print(f"  {G} games per row. 'last muted' = the final card starts no")
    print("  chain, as the shipped rules do for the ninth card.")
    print()
    print(f"  {'order':<11}{'hands':<8}{'last':<6}{'muted':<7}"
          f"{'draws':>8}{'P1':>8}{'P2':>8}{'depth':>8}")
    for name, (order, hn) in ORDERS.items():
        for mute in (True, False):
            dr, p1, p2, _ = run(G, mute, order=order, hands_n=hn)
            dp = depth(max(G // 2, 300), mute, order=order, hands_n=hn)
            last = 'P1' if order[-1] == 0 else 'P2'
            print(f"  {name:<11}{str(hn):<8}{last:<6}"
                  f"{('yes' if mute else 'no'):<7}"
                  f"{pct(dr):>8}{pct(p1):>8}{pct(p2):>8}{pct(dp):>8}")
    print()

    print("=" * 74)
    print("C. IS THE WINNER THE ONE WHO DREW BETTER ABILITIES?")
    print("=" * 74)
    by_gap, by_top = luck(G * 2, True)
    print("  by how many of the three hottest abilities P1 held more of:")
    print(f"    {'advantage':<12}{'P1 wins':>10}{'games':>9}")
    for k in sorted(by_top):
        a, b = by_top[k]
        if b >= 40:
            print(f"    {k:+d}{'':<10}{pct(a / b):>10}{b:>9}")
    print()
    print("  by summed measured contribution, P1 minus P2:")
    print(f"    {'gap':<12}{'P1 wins':>10}{'games':>9}")
    for k in sorted(by_gap):
        a, b = by_gap[k]
        if b >= 40:
            print(f"    {k:+.0f}{'':<10}{pct(a / b):>10}{b:>9}")
    print()
    print("  A flat column means the draw does not decide the game.")
    print("  A steep one means the format is a lottery with a board.")


if __name__ == '__main__':
    main()
