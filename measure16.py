#!/usr/bin/env python3
"""
What each ability is worth, and whether it is a lure.

The deck is 12 cards all carrying the one ability under test, shared, as
in the real game. What differs between the two sides is permission:

  joint   -- may use it, and may choose the placement that sets it up
  nobias  -- may use it, but the placement is chosen as if it did not
             exist; the ability is bolted on afterwards
  never   -- holds the card, cannot use it

Both contests are played against `never`, seats swapped:

  joint  vs never   -- what the ability is worth, all in
  nobias vs never   -- what it is worth taken only when it falls out

A fair ability's win rate RISES when you are allowed to play toward it.
If `nobias` beats `joint`, playing toward the ability costs more than the
ability returns, and the card is a lure -- it reads as powerful and loses
games. That reversal is what exposed two abilities in the elemental game
after I had ranked one of them best in the set.

`never` is also the control for inertness: joint at ~50% against never
can mean balanced, or can mean the ability does nothing. Liveness
(live16.py) separates those two.
"""

import random
import sys
from collections import Counter

import proto as P
import proto16 as X


def pick_faculty(cards, own, hands, player, empties, cap, placed, rng,
                 shields, turn, faculty):
    """One move, under one permission regime."""
    if faculty == 'never':
        return X.pick16(cards, own, hands, player, empties, cap, placed,
                        rng, P.LAM, shields, turn, use_abilities=False)
    if faculty == 'joint':
        return X.pick16(cards, own, hands, player, empties, cap, placed,
                        rng, P.LAM, shields, turn)
    if faculty == 'always':
        # Must use the ability wherever one is on offer -- declining is
        # removed, but the choice of WHICH option, and of where to place,
        # is still free.
        #
        # This column exists because a one-ply bot scoring
        # captures-minus-exposure cannot pay a capture for a better
        # position: any ability whose return arrives next turn will be
        # refused 100% of the time, which looks identical to the ability
        # being worthless. Forcing the use separates the two. If forced
        # use LOSES, the ability really is bad; if it WINS, the bot was
        # leaving value behind and the honest answer is that this
        # instrument cannot price it.
        return X.pick16(cards, own, hands, player, empties, cap, placed,
                        rng, P.LAM, shields, turn, require=True)
    # nobias: fix the placement without the ability, then add the best
    # option available at that placement
    base = X.pick16(cards, own, hands, player, empties, cap, placed, rng,
                    P.LAM, shields, turn, use_abilities=False)
    if base is None:
        return None
    i, cell, edges, _ = base
    ability = hands[player][i][1] if placed >= P.ABILITY_FROM_PLACEMENT - 1 \
        else None
    best, ties = None, []
    for opt in X.options16(cards, own, player, ability, cell, True,
                           shields, edges, cap):
        c = [x for x in cards]
        o = own[:]
        h = [list(x) for x in hands]
        s = dict(shields)
        got = X.apply16(c, o, h, player, (i, cell, edges, opt), cap,
                        placed, s, turn)
        sc = got - P.LAM * P.exposure(c, o, player)
        if best is None or sc > best:
            best, ties = sc, [opt]
        elif sc == best:
            ties.append(opt)
    return (i, cell, edges, rng.choice(ties))


def play16(rng, ability, facs, stats=None):
    deck = P.build_deck(rng, ('versatile',), (ability,), P.DECK)
    hands = [list(deck[:P.HANDS[0]]),
             list(deck[P.HANDS[0]:P.HANDS[0] + P.HANDS[1]])]
    cards = [None] * P.NCELLS
    own = [0, 0]
    placed = [0, 0]
    shields = {}
    nturns = len(P.ORDER)
    for turn, p in enumerate(P.ORDER):
        empties = [i for i in range(P.NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = P.cap_for_turn(turn)
        mv = pick_faculty(cards, own, hands, p, empties, cap, placed[p],
                          rng, shields, turn, facs[p])
        if mv is None:
            continue
        if stats is not None and facs[p] == 'joint':
            stats['placements'] += 1
            live = placed[p] >= P.ABILITY_FROM_PLACEMENT - 1
            if len(X.options16(cards, own, p, ability, mv[1], live,
                               shields, mv[2], cap)) > 1:
                stats['offered'] += 1
            if mv[3] is not None:
                stats['used'] += 1
                if turn >= nturns - 2:
                    stats['late'] += 1
        X.apply16(cards, own, hands, p, mv, cap, placed[p], shields, turn)
        placed[p] += 1
    return [bin(own[0]).count('1'), bin(own[1]).count('1')]


def duel16(games, ability, fa, fb, seed=77, stats=None):
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for seat in (0, 1):
            facs = [fb, fb]
            facs[seat] = fa
            s = play16(rng, ability, tuple(facs), stats)
            n += 1
            if (s[0] > s[1]) == (seat == 0):
                w += 1
    return w / n


if __name__ == '__main__':
    games = int(sys.argv[1]) if len(sys.argv) > 1 else 150
    only = sys.argv[2:] if len(sys.argv) > 2 else None
    names = only if only else list(X.ALL20)
    print(f'{games * 2} games per column, 3x3, deck of 12 all-one-ability\n')
    print(f'{"ability":10} {"joint":>8} {"nobias":>8} {"forced":>8} '
          f'{"greed":>7} {"offered":>8} {"used":>7} {"late":>7}')
    print('-' * 73)
    for a in names:
        st = Counter()
        j = duel16(games, a, 'joint', 'never', stats=st)
        nb = duel16(games, a, 'nobias', 'never')
        fo = duel16(games, a, 'always', 'never')
        off = 100 * st['offered'] / max(st['placements'], 1)
        use = 100 * st['used'] / max(st['offered'], 1)
        late = 100 * st['late'] / max(st['used'], 1)
        greed = 100 * (j - nb)
        print(f'{a:10} {100*j:7.1f}% {100*nb:7.1f}% {100*fo:7.1f}% '
              f'{greed:+7.1f} {off:7.1f}% {use:6.1f}% {late:6.1f}%',
              flush=True)
