#!/usr/bin/env python3
"""
Differential fixture for the v3 rules, generated from v3.py (the normative
reference). Lets the TypeScript port be proved equivalent rather than
assumed equivalent -- the same discipline that caught four mutations in the
v1 port.

Row format (arrays, to keep the file small):

  [ cards9, own0, own1, cell, card, player, cap,
    expCaptured, expWaves, expOwn0, expOwn1 ]

A card is [north, east, south, west] with elements 1..8; null means an empty
cell. Cell sets are 9-bit masks.

    python3 gen_v3_fixture.py [count] [outfile]
"""

import json
import random
import sys

import v3


def random_position(rng):
    cards = [None] * v3.NCELLS
    own = [0, 0]
    n = rng.randrange(0, 9)
    for cell in rng.sample(range(v3.NCELLS), n):
        cards[cell] = rng.choice(v3.CARDS)
        own[rng.randrange(2)] |= 1 << cell
    empties = [i for i in range(v3.NCELLS) if cards[i] is None]
    if not empties:
        return None
    return cards, own, rng.choice(empties)


def build(count, seed=991):
    rng = random.Random(seed)
    rows = []
    while len(rows) < count:
        pos = random_position(rng)
        if pos is None:
            continue
        cards, own, cell = pos
        card = rng.choice(v3.CARDS)
        # exercise both orientations the game actually offers
        if rng.random() < 0.5:
            card = v3.rot90(v3.rot90(card))
        player = rng.randrange(2)
        cap = rng.choice([0, 1, 2])

        before_cards = [list(c) if c else None for c in cards]
        before_own = own[:]
        work = [c for c in cards]
        work_own = own[:]
        captured, waves = v3.resolve(work, work_own, cell, card, player, cap)

        rows.append([
            before_cards, before_own[0], before_own[1],
            cell, list(card), player, cap,
            captured, waves, work_own[0], work_own[1],
        ])
    return rows


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 40000
    out = (sys.argv[2] if len(sys.argv) > 2
           else 'web/test/fixtures/v3.json')
    rows = build(count)

    beats_table = {str(e): sorted(v3.BEATS[e]) for e in v3.ELEMENTS}
    payload = {
        'format': 1,
        'generator': 'v3.py',
        'constants': {
            'ORDER': list(v3.ORDER),
            'HANDS': list(v3.HANDS),
            'CASCADE_CAP': v3.CASCADE_CAP,
            'FINAL_CASCADE_CAP': v3.FINAL_CASCADE_CAP,
            'ROTATIONS': v3.ROTATIONS,
            'CARD_COUNT': len(v3.CARDS),
        },
        'beats': beats_table,
        'twin': {str(k): v for k, v in v3.TWIN.items()},
        'schema': ['cards9', 'own0', 'own1', 'cell', 'card', 'player', 'cap',
                   'expCaptured', 'expWaves', 'expOwn0', 'expOwn1'],
        'cases': rows,
    }
    with open(out, 'w') as f:
        json.dump(payload, f, separators=(',', ':'))

    caps = sum(1 for r in rows if r[7] > 0)
    multi = sum(1 for r in rows if r[8] > 1)
    print(f"wrote {out}")
    print(f"  cases          {len(rows)}")
    print(f"  with captures  {caps} ({100*caps/len(rows):.1f}%)")
    print(f"  multi-wave     {multi} ({100*multi/len(rows):.1f}%)")


if __name__ == '__main__':
    main()
