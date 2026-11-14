#!/usr/bin/env python3
"""
Does it matter that reach (Scorch, Backlash, Beacon) resolves AFTER the
chain?

ordering.py reported "no difference" and that was a bad test. It compared
"reach, then chain from the placed cell" against "chain from the placed
cell, then reach" -- but in both arrangements the reached card is outside
the chain's frontier, so of course the totals agreed. It measured
bookkeeping order, not the rule RULES.md actually claims.

The rule RULES.md claims is "they cannot FEED the chain". The alternative
reading that would break is the natural one a player might assume: that a
card taken by Scorch is part of your attack and therefore cascades like
any other capture. That is what gets compared here:

  SHIPPED   chain from the placed card; then the reach takes one card,
            which attacks nothing
  FED       the reach takes its card first, and that card joins the
            chain's starting frontier, so it attacks too

If those differ, the sentence is load-bearing and belongs in the rulebook.
"""

import random
import sys

import v3
from v3 import CARDS, NB, NCELLS, OPPSIDE, beats, pct, rot90

CAP = v3.CASCADE_CAP

DIAG = []
for i in range(NCELLS):
    r, c = divmod(i, 3)
    row = []
    for dr, dc, near in ((-1, -1, 0), (-1, 1, 0), (1, -1, 2), (1, 1, 2)):
        nr, nc = r + dr, c + dc
        if 0 <= nr < 3 and 0 <= nc < 3:
            row.append((nr * 3 + nc, near))
    DIAG.append(tuple(row))


def cascade(cards, own, origin, player, cap):
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


def run(cards, own, cell, card, player, t, near, fed):
    cards = [x for x in cards]
    own = own[:]
    opp = 1 - player
    cards[cell] = card
    own[player] |= 1 << cell
    got = 0

    def reach():
        if cards[t] and (own[opp] >> t) & 1 and \
                beats(card[near], cards[t][OPPSIDE[near]]):
            own[player] |= 1 << t
            own[opp] &= ~(1 << t)
            return True
        return False

    if fed:
        # the reached card is taken first AND joins the chain's frontier
        took = reach()
        origin = (1 << cell) | ((1 << t) if took else 0)
        got = (1 if took else 0) + cascade(cards, own, origin, player, CAP)
    else:
        got = cascade(cards, own, 1 << cell, player, CAP)
        if reach():
            got += 1
    return got, own[player]


def position(rng):
    n = rng.randint(4, 8)
    cards = [None] * NCELLS
    own = [0, 0]
    for c in rng.sample(range(NCELLS), n):
        x = rng.choice(CARDS)
        for _ in range(rng.randrange(4)):
            x = rot90(x)
        cards[c] = x
        own[0 if rng.random() < 0.35 else 1] |= 1 << c
    empt = [i for i in range(NCELLS) if cards[i] is None]
    if not empt:
        return None
    cell = rng.choice(empt)
    card = rng.choice(CARDS)
    for _ in range(rng.randrange(4)):
        card = rot90(card)
    return cards, own, cell, card


def main():
    rng = random.Random(4812)
    N = 200000
    print("=" * 74)
    print("DOES 'REACH CANNOT FEED THE CHAIN' CHANGE THE OUTCOME?")
    print("=" * 74)
    n = diff = 0
    sa = sb = 0
    worst = None
    for _ in range(N):
        p = position(rng)
        if not p:
            continue
        cards, own, cell, card = p
        targets = [(t, near) for t, near in DIAG[cell]
                   if cards[t] and (own[1] >> t) & 1
                   and beats(card[near], cards[t][OPPSIDE[near]])]
        if not targets:
            continue
        t, near = targets[0]
        a = run(cards, own, cell, card, 0, t, near, fed=False)
        b = run(cards, own, cell, card, 0, t, near, fed=True)
        n += 1
        sa += a[0]
        sb += b[0]
        if a != b:
            diff += 1
            if worst is None or (b[0] - a[0]) > worst[0]:
                worst = (b[0] - a[0], cards, own, cell, card, t, a[0], b[0])

    print(f"  {n} positions where Scorch had a live diagonal target")
    print(f"  outcomes differ in {diff} ({pct(diff / max(n, 1))})")
    print(f"  mean captures: shipped {sa / max(n,1):.3f}   "
          f"if reach fed the chain {sb / max(n,1):.3f}  "
          f"(+{(sb - sa) / max(n,1):.3f})")
    print()
    if diff:
        gap, cards, own, cell, card, t, a, b = worst
        print("  -> LOAD-BEARING. The rulebook must say that a card taken by")
        print("     reach starts no chain, or Scorch becomes a second")
        print("     placement.")
        print(f"  widest witness: {a} captures shipped vs {b} if it fed, "
              f"placing on cell {cell}, scorching cell {t}")
    else:
        print("  -> free choice after all")
    return 0


if __name__ == '__main__':
    sys.exit(main())
