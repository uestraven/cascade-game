#!/usr/bin/env python3
"""
Differential fixture for v2's command phase.

v2.py is the oracle, web/src/v2/game.ts is the port. The command phase is
where the two could silently diverge: the attacker can be moved by
Exchange or Relay, Prism makes one edge wild, and the follow-up is
conditional on a multiple capture. Every one of those is a place where
"the same rule, written twice" has gone wrong in this project before.

Both sides are pinned to the shipped configuration: attack along every
edge, follow-up only after a multiple capture, no lock.

    python3 gen_v2_fixture.py 3000 > web/test/fixtures/v2.json
"""

import json
import random
import sys
from collections import Counter

import proto as P
import v2


def enc(opt):
    if opt is None:
        return None
    k = opt[0]
    return {'kind': k, 'edge': opt[1]} if k == 'prism' \
        else {'kind': k, 'cell': opt[1]}


def main():
    want = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    # the shipped board: variant C -- 3x4, 12 placements, six each, so
    # the board finishes complete
    P.set_board(3, 4, (6, 6), 12)
    rng = random.Random(2525)
    cases = []
    cover = Counter()

    while len(cases) < want:
        n = P.NCELLS
        cards = [None] * n
        own = [0, 0]
        abil = {}
        # a realistic Phase II board is complete, but a cell can be
        # empty mid-deployment, so both are generated
        k = n if rng.random() < 0.8 else n - 1
        filled = rng.sample(range(n), k)
        for i, c in enumerate(filled):
            cards[c] = rng.choice(P.BY_SHAPE['versatile'])
            own[i % 2] |= 1 << c
            abil[c] = v2.ABILITIES[rng.randrange(4)]
        player = rng.randrange(2)
        mine = [c for c in range(n)
                if cards[c] is not None and (own[player] >> c) & 1]
        if not mine:
            continue
        src = rng.choice(mine)

        opts = list(v2.command_options(cards, own, player, abil, src))
        results = []
        for opt in opts:
            c2 = [x for x in cards]
            o2 = own[:]
            a2 = dict(abil)
            got = v2.run_command(c2, o2, a2, player, src, opt,
                                 True, None, None)
            results.append({
                'option': enc(opt),
                'captured': got,
                'own': o2,
                'cards': [None if x is None else list(x) for x in c2],
            })
            cover[abil[src]] += 1

        cases.append({
            'cells': n,
            'cards': [None if x is None else list(x) for x in cards],
            'own': own,
            'abil': [abil.get(c) for c in range(n)],
            'cell': src,
            'player': player,
            'options': [enc(o) for o in opts],
            'results': results,
        })

    out = {
        'format': 'cascade-v2-command-fixture',
        'generator': 'gen_v2_fixture.py (oracle: v2.py)',
        'note': 'all edges attack; follow-up only after a multiple '
                'capture; no lock; variant C -- 3x4, 12 placements',
        'coverage': dict(cover),
        'cases': cases,
    }
    json.dump(out, sys.stdout, separators=(',', ':'))
    print(f'\n{len(cases)} cases, '
          f'{sum(len(c["results"]) for c in cases)} option outcomes',
          file=sys.stderr)
    print('coverage:', dict(cover), file=sys.stderr)
    missing = [a for a in v2.ABILITIES if not cover[a]]
    if missing:
        print('NO COVERAGE:', missing, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
