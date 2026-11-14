#!/usr/bin/env python3
"""
Differential fixture for Prototype A: proto.py is the oracle, the
TypeScript in web/src/proto is the port.

Covers all four abilities and all three measured boards. For each case it
records the option LIST the oracle offers as well as the outcome, because
an offered-option bug and an effect bug are different failures and the
first one hides the second.

The final cards are recorded, not just the capture count: pivot and
exchange change the board itself, and a rotation that turned the wrong
way would be invisible to a count-only comparison. That is the exact hole
mutation testing found in the first port of the eight-element engine.

    python3 gen_proto_fixture.py 6000 > web/test/fixtures/proto.json
"""

import json
import random
import sys
from collections import Counter

import proto as P

BOARDS = [('3x3', 3, 3, (5, 5), None),
          ('3x4', 3, 4, (6, 7), 11),
          ('4x4', 4, 4, (8, 8), 15)]
SHAPES = ('versatile', 'focused', 'specialized')


def main():
    want = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
    rng = random.Random(4242)
    cases = []
    cover = Counter()

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

        ability = P.ABILITIES[len(cases) % len(P.ABILITIES)]
        sigils = rng.choice(P.BY_SHAPE[rng.choice(SHAPES)])
        player = rng.randrange(2)
        # abilities are live from the second placement; the fixture tests
        # the effects, so the gate is opened explicitly per case
        live = True
        placed_so_far = P.ABILITY_FROM_PLACEMENT - 1

        opts = P.options(cards, own, player, ability, cell, live)
        results = []
        for opt in opts:
            c2 = [x for x in cards]
            o2 = own[:]
            hands2 = [[], []]
            hands2[player] = [(sigils, ability)]
            got = P.apply_move(c2, o2, hands2, player,
                               (0, cell, sigils, opt),
                               P.CASCADE_CAP, placed_so_far)
            results.append({
                'option': None if opt is None else (
                    {'kind': opt[0], 'cell': opt[1]} if opt[0] != 'prism'
                    else {'kind': 'prism', 'edge': opt[1]}),
                'captured': got,
                'own': o2,
                'cards': [None if x is None else list(x) for x in c2],
            })
            cover[ability] += 1

        cases.append({
            'board': name,
            'cells': n,
            'cards': [None if x is None else list(x) for x in cards],
            'own': own,
            'cell': cell,
            'sigils': list(sigils),
            'ability': ability,
            'player': player,
            'cap': P.CASCADE_CAP,
            'options': [
                None if o is None else (
                    {'kind': o[0], 'cell': o[1]} if o[0] != 'prism'
                    else {'kind': 'prism', 'edge': o[1]})
                for o in opts],
            'results': results,
        })

    out = {
        'format': 'cascade-proto-a-fixture',
        'generator': 'gen_proto_fixture.py (oracle: proto.py)',
        'note': 'matching facing sigils capture; different sigils do '
                'nothing; only the acting card attacks',
        'abilities': list(P.ABILITIES),
        'boards': {b[0]: {'rows': b[1], 'cols': b[2], 'hands': list(b[3]),
                          'placements': b[4] if b[4] else b[1] * b[2]}
                   for b in BOARDS},
        'coverage': dict(cover),
        'cases': cases,
    }
    json.dump(out, sys.stdout, separators=(',', ':'))
    print()
    print(f'# {len(cases)} cases, '
          f'{sum(len(c["results"]) for c in cases)} option outcomes',
          file=sys.stderr)
    print(f'# per-ability: {sorted(cover.items())}', file=sys.stderr)


if __name__ == '__main__':
    main()
