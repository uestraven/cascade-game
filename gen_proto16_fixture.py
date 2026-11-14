#!/usr/bin/env python3
"""
Differential fixture for the sixteen adopted abilities.

proto16.py is the oracle, web/src/proto/abilities.ts is the port. The
same prose was turned into code twice, which is exactly the situation
that produced a silent disagreement last time -- an ability chained from
the vacated cell in Python and from the destination cell in TypeScript,
and both passed their own tests for weeks.

What is recorded per case, and why:

  options   the option LIST, so an offered-option bug cannot hide an
            effect bug behind it
  captured  the count
  own       ownership, which is the score
  cards     the final board, because Anchor, Withdraw, Crossing, Mend,
            Reorient and Hinge all move or turn cards without
            necessarily changing the count. A count-only comparison
            would be blind to every one of them
  shields   Fortify writes state that outlives the placement, so it is
            compared too

    python3 gen_proto16_fixture.py 6000 > web/test/fixtures/proto16.json
"""

import json
import random
import sys
from collections import Counter

import proto as P
import proto16 as X

BOARDS = [('3x3', 3, 3, (5, 5), None),
          ('3x4', 3, 4, (6, 7), 11),
          ('4x4', 4, 4, (8, 8), 15)]
SHAPES = ('versatile', 'focused', 'specialized')


def enc(opt):
    """Option tuples -> the TypeScript's discriminated-union shape."""
    if opt is None:
        return None
    k = opt[0]
    if k == 'mirror':
        return {'kind': k, 'a': opt[1], 'b': opt[2]}
    if k == 'echo':
        return {'kind': k, 'from': opt[1], 'to': opt[2]}
    if k == 'attune':
        return {'kind': k, 'cell': opt[1], 'edge': opt[2]}
    if k == 'converge':
        return {'kind': k, 'a': opt[1], 'b': opt[2]}
    if k == 'lance':
        return {'kind': k, 'edge': opt[1]}
    if k == 'corner':
        return {'kind': k, 'cell': opt[1], 'edge': opt[2]}
    if k == 'bridge':
        return {'kind': k, 'through': opt[1], 'cell': opt[2],
                'edge': opt[3]}
    if k == 'crossing':
        return {'kind': k, 'axis': opt[1]}
    if k == 'hinge':
        return {'kind': k, 'cell': opt[1]}
    if k == 'amplify':
        return {'kind': k, 'edge': opt[1], 'target': opt[2]}
    if k == 'anchor':
        return {'kind': k, 'cell': opt[1], 'dest': opt[2]}
    if k == 'handoff':
        return {'kind': k, 'cell': opt[1], 'ally': opt[2]}
    if k == 'fortify':
        return {'kind': k, 'edge': opt[1]}
    if k == 'withdraw':
        return {'kind': k, 'dest': opt[1]}
    if k == 'reorient':
        return {'kind': k, 'cell': opt[1], 'cw': opt[2] == 0}
    if k == 'mend':
        return {'kind': k, 'edge': opt[1]}
    raise AssertionError(f'unencodable option {opt!r}')


def main():
    want = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
    rng = random.Random(1616)
    cases = []
    cover = Counter()
    offered = Counter()

    while len(cases) < want:
        name, rows, cols, hands, stop = BOARDS[len(cases) % len(BOARDS)]
        P.set_board(rows, cols, hands, stop)
        n = P.NCELLS

        cards = [None] * n
        own = [0, 0]
        for c in rng.sample(range(n), rng.randint(2, max(2, n - 2))):
            sh = rng.choice(SHAPES)
            cards[c] = rng.choice(P.BY_SHAPE[sh])
            own[rng.randrange(2)] |= 1 << c
        empt = [i for i in range(n) if cards[i] is None]
        if not empt:
            continue
        cell = rng.choice(empt)

        ability = X.NEW16[len(cases) % len(X.NEW16)]
        sigils = rng.choice(P.BY_SHAPE[rng.choice(SHAPES)])
        player = rng.randrange(2)
        placed_so_far = P.ABILITY_FROM_PLACEMENT - 1
        # a turn in the middle of the game, so Fortify's expiry window is
        # exercised rather than always starting from zero
        turn = rng.randrange(1, max(2, len(P.ORDER) - 1))
        cap = P.CASCADE_CAP

        opts = X.options16(cards, own, player, ability, cell, True, {},
                           sigils, cap)
        # a case where the ability offers nothing teaches the port
        # nothing, and three of the sixteen are rare enough that most
        # random positions are like that
        if len(opts) <= 1:
            continue

        results = []
        for opt in opts:
            c2 = [x for x in cards]
            o2 = own[:]
            h2 = [[], []]
            h2[player] = [(sigils, ability)]
            sh2 = {}
            got = X.apply16(c2, o2, h2, player, (0, cell, sigils, opt),
                            cap, placed_so_far, sh2, turn)
            results.append({
                'option': enc(opt),
                'captured': got,
                'own': o2,
                'cards': [None if x is None else list(x) for x in c2],
                'shields': {f'{k[0]}:{k[1]}': v for k, v in sh2.items()},
            })
            cover[ability] += 1

        offered[ability] += 1
        cases.append({
            'board': name,
            'cells': n,
            'cards': [None if x is None else list(x) for x in cards],
            'own': own,
            'cell': cell,
            'sigils': list(sigils),
            'ability': ability,
            'player': player,
            'cap': cap,
            'turn': turn,
            'options': [enc(o) for o in opts],
            'results': results,
        })

    out = {
        'format': 'cascade-proto16-fixture',
        'generator': 'gen_proto16_fixture.py (oracle: proto16.py)',
        'note': 'the sixteen adopted abilities; matching facing sigils '
                'capture, only the acting card attacks',
        'abilities': list(X.NEW16),
        'boards': {b[0]: {'rows': b[1], 'cols': b[2], 'hands': list(b[3]),
                          'placements': b[4] if b[4] else b[1] * b[2]}
                   for b in BOARDS},
        'coverage': dict(cover),
        'cases': cases,
    }
    json.dump(out, sys.stdout, separators=(',', ':'))
    print(f'\n{len(cases)} cases, '
          f'{sum(len(c["results"]) for c in cases)} option outcomes',
          file=sys.stderr)
    missing = [a for a in X.NEW16 if not cover[a]]
    print('coverage:', dict(cover), file=sys.stderr)
    if missing:
        print('NO COVERAGE:', missing, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
