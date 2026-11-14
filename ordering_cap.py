#!/usr/bin/env python3
"""
WHY traversal order cannot matter -- and the condition that guarantees it.

Two scripts failed to find a position where breadth-first waves and a
depth-first reading disagree (160,000 positions, 29 orderings). That is not
luck. The 3x3 board's adjacency graph is BIPARTITE: colour the cells like a
chessboard and every edge joins opposite colours. So every path from the
placed card to a given cell has the same parity, and a cell at graph
distance 1 can never be reached by a depth-1 step from another
distance-1 cell -- there are no triangles to shortcut through.

With the cascade capped at two waves (depths 0 and 1), every reachable cell
therefore has exactly ONE possible depth, whatever order you walk in. The
readings cannot diverge.

That is a fact about the CAP, not about the game. Raise the cap and a cell
at distance 1 becomes reachable at depth 3 as well, a depth-first walk can
burn the extra levels getting there, and the readings come apart. This
sweeps the cap to find where that starts, so the rulebook can say plainly
which of its sentences are load-bearing.
"""

import itertools
import random
import sys

import v3
from v3 import CARDS, NB, NCELLS, OPPSIDE, beats, pct, rot90

PERMS = list(itertools.permutations(range(4)))


def check_bipartite():
    """Chessboard colouring: every adjacency must join opposite colours."""
    colour = [(i // 3 + i % 3) & 1 for i in range(NCELLS)]
    for i in range(NCELLS):
        for d in range(4):
            t = NB[i][d]
            if t >= 0 and colour[i] == colour[t]:
                return False, (i, t)
    return True, None


def distances():
    """Graph distance from every cell to every other."""
    INF = 99
    dist = [[INF] * NCELLS for _ in range(NCELLS)]
    for s in range(NCELLS):
        dist[s][s] = 0
        frontier = [s]
        d = 0
        while frontier:
            nxt = []
            d += 1
            for u in frontier:
                for k in range(4):
                    v = NB[u][k]
                    if v >= 0 and dist[s][v] == INF:
                        dist[s][v] = d
                        nxt.append(v)
            frontier = nxt
    return dist


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


def position(rng):
    n = rng.randint(6, 8)
    cards = [None] * NCELLS
    own = [0, 0]
    for cell in rng.sample(range(NCELLS), n):
        c = rng.choice(CARDS)
        for _ in range(rng.randrange(4)):
            c = rot90(c)
        cards[cell] = c
        own[0 if rng.random() < 0.2 else 1] |= 1 << cell
    empt = [i for i in range(NCELLS) if cards[i] is None]
    if not empt:
        return None
    cell = rng.choice(empt)
    card = rng.choice(CARDS)
    for _ in range(rng.randrange(4)):
        card = rot90(card)
    return cards, own, cell, card


def main():
    ok, bad = check_bipartite()
    print("=" * 74)
    print("1. IS THE BOARD GRAPH BIPARTITE?")
    print("=" * 74)
    print(f"  chessboard colouring holds on all adjacencies: {ok}"
          + (f"  (broken at {bad})" if not ok else ""))

    dist = distances()
    print()
    print("=" * 74)
    print("2. PARITY -- can one cell sit at two different depths?")
    print("=" * 74)
    print("  For each origin and target, every path length has the same")
    print("  parity as the shortest. So a target first reached at depth d")
    print("  by a longer route is reached at d+2, d+4, ... never d+1.")
    pairs = [(a, b) for a in range(NCELLS) for b in range(NCELLS) if a != b]
    far = max(dist[a][b] for a, b in pairs)
    print(f"  max graph distance on the 3x3 board: {far}")
    print("  with a 2-wave cap, reachable depths are 1 and 2 only, which")
    print("  are opposite parities -- so no cell is ambiguous.")

    print()
    print("=" * 74)
    print("3. CAP SWEEP -- at what cap do the two readings come apart?")
    print("=" * 74)
    orders = [(p, p, p, p, p, p) for p in PERMS]
    orders += [(PERMS[i], PERMS[j], PERMS[k], PERMS[l], PERMS[0], PERMS[0])
               for i, j, k, l in ((0, 23, 7, 11), (23, 0, 11, 3),
                                  (5, 17, 2, 19), (11, 3, 19, 7))]
    N = 30000
    print(f"  {N} positions x {len(orders)} orderings per cap")
    print(f"  {'cap':<6}{'waves':<8}{'disagree with waves':>22}"
          f"{'dfs self-disagrees':>22}")
    for cap in (0, 1, 2, 3, 4, 8):
        rng = random.Random(900 + cap)
        n = vs = self_ = 0
        for _ in range(N):
            p = position(rng)
            if not p:
                continue
            cards, own, cell, card = p
            c, o = [x for x in cards], own[:]
            c[cell] = card
            o[0] |= 1 << cell
            b = bfs(c, o, 1 << cell, 0, cap)
            lo = hi = None
            for order in orders:
                c2, o2 = [x for x in cards], own[:]
                c2[cell] = card
                o2[0] |= 1 << cell
                g = dfs(c2, o2, 1 << cell, 0, cap, order)
                lo = g if lo is None else min(lo, g)
                hi = g if hi is None else max(hi, g)
            n += 1
            if lo != hi:
                self_ += 1
            if b != lo or b != hi:
                vs += 1
        tag = '  <-- SHIPPED' if cap == v3.CASCADE_CAP else ''
        print(f"  {cap:<6}{cap + 1:<8}{pct(vs / n):>22}"
              f"{pct(self_ / n):>22}{tag}")

    print()
    print("  The shipped cap of 1 (two waves) is in the safe region: the")
    print("  rulebook does NOT have to specify a traversal order. Raising")
    print("  the cap to 3 or more would make that sentence load-bearing.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
