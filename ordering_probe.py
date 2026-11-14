#!/usr/bin/env python3
"""
Targeted hunt for a position where the traversal order CHANGES the result.

ordering.py sampled 40,000 random positions and found no disagreement
between breadth-first waves and a depth-first reading. That is weak
evidence: the construction that would separate them is rare by
inspection, so random sampling is the wrong instrument.

The construction: a cell X that the placed card O beats directly AND that
a sibling A (also beaten by O) beats. Depth-first may reach X via
O -> A -> X, spending two levels and leaving X unable to attack under the
depth cap, where breadth-first captures X in the first wave and lets it
attack in the second. So X's own victims are captured under one reading
and not the other.

Rather than sample, this does two things:

  1. For each position, runs the depth-first reading under MANY direction
     orderings and reports whether the orderings disagree with each other.
     A reading that disagrees with itself is unusable regardless of how it
     compares to waves.
  2. Searches positions biased toward the diamond above -- dense boards,
     and the placed card chosen to beat as many neighbours as possible.
"""

import itertools
import random
import sys

import v3
from v3 import CARDS, NB, NCELLS, OPPSIDE, beats, pct, rot90

CAP = v3.CASCADE_CAP


def bfs(cards, own, origin, player, cap):
    opp = 1 - player
    frontier, captured, depth = origin, 0, 0
    while frontier and depth <= cap:
        newly = 0
        for src in range(NCELLS):
            if not (frontier >> src) & 1 or cards[src] is None:
                continue
            for d in range(4):
                t = NB[src][d]
                if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
                    continue
                if beats(cards[src][d], cards[t][OPPSIDE[d]]):
                    newly |= 1 << t
        if newly:
            own[player] |= newly
            own[opp] &= ~newly
            captured += bin(newly).count('1')
        frontier = newly
        depth += 1
    return captured


def dfs(cards, own, origin, player, cap, order):
    """`order` is a tuple of 4 direction permutations, indexed by depth, so
    a single call is deterministic and reproducible."""
    opp = 1 - player
    captured = 0

    def go(src, depth):
        nonlocal captured
        if depth > cap:
            return
        for d in order[min(depth, len(order) - 1)]:
            t = NB[src][d]
            if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
                continue
            if beats(cards[src][d], cards[t][OPPSIDE[d]]):
                own[player] |= 1 << t
                own[opp] &= ~(1 << t)
                captured += 1
                go(t, depth + 1)

    for s in range(NCELLS):
        if (origin >> s) & 1 and cards[s]:
            go(s, 0)
    return captured


PERMS = list(itertools.permutations(range(4)))


def probe(cards, own, cell, card, orders):
    """BFS result, and the min/max over the given depth-first orderings."""
    c = [x for x in cards]
    o = own[:]
    c[cell] = card
    o[0] |= 1 << cell
    b = bfs(c, o, 1 << cell, 0, CAP)

    lo = hi = None
    for order in orders:
        c2 = [x for x in cards]
        o2 = own[:]
        c2[cell] = card
        o2[0] |= 1 << cell
        g = dfs(c2, o2, 1 << cell, 0, CAP, order)
        lo = g if lo is None else min(lo, g)
        hi = g if hi is None else max(hi, g)
    return b, lo, hi


def biased_position(rng):
    """A dense board, mostly opponent-owned, and a placed card picked to
    beat as many of its neighbours as possible -- the conditions the
    divergence needs."""
    n = rng.randint(6, 8)
    cards = [None] * NCELLS
    own = [0, 0]
    for i, cell in enumerate(rng.sample(range(NCELLS), n)):
        c = rng.choice(CARDS)
        for _ in range(rng.randrange(4)):
            c = rot90(c)
        cards[cell] = c
        # heavily opponent-owned, so there is something to chain through
        own[0 if rng.random() < 0.2 else 1] |= 1 << cell
    empt = [i for i in range(NCELLS) if cards[i] is None]
    if not empt:
        return None
    cell = rng.choice(empt)

    best, bestcard = -1, None
    for _ in range(40):
        card = rng.choice(CARDS)
        for _ in range(rng.randrange(4)):
            card = rot90(card)
        k = 0
        for d in range(4):
            t = NB[cell][d]
            if t >= 0 and cards[t] and (own[1] >> t) & 1 and \
                    beats(card[d], cards[t][OPPSIDE[d]]):
                k += 1
        if k > best:
            best, bestcard = k, card
    return cards, own, cell, bestcard


def main():
    rng = random.Random(31337)
    N = 120000
    orders = [(p, p, p, p) for p in PERMS]          # uniform per position
    # plus a few mixed-by-depth orders, which is where the diamond bites
    orders += [(PERMS[i], PERMS[j], PERMS[k], PERMS[0])
               for i, j, k in ((0, 23, 7), (23, 0, 11), (5, 17, 2),
                               (11, 3, 19), (7, 13, 0))]

    print("=" * 76)
    print("TARGETED PROBE -- does traversal order change the outcome?")
    print("=" * 76)
    print(f"  {N} biased positions x {len(orders)} depth-first orderings")

    self_disagree = vs_bfs = n = 0
    worst = None
    for _ in range(N):
        p = biased_position(rng)
        if not p:
            continue
        cards, own, cell, card = p
        b, lo, hi = probe(cards, own, cell, card, orders)
        n += 1
        if lo != hi:
            self_disagree += 1
            if worst is None or (hi - lo) > worst[0]:
                worst = (hi - lo, cards, own, cell, card, b, lo, hi)
        if b != lo or b != hi:
            vs_bfs += 1
            if worst is None:
                worst = (abs(b - lo), cards, own, cell, card, b, lo, hi)

    print()
    print(f"  positions tested:                        {n}")
    print(f"  depth-first disagrees with ITSELF:       {self_disagree} "
          f"({pct(self_disagree / max(n, 1))})")
    print(f"  depth-first disagrees with waves:        {vs_bfs} "
          f"({pct(vs_bfs / max(n, 1))})")

    if worst:
        gap, cards, own, cell, card, b, lo, hi = worst
        print()
        print("  WITNESS -- a position where the reading changes the score:")
        print(f"    waves: {b} captures;  depth-first: {lo}..{hi}")
        for r in range(3):
            row = []
            for c in range(3):
                i = r * 3 + c
                if i == cell:
                    row.append('[place]')
                elif cards[i] is None:
                    row.append('   .   ')
                else:
                    o = 'P1' if (own[0] >> i) & 1 else 'P2'
                    row.append(f"{o}:{'/'.join(v3.CODES[e] for e in cards[i])}")
            print('     ' + '  '.join(f'{x:<14}' for x in row))
        print(f"    placing {'/'.join(v3.CODES[e] for e in card)} on cell "
              f"{cell}")
    else:
        print()
        print("  no witness found: the two readings coincide on every")
        print("  position tested, including the biased ones")
    return 0


if __name__ == '__main__':
    sys.exit(main())
