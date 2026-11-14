#!/usr/bin/env python3
"""
Generate the cross-language differential fixture.

engine.py is the normative reference for this game's rules -- every balance
number in the design was measured against it. This emits random positions
together with their expected resolution so that a port in another language
can be proved equivalent rather than assumed equivalent.

Compact row format (arrays, not objects, to keep the file small):

    [ cards[9], own0, own1, protected, cell, card, player,
      cap, bonus, attackBonus,
      expCaptured, expOwn0, expOwn1, expWaves[] ]

Cards are packed ints (4 nibbles of face value + 1 nibble of element);
0 means an empty cell. Cell sets are 9-bit masks.

    python3 gen_fixture.py [count] [outfile]
"""

import json
import random
import sys

import engine as E


def random_position(rng):
    """A random legal position, plus a move to resolve on it."""
    board = E.Board()
    n_placed = rng.randrange(0, 9)
    for cell in rng.sample(range(E.NCELLS), n_placed):
        board.cards[cell] = E.random_card(rng, with_element=rng.random() < 0.8)
        board.own[rng.randrange(2)] |= 1 << cell

    empties = board.empty_cells()
    if not empties:
        return None

    # Protect a random subset of the occupied cells (Leto's frozen cards).
    protected = 0
    if n_placed and rng.random() < 0.25:
        for cell in rng.sample(range(E.NCELLS), rng.randint(1, 2)):
            if board.cards[cell]:
                protected |= 1 << cell

    return {
        'board': board,
        'cell': rng.choice(empties),
        'card': E.random_card(rng),
        'player': rng.randrange(2),
        'cap': rng.choice([0, 1, 2, 99]),
        'bonus': rng.choice([0, 1, 2, 3]),
        'attack_bonus': rng.choice([0, 0, 0, 1]),
        'protected': protected,
    }


def build(count, seed=20241028):
    rng = random.Random(seed)
    rows = []
    while len(rows) < count:
        pos = random_position(rng)
        if pos is None:
            continue
        board = pos['board']
        before = (board.cards[:], board.own[0], board.own[1])
        waves = []
        captured = E.place(board, pos['cell'], pos['card'], pos['player'],
                           pos['cap'], pos['bonus'], pos['attack_bonus'],
                           pos['protected'], waves)
        rows.append([
            before[0], before[1], before[2], pos['protected'],
            pos['cell'], pos['card'], pos['player'],
            pos['cap'], pos['bonus'], pos['attack_bonus'],
            captured, board.own[0], board.own[1], waves,
        ])
    return rows


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 40000
    out = sys.argv[2] if len(sys.argv) > 2 else 'web/test/fixtures/resolution.json'
    rows = build(count)

    payload = {
        'format': 1,
        'generator': 'engine.py',
        'schema': ['cards9', 'own0', 'own1', 'protected', 'cell', 'card',
                   'player', 'cap', 'bonus', 'attackBonus',
                   'expCaptured', 'expOwn0', 'expOwn1', 'expWaves'],
        'constants': {
            'CASCADE_CAP': E.CASCADE_CAP,
            'ELEMENT_BONUS': E.ELEMENT_BONUS,
            'TURN_ORDER': list(E.TURN_ORDER),
            'HAND_SIZES': list(E.HAND_SIZES),
            'LEGAL_FACE_COMBOS': len(E.LEGAL_FACES),
        },
        'cases': rows,
    }
    with open(out, 'w') as f:
        json.dump(payload, f, separators=(',', ':'))

    nonzero = sum(1 for r in rows if r[10] > 0)
    multiwave = sum(1 for r in rows if len(r[13]) > 1)
    protected = sum(1 for r in rows if r[3])
    print(f"wrote {out}")
    print(f"  cases            {len(rows)}")
    print(f"  with captures    {nonzero} ({100*nonzero/len(rows):.1f}%)")
    print(f"  multi-wave       {multiwave} ({100*multiwave/len(rows):.1f}%)")
    print(f"  with frozen cell {protected} ({100*protected/len(rows):.1f}%)")


if __name__ == '__main__':
    main()
