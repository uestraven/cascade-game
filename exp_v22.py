#!/usr/bin/env python3
"""
Are the new abilities actually doing anything?

The two-phase structure is held fixed. For each candidate the deck is
made entirely of that ability, and the run is compared against PLAIN --
the same game with the ability replaced by an ordinary attack. That is
the control the four old abilities failed: switching every one of them
off changed the game by 1.5 captures and 1.7 points.

Reported per ability:

  used        share of commands that chose the ability over a plain
              attack. Near zero means the ability is never worth taking,
              which no amount of flavour fixes.
  swing       how far the outcome moves from the PLAIN control -- the
              sum of the absolute changes in P1, P2 and draw rate. Near
              zero means inert.
  conv/dom    captures by phase, against PLAIN's. A passive that cuts
              Convergence captures is doing its job.
  reversed    how often Dominion changes who was ahead.

    python3 exp_v22.py [games]
"""

import random
import sys
from collections import Counter

import proto as P
import v22

CANDIDATES = [
    ('PLAIN (control)',   None,          'plain'),
    ('SANCTUARY',         'sanctuary',   'plain'),
    ('USURP',             None,          'usurp'),
    ('TRANSPOSE',         None,          'transpose'),
    ('RECLAIM',           None,          'reclaim'),
    ('RETRIBUTION',       'retribution', 'plain'),
]


def survey(games, passive_kind, active_kind, seed=5150):
    rng = random.Random(seed)
    w = [0, 0]
    draws = 0
    c1 = c2 = 0.0
    rev = lead = 0
    track = Counter()
    n = 0
    for _ in range(games):
        mid, end, a, b = v22.play(rng, passive_kind=passive_kind,
                                  active_kind=active_kind, track=track)
        n += 1
        c1 += a
        c2 += b
        if end[0] > end[1]:
            w[0] += 1
        elif end[1] > end[0]:
            w[1] += 1
        else:
            draws += 1
        if mid[0] != mid[1] and end[0] != end[1]:
            lead += 1
            if (mid[0] > mid[1]) != (end[0] > end[1]):
                rev += 1
    tot = sum(track.values())
    used = 1 - (track['plain'] / tot if tot else 1)
    return dict(p1=w[0] / n, p2=w[1] / n, draws=draws / n,
                c1=c1 / n, c2=c2 / n, used=used,
                rev=rev / max(lead, 1))


def pct(x):
    return f'{100 * x:5.1f}%'


if __name__ == '__main__':
    games = int(sys.argv[1]) if len(sys.argv) > 1 else 1500
    rows = {}
    for name, pk, ak in CANDIDATES:
        rows[name] = survey(games, pk, ak)

    base = rows['PLAIN (control)']
    print('=' * 84)
    print('CASCADE V2.2 -- five abilities designed from intended experience')
    print('=' * 84)
    print(f'  {games} games each. Two-phase baseline held fixed: 3x4, 12')
    print('  placements, six cards each, Dominion opens with P2, six')
    print('  commands.')
    print()
    print(f'  {"ability":<18}{"used":>7}{"P1":>7}{"P2":>7}{"draw":>7}'
          f'{"conv":>7}{"dom":>7}{"rev":>8}{"swing":>8}')
    for name, *_ in CANDIDATES:
        r = rows[name]
        swing = (abs(r['p1'] - base['p1']) + abs(r['p2'] - base['p2'])
                 + abs(r['draws'] - base['draws']))
        tag = '' if name.startswith('PLAIN') else f'{100 * swing:7.1f}'
        print(f'  {name:<18}{pct(r["used"]):>7}{pct(r["p1"]):>7}'
              f'{pct(r["p2"]):>7}{pct(r["draws"]):>7}'
              f'{r["c1"]:>7.1f}{r["c2"]:>7.1f}{pct(r["rev"]):>8}{tag:>8}')

    print()
    print('  For scale: switching off all four of v2.1\'s abilities moved')
    print('  the outcome by about 5 points of swing and 1.5 captures.')
    print()
    print('=' * 84)
    print('VERDICT')
    print('=' * 84)
    for name, *_ in CANDIDATES:
        if name.startswith('PLAIN'):
            continue
        r = rows[name]
        swing = 100 * (abs(r['p1'] - base['p1'])
                       + abs(r['p2'] - base['p2'])
                       + abs(r['draws'] - base['draws']))
        notes = []
        if r['used'] < 0.08:
            notes.append(f'chosen in only {pct(r["used"]).strip()} of '
                         'commands -- not worth taking')
        if swing < 6:
            notes.append(f'swing {swing:.1f} -- barely changes the game')
        bias = abs(r['p1'] - r['p2'])
        if bias > 0.18:
            who = 'P1' if r['p1'] > r['p2'] else 'P2'
            notes.append(f'breaks balance, {who} +{100 * bias:.0f}')
        if abs(r['c2'] - base['c2']) > 8:
            d = r['c2'] - base['c2']
            notes.append(f'Dominion captures {d:+.1f}')
        if not notes:
            notes.append(f'live: used {pct(r["used"]).strip()}, '
                         f'swing {swing:.1f}, balance holds')
        print(f'  {name:<18}{"; ".join(notes)}')
