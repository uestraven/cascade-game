#!/usr/bin/env python3
"""
Four leaders, one of each shape. Once per game each.

  PRINCE    MASS SWING      every card you control attacks its neighbours
                            again, right now
  TANTALUS  COMEBACK VALVE  the same, but only while you control fewer
                            cells than your opponent
  LOVER     SETUP PAYOFF    if you control three or more cards showing the
                            same element, all of them attack their
                            neighbours
  LETO      RULE PIVOT      from now on, your cascades may start from any
                            card you control, not only the one you placed

Prince and Tantalus deliberately differ only by the gate, so the pair is a
controlled read on what "only while behind" costs.

Three things are measured beyond the win rate, because a leader can be
balanced and still be bad:

  fires      how often it ever gets used. A leader that cannot meet its
             own condition is dead, not balanced.
  turn       WHEN it fires. Every large one-shot measured so far peaked on
             the final turn; if they all fire on turn 8, timing is not a
             decision.
  1-card     whether games stay close. Leto as a standing rule cut
             one-card finishes from 71% to 17%, which is a feel problem
             independent of who wins.
"""

import random
import sys
from collections import Counter

import v3
from v3 import BEATS, CARDS, ELEMENTS, NB, NCELLS, OPPSIDE, ORDER, pct, rot90

HANDS = (5, 6)
SHAPES = {
    'none': '-',
    'PRINCE': 'mass swing',
    'TANTALUS': 'comeback valve',
    'LOVER': 'setup payoff',
    'LETO': 'rule pivot',
}


def beats(a, b):
    return b in BEATS[a]


def attack_from(cards, own, mask, player, cap=0):
    """One wave (or more) outward from every cell in `mask`."""
    opp = 1 - player
    frontier, captured, depth = mask, 0, 0
    while frontier and depth <= cap:
        newly = 0
        for src in range(NCELLS):
            if not (frontier >> src) & 1 or cards[src] is None:
                continue
            se = cards[src]
            for d in range(4):
                t = NB[src][d]
                if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
                    continue
                if beats(se[d], cards[t][OPPSIDE[d]]):
                    newly |= 1 << t
        if newly:
            own[player] |= newly
            own[opp] &= ~newly
            captured += bin(newly).count('1')
        frontier = newly
        depth += 1
    return captured


def element_clusters(cards, own, player):
    """Largest set of cells you control that all show the same element."""
    best = 0
    for e in ELEMENTS:
        n = sum(1 for i in range(NCELLS)
                if (own[player] >> i) & 1 and cards[i] is not None
                and e in cards[i])
        best = max(best, n)
    return best


def can_fire(name, cards, own, player, turn=None):
    # A leader may not be used on your FINAL placement. Every large one-shot
    # measured so far detonated on turn 9 in ~78% of games, so the last turn
    # was not a choice of timing, it was the only timing. Barring it is
    # coherent here in a way the flat-final-card rule was not: it references
    # a turn, which both players can see, not an unobservable property of a
    # card in hand.
    if turn is not None and turn == len(ORDER) - 1:
        return False
    if name == 'PRINCE':
        return bin(own[player]).count('1') > 0
    if name == 'TANTALUS':
        return (bin(own[player]).count('1') <
                bin(own[1 - player]).count('1'))
    if name == 'LOVER':
        return element_clusters(cards, own, player) >= 3
    if name == 'LETO':
        return True
    return False


def fire(name, cards, own, player, pivot):
    """Returns captures. `pivot` is a mutable [bool, bool] for Leto."""
    if name in ('PRINCE', 'TANTALUS'):
        return attack_from(cards, own, own[player], player, cap=0)
    if name == 'LOVER':
        best, bestmask = 0, 0
        for e in ELEMENTS:
            m = 0
            for i in range(NCELLS):
                if (own[player] >> i) & 1 and cards[i] is not None \
                        and e in cards[i]:
                    m |= 1 << i
            if bin(m).count('1') > best:
                best, bestmask = bin(m).count('1'), m
        return attack_from(cards, own, bestmask, player, cap=0)
    if name == 'LETO':
        pivot[player] = True
        return 0
    return 0


# ---------------------------------------------------------------------------
def orients(card):
    out = [card]
    c = card
    for _ in range(3):
        c = rot90(c)
        out.append(c)
    return out


def placements(hand, empt):
    return [(i, cell, cv) for i, card in enumerate(hand)
            for cv in orients(card) for cell in empt]


def resolve(cards, own, cell, card, player, cap, pivot, origin=None):
    cards[cell] = card
    own[player] |= 1 << cell
    start = (1 << origin) if origin is not None else (1 << cell)
    return attack_from(cards, own, start, player, cap)


def best_placement(cards, own, hand, player, empt, cap, pivot, rng):
    best, ties = -1, []
    for i, cell, cv in placements(hand, empt):
        origins = [None]
        if pivot[player]:
            # Leto: the chain may start from any card you control
            origins += [t for t in range(NCELLS) if (own[player] >> t) & 1]
        for o in origins:
            c = [x for x in cards]
            oo = own[:]
            g = resolve(c, oo, cell, cv, player, cap, pivot, o)
            if g > best:
                best, ties = g, [(i, cell, cv, o)]
            elif g == best:
                ties.append((i, cell, cv, o))
    return rng.choice(ties), best


def play(rng, lead, fire_policy='greedy'):
    hands = [[rng.choice(CARDS) for _ in range(HANDS[p])] for p in (0, 1)]
    cards = [None] * NCELLS
    own = [0, 0]
    pivot = [False, False]
    used = [False, False]
    fired_on = [None, None]
    caps = 0
    for turn, p in enumerate(ORDER):
        empt = [i for i in range(NCELLS) if cards[i] is None]
        if not empt or not hands[p]:
            continue
        cap = v3.FINAL_CASCADE_CAP if turn == len(ORDER) - 1 \
            else v3.CASCADE_CAP
        name = lead[p]

        # decide whether to use the leader before placing
        if name != 'none' and not used[p] \
                and can_fire(name, cards, own, p, turn):
            if name == 'LETO':
                # a standing benefit is worth most as early as possible
                take = True
            else:
                c2 = [x for x in cards]
                o2 = own[:]
                gain = fire(name, c2, o2, p, [False, False])
                _, best_now = best_placement(cards, own, hands[p], p, empt,
                                             cap, pivot, rng)
                take = gain > 0 and gain >= best_now
            if take:
                caps += fire(name, cards, own, p, pivot)
                used[p] = True
                fired_on[p] = turn + 1

        mv, _ = best_placement(cards, own, hands[p], p, empt, cap, pivot, rng)
        i, cell, cv, o = mv
        hands[p].pop(i)
        caps += resolve(cards, own, cell, cv, p, cap, pivot, o)
    return ([bin(own[0]).count('1'), bin(own[1]).count('1')], caps,
            used, fired_on)


def holder(games, leader, seed=4242):
    rng = random.Random(seed)
    w = n = caps = close = 0
    fires = 0
    turns = Counter()
    for _ in range(games):
        for seat in (0, 1):
            lead = ['none', 'none']
            lead[seat] = leader
            s, c, used, fo = play(rng, lead)
            n += 1
            caps += c
            if abs(s[0] - s[1]) == 1:
                close += 1
            if used[seat]:
                fires += 1
                turns[fo[seat]] += 1
            if (s[0] > s[1]) == (seat == 0):
                w += 1
    return dict(win=w / n, caps=caps / n, close=close / n,
                fires=fires / n,
                turns={k: v / max(fires, 1) for k, v in sorted(turns.items())})


def main():
    G = 1600
    print("=" * 84)
    print("FOUR SHAPES, one leader each, once per game")
    print("=" * 84)
    print(f"  {'leader':<10}{'shape':<17}{'holder win':>12}{'fires':>8}"
          f"{'caps':>7}{'1-card':>9}")
    base = None
    rows = []
    for L, shape in SHAPES.items():
        r = holder(G, L)
        if L == 'none':
            base = r['win']
        rows.append((L, shape, r))
        print(f"  {L:<10}{shape:<17}{pct(r['win']):>12}"
              f"{pct(r['fires']):>8}{r['caps']:>7.2f}{pct(r['close']):>9}")

    print()
    print("  gain over holding no leader:")
    for L, shape, r in rows:
        if L == 'none':
            continue
        print(f"    {L:<10}{pct(r['win'] - base):>8}")

    print()
    print("=" * 84)
    print("WHEN DOES IT FIRE?  (share of uses on each turn)")
    print("=" * 84)
    print(f"  {'leader':<10}" + "".join(f"T{t:<4}" for t in range(1, 10)))
    for L, shape, r in rows:
        if L == 'none':
            continue
        line = "".join(f"{100*r['turns'].get(t,0):3.0f}% "
                       for t in range(1, 10))
        print(f"  {L:<10}{line}")
    print()
    print("  If every leader fires on turn 8, timing is not a decision.")


if __name__ == '__main__':
    main()
