#!/usr/bin/env python3
"""
A small SHARED constructed deck: both players draw from the same 10-12
cards, every card carries an ability, and the deck is the scenario.

Two structural consequences, which change what needs measuring:

  * ABILITY IMBALANCE STOPS BEING UNFAIRNESS. A strong ability in a
    shared deck is available to whoever draws it, so it is a property of
    the scenario rather than an edge for one seat. Most of the pricing
    work becomes irrelevant to fairness -- and converts into VARIANCE,
    because with ten cards the split decides who gets what.

  * THE DECK IS NEARLY DETERMINISTIC. Ten cards dealt five and five uses
    every card every game; twelve dealt five and six leaves one unseen.
    So the only randomness is the split, which is exactly what section A
    measures.

Section C is the archetype question. Abilities were already measured NOT
to compound in win rate -- five copies of one against five different came
out within a point. But for a shared deck, winning is not what an
archetype is for: the deck is built to produce a kind of game. So this
measures TEXTURE -- captures, biggest turn, margin spread, depth -- and
asks whether compositions differ in character even when they do not
differ in who wins.
"""

import random
import sys
from collections import Counter

import v3
import v3_abilities as A
from v3 import NCELLS, ORDER, pct

import ability_power as P

# the abilities that measured priced, instant and delayed
INSTANT = ['arc', 'umbraone', 'eclipse', 'glaciate', 'conduit']
DELAYED = ['surge', 'beacon', 'gust']
ALL13 = [a for a in A.ABIL]

# candidate archetypes, built only from abilities that exist
ARCHETYPES = {
    'rotators':  ['gust', 'tremor', 'cyclone', 'upheaval'],
    'chainers':  ['arc', 'conduit'],
    'deniers':   ['umbraone', 'eclipse', 'glaciate'],
    'reach':     ['beacon', 'scorch', 'backlash'],
    'sweepers':  ['cyclone', 'quake', 'tremor'],
    'priced mix': INSTANT,
    'everything': ALL13,
}


def build(rng, pool, size):
    """A shared deck of `size`, drawing abilities round-robin from the
    pool so the composition is the pool rather than a random sample."""
    deck = [A.make_card(rng, pool[i % len(pool)]) for i in range(size)]
    rng.shuffle(deck)
    return deck


def play(rng, deck, hands_n, smarts, track=None):
    hands = [list(deck[:hands_n[0]]),
             list(deck[hands_n[0]:hands_n[0] + hands_n[1]])]
    cards = [None] * NCELLS
    own = [0, 0]
    A.PLAYED[0].clear()
    A.PLAYED[1].clear()
    placed = [0, 0]
    caps = 0
    biggest = 0
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = v3.cap_for_turn(turn)
        mv = P.pick(cards, own, hands, p, empties, cap, placed[p], rng,
                    smarts[p])
        got = P.apply_move(cards, own, hands, p, mv, cap, placed[p], rng)
        caps += got
        biggest = max(biggest, got)
        if track is not None:
            track[got] += 1
        placed[p] += 1
    return [bin(own[0]).count('1'), bin(own[1]).count('1')], caps, biggest


def survey(games, pool, size, hands_n, seed=4242):
    rng = random.Random(seed)
    p1 = n = 0
    caps = 0.0
    margins = Counter()
    bigs = Counter()
    hist = Counter()
    for _ in range(games):
        deck = build(rng, pool, size)
        s, c, b = play(rng, deck, hands_n, [False, False], hist)
        n += 1
        caps += c
        margins[abs(s[0] - s[1])] += 1
        bigs[b] += 1
        if s[0] > s[1]:
            p1 += 1
    return dict(p1=p1 / n, caps=caps / n,
                margins={k: v / n for k, v in margins.items()},
                bigs={k: v / n for k, v in bigs.items()},
                hist={k: v / sum(hist.values()) for k, v in hist.items()})


def depth(games, pool, size, hands_n, seed=31):
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for smart in (0, 1):
            sm = [False, False]
            sm[smart] = True
            deck = build(rng, pool, size)
            s, _, _ = play(rng, deck, hands_n, sm)
            if s[0] == s[1]:
                continue
            n += 1
            if (s[0] > s[1]) == (smart == 0):
                w += 1
    return w / max(n, 1)


def split_decides(games, pool, size, hands_n, seed=99):
    """Does the SPLIT decide it? Same deck order, stronger bot in each
    seat. With a small shared deck this is the format's key risk."""
    rng = random.Random(seed)
    t = Counter()
    for _ in range(games):
        deck = build(rng, pool, size)
        s1, _, _ = play(random.Random(5), deck, hands_n, [True, False])
        s2, _, _ = play(random.Random(5), deck, hands_n, [False, True])
        w1 = 0 if s1[0] > s1[1] else 1
        w2 = 0 if s2[0] > s2[1] else 1
        if w1 == 0 and w2 == 1:
            t['play'] += 1
        elif w1 == 1 and w2 == 0:
            t['anti'] += 1
        else:
            t['split'] += 1
    n = sum(t.values())
    return {k: v / n for k, v in t.items()}


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 500

    print("=" * 78)
    print("A. DECK SIZE -- 10 forces a 5/5 deal, 12 allows 5/6")
    print("=" * 78)
    print("  P2's surplus is the only thing that prices P1's extra")
    print("  placement, so deck size decides whether the seats balance.")
    print()
    print(f"  {'size':<7}{'deal':<9}{'unseen':<8}{'P1 win':>9}{'seat':>7}"
          f"{'depth':>8}{'play decides':>14}{'split decides':>15}")
    for size, hn in ((10, (5, 5)), (11, (5, 6)), (12, (5, 6)),
                     (12, (6, 6)), (14, (5, 6))):
        r = survey(G, ALL13, size, hn)
        dp = depth(G // 2, ALL13, size, hn)
        sd = split_decides(G // 2, ALL13, size, hn)
        print(f"  {size:<7}{str(hn):<9}{size - sum(hn):<8}"
              f"{pct(r['p1']):>9}{pct(abs(r['p1'] - 0.5)):>7}{pct(dp):>8}"
              f"{pct(sd.get('play', 0)):>14}"
              f"{pct(sd.get('split', 0)):>15}")

    print()
    print("=" * 78)
    print("C. ARCHETYPES -- do compositions differ in TEXTURE?")
    print("=" * 78)
    print(f"  12-card shared deck, dealt 5 and 6. {G} games each.")
    print("  Win rate should stay near even for all of them -- a shared")
    print("  deck is symmetric. The question is whether the GAME differs.")
    print()
    print(f"  {'archetype':<13}{'P1':>7}{'caps':>7}{'big turn':>10}"
          f"{'margin 1':>10}{'depth':>8}{'play decides':>14}")
    for name, pool in ARCHETYPES.items():
        r = survey(G, pool, 12, (5, 6))
        dp = depth(G // 2, pool, 12, (5, 6))
        sd = split_decides(G // 2, pool, 12, (5, 6))
        top = max(r['bigs'])
        print(f"  {name:<13}{pct(r['p1']):>7}{r['caps']:>7.1f}{top:>10}"
              f"{pct(r['margins'].get(1, 0)):>10}{pct(dp):>8}"
              f"{pct(sd.get('play', 0)):>14}")
    print()
    print("  Spread in the caps / big turn / margin columns is what makes")
    print("  an archetype real. Spread in the P1 column would instead mean")
    print("  the shared deck is not actually symmetric.")


if __name__ == '__main__':
    main()
