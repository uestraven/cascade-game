#!/usr/bin/env python3
"""
What a 4x4 board changes.

The appeal is arithmetic: 16 cells is EVEN, so both players place eight
and the discretion asymmetry disappears. That asymmetry is the thing no
hand model could compensate -- P1's extra placement on nine cells is
priced only by P1 being forced to play their whole hand, which every
small-hand or refilling model destroys.

The costs are what this measures:

  * draws come back, because eight owned cells each can split 8-8
  * decision load goes UP, which is the opposite of the stated goal:
    choices per turn is hand x 4 rotations x empty cells, and empty
    cells nearly doubles
  * the game stops being decided by one card, because each card is a
    smaller share of the board

Grid size is a parameter so the same harness runs 3x3, and the 3x3 run
is a validation check: it has to reproduce the figures measured all
session (P1 ~51%, depth ~70%, ~18.7 captures) or the port is wrong.
"""

import random
import sys
from collections import Counter

import v3
from v3 import BEATS, CARDS, ELEMENTS, TWIN, pct, rot90

NORTH, EAST, SOUTH, WEST = range(4)
OPPSIDE = (SOUTH, WEST, NORTH, EAST)
_DELTA = ((-1, 0), (0, 1), (1, 0), (0, -1))


def geometry(grid):
    n = grid * grid
    nb = []
    for i in range(n):
        r, c = divmod(i, grid)
        nb.append(tuple(
            ((r + dr) * grid + (c + dc))
            if 0 <= r + dr < grid and 0 <= c + dc < grid else -1
            for dr, dc in _DELTA))
    return n, tuple(nb)


def beats(a, b):
    return b in BEATS[a]


def resolve(nb, ncells, cards, own, cell, card, player, cap):
    """The shipped capture rule, on an arbitrary square grid."""
    cards[cell] = card
    own[player] |= 1 << cell
    opp = 1 - player
    frontier, captured, waves, depth = 1 << cell, 0, 0, 0
    while frontier and depth <= cap:
        newly = 0
        for src in range(ncells):
            if not (frontier >> src) & 1 or cards[src] is None:
                continue
            for d in range(4):
                t = nb[src][d]
                if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
                    continue
                if beats(cards[src][d], cards[t][OPPSIDE[d]]):
                    newly |= 1 << t
        if newly:
            own[player] |= newly
            own[opp] &= ~newly
            captured += bin(newly).count('1')
            waves += 1
        frontier = newly
        depth += 1
    return captured, waves


def exposure(nb, ncells, cards, own, player):
    n = 0
    for i in range(ncells):
        if not (own[player] >> i) & 1 or cards[i] is None:
            continue
        for d in range(4):
            t = nb[i][d]
            if t >= 0 and cards[t] is None:
                n += 1
    return n


def choose(nb, ncells, cards, own, hand, player, empties, cap, rng, lam):
    best, ties = None, []
    for i, card in enumerate(hand):
        cv = card
        for _ in range(4):
            for cell in empties:
                c = [x for x in cards]
                o = own[:]
                got, _ = resolve(nb, ncells, c, o, cell, cv, player, cap)
                s = got - lam * exposure(nb, ncells, c, o, player)
                if best is None or s > best:
                    best, ties = s, [(i, cell, cv)]
                elif s == best:
                    ties.append((i, cell, cv))
            cv = rot90(cv)
    return rng.choice(ties)


def play(rng, grid, hands_n, refill, mute_final, lams, count=False):
    ncells, nb = geometry(grid)
    order = tuple(i % 2 for i in range(ncells))
    deck = [rng.choice(CARDS) for _ in range(ncells * 3)]
    hands = [deck[:hands_n[0]], deck[hands_n[0]:sum(hands_n)]]
    pile = deck[sum(hands_n):]
    cards = [None] * ncells
    own = [0, 0]
    caps = 0
    tot = turns = first = 0
    swing = 0
    frontot = emptot = froncells = 0
    infront = placements = 0
    for turn, p in enumerate(order):
        empties = [i for i in range(ncells) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        last = turn == len(order) - 1
        cap = 0 if (last and mute_final) else v3.CASCADE_CAP
        front = [c for c in empties
                 if any(nb[c][d] >= 0 and cards[nb[c][d]] is not None
                        for d in range(4))]
        if count:
            tot += len(hands[p]) * 4 * len(empties)
            frontot += len(hands[p]) * 4 * max(len(front), 1)
            emptot += len(empties)
            froncells += len(front)
            turns += 1
            if turn == 0:
                first = len(hands[p]) * 4 * len(empties)
        before = bin(own[p]).count('1') - bin(own[1 - p]).count('1')
        i, cell, cv = choose(nb, ncells, cards, own, hands[p], p, empties,
                             cap, rng, lams[p])
        hands[p].pop(i)
        placements += 1
        if cell in front:
            infront += 1
        got, _ = resolve(nb, ncells, cards, own, cell, cv, p, cap)
        caps += got
        after = bin(own[p]).count('1') - bin(own[1 - p]).count('1')
        if before < 0 <= after or after < 0 <= before:
            swing += 1
        if refill and pile and len(hands[p]) < hands_n[p]:
            hands[p].append(pile.pop(0))
    s = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    return (s, caps, (tot / max(turns, 1)), first, swing,
            frontot / max(turns, 1), emptot / max(turns, 1),
            froncells / max(turns, 1), infront / max(placements, 1))


def run(games, grid, hands_n, refill, mute_final, seed=606):
    rng = random.Random(seed)
    dr = p1 = n = 0
    caps = bf = fi = sw = 0.0
    fbf = ecl = fcl = inff = 0.0
    onecard = 0
    for _ in range(games):
        s, c, b, f, swing, fb, ec, fc, inf = play(
            rng, grid, hands_n, refill, mute_final, [0.5, 0.5], count=True)
        n += 1
        caps += c
        bf += b
        fi += f
        sw += swing
        fbf += fb
        ecl += ec
        fcl += fc
        inff += inf
        if abs(s[0] - s[1]) <= 1:
            onecard += 1
        if s[0] == s[1]:
            dr += 1
        elif s[0] > s[1]:
            p1 += 1
    return dict(draws=dr / n, p1=p1 / n, caps=caps / n, bf=bf / n,
                first=fi / n, swing=sw / n, onecard=onecard / n,
                front_bf=fbf / n, empty=ecl / n, front=fcl / n,
                in_front=inff / n)


def depth(games, grid, hands_n, refill, mute_final, seed=77):
    """The positional bot (lambda 0.5) against a pure capture-greedy one
    (lambda 0), seats swapped. A first version of this set ONE global
    lambda, so both sides ran the same policy and it compared a bot with
    itself."""
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for smart in (0, 1):
            lams = [0.0, 0.0]
            lams[smart] = 0.5
            s = play(rng, grid, hands_n, refill, mute_final, lams)[0]
            if s[0] == s[1]:
                continue
            n += 1
            if (s[0] > s[1]) == (smart == 0):
                w += 1
    return w / max(n, 1)


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 400
    r = run(G, 3, (5, 6), False, True)
    print("=" * 78)
    print("VALIDATION -- the 3x3 row must match the figures measured all")
    print("session, or this parameterised port is wrong")
    print("=" * 78)
    print(f"  P1 {pct(r['p1'])}  draws {pct(r['draws'])}"
          f"  captures {r['caps']:.2f}  within one card {pct(r['onecard'])}")
    print(f"  expected:  P1 ~51%, draws 0%, captures ~18.7, one card 69-91%")
    print()
    print("=" * 78)
    print("BOARD SIZE -- and whether a bigger board really costs decisions")
    print("=" * 78)
    print("  'all cells' counts every empty cell as a candidate.")
    print("  'frontier' counts only empty cells touching a placed card,")
    print("  which is the set a player plausibly considers.")
    print()
    print(f"  {'board':<6}{'hands':<9}{'mode':<8}{'draws':>7}{'P1':>7}"
          f"{'caps':>6}{'+-1':>7}{'depth':>7}"
          f"{'empty':>7}{'front':>7}{'clustered':>11}"
          f"{'all cells':>11}{'frontier':>10}")
    for grid, hn, refill in [
            (3, (5, 6), False), (3, (3, 3), True),
            (4, (8, 8), False), (4, (8, 9), False),
            (4, (3, 3), True), (4, (5, 5), True),
            # 15 placements leaves one cell empty, so the margin is forced
            # odd and a draw becomes impossible again
            (4, (8, 7), False), (4, (7, 8), False)]:
        r = run(G, grid, hn, refill, True)
        dp = depth(max(G // 2, 200), grid, hn, refill, True)
        print(f"  {grid}x{grid:<3}{str(hn):<9}"
              f"{('refill' if refill else 'once'):<8}"
              f"{pct(r['draws']):>7}{pct(r['p1']):>7}{r['caps']:>6.1f}"
              f"{pct(r['onecard']):>7}{pct(dp):>7}"
              f"{r['empty']:>7.1f}{r['front']:>7.1f}"
              f"{pct(r['in_front']):>11}"
              f"{r['bf']:>11.0f}{r['front_bf']:>10.0f}")
    print()
    print("  If 'frontier' choices barely rise from 3x3 to 4x4, the board")
    print("  size does not cost decision load and the claim holds.")


if __name__ == '__main__':
    main()
