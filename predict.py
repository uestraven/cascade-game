#!/usr/bin/env python3
"""
If the lead changes hands 7.5 times in 8 turns, what DOES tell you who is
winning?

The ablation found positional control worth 38% + 35% + 22% of win rate
across its three facets, while the running score flips nearly every turn
because captures accrue to whoever just placed. So the score may be a
lagging display while the real state is positional. This tests that.

A FIRST VERSION OF THIS SCRIPT WAS WRONG and the way it failed is worth
keeping. It scored each signal by whether its SIGN predicted the winner,
and produced a perfect 46.8 / 53.2 / 46.8 / 53.2 alternation by turn --
which is just the base rate of who wins, because after an odd number of
placements P1 has always just captured and is always ahead. Sign accuracy
measured turn parity, not information.

So this uses AUC instead: the probability that a randomly chosen game P1
went on to win had a higher signal, at that turn, than a randomly chosen
game P1 lost. AUC is invariant to any per-turn offset, so parity cannot
leak in. 50% is no information.

Three signals, all oriented so that higher favours P1:

  score       cards owned, the difference -- what the UI shows
  open edges  P2's open edges minus P1's (fewer of your own is better)
  safe cards  cards you own that touch no empty cell, the difference
"""

import random
import sys

import v3
from v3 import NB, NCELLS, ORDER, pct

import identity as I


def safe_cards(cards, own, player):
    """Cards I own that no placement can reach: every neighbour filled."""
    n = 0
    for i in range(NCELLS):
        if not (own[player] >> i) & 1 or cards[i] is None:
            continue
        if all(NB[i][d] < 0 or cards[NB[i][d]] is not None
               for d in range(4)):
            n += 1
    return n


def auc(pos, neg):
    """P(a random positive outranks a random negative), ties at 0.5."""
    if not pos or not neg:
        return None
    wins = 0.0
    for a in pos:
        for b in neg:
            if a > b:
                wins += 1
            elif a == b:
                wins += 0.5
    return wins / (len(pos) * len(neg))


def snapshot_game(rng, faculty='full'):
    hands = [[rng.choice(v3.CARDS) for _ in range(I.HANDS[p])]
             for p in (0, 1)]
    cards = [None] * NCELLS
    own = [0, 0]
    rows = []
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = v3.cap_for_turn(turn)
        i, cell, cv = I.choose(cards, own, hands[p], p, empties, cap, rng,
                               faculty)
        hands[p].pop(i)
        v3.resolve(cards, own, cell, cv, p, cap)
        rows.append((
            turn + 1,
            bin(own[0]).count('1') - bin(own[1]).count('1'),
            I.exposure(cards, own, 1) - I.exposure(cards, own, 0),
            safe_cards(cards, own, 0) - safe_cards(cards, own, 1),
        ))
    s = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    return rows, (0 if s[0] > s[1] else 1)


SIGNALS = ('score', 'open edges', 'safe cards')


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 1200
    rng = random.Random(515)
    # placements -> signal -> (p1 won values, p1 lost values)
    data = {}
    for _ in range(G):
        rows, winner = snapshot_game(rng)
        for placed, *sigs in rows:
            for name, v in zip(SIGNALS, sigs):
                d = data.setdefault((placed, name), ([], []))
                d[0 if winner == 0 else 1].append(v)

    print("=" * 72)
    print("WHICH SIGNAL PREDICTS THE WINNER?   (AUC; 50% = no information)")
    print("=" * 72)
    print(f"  {G} games, full bot both seats")
    print()
    print(f"  {'after':<10}" + "".join(s.rjust(14) for s in SIGNALS)
          + "best".rjust(13))
    for placed in range(1, 10):
        vals = {}
        for name in SIGNALS:
            d = data.get((placed, name))
            vals[name] = auc(d[0], d[1]) if d else None
        if any(v is None for v in vals.values()):
            continue
        best = max(SIGNALS, key=lambda s: vals[s])
        row = "".join(pct(vals[s]).rjust(14) for s in SIGNALS)
        print(f"  {str(placed) + ' cards':<10}{row}{best:>13}")
    print()
    print("  AUC is invariant to a per-turn offset, so the turn-parity")
    print("  effect that broke the first version of this test cannot")
    print("  contribute here.")


if __name__ == '__main__':
    main()
