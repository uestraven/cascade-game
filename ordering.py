#!/usr/bin/env python3
"""
What the rulebook must say about resolution order -- and which parts of it
actually change outcomes.

A rulebook should spend words where ambiguity costs games. So rather than
write down everything the engine happens to do, each candidate rule is
restated as a DIFFERENT plausible reading, and both are run over the same
random positions:

  no difference  -> the rule is a free choice; say it once, briefly, or not
                    at all, and no table argument can go wrong
  difference     -> the rule is load-bearing; it must be stated explicitly,
                    with the margin as evidence of how often it bites

Five readings are tested:

  A  within a wave, captures applied together   vs  applied one at a time
  B  waves (breadth-first)                      vs  one chain at a time
                                                    (depth-first)
  C  (moved to ordering_reach.py -- the version here was the
     wrong comparison and is kept only as a note)
  D  captures always go to the placer           vs  (invariant check)
  E  orientation frozen once placed             vs  (invariant check)
"""

import random
import sys

import v3
from v3 import (CARDS, NB, NCELLS, OPPSIDE, beats, pct, resolve, rot90)

CAP = v3.CASCADE_CAP


def popcount(x):
    return bin(x).count('1')


def batch_cascade(cards, own, origin, player, cap):
    """The engine's own wave loop, lifted out of v3.resolve so a chain can
    be started from a cell that is already on the board."""
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
            captured += popcount(newly)
        frontier = newly
        depth += 1
    return captured


def rand_position(rng, n=None):
    """A board with n cards split between both players, and one empty cell
    plus a card to drop on it."""
    n = n or rng.randint(3, 7)
    cards = [None] * NCELLS
    own = [0, 0]
    for cell in rng.sample(range(NCELLS), n):
        c = rng.choice(CARDS)
        for _ in range(rng.randrange(4)):
            c = rot90(c)
        cards[cell] = c
        own[rng.randrange(2)] |= 1 << cell
    empt = [i for i in range(NCELLS) if cards[i] is None]
    if not empt:
        return None
    cell = rng.choice(empt)
    card = rng.choice(CARDS)
    for _ in range(rng.randrange(4)):
        card = rot90(card)
    return cards, own, cell, card


# ---------------------------------------------------------------------------
# A. within a wave: together, or one at a time?
# ---------------------------------------------------------------------------
def seq_cascade(cards, own, origin, player, cap, rng):
    """Same waves, but each capture is applied the instant it is found, and
    sources and directions are visited in random order. If the rules are
    order-independent this must agree with the engine every time."""
    opp = 1 - player
    frontier, captured, depth = origin, 0, 0
    while frontier and depth <= cap:
        newly = 0
        srcs = [s for s in range(NCELLS) if (frontier >> s) & 1 and cards[s]]
        rng.shuffle(srcs)
        for src in srcs:
            dirs = list(range(4))
            rng.shuffle(dirs)
            for d in dirs:
                t = NB[src][d]
                if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
                    continue
                if beats(cards[src][d], cards[t][OPPSIDE[d]]):
                    own[player] |= 1 << t      # applied immediately
                    own[opp] &= ~(1 << t)
                    newly |= 1 << t
                    captured += 1
        frontier = newly
        depth += 1
    return captured


# ---------------------------------------------------------------------------
# B. breadth-first waves, or one chain at a time?
# ---------------------------------------------------------------------------
def dfs_cascade(cards, own, origin, player, cap, rng):
    """A reading where each captured card finishes its own chain before the
    next sibling starts -- the way a person reading "a captured card then
    attacks its neighbours" out loud might well play it."""
    opp = 1 - player
    captured = 0

    def go(src, depth):
        nonlocal captured
        if depth > cap:
            return
        dirs = list(range(4))
        rng.shuffle(dirs)
        for d in dirs:
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


# ---------------------------------------------------------------------------
def main():
    rng = random.Random(777)
    N = 40000

    print("=" * 76)
    print("A. WITHIN A WAVE -- captures applied together, or one at a time?")
    print("=" * 76)
    diff = n = 0
    for _ in range(N):
        p = rand_position(rng)
        if not p:
            continue
        cards, own, cell, card = p
        a = resolve([x for x in cards], own[:], cell, card, 0, CAP)[0]
        c2, o2 = [x for x in cards], own[:]
        c2[cell] = card
        o2[0] |= 1 << cell
        b = seq_cascade(c2, o2, 1 << cell, 0, CAP, rng)
        n += 1
        if a != b:
            diff += 1
    print(f"  {n} positions, {diff} disagreements ({pct(diff / n)})")
    print("  -> order WITHIN a wave is free: no sequencing rule needed"
          if diff == 0 else "  -> ORDER MATTERS, must be specified")

    print()
    print("=" * 76)
    print("B. WAVES (breadth-first) vs ONE CHAIN AT A TIME (depth-first)")
    print("=" * 76)
    diff = n = tot_a = tot_b = 0
    for _ in range(N):
        p = rand_position(rng)
        if not p:
            continue
        cards, own, cell, card = p
        a = resolve([x for x in cards], own[:], cell, card, 0, CAP)[0]
        c2, o2 = [x for x in cards], own[:]
        c2[cell] = card
        o2[0] |= 1 << cell
        b = dfs_cascade(c2, o2, 1 << cell, 0, CAP, rng)
        n += 1
        tot_a += a
        tot_b += b
        if a != b:
            diff += 1
    print(f"  {n} positions, {diff} disagreements ({pct(diff / n)})")
    print(f"  mean captures: waves {tot_a / n:.3f}   depth-first "
          f"{tot_b / n:.3f}")
    print("  -> the wave structure is LOAD-BEARING and must be stated"
          if diff else "  -> free choice")

    print()
    print("=" * 76)
    print("C. REACH -- see ordering_reach.py")
    print("=" * 76)
    print("  An earlier version of this script compared 'reach then chain'")
    print("  against 'chain then reach' and reported no difference. That")
    print("  was the wrong pair: in both arrangements the reached card sits")
    print("  outside the chain's frontier, so the totals had to agree. It")
    print("  measured bookkeeping order, not the rule.")
    print("  The rule RULES.md claims is that reach cannot FEED the chain.")
    print("  ordering_reach.py compares that against the reading where a")
    print("  scorched card cascades like any other capture, and finds the")
    print("  outcomes differ in 36.4% of live positions -- so the rule is")
    print("  load-bearing and must be stated.")
    print()
    print("=" * 76)
    print("D+E. INVARIANTS")
    print("=" * 76)
    bad_owner = bad_twice = bad_rot = n = 0
    for _ in range(N):
        p = rand_position(rng)
        if not p:
            continue
        cards, own, cell, card = p
        before_cards = [x for x in cards]
        before_opp = own[1]
        c2, o2 = [x for x in cards], own[:]
        got, waves = v3.resolve(c2, o2, cell, card, 0, CAP)
        n += 1
        # D: the opponent never gains a cell during my turn
        if o2[1] & ~before_opp:
            bad_owner += 1
        # D: every captured cell is now mine
        if popcount(o2[0]) != popcount(own[0]) + 1 + got:
            bad_twice += 1
        # E: no card's orientation changed
        for i in range(NCELLS):
            if i != cell and before_cards[i] != c2[i]:
                bad_rot += 1
                break
    print(f"  {n} chains")
    print(f"  opponent gained a cell during my turn:      {bad_owner}")
    print(f"  capture count disagrees with ownership:     {bad_twice}")
    print(f"  a card's orientation changed during a chain:{bad_rot}")
    ok = not (bad_owner or bad_twice or bad_rot)
    print("  -> all three invariants hold" if ok else "  -> INVARIANT BROKEN")
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
