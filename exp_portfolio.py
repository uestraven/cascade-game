#!/usr/bin/env python3
"""
Does controlling more cards compound, and if so through what?

Dominion reverses the deployment leader 44.6% of the time. Three
explanations are live and they call for different fixes:

  position   the reversal is earned by where the cards sit
  portfolio  more cards means more and better abilities to choose from,
             which wins more cards -- a compounding advantage
  churn      commands are simply big enough that ownership swings
             regardless of either

This isolates them.

  A. Win rate by ownership at the phase transition. The baseline: does
     a deployment lead convert at all?
  B. Win rate by ownership HOLDING the ability portfolio equal, and by
     portfolio HOLDING ownership equal. If ownership stops mattering
     once the portfolio is controlled for, the advantage is the
     portfolio and not the position.
  C. How often the same card is commanded repeatedly, which is the
     mechanism by which one strong character would compound.
  D. A control: Dominion played with abilities switched off. If the
     reversal rate barely moves, the reversals are churn.

    python3 exp_portfolio.py [games]
"""

import random
import sys
from collections import Counter, defaultdict

import proto as P
import v2

BOARD = (3, 4, (6, 6), 12)
HANDS = (6, 6)


def portfolio(abil, own, player):
    """What this player can actually choose between: distinct abilities
    across the cards they control."""
    kinds = set()
    for c, a in abil.items():
        if a is not None and (own[player] >> c) & 1:
            kinds.add(a)
    return len(kinds)


def one_game(rng, *, no_abilities=False, track_repeat=None):
    P.set_board(*BOARD)
    deck = v2.build_deck(rng, sum(HANDS) + 2)
    hands = [list(deck[:HANDS[0]]), list(deck[HANDS[0]:sum(HANDS)])]
    cards = [None] * P.NCELLS
    own = [0, 0]
    abil = {}
    v2.phase1(cards, own, hands, abil, rng)
    mid = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    port = (portfolio(abil, own, 0), portfolio(abil, own, 1))
    if no_abilities:
        for c in list(abil):
            abil[c] = None

    # Dominion, P2 opening, recording which cells get commanded
    used = Counter()
    caps = 0
    for k in range(v2.PHASE2):
        player = 1 - (k % 2)
        mine = [c for c in range(P.NCELLS)
                if cards[c] is not None and (own[player] >> c) & 1]
        if not mine:
            continue
        best, ties = None, []
        for src in mine:
            for opt in v2.command_options(cards, own, player, abil, src):
                c2 = [x for x in cards]
                o2 = own[:]
                a2 = dict(abil)
                got = v2.run_command(c2, o2, a2, player, src, opt,
                                     True, None, None)
                if best is None or got > best:
                    best, ties = got, [(src, opt)]
                elif got == best:
                    ties.append((src, opt))
        src, opt = rng.choice(ties)
        used[(player, src)] += 1
        caps += v2.run_command(cards, own, abil, player, src, opt,
                               True, None, None)
    end = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    if track_repeat is not None:
        for (pl, _c), n in used.items():
            track_repeat[n] += 1
    return mid, end, port, caps


def pct(x):
    return f'{100 * x:5.1f}%'


if __name__ == '__main__':
    games = int(sys.argv[1]) if len(sys.argv) > 1 else 6000

    # ---- A: does a deployment lead convert? -----------------------
    rng = random.Random(31337)
    byown = defaultdict(lambda: [0, 0])      # p1 cards -> [wins, games]
    cell = defaultdict(lambda: [0, 0])       # (own, port) -> [wins, games]
    byport = defaultdict(lambda: [0, 0])
    repeat = Counter()
    rev = lead = 0
    for _ in range(games):
        mid, end, port, _ = one_game(rng, track_repeat=repeat)
        w = 1 if end[0] > end[1] else 0
        byown[mid[0]][0] += w
        byown[mid[0]][1] += 1
        d = port[0] - port[1]
        byport[d][0] += w
        byport[d][1] += 1
        cell[(mid[0], d)][0] += w
        cell[(mid[0], d)][1] += 1
        if mid[0] != mid[1] and end[0] != end[1]:
            lead += 1
            if (mid[0] > mid[1]) != (end[0] > end[1]):
                rev += 1

    print('=' * 76)
    print('A. DOES A DEPLOYMENT LEAD CONVERT?')
    print('=' * 76)
    print(f'  {games} games. P1 win rate by the cards P1 held when')
    print('  Dominion began. Six of twelve is level.')
    print()
    print(f'  {"P1 cards":>9}{"games":>8}{"P1 wins":>9}')
    for k in sorted(byown):
        wins, n = byown[k]
        if n < games * 0.01:
            continue
        print(f'  {k:>9}{n:>8}{pct(wins / n):>9}')
    print(f'\n  deployment leader reversed: {pct(rev / max(lead, 1))}')

    print()
    print('=' * 76)
    print('B. OWNERSHIP vs PORTFOLIO')
    print('=' * 76)
    print('  "portfolio" is how many DISTINCT abilities a player can')
    print('  choose between across the cards they hold. If ownership')
    print('  still predicts wins at a fixed portfolio, position is doing')
    print('  the work; if not, the portfolio is.')
    print()
    print(f'  P1 win rate by portfolio difference, ownership ignored:')
    print(f'  {"port diff":>10}{"games":>8}{"P1 wins":>9}')
    for k in sorted(byport):
        wins, n = byport[k]
        if n < games * 0.02:
            continue
        print(f'  {k:>+10}{n:>8}{pct(wins / n):>9}')

    print()
    print('  held level at 6 cards each, win rate by portfolio diff:')
    print(f'  {"port diff":>10}{"games":>8}{"P1 wins":>9}')
    for k in sorted({d for (o, d) in cell if o == 6}):
        wins, n = cell[(6, k)]
        if n < 40:
            continue
        print(f'  {k:>+10}{n:>8}{pct(wins / n):>9}')

    print()
    print('  held level at portfolio diff 0, win rate by ownership:')
    print(f'  {"P1 cards":>10}{"games":>8}{"P1 wins":>9}')
    for o in sorted({o for (o, d) in cell if d == 0}):
        wins, n = cell[(o, 0)]
        if n < 40:
            continue
        print(f'  {o:>10}{n:>8}{pct(wins / n):>9}')

    print()
    print('=' * 76)
    print('C. IS ONE CHARACTER COMMANDED REPEATEDLY?')
    print('=' * 76)
    print('  Commands spent on the same cell, per player per game. Three')
    print('  commands each, so 3 means one card did everything.')
    print()
    tot = sum(repeat.values())
    for k in sorted(repeat):
        print(f'    commanded {k}x  {pct(repeat[k] / tot)}')

    print()
    print('=' * 76)
    print('D. CONTROL: DOMINION WITH ABILITIES OFF')
    print('=' * 76)
    print('  If the reversal rate barely moves, the reversals are churn')
    print('  rather than ability play.')
    print()
    for label, off in (('abilities on', False), ('abilities off', True)):
        rng2 = random.Random(31337)
        r = l = 0
        caps = 0.0
        n = 0
        for _ in range(games // 2):
            mid, end, _p, c = one_game(rng2, no_abilities=off)
            caps += c
            n += 1
            if mid[0] != mid[1] and end[0] != end[1]:
                l += 1
                if (mid[0] > mid[1]) != (end[0] > end[1]):
                    r += 1
        print(f'  {label:<16} reversed {pct(r / max(l, 1))}   '
              f'Dominion captures {caps / n:5.2f}')
