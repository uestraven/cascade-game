#!/usr/bin/env python3
"""
Cascade v2.1: the four-variant experiment.

    A  existing baseline   deal 7/6   placements 6/5   P2 opens Dominion
    B  equal and full      deal 6/6   placements 6/6   P1 opens
    C  phase-order test    deal 6/6   placements 6/6   P2 opens
    D  extra hand choice   deal 7/7   placements 6/6   P1 opens

Six commands, follow-up only after a multiple direct capture, no lock,
throughout.

P1 wins, P2 wins and draws are reported separately on purpose: a 50%
P1 rate can hide a third of games ending level, and the two readings
call for completely different fixes.

    python3 exp_v21.py [games]
"""

import random
import sys
from collections import Counter

import proto as P
import v2

VARIANTS = [
    ('A  baseline',     (7, 6), 11, True),
    ('B  equal+full',   (6, 6), 12, False),
    ('C  phase order',  (6, 6), 12, True),
    ('D  hand choice',  (7, 7), 12, False),
]


def survey(games, hands, placements, p2_first, seed=4242):
    P.set_board(3, 4, hands, placements)
    rng = random.Random(seed)
    w = [0, 0]
    draws = 0
    mid_p1 = 0.0
    caps1 = caps2 = 0.0
    rev = lead = 0
    track = Counter()
    passes = Counter()
    n = 0
    for _ in range(games):
        mid, end, c1, c2 = v2.play(
            rng, commands=v2.PHASE2, followup_needs_multi=True,
            one_edge=False, lock=False, p2_first=p2_first,
            hands=hands, deck_size=sum(hands) + 2,
            track=track, passes=passes)
        n += 1
        caps1 += c1
        caps2 += c2
        mid_p1 += mid[0]
        if end[0] > end[1]:
            w[0] += 1
        elif end[1] > end[0]:
            w[1] += 1
        else:
            draws += 1
        m = mid[0] - mid[1]
        if m != 0 and end[0] != end[1]:
            lead += 1
            if (m > 0) != (end[0] > end[1]):
                rev += 1
    return dict(p1=w[0] / n, p2=w[1] / n, draws=draws / n,
                mid=mid_p1 / n, c1=caps1 / n, c2=caps2 / n,
                rev=rev / max(lead, 1), track=track,
                passes=(passes[0] / n, passes[1] / n), n=n)


def pct(x):
    return f'{100 * x:5.1f}%'


if __name__ == '__main__':
    games = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
    print('=' * 78)
    print('CASCADE V2.1 -- four variants')
    print('=' * 78)
    print(f'  {games} games each. 6 commands, follow-up only after a')
    print('  multiple direct capture, no lock.')
    print()
    print(f'  {"variant":<16}{"deal":>7}{"place":>7}{"opens":>7}'
          f'{"P1":>7}{"P2":>7}{"draw":>7}{"P1 cards":>10}'
          f'{"reversed":>10}')
    rows = {}
    for name, hands, placements, p2_first in VARIANTS:
        r = survey(games, hands, placements, p2_first)
        rows[name] = r
        deal = f'{hands[0]}/{hands[1]}'
        pl = f'{(placements + 1) // 2}/{placements // 2}'
        print(f'  {name:<16}{deal:>7}{pl:>7}'
              f'{"P2" if p2_first else "P1":>7}'
              f'{pct(r["p1"]):>7}{pct(r["p2"]):>7}{pct(r["draws"]):>7}'
              f'{r["mid"]:>10.2f}{pct(r["rev"]):>10}')

    print()
    print('  captures and passes')
    print(f'  {"variant":<16}{"phase I":>9}{"phase II":>10}'
          f'{"total":>8}{"P1 passes":>11}{"P2 passes":>11}')
    for name, *_ in VARIANTS:
        r = rows[name]
        print(f'  {name:<16}{r["c1"]:>9.2f}{r["c2"]:>10.2f}'
              f'{r["c1"] + r["c2"]:>8.2f}'
              f'{r["passes"][0]:>11.3f}{r["passes"][1]:>11.3f}')

    print()
    print('  captures per command')
    ks = sorted({k for r in rows.values() for k in r['track']})
    print(f'  {"variant":<16}' + ''.join(f'{k:>8}' for k in ks))
    for name, *_ in VARIANTS:
        t = rows[name]['track']
        tot = sum(t.values())
        print(f'  {name:<16}'
              + ''.join(f'{100 * t[k] / tot:7.1f}%' for k in ks))

    print()
    print('=' * 78)
    print('READING')
    print('=' * 78)
    for name, *_ in VARIANTS:
        r = rows[name]
        bias = abs(r['p1'] - r['p2'])
        notes = []
        if bias > 0.10:
            lead_s = 'P1' if r['p1'] > r['p2'] else 'P2'
            notes.append(f'{lead_s} favoured by {100 * bias:.0f} points')
        if r['draws'] > 0.20:
            notes.append(f'{100 * r["draws"]:.0f}% draws')
        if r['rev'] < 0.15:
            notes.append('Dominion rarely changes the winner')
        if not notes:
            notes.append('balanced, and Dominion matters')
        print(f'  {name:<16}{"; ".join(notes)}')
