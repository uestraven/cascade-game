#!/usr/bin/env python3
"""
First measurements of the two-phase game: seat order, churn, and whether
the last command decides it.

    python3 measure_v2.py [games]
"""

import random
import sys
from collections import Counter

import proto as P
import v2


def survey(games, *, commands=v2.PHASE2, exhaust='none',
           followup_needs_multi=False, greed=1.0, seed=909):
    rng = random.Random(seed)
    p1 = draws = n = 0
    c1 = c2 = 0.0
    track = Counter()
    swing = 0.0
    lead_kept = 0
    lead_games = 0
    by_margin = Counter()
    by_margin_win = Counter()
    for _ in range(games):
        mid, end, a, b = v2.play(rng, commands=commands, exhaust=exhaust,
                                 followup_needs_multi=followup_needs_multi,
                                 greed=greed, track=track)
        n += 1
        c1 += a
        c2 += b
        if end[0] > end[1]:
            p1 += 1
        elif end[0] == end[1]:
            draws += 1
        swing += abs((end[0] - end[1]) - (mid[0] - mid[1]))
        m = mid[0] - mid[1]
        if m != 0:
            lead_games += 1
            if (m > 0) == (end[0] > end[1]) and end[0] != end[1]:
                lead_kept += 1
        by_margin[m] += 1
        if end[0] > end[1]:
            by_margin_win[m] += 1
    return dict(p1=p1 / n, draws=draws / n, c1=c1 / n, c2=c2 / n,
                swing=swing / n, track=track,
                lead_kept=lead_kept / max(lead_games, 1),
                by_margin=by_margin, by_margin_win=by_margin_win)


def pct(x):
    return f'{100 * x:5.1f}%'


if __name__ == '__main__':
    games = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
    P.set_board(3, 3, (5, 5))

    print('=' * 72)
    print('TWO-PHASE CASCADE -- first look')
    print('=' * 72)
    print(f'  {games} games. Phase I: 9 placements, P1 first, direct')
    print('  captures only. Phase II: 6 commands, P2 first, so P1 commands')
    print('  last. Abilities are the original four and fire in Phase II.')
    print()

    base = survey(games)
    print(f'  P1 wins              {pct(base["p1"])}')
    print(f'  draws                {pct(base["draws"])}')
    print(f'  captures, phase I    {base["c1"]:5.2f}')
    print(f'  captures, phase II   {base["c2"]:5.2f}   '
          f'({base["c2"] / v2.PHASE2:.2f} per command)')
    print(f'  total                {base["c1"] + base["c2"]:5.2f}   '
          f'(v1 on the same board: 18.43)')
    print()
    print(f'  mean swing in margin across phase II  {base["swing"]:.2f} cards')
    print(f'  phase I leader still ahead at the end {pct(base["lead_kept"])}')
    print()
    print('  captures per command:')
    tot = sum(base['track'].values())
    for k in sorted(base['track']):
        print(f'    {k}  {pct(base["track"][k] / tot)}')

    print()
    print('=' * 72)
    print('A. DOES THE LAST COMMAND DECIDE IT?')
    print('=' * 72)
    print('  P2 commands first, so an even count gives P1 the last word.')
    print('  If the winner tracks whoever moves last, the phase is a')
    print('  tempo race rather than a contest.')
    print()
    print(f'  {"commands":>10} {"last mover":>11} {"P1 wins":>9} {"draws":>7}')
    for k in (4, 5, 6, 7, 8):
        r = survey(games, commands=k)
        last = 'P1' if k % 2 == 0 else 'P2'
        print(f'  {k:>10} {last:>11} {pct(r["p1"]):>9} {pct(r["draws"]):>7}')

    print()
    print('=' * 72)
    print('B. THE EXHAUSTION RULE')
    print('=' * 72)
    print('  Nothing in the proposal stops you commanding one strong card')
    print('  all three times.')
    print()
    print(f'  {"rule":>8} {"P1 wins":>9} {"phase II caps":>14} '
          f'{"distinct cards":>15}')
    for ex, note in (('none', 'reuse freely'),
                     ('round', 'not twice in a row'),
                     ('once', 'each card once per game')):
        r = survey(games, exhaust=ex)
        print(f'  {ex:>8} {pct(r["p1"]):>9} {r["c2"]:>14.2f}   {note}')

    print()
    print('=' * 72)
    print('C. THE FOLLOW-UP READING')
    print('=' * 72)
    print('  "if you capture multiple cards, choose one newly captured')
    print('  card to make a follow-up" -- strictly, a single capture gets')
    print('  no follow-up.')
    print()
    for f, note in ((False, 'any capture may follow up'),
                    (True, 'only a multiple capture may')):
        r = survey(games, followup_needs_multi=f)
        print(f'  {str(f):>6}  P1 {pct(r["p1"])}  phase II '
              f'{r["c2"]:5.2f}  total {r["c1"] + r["c2"]:5.2f}   {note}')

    print()
    print('=' * 72)
    print('D. CAN THE TRAILING PLAYER RECOVER?')
    print('=' * 72)
    print('  P1 win rate by the margin P1 held when deployment ended.')
    print()
    bm, bw = base['by_margin'], base['by_margin_win']
    print(f'  {"margin":>7} {"games":>7} {"P1 wins":>9}')
    for m in sorted(bm):
        if bm[m] < games * 0.01:
            continue
        print(f'  {m:>+7} {bm[m]:>7} {pct(bw[m] / bm[m]):>9}')
