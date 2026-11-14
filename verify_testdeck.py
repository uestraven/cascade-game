#!/usr/bin/env python3
"""
Independent check of testdeck.json: read the FILE, not the generator's
variables, and re-derive every claim it makes.

The generator asserting its own output proves nothing -- the port that
offered 90-degree rotations instead of 180 passed every test because the
test asked the port what it did. So this reads the deck back as a stranger
would, rebuilds each card from its named edges, re-applies the stated
rotation, and replays each position.

    python3 verify_testdeck.py
"""
# Rewritten for the shared-12 format: six 12-card decks, every card
# carrying an ability, scenarios laid out from a named deck.

import json
import sys
from collections import Counter

import v3
from v3 import NAMES, NB, NCELLS, OPPSIDE, TWIN, beats, resolve, rot90

SIDES = ('n', 'e', 's', 'w')
BY_NAME = {n: e for e, n in NAMES.items()}
fails = []


def check(ok, msg):
    if not ok:
        fails.append(msg)
    return ok


def edges_of(obj):
    return tuple(BY_NAME[obj['edges'][s]] for s in SIDES)


def main():
    d = json.load(open('testdeck.json'))
    assert d['format'] == 'cascade-shared-12', d['format']

    # --- the wheel, re-derived from the engine ---
    for name, w in d['wheel'].items():
        e = BY_NAME[name]
        check(sorted(NAMES[v] for v in v3.BEATS[e]) == w['beats'],
              f"wheel: {name} beats list is wrong")
        check(NAMES[TWIN[e]] == w['twin'], f"wheel: {name} twin is wrong")
        check(len(w['beats']) == 3, f"wheel: {name} beats {len(w['beats'])}")

    import v3_abilities as A
    decks = {}
    for k in d['decks']:
        name = k['name']
        cards = k['cards']
        check(len(cards) == 12, f"{name}: {len(cards)} cards, not 12")
        edges = [edges_of(c) for c in cards]
        decks[name] = edges
        check(len(set(edges)) == 12, f"{name}: two cards are identical")
        for c, e in zip(cards, edges):
            check(len(set(e)) == 4,
                  f"{name}/{c['id']} repeats an element: {c['short']}")
            check(c['short'] == '/'.join(v3.CODES[x] for x in e),
                  f"{name}/{c['id']} short code disagrees with its edges")
            check(c['ability'] is not None,
                  f"{name}/{c['id']} has no ability -- every card must")
            check(c['ability'] in A.ABIL,
                  f"{name}/{c['id']} ability {c['ability']} is not shipped")
            check(c['ability'] in k['abilities_used'],
                  f"{name}/{c['id']} ability is outside the deck's list")
            vict = set()
            for x in e:
                vict |= v3.BEATS[x]
            check(c['coverage'] == len(vict),
                  f"{name}/{c['id']} coverage stated {c['coverage']}, "
                  f"actually {len(vict)}")
        cnt = Counter(x for e in edges for x in e)
        for nm, n in k['element_balance'].items():
            check(cnt[BY_NAME[nm]] == n,
                  f"{name}: balance for {nm} stated {n}, actually "
                  f"{cnt[BY_NAME[nm]]}")
        check(k['element_spread'] == max(cnt.values()) - min(cnt.values()),
              f"{name}: element spread misstated")

    # --- scenarios ---
    def rebuild(deck, r):
        k = int(r['turn'].split('°')[0]) // 90
        idx = int(r['id']) - 1
        c = deck[idx]
        for _ in range(k):
            c = rot90(c)
        check(c == edges_of(r),
              f"card {r['id']} at {r['turn']}: stated edges {r['short']} "
              f"!= the deck card turned that far")
        return c

    for s_ in d['scenarios']:
        nm = f"{s_['deck']}/{s_['name']}"
        deck = decks.get(s_['deck'])
        check(deck is not None, f"{nm}: unknown deck")
        if deck is None:
            continue
        b = s_['setup']['board']
        check(len(b) == NCELLS, f"{nm}: board has {len(b)} cells")
        cards = [None] * NCELLS
        own = [0, 0]
        ids = []
        for i, slot in enumerate(b):
            if slot is None:
                continue
            check(slot['cell'] == i, f"{nm}: cell {i} labelled {slot['cell']}")
            cards[i] = rebuild(deck, slot)
            own[0 if slot['owner'] == 'P1' else 1] |= 1 << i
            ids.append(slot['id'])
        placed = s_['setup'].get('your_card') or s_['setup'].get('opponent_card')
        if placed:
            ids.append(placed['id'])
        check(len(set(ids)) == len(ids),
              f"{nm}: needs two copies of one card: {ids}")
        v = s_['verified']

        if 'resolves' in v:
            a, bb = v['cells']
            dd = next((k for k in range(4) if NB[a][k] == bb), None)
            check(dd is not None, f"{nm}: cells {a},{bb} are not adjacent")
            if dd is not None:
                x, y = cards[a][dd], cards[bb][OPPSIDE[dd]]
                check([NAMES[x], NAMES[y]] == v['facing'],
                      f"{nm}: facing claimed {v['facing']}, actually "
                      f"{[NAMES[x], NAMES[y]]}")
                check(not beats(x, y) and not beats(y, x),
                      f"{nm}: {NAMES[x]} vs {NAMES[y]} DOES resolve")
        elif 'waves' in v:
            cell = s_['setup']['opponent_places_on_cell']
            check(cards[cell] is None, f"{nm}: target cell occupied")
            cv = rebuild(deck, placed)
            got, waves = resolve([x for x in cards], own[:], cell, cv, 1,
                                 v3.CASCADE_CAP)
            check(got == v['captures'],
                  f"{nm}: claimed {v['captures']} captures, got {got}")
            check(waves == v['waves'],
                  f"{nm}: claimed {v['waves']} waves, got {waves}")
        elif 'captures_with_surge' in v:
            cell = s_['setup']['place_on_cell']
            check(cards[cell] is None, f"{nm}: target cell occupied")
            check(placed['ability'] == 'surge', f"{nm}: not a surge card")
            wrapped = [None if c is None else (c, v3.ELEMENTS[0], None)
                       for c in cards]
            card = (rebuild(deck, placed), v3.ELEMENTS[0], 'surge')
            A.PLAYED[0].clear()
            for e in v3.ELEMENTS:
                A.PLAYED[0][e] = 99
            got = {}
            for opt in (None, ('use',)):
                got[opt] = A.apply_move([x for x in wrapped], own[:],
                                        [[card], []], [[], []], 0,
                                        (0, cell, A.edges(card), opt),
                                        v3.CASCADE_CAP, None)
            check(got[None] == v['captures_without_surge'],
                  f"{nm}: claimed {v['captures_without_surge']} without, "
                  f"got {got[None]}")
            check(got[('use',)] == v['captures_with_surge'],
                  f"{nm}: claimed {v['captures_with_surge']} with, "
                  f"got {got[('use',)]}")
        else:
            # the rotation sweep: keys are '0°', '90°', ...
            cell = s_['setup']['place_on_cell']
            check(cards[cell] is None, f"{nm}: target cell occupied")
            base = deck[int(placed['id']) - 1]
            for k in range(4):
                cv = base
                for _ in range(k):
                    cv = rot90(cv)
                got = resolve([x for x in cards], own[:], cell, cv, 0,
                              v3.CASCADE_CAP)[0]
                said = v[f'{k * 90}°']
                check(got == said,
                      f"{nm}: {k * 90}° claimed {said}, got {got}")

    print(f"{len(d['decks'])} decks, {len(d['scenarios'])} scenarios")
    if fails:
        print(f"\n{len(fails)} PROBLEM(S):")
        for f in fails:
            print(f"  - {f}")
        sys.exit(1)
    print("every claim in the file re-derives from the engine")


if __name__ == '__main__':
    main()
