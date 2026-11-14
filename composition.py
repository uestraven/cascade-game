#!/usr/bin/env python3
"""
Composition matchup matrix: do card TYPES create archetypes?

Every previous measurement asked whether a card type is individually
strong, and the answer was always no. This asks a different question: does
a deck built from one type beat a deck built from another, and do those
results form a loop?

  non-transitive (A>B>C>A)  -> archetypes exist, deckbuilding is real
  one mix dominates         -> solved deck, types are a trap
  all even                  -> types are decoration

Types differ in AIMABILITY and EXPLOITABILITY, not strength:

  BASIC       four distinct elements. Four orientations -- maximum
              flexibility, maximum chance of aiming it wrong.
  SPECIALIST  one element on all four edges. ONE orientation: you cannot
              misplay its rotation, and your opponent always knows every
              side. Beats exactly three, loses to exactly three, from any
              direction.
  DUAL        two elements, opposite edges paired. Two orientations.
  NULL        one blank edge. A blank can never capture and anything takes
              it, but with free rotation you can aim it at a wall.
  ABILITY     a basic card carrying one of the thirteen abilities.

Seats are swapped on every pairing, because P1 and P2 are not symmetric
and a one-sided read would measure the seat.
"""

import itertools
import random
from collections import Counter

import v3
from v3 import ELEMENTS, NCELLS, ORDER, pct, rot90

NULL = 0
TYPES = ['BASIC', 'SPECIALIST', 'DUAL', 'NULL', 'ABILITY']

BASIC_POOL = tuple(itertools.permutations(ELEMENTS, 4))
SPECIALIST_POOL = tuple((e, e, e, e) for e in ELEMENTS)
DUAL_POOL = tuple((a, b, a, b) for a in ELEMENTS for b in ELEMENTS if a != b)
NULL_POOL = tuple(c for c in itertools.permutations(
    (NULL,) + ELEMENTS, 4) if NULL in c)


def beats(a, b):
    """A blank edge never captures; anything with an element takes one."""
    if a == NULL:
        return False
    if b == NULL:
        return True
    return b in v3.BEATS[a]


def draw(rng, t):
    if t == 'BASIC':
        return rng.choice(BASIC_POOL)
    if t == 'SPECIALIST':
        return rng.choice(SPECIALIST_POOL)
    if t == 'DUAL':
        return rng.choice(DUAL_POOL)
    if t == 'NULL':
        return rng.choice(NULL_POOL)
    if t == 'ABILITY':
        return rng.choice(BASIC_POOL)      # ability modelled separately
    raise ValueError(t)


def orients(card):
    """Distinct orientations only -- a specialist has exactly one."""
    out = []
    c = card
    for _ in range(4):
        if c not in out:
            out.append(c)
        c = rot90(c)
    return out


def resolve(cards, own, cell, card, p, cap):
    cards[cell] = card
    own[p] |= 1 << cell
    opp = 1 - p
    frontier, captured, depth = 1 << cell, 0, 0
    while frontier and depth <= cap:
        newly = 0
        for src in range(NCELLS):
            if not (frontier >> src) & 1 or cards[src] is None:
                continue
            se = cards[src]
            for d in range(4):
                t = v3.NB[src][d]
                if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
                    continue
                if beats(se[d], cards[t][v3.OPPSIDE[d]]):
                    newly |= 1 << t
        if newly:
            own[p] |= newly
            own[opp] &= ~newly
            captured += bin(newly).count('1')
        frontier = newly
        depth += 1
    return captured


def choose(cards, own, hand, p, empt, rng, cap, smart):
    best, ties = -1, []
    for i, card in enumerate(hand):
        for cv in orients(card):
            for cell in empt:
                c = [x for x in cards]
                o = own[:]
                g = resolve(c, o, cell, cv, p, cap)
                if g > best:
                    best, ties = g, [(i, cell, cv)]
                elif g == best:
                    ties.append((i, cell, cv))
    if smart:
        def openedge(cell):
            return sum(1 for d in range(4)
                       if v3.NB[cell][d] >= 0
                       and cards[v3.NB[cell][d]] is None)
        lo = min(openedge(t[1]) for t in ties)
        ties = [t for t in ties if openedge(t[1]) == lo]
    return rng.choice(ties)


def play(rng, types, smarts):
    hands = [[draw(rng, types[p]) for _ in range(v3.HANDS[p])]
             for p in (0, 1)]
    cards = [None] * NCELLS
    own = [0, 0]
    caps = 0
    branch = 0
    turns = 0
    for t, p in enumerate(ORDER):
        empt = [i for i in range(NCELLS) if cards[i] is None]
        if not empt or not hands[p]:
            continue
        cap = v3.FINAL_CASCADE_CAP if t == len(ORDER) - 1 else v3.CASCADE_CAP
        branch += sum(len(orients(c)) for c in hands[p]) * len(empt)
        turns += 1
        i, cell, cv = choose(cards, own, hands[p], p, empt, rng, cap,
                             smarts[p])
        hands[p].pop(i)
        caps += resolve(cards, own, cell, cv, p, cap)
    return ([bin(own[0]).count('1'), bin(own[1]).count('1')], caps,
            branch / max(turns, 1))


def matchup(games, ta, tb, seed=4242):
    """A's win rate, seats swapped so the seat cannot leak in."""
    rng = random.Random(seed)
    wins = n = 0
    caps = close = 0
    for _ in range(games):
        for a_seat in (0, 1):
            types = [tb, tb]
            types[a_seat] = ta
            s, c, _ = play(rng, types, [False, False])
            n += 1
            caps += c
            if abs(s[0] - s[1]) == 1:
                close += 1
            if (s[0] > s[1]) == (a_seat == 0):
                wins += 1
    return wins / n, caps / n, close / n


def depth(games, t, seed=22):
    rng = random.Random(seed)
    wins = n = 0
    for _ in range(games):
        for smart in (0, 1):
            sm = [False, False]
            sm[smart] = True
            s, _, _ = play(rng, [t, t], sm)
            n += 1
            if (s[0] > s[1]) == (smart == 0):
                wins += 1
    return wins / n


def main():
    PLAY = [t for t in TYPES if t != 'ABILITY']   # ability == basic here

    print("=" * 78)
    print("A. WHAT EACH TYPE IS")
    print("=" * 78)
    print(f"  {'type':<12}{'cards':>7}{'avg orientations':>19}"
          f"{'mirror caps':>13}{'depth':>8}")
    for t in PLAY:
        pool = {'BASIC': BASIC_POOL, 'SPECIALIST': SPECIALIST_POOL,
                'DUAL': DUAL_POOL, 'NULL': NULL_POOL}[t]
        avg = sum(len(orients(c)) for c in pool) / len(pool)
        _, caps, _ = matchup(1200, t, t)
        d = depth(700, t)
        print(f"  {t:<12}{len(pool):>7}{avg:>19.2f}{caps:>13.2f}"
              f"{pct(d):>8}")

    print()
    print("=" * 78)
    print("B. MATCHUP MATRIX -- row's win rate against column")
    print("=" * 78)
    print(f"  {'':<12}" + "".join(f"{t[:6]:>10}" for t in PLAY))
    grid = {}
    for ta in PLAY:
        row = ""
        for tb in PLAY:
            if ta == tb:
                row += f"{'--':>10}"
                grid[(ta, tb)] = 0.5
                continue
            w, _, _ = matchup(1400, ta, tb)
            grid[(ta, tb)] = w
            row += f"{pct(w):>10}"
        print(f"  {ta:<12}{row}")

    print()
    print("=" * 78)
    print("C. IS IT A LOOP?")
    print("=" * 78)
    beats_ = {t: [u for u in PLAY if u != t and grid[(t, u)] > 0.53]
              for t in PLAY}
    for t in PLAY:
        b = ', '.join(beats_[t]) or 'nothing'
        print(f"  {t:<12} beats {b}")
    cycles = []
    for a, b, c in itertools.permutations(PLAY, 3):
        if b in beats_[a] and c in beats_[b] and a in beats_[c]:
            cycles.append((a, b, c))
    print()
    if cycles:
        print(f"  NON-TRANSITIVE: {len(cycles)} three-way loop(s) found")
        for cy in cycles[:4]:
            print(f"    {cy[0]} > {cy[1]} > {cy[2]} > {cy[0]}")
    else:
        dom = [t for t in PLAY if len(beats_[t]) == len(PLAY) - 1]
        if dom:
            print(f"  DOMINANT: {', '.join(dom)} beats everything -- "
                  f"solved deck")
        else:
            spread = max(grid.values()) - min(grid.values())
            print(f"  NO LOOP. widest matchup spread "
                  f"{pct(spread)} -- types are decoration unless that is "
                  f"enough for you")


if __name__ == '__main__':
    main()
