#!/usr/bin/env python3
"""
Differential fixture for ABILITIES, which the existing 40,000-case v3
fixture does not cover at all -- it only exercises plain placement. The
TypeScript side is currently tested only for "resolves without throwing",
which would pass on an ability that did the wrong thing.

Emits, for each random position and each legal option of one ability:

  the board, the placed cell and edges, the ability, the option
  -> the option LIST the oracle offers, the captures, the final owners,
     and the final cards

The final cards matter as much as the capture count: Gust, Tremor,
Cyclone, Upheaval, Umbra and Tide all change the board itself, and a
rotation that turns the wrong way would be invisible to a count-only
comparison. That is the exact hole mutation testing found in the first
port.

    python3 gen_ability_fixture.py 6000 > web/test/fixtures/abilities.json
"""

import json
import random
import sys

import v3
import v3_abilities as A
from v3 import CARDS, ELEMENTS, NCELLS, rot90

# the eight that appear in the physical test deck, first, then the rest
EIGHT = ['gust', 'scorch', 'tremor', 'conduit', 'eclipse', 'tide', 'beacon',
         'arc']
REST = [a for a in A.ABIL if a not in EIGHT]
ORDERED = EIGHT + REST

GENERIC = ('eclipse', 'tremor', 'glaciate', 'cyclone', 'upheaval')


def norm(ability, opt):
    """Python's tuple options -> the TypeScript Option shape."""
    if opt is None:
        return None
    kind = opt[0]
    if kind == 'use':
        return {'kind': ability}
    if kind in ('gust', 'conduit', 'arc', 'tide', 'umbra'):
        return {'kind': kind, 'cell': opt[1]}
    if kind in ('scorch', 'backlash'):
        return {'kind': kind, 'cell': opt[1], 'near': opt[2]}
    if kind == 'beacon':
        return {'kind': 'beacon', 'cell': opt[1], 'near': opt[2],
                'edge': opt[3]}
    raise ValueError(opt)


def opt_key(o):
    if o is None:
        return ''
    return '|'.join(str(o.get(k, '')) for k in ('kind', 'cell', 'near', 'edge'))


def position(rng):
    n = rng.randint(2, 7)
    cards = [None] * NCELLS
    own = [0, 0]
    for cell in rng.sample(range(NCELLS), n):
        c = rng.choice(CARDS)
        for _ in range(rng.randrange(4)):
            c = rot90(c)
        cards[cell] = c
        own[rng.randrange(2)] |= 1 << cell
    empt = [i for i in range(NCELLS) if cards[i] is None]
    if not empt:
        return None
    cell = rng.choice(empt)
    card = rng.choice(CARDS)
    for _ in range(rng.randrange(4)):
        card = rot90(card)
    return cards, own, cell, card


def main():
    want = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
    rng = random.Random(606)
    cases = []
    seen_kind = {}

    while len(cases) < want:
        p = position(rng)
        if not p:
            continue
        board, own, cell, edges = p
        ability = ORDERED[len(cases) % len(ORDERED)]
        player = rng.randrange(2)

        # force the ability live: the affinity gate was deleted from the
        # game in favour of a turn gate, so the oracle's own cost model is
        # bypassed rather than modelled
        A.PLAYED[player].clear()
        for e in ELEMENTS:
            A.PLAYED[player][e] = 99

        wrapped = [None if c is None else (c, ELEMENTS[0], None)
                   for c in board]
        card = (edges, ELEMENTS[0], ability)
        opts = A.options(wrapped, own, player, card, cell)
        norm_opts = [norm(ability, o) for o in opts]

        results = []
        for o in opts:
            c2 = [x for x in wrapped]
            o2 = own[:]
            got = A.apply_move(c2, o2, [[card], [card]], [[], []], player,
                               (0, cell, edges, o), v3.CASCADE_CAP, rng)
            results.append({
                'option': norm(ability, o),
                'captured': got,
                'own': o2,
                'cards': [None if x is None else list(A.edges(x))
                          for x in c2],
            })
            seen_kind[ability] = seen_kind.get(ability, 0) + 1

        cases.append({
            'board': [None if c is None else list(c) for c in board],
            'own': own,
            'cell': cell,
            'edges': list(edges),
            'ability': ability,
            'player': player,
            'cap': v3.CASCADE_CAP,
            'options': norm_opts,
            'results': results,
        })

    out = {
        'format': 'cascade-v3-ability-fixture',
        'generator': 'gen_ability_fixture.py (oracle: v3_abilities.py)',
        'note': 'the affinity cost gate is forced open; the shipped game '
                'gates abilities on your second placement instead',
        'abilities': ORDERED,
        'coverage': seen_kind,
        'cases': cases,
    }
    json.dump(out, sys.stdout, separators=(',', ':'))
    print()
    print(f'# {len(cases)} cases, '
          f'{sum(len(c["results"]) for c in cases)} option outcomes',
          file=sys.stderr)
    print(f'# per-ability outcomes: '
          f'{sorted(seen_kind.items(), key=lambda kv: -kv[1])}',
          file=sys.stderr)


if __name__ == '__main__':
    main()
