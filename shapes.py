#!/usr/bin/env python3
"""
Board shape: 3x3 against 3x4 against 4x4.

Written as rows x cols rather than patching the square-only version, so
3x4 is a first-class case instead of a special one.

Two things are already settled and shape the comparison:

  * DECISION LOAD IS NOT MAINLY THE BOARD. Measured: placements land
    adjacent to an existing card 88.9% of the time on 3x3 and 93.8% on
    4x4, and the frontier -- empty cells touching a placed card, which is
    the set a player actually weighs -- grows only 2.2 to 3.1 while total
    empty cells grow 5.0 to 8.5. So both 'all cells' and 'frontier' are
    reported, and the frontier column is the honest one.

  * CELL PARITY IS THE WHOLE BALANCE PROBLEM. An ODD number of filled
    cells forces a winner but also forces one player to place more, which
    creates the discretion asymmetry that no hand model could compensate.
    An EVEN number balances the seats and brings back draws. So every
    shape is run at both parities: filling the board, and leaving one
    cell empty by dealing one fewer card.
"""

import random
import sys
from collections import Counter

import v3
from v3 import BEATS, CARDS, pct, rot90

NORTH, EAST, SOUTH, WEST = range(4)
OPPSIDE = (SOUTH, WEST, NORTH, EAST)
_DELTA = ((-1, 0), (0, 1), (1, 0), (0, -1))


def geometry(rows, cols):
    n = rows * cols
    nb = []
    for i in range(n):
        r, c = divmod(i, cols)
        nb.append(tuple(
            ((r + dr) * cols + (c + dc))
            if 0 <= r + dr < rows and 0 <= c + dc < cols else -1
            for dr, dc in _DELTA))
    return n, tuple(nb)


def beats(a, b):
    return b in BEATS[a]


def resolve(nb, ncells, cards, own, cell, card, player, cap):
    cards[cell] = card
    own[player] |= 1 << cell
    opp = 1 - player
    frontier, captured, depth = 1 << cell, 0, 0
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
        frontier = newly
        depth += 1
    return captured


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
                got = resolve(nb, ncells, c, o, cell, cv, player, cap)
                s = got - lam * exposure(nb, ncells, c, o, player)
                if best is None or s > best:
                    best, ties = s, [(i, cell, cv)]
                elif s == best:
                    ties.append((i, cell, cv))
            cv = rot90(cv)
    return rng.choice(ties)


def play(rng, shape, hands_n, refill, lams, stop=None):
    """`stop` caps the number of placements, which is how a cell is left
    empty to force an odd margin."""
    rows, cols = shape
    ncells, nb = geometry(rows, cols)
    limit = ncells if stop is None else stop
    order = tuple(i % 2 for i in range(limit))
    deck = [rng.choice(CARDS) for _ in range(ncells * 3)]
    hands = [deck[:hands_n[0]], deck[hands_n[0]:sum(hands_n)]]
    pile = deck[sum(hands_n):]
    cards = [None] * ncells
    own = [0, 0]
    caps = 0
    allch = froch = turns = 0
    infront = placements = 0
    emptysum = frontsum = 0
    for turn, p in enumerate(order):
        empties = [i for i in range(ncells) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = 0 if turn == limit - 1 else v3.CASCADE_CAP
        front = [c for c in empties
                 if any(nb[c][d] >= 0 and cards[nb[c][d]] is not None
                        for d in range(4))]
        allch += len(hands[p]) * 4 * len(empties)
        froch += len(hands[p]) * 4 * max(len(front), 1)
        emptysum += len(empties)
        frontsum += len(front)
        turns += 1
        i, cell, cv = choose(nb, ncells, cards, own, hands[p], p, empties,
                             cap, rng, lams[p])
        hands[p].pop(i)
        placements += 1
        if cell in front:
            infront += 1
        caps += resolve(nb, ncells, cards, own, cell, cv, p, cap)
        if refill and pile and len(hands[p]) < hands_n[p]:
            hands[p].append(pile.pop(0))
    s = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    t = max(turns, 1)
    return dict(score=s, caps=caps, allch=allch / t, froch=froch / t,
                empty=emptysum / t, front=frontsum / t,
                clustered=infront / max(placements, 1),
                placed=placements)


def run(games, shape, hands_n, refill, stop=None, seed=606):
    rng = random.Random(seed)
    acc = Counter()
    n = 0
    f = Counter()
    for _ in range(games):
        r = play(rng, shape, hands_n, refill, [0.5, 0.5], stop)
        n += 1
        s = r['score']
        for k in ('caps', 'allch', 'froch', 'empty', 'front', 'clustered',
                  'placed'):
            acc[k] += r[k]
        if s[0] == s[1]:
            f['draw'] += 1
        elif s[0] > s[1]:
            f['p1'] += 1
        if abs(s[0] - s[1]) == 1:
            f['close'] += 1
    out = {k: v / n for k, v in acc.items()}
    out.update(draws=f['draw'] / n, p1=f['p1'] / n, close=f['close'] / n)
    return out


def depth(games, shape, hands_n, refill, stop=None, seed=77):
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for smart in (0, 1):
            lams = [0.0, 0.0]
            lams[smart] = 0.5
            s = play(rng, shape, hands_n, refill, lams, stop)['score']
            if s[0] == s[1]:
                continue
            n += 1
            if (s[0] > s[1]) == (smart == 0):
                w += 1
    return w / max(n, 1)


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 400

    print("=" * 80)
    print("SHAPES.  'fills' = every cell gets a card; 'one empty' = one")
    print("fewer placement, which forces the margin odd so a draw cannot")
    print("happen.")
    print("=" * 80)
    print(f"  {G} games per row.")
    print()
    print(f"  {'board':<7}{'cells':<7}{'hands':<9}{'mode':<11}"
          f"{'draws':>7}{'P1':>7}{'seat':>7}{'caps':>6}{'margin 1':>10}"
          f"{'depth':>7}{'front':>7}{'clust':>7}{'frontier ch':>13}")
    rows = [
        # the shipped game, as a validation anchor
        ((3, 3), (5, 6), False, None),
        ((3, 4), (6, 6), False, None),
        ((3, 4), (6, 5), False, 11),
        ((3, 4), (3, 3), True, None),
        ((3, 4), (3, 3), True, 11),
        ((4, 4), (8, 8), False, None),
        ((4, 4), (8, 7), False, 15),
        ((4, 4), (3, 3), True, 15),
    ]
    for shape, hn, refill, stop in rows:
        r = run(G, shape, hn, refill, stop)
        dp = depth(max(G // 2, 200), shape, hn, refill, stop)
        ncells = shape[0] * shape[1]
        mode = ('refill' if refill else 'once') + \
               ('' if stop is None else ', 1 empty')
        print(f"  {shape[0]}x{shape[1]:<5}{ncells:<7}{str(hn):<9}{mode:<11}"
              f"{pct(r['draws']):>7}{pct(r['p1']):>7}"
              f"{pct(abs(r['p1'] - 0.5)):>7}{r['caps']:>6.1f}"
              f"{pct(r['close']):>10}{pct(dp):>7}"
              f"{r['front']:>7.1f}{pct(r['clustered']):>7}"
              f"{r['froch']:>13.0f}")
    print()
    print("  The 3x3 (5,6) row anchors everything: it should read P1 ~51%,")
    print("  0% draws, ~18.7 captures.")


if __name__ == '__main__':
    main()
