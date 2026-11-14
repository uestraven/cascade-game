#!/usr/bin/env python3
"""
Independent check of protodeck.json: read the FILE, not the generator's
variables, and re-derive every claim it makes.

The generator asserting its own output proves nothing. This reads the
deck back as a stranger would -- rebuilding each card from its sigil
NAMES, re-applying the stated rotation, and replaying each position
through proto.py.

    python3 verify_protodeck.py
"""

import json
import sys
from collections import Counter

import proto as P

SIGILS = ['halo', 'ward', 'crux', 'gyre']
BY_NAME = {n: i for i, n in enumerate(SIGILS)}
SIDES = ('n', 'e', 's', 'w')
fails = []


def check(ok, msg):
    if not ok:
        fails.append(msg)
    return ok


def sig_of(obj):
    return tuple(BY_NAME[obj['sigils'][s]] for s in SIDES)


def main():
    d = json.load(open('protodeck.json'))
    check(d['format'] == 'cascade-proto-a-deck', 'wrong format tag')
    P.set_board(3, 3, (5, 5))

    # --- the deck ---
    cards = d['cards']
    check(len(cards) == 20, f"{len(cards)} cards, not 20")
    printed = [sig_of(c) for c in cards]
    check(len(set(printed)) == len(printed), 'two cards are identical')
    for c, sg in zip(cards, printed):
        check(c['shape'] == P.shape(sg),
              f"{c['id']} shape stated {c['shape']}, actually {P.shape(sg)}")
        check(c['ability'] in P.ABILITIES,
              f"{c['id']} ability {c['ability']} is not one of the four")
        check(c['short'] == '/'.join(SIGILS[v][0].upper() for v in sg),
              f"{c['id']} short code disagrees with its sigils")
        # the deck pool deliberately excludes triples and monos
        check(max(Counter(sg).values()) <= 2,
              f"{c['id']} has three or more of one sigil")
    counts = Counter(c['shape'] for c in cards)
    for k, v in d['shape_counts'].items():
        check(counts[k] == v,
              f"shape count for {k} stated {v}, actually {counts[k]}")

    # --- the prefix promise: 12 / 16 / 20 each balanced by ability ---
    for n in (12, 16, 20):
        ab = Counter(c['ability'] for c in cards[:n])
        check(len(set(ab.values())) == 1,
              f"first {n} cards are not ability-balanced: {dict(ab)}")
        check(sum(ab.values()) == n, f"first {n} count mismatch")
        want = n // 4
        check(all(v == want for v in ab.values()),
              f"first {n} should be {want} of each, got {dict(ab)}")

    # --- the board table must be arithmetically consistent ---
    for name, b in d['boards'].items():
        rows, cols = (int(x) for x in name.split('x'))
        cells = rows * cols
        lo, hi = b['use_cards'].split('-')
        used = int(hi) - int(lo) + 1
        deal = [int(x) for x in b['deal'].replace(' and ', ' ').split()]
        check(used == sum(deal) + b['unseen'],
              f"{name}: {used} cards but deal {deal} + {b['unseen']} unseen")
        check(b['placements'] <= cells,
              f"{name}: {b['placements']} placements on {cells} cells")
        check(b['placements'] % 2 == 1,
              f"{name}: {b['placements']} placements is even, so a draw "
              f"is possible")
        check(b['placements'] <= sum(deal),
              f"{name}: not enough cards dealt for {b['placements']} "
              f"placements")

    # --- scenarios ---
    def rebuild(r):
        k = int(r['turn'].split('°')[0]) // 90
        idx = int(r['id']) - 1
        c = printed[idx]
        for _ in range(k):
            c = P.rot90(c)
        check(c == sig_of(r),
              f"card {r['id']} at {r['turn']}: stated sigils {r['short']} "
              f"!= the deck card turned that far")
        return c

    def plain(cards_, own, cell, card, player, cap=P.CASCADE_CAP):
        c = [x for x in cards_]
        o = own[:]
        h = [[], []]
        h[player] = [(card, 'pivot')]
        return P.apply_move(c, o, h, player, (0, cell, card, None), cap, -1)

    for s_ in d['scenarios']:
        nm = s_['name']
        b = s_['setup']['board']
        check(len(b) == 9, f"{nm}: board has {len(b)} cells, not 9")
        board = [None] * 9
        own = [0, 0]
        ids = []
        for i, slot in enumerate(b):
            if slot is None:
                continue
            check(slot['cell'] == i, f"{nm}: cell {i} labelled {slot['cell']}")
            board[i] = rebuild(slot)
            own[0 if slot['owner'] == 'P1' else 1] |= 1 << i
            ids.append(slot['id'])
        placed = s_['setup'].get('your_card') or s_['setup'].get('opponent_card')
        if placed:
            ids.append(placed['id'])
        check(len(set(ids)) == len(ids),
              f"{nm}: needs two copies of one card: {ids}")
        # every scenario card must come from the first 12, so the 3x3
        # deck alone can lay it out
        for pid in ids:
            check(int(pid) <= 12,
                  f"{nm}: uses card {pid}, outside the first twelve")
        v = s_['verified']

        if '0°' in v:
            cell = s_['setup']['place_on_cell']
            check(board[cell] is None, f"{nm}: target cell occupied")
            base = printed[int(placed['id']) - 1]
            for k in range(4):
                cv = base
                for _ in range(k):
                    cv = P.rot90(cv)
                got = plain(board, own, cell, cv, 0)
                check(got == v[f'{k * 90}°'],
                      f"{nm}: {k * 90}° claimed {v[f'{k * 90}°']}, got {got}")

        elif 'best_any_versatile_card_could_do' in v:
            cell = s_['setup']['place_on_cell']
            cv = rebuild(placed)
            got = plain(board, own, cell, cv, 0)
            check(got == v['captures'],
                  f"{nm}: claimed {v['captures']} captures, got {got}")
            check(P.shape(cv) == v['shape'],
                  f"{nm}: shape claimed {v['shape']}, actually {P.shape(cv)}")
            # the whole point: exhaust every versatile card and rotation
            best = 0
            for x in P.BY_SHAPE['versatile']:
                r = x
                for _ in range(4):
                    best = max(best, plain(board, own, cell, r, 0))
                    r = P.rot90(r)
            check(best == v['best_any_versatile_card_could_do'],
                  f"{nm}: claimed no versatile card beats "
                  f"{v['best_any_versatile_card_could_do']}, but one "
                  f"reaches {best}")
            check(got > best,
                  f"{nm}: the repeated-sigil card takes {got}, which is "
                  f"not more than a versatile card's {best}")

        elif 'with_chain' in v:
            cell = s_['setup']['opponent_places_on_cell']
            cv = rebuild(placed)
            direct = plain(board, own, cell, cv, 1, 0)
            full = plain(board, own, cell, cv, 1, P.CASCADE_CAP)
            check(direct == v['direct'],
                  f"{nm}: claimed {v['direct']} direct, got {direct}")
            check(full == v['with_chain'],
                  f"{nm}: claimed {v['with_chain']} with chain, got {full}")
            check(full > direct, f"{nm}: no chain actually happened")

        elif 'captures_using_it' in v:
            cell = s_['setup']['place_on_cell']
            ability = placed['ability']
            deck_ab = cards[int(placed['id']) - 1]['ability']
            check(deck_ab == ability,
                  f"{nm}: scenario says {ability}, card {placed['id']} "
                  f"carries {deck_ab}")
            cv = rebuild(placed)
            live = P.ABILITY_FROM_PLACEMENT - 1
            base = best = None
            for opt in P.options(board, own, 0, ability, cell, True):
                c = [x for x in board]
                o = own[:]
                got = P.apply_move(c, o, [[(cv, ability)], []], 0,
                                   (0, cell, cv, opt), P.CASCADE_CAP, live)
                if opt is None:
                    base = got
                elif best is None or got > best:
                    best = got
            check(base == v['captures_declining'],
                  f"{nm}: claimed {v['captures_declining']} declining, "
                  f"got {base}")
            check(best == v['captures_using_it'],
                  f"{nm}: claimed {v['captures_using_it']} using it, "
                  f"got {best}")
        else:
            fails.append(f"{nm}: nothing in `verified` was checkable")

    print(f"{len(cards)} cards, {len(d['scenarios'])} scenarios")
    if fails:
        print(f"\n{len(fails)} PROBLEM(S):")
        for f in fails:
            print(f"  - {f}")
        sys.exit(1)
    print("every claim in the file re-derives from proto.py")


if __name__ == '__main__':
    main()
