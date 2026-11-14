#!/usr/bin/env python3
"""
The variance nobody measured.

Every ability figure in this project is a MEAN -- power, depth,
contribution. A format can have a respectable average depth and still be
chaotic game to game, and almost every ability was measured as five
copies of itself against an opponent holding none, so interactions
between different abilities are nearly untested.

Three things here, none of which is a mean:

  A  DEAL DETERMINISM. The sharpest chaos metric available. Play the
     SAME deal twice, swapping which seat holds the stronger bot. Then:
       the stronger bot wins both  -> play decided it
       the same seat wins both     -> the DEAL decided it, not skill
       the weaker bot wins both    -> actively anti-skill
     A format where the deal decides is chaotic however good its mean
     depth looks.

  B  OUTCOME SPREAD. The distribution of final margins and of the
     biggest single-turn capture, rather than their averages. A format
     that occasionally produces a six-card turn feels different from one
     that averages the same captures smoothly.

  C  COMBINATIONS. Five copies of one ability against five DIFFERENT
     abilities in the same hand, which is the thing 28 individual
     ability cards would actually produce.
"""

import random
import sys
from collections import Counter

import v3
import v3_abilities as A
from v3 import ELEMENTS, NCELLS, ORDER, pct

import ability_power as P

ALL13 = [a for a in A.ABIL]
FIVE = ['arc', 'umbra', 'eclipse', 'glaciate', 'conduit']
# deliberately board-volatile: sweeping, deterministic, readable
# 'inversion' was removed: twin-flipping is an automorphism of the beats
# relation, so twinning every card changes nothing. It measured as a
# no-op in 0 of 20,000 positions.
VOLATILE = ['cyclone', 'quake', 'tremor', 'upheaval', 'umbraone']
# the priced five plus the three biggest sweeps
MIXED = ['arc', 'umbraone', 'eclipse', 'glaciate', 'conduit',
         'cyclone', 'quake']


def deal(rng, density, pool, size=28):
    d = [A.make_card(rng, rng.choice(pool) if rng.random() < density
                     else None)
         for _ in range(size)]
    rng.shuffle(d)
    return d


def play_deal(deck, smarts, rng, track=None):
    """Play a FIXED deal. Returns the score and the largest single-turn
    capture."""
    hands = [list(deck[:P.HANDS[0]]),
             list(deck[P.HANDS[0]:P.HANDS[0] + P.HANDS[1]])]
    cards = [None] * NCELLS
    own = [0, 0]
    A.PLAYED[0].clear()
    A.PLAYED[1].clear()
    placed = [0, 0]
    biggest = 0
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = v3.cap_for_turn(turn)
        mv = P.pick(cards, own, hands, p, empties, cap, placed[p], rng,
                    smarts[p])
        got = P.apply_move(cards, own, hands, p, mv, cap, placed[p], rng)
        biggest = max(biggest, got)
        if track is not None:
            track[got] += 1
        placed[p] += 1
    return [bin(own[0]).count('1'), bin(own[1]).count('1')], biggest


def determinism(games, density, pool, seed=1234):
    """Same deal, stronger bot in each seat in turn."""
    rng = random.Random(seed)
    tally = Counter()
    for _ in range(games):
        deck = deal(rng, density, pool)
        # replay seed so the two runs differ only in which seat is strong
        s1, _ = play_deal(deck, [True, False], random.Random(7))
        s2, _ = play_deal(deck, [False, True], random.Random(7))
        w1 = 0 if s1[0] > s1[1] else 1
        w2 = 0 if s2[0] > s2[1] else 1
        if w1 == 0 and w2 == 1:
            tally['play'] += 1
        elif w1 == 1 and w2 == 0:
            tally['anti'] += 1
        elif w1 == w2 == 0:
            tally['seat_p1'] += 1
        else:
            tally['seat_p2'] += 1
    n = sum(tally.values())
    return {k: v / n for k, v in tally.items()}


def spread(games, density, pool, seed=55):
    rng = random.Random(seed)
    margins = Counter()
    bigs = Counter()
    turnhist = Counter()
    for _ in range(games):
        deck = deal(rng, density, pool)
        s, big = play_deal(deck, [False, False], rng, turnhist)
        margins[abs(s[0] - s[1])] += 1
        bigs[big] += 1
    n = games
    return ({k: v / n for k, v in margins.items()},
            {k: v / n for k, v in bigs.items()},
            {k: v / sum(turnhist.values()) for k, v in turnhist.items()})


def combo(games, pool, distinct, seed=808):
    """distinct=False: five copies of one ability. True: five different
    ones. Same count either way, so only the mix differs."""
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for seat in (0, 1):
            if distinct:
                picks = rng.sample(pool, min(5, len(pool)))
            else:
                picks = [rng.choice(pool)] * 5
            hands = [[], []]
            for p in (0, 1):
                if p == seat:
                    hands[p] = [A.make_card(rng, picks[i % len(picks)])
                                for i in range(P.HANDS[p])]
                else:
                    hands[p] = [A.make_card(rng, None)
                                for _ in range(P.HANDS[p])]
            deck = hands[0] + hands[1]
            s, _ = play_deal(deck, [False, False], rng)
            n += 1
            if (s[0] > s[1]) == (seat == 0):
                w += 1
    return w / n


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 500

    print("=" * 76)
    print("A. DID THE DEAL DECIDE IT, OR THE PLAY?")
    print("=" * 76)
    print(f"  {G} deals, each played twice with the stronger bot in each")
    print("  seat. 'seat' rows mean the same player won regardless of who")
    print("  was playing well -- that is the deal deciding, not skill.")
    print()
    print(f"  {'format':<26}{'play':>8}{'anti':>8}{'seat P1':>9}"
          f"{'seat P2':>9}")
    for label, dens, pool in (
            ('no abilities', 0.0, ALL13),
            ('all 13, every card', 1.0, ALL13),
            ('the priced 5, every card', 1.0, FIVE),
            ('5 board-volatile', 1.0, VOLATILE),
            ('priced 5 + 3 sweeps', 1.0, MIXED)):
        d = determinism(G, dens, pool)
        print(f"  {label:<26}{pct(d.get('play', 0)):>8}"
              f"{pct(d.get('anti', 0)):>8}{pct(d.get('seat_p1', 0)):>9}"
              f"{pct(d.get('seat_p2', 0)):>9}")
    print()
    print("  'play' + 'anti' is how often skill mattered at all; the rest")
    print("  is the deal.")

    print()
    print("=" * 76)
    print("B. SPREAD, not averages")
    print("=" * 76)
    for label, dens, pool in (('no abilities', 0.0, ALL13),
                              ('all 13, every card', 1.0, ALL13),
                              ('5 board-volatile', 1.0, VOLATILE)):
        m, b, t = spread(G, dens, pool)
        print(f"  {label}")
        print("    final margin:  " + "  ".join(
            f"{k}:{pct(v)}" for k, v in sorted(m.items())))
        print("    biggest single turn: " + "  ".join(
            f"{k}:{pct(v)}" for k, v in sorted(b.items())))
        print("    per-turn captures:   " + "  ".join(
            f"{k}:{pct(v)}" for k, v in sorted(t.items())))
        print()

    print("=" * 76)
    print("C. DO DIFFERENT ABILITIES COMBINE?")
    print("=" * 76)
    print(f"  holder win rate, seats swapped, {G * 2} games")
    print()
    print(f"  {'pool':<22}{'5 copies of one':>18}{'5 different':>14}")
    for label, pool in (('all 13', ALL13), ('the priced 5', FIVE),
                        ('board-volatile', VOLATILE)):
        same = combo(G, pool, False)
        diff = combo(G, pool, True)
        print(f"  {label:<22}{pct(same):>18}{pct(diff):>14}")
    print()
    print("  A gap means abilities interact -- which is what a deck of 28")
    print("  individual ability cards would produce, and what measuring")
    print("  one ability at a time could never show.")


if __name__ == '__main__':
    main()
