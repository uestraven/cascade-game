#!/usr/bin/env python3
"""
Liveness: in what fraction of random positions does an ability change
anything at all?

This is the first gate, not the last. An ability that scores 0% here is
inert no matter how good its rules text sounds -- that is how the
board-wide twin flip was caught, after it had already been written into a
rulebook. An ability can pass this and still be worthless; it cannot fail
this and be worth anything.

Two numbers per ability:
  avail  -- positions where the ability offers at least one choice
  live   -- positions where some choice changes captures OR the board

`live` is measured against declining, and counts a changed board even
when the capture count is identical, because Fortify, Withdraw, Reorient
and Anchor are all supposed to change what you leave behind rather than
what you take this turn.
"""

import random
import sys

import proto as P
import proto16 as X


def rand_position(rng, filled):
    cards = [None] * P.NCELLS
    own = [0, 0]
    cells = rng.sample(range(P.NCELLS), filled)
    for i, c in enumerate(cells):
        cards[c] = rng.choice(P.ALL_CARDS)
        own[i % 2] |= 1 << c
    return cards, own


def snapshot(cards, own):
    return (tuple(cards), tuple(own))


def scan(ability, trials=4000, seed=11):
    rng = random.Random(seed)
    avail = live = 0
    best_gain = 0
    for _ in range(trials):
        filled = rng.randint(3, P.NCELLS - 2)
        cards, own = rand_position(rng, filled)
        empties = [i for i in range(P.NCELLS) if cards[i] is None]
        cell = rng.choice(empties)
        card = rng.choice(P.ALL_CARDS)
        hands = [[(card, ability)], [(card, ability)]]
        player = 0
        opts = X.options16(cards, own, player, ability, cell, True, {},
                           card, P.CASCADE_CAP)
        if len(opts) <= 1:
            continue
        avail += 1

        base_c = [x for x in cards]
        base_o = own[:]
        base_h = [list(h) for h in hands]
        base_s = {}
        base_got = X.apply16(base_c, base_o, base_h, player,
                             (0, cell, card, None), P.CASCADE_CAP, 5,
                             base_s, 0)
        base = (base_got, snapshot(base_c, base_o), tuple(sorted(base_s)))

        changed = False
        for opt in opts[1:]:
            c = [x for x in cards]
            o = own[:]
            h = [list(x) for x in hands]
            s = {}
            got = X.apply16(c, o, h, player, (0, cell, card, opt),
                            P.CASCADE_CAP, 5, s, 0)
            if (got, snapshot(c, o), tuple(sorted(s))) != base:
                changed = True
                best_gain = max(best_gain, got - base_got)
        if changed:
            live += 1
    return avail, live, best_gain, trials


if __name__ == '__main__':
    trials = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
    print(f'liveness over {trials} random positions, 3x3\n')
    print(f'{"ability":10} {"offers a choice":>16} '
          f'{"changes something":>18}  {"best gain":>9}')
    print('-' * 60)
    for fam, names in [('shipped', P.ABILITIES)] + list(X.FAMILY.items()):
        print(f'{fam}:')
        for a in names:
            avail, live, gain, n = scan(a, trials)
            av = 100 * avail / n
            lv = 100 * live / max(avail, 1)
            flag = '  <-- INERT' if live == 0 else ''
            print(f'  {a:10} {av:14.1f}% {lv:16.1f}%  {gain:9d}{flag}')
