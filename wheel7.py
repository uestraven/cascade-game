#!/usr/bin/env python3
"""
A SEVEN-element wheel, which has no twins.

Playtest feedback: keeping track of each symbol's twin is hard. It is
also a poor trade -- twin matchups are 12.4% of adjacent facing pairs, so
four arbitrary pairs are being memorised to settle an eighth of the
comparisons. And the current wheel is not positionally derivable: there
is NO circular ordering of the eight in which each element beats the next
three, so the twin cannot be read off a diagram.

With seven elements it can. Number them 0-6 around a ring; each beats the
next three clockwise and loses to the previous three. That is a perfect
regular tournament: every element beats three and loses to three, it is
antisymmetric, and NO pair fails to resolve. One picture, one direction,
nothing to remember.

What it costs is what this measures:

  * dead matchups halve (25.0% -> 12.6%, only identical symbols), so
    captures and volatility should rise
  * 840 distinct cards instead of 1,680
  * Eclipse and Umbra are defined in terms of twins and would need
    replacing -- Eclipse is one of the best-behaved abilities in the game
  * twin standoffs were a safe wall; without them no adjacency is ever
    safe

Run against the shipped eight-element wheel as the control.
"""

import itertools
import random
import sys
from collections import Counter

import v3
from v3 import NB, NCELLS, OPPSIDE, ORDER, pct

RING7 = tuple(range(7))
CARDS7 = tuple(itertools.permutations(RING7, 4))


def beats7(a, b):
    """`a` beats the next three clockwise."""
    return (b - a) % 7 in (1, 2, 3)


def rot90(c):
    n, e, s, w = c
    return (w, n, e, s)


def resolve(cards, own, cell, card, player, cap, beats):
    cards[cell] = card
    own[player] |= 1 << cell
    opp = 1 - player
    frontier, captured, depth = 1 << cell, 0, 0
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


def exposure(cards, own, player):
    n = 0
    for i in range(NCELLS):
        if not (own[player] >> i) & 1 or cards[i] is None:
            continue
        for d in range(4):
            t = NB[i][d]
            if t >= 0 and cards[t] is None:
                n += 1
    return n


def choose(cards, own, hand, player, empties, cap, rng, lam, beats):
    best, ties = None, []
    for i, card in enumerate(hand):
        cv = card
        for _ in range(4):
            for cell in empties:
                c = [x for x in cards]
                o = own[:]
                got = resolve(c, o, cell, cv, player, cap, beats)
                s = got - lam * exposure(c, o, player)
                if best is None or s > best:
                    best, ties = s, [(i, cell, cv)]
                elif s == best:
                    ties.append((i, cell, cv))
            cv = rot90(cv)
    return rng.choice(ties)


def play(rng, pool, beats, lams, hands_n=(5, 6)):
    hands = [[rng.choice(pool) for _ in range(hands_n[p])] for p in (0, 1)]
    cards = [None] * NCELLS
    own = [0, 0]
    caps = 0
    biggest = 0
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = v3.cap_for_turn(turn)
        i, cell, cv = choose(cards, own, hands[p], p, empties, cap, rng,
                             lams[p], beats)
        hands[p].pop(i)
        got = resolve(cards, own, cell, cv, p, cap, beats)
        caps += got
        biggest = max(biggest, got)
    return [bin(own[0]).count('1'), bin(own[1]).count('1')], caps, biggest


def survey(games, pool, beats, seed=606):
    rng = random.Random(seed)
    p1 = n = 0
    caps = 0.0
    margins = Counter()
    bigs = Counter()
    for _ in range(games):
        s, c, b = play(rng, pool, beats, [0.5, 0.5])
        n += 1
        caps += c
        margins[abs(s[0] - s[1])] += 1
        bigs[b] += 1
        if s[0] > s[1]:
            p1 += 1
    return dict(p1=p1 / n, caps=caps / n,
                margins={k: v / n for k, v in margins.items()},
                bigs={k: v / n for k, v in bigs.items()})


def depth(games, pool, beats, seed=77):
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for smart in (0, 1):
            lams = [0.0, 0.0]
            lams[smart] = 0.5
            s, _, _ = play(rng, pool, beats, lams)
            if s[0] == s[1]:
                continue
            n += 1
            if (s[0] > s[1]) == (smart == 0):
                w += 1
    return w / max(n, 1)


def deadpairs(els, beats):
    """Share of ordered element pairs that do not resolve. Takes the
    element list, because the eight-wheel is numbered 1-8 and the
    seven-ring 0-6."""
    dead = sum(1 for a in els for b in els
               if not beats(a, b) and not beats(b, a))
    return dead / (len(els) * len(els))


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 600

    def beats8(a, b):
        return b in v3.BEATS[a]

    print("=" * 74)
    print("SEVEN ELEMENTS (no twins) vs the shipped EIGHT")
    print("=" * 74)
    print(f"  {G} games per row")
    print()
    print(f"  {'wheel':<22}{'cards':>7}{'dead pairs':>12}{'P1 win':>9}"
          f"{'caps':>7}{'big turn':>10}{'margin 1':>10}{'depth':>8}")
    for label, pool, beats, els in (
            ('eight, with twins', v3.CARDS, beats8, list(v3.ELEMENTS)),
            ('seven, no twins', CARDS7, beats7, list(RING7))):
        r = survey(G, pool, beats)
        dp = depth(G // 2, pool, beats)
        dead = deadpairs(els, beats)
        print(f"  {label:<22}{len(pool):>7}{pct(dead):>12}"
              f"{pct(r['p1']):>9}{r['caps']:>7.1f}{max(r['bigs']):>10}"
              f"{pct(r['margins'].get(1, 0)):>10}{pct(dp):>8}")
    print()
    print("  'dead pairs' counts ordered element pairs that cannot resolve,")
    print("  including a symbol against itself. Eight-with-twins has four")
    print("  twin pairs plus eight self-matches; seven has only the seven")
    print("  self-matches.")

    print()
    print("=" * 74)
    print("THE SEVEN-ELEMENT RING")
    print("=" * 74)
    print("  Each element beats the NEXT THREE clockwise:")
    print()
    for a in RING7:
        wins = [b for b in RING7 if beats7(a, b)]
        loses = [b for b in RING7 if beats7(b, a)]
        print(f"    {a}  beats {wins}   loses to {loses}")
    print()
    print("  No twin column, because there is no twin.")


if __name__ == '__main__':
    main()
