#!/usr/bin/env python3
"""
Physical test deck for Prototype A: four sigils, matching captures, four
abilities.

This replaces the elemental shared-12 deck, which described a different
game. Everything is verified against proto.py before it is written out.

ONE DECK OF 20, ORDERED SO PREFIXES WORK. The board is still undecided,
and the three measured boards want different deck sizes, so the deck is
built so that taking the first 12 / 16 / 20 cards each gives a balanced
mix of abilities:

    3x3   first 12   deal 5 and 5    2 unseen    9 placements
    3x4   first 16   deal 6 and 7    3 unseen   11 placements, 1 cell empty
    4x4   all 20     deal 8 and 8    4 unseen   15 placements, 1 cell empty

Cut twenty cards once and you can play all three.

    python3 gen_protodeck.py > protodeck.json
"""

import json
import random
import sys
from collections import Counter

import proto as P

SIGILS = ['halo', 'ward', 'crux', 'gyre']
SHAPE_NOTE = {
    'versatile': 'four different sigils — some rotation answers any '
                 'single exposed edge, but it can never take two at once',
    'focused': 'one sigil twice — fewer answers, but it can take two '
               'cards showing that sigil',
    'specialized': 'two pairs — narrowest, and strongest against a wall '
                   'of one sigil',
}
ABILITY_TEXT = {
    'pivot': 'Rotate one adjacent card 90° clockwise — either player’s — '
             'before attacking. (changes orientation)',
    'exchange': 'Swap this card with one adjacent card you control. It '
                'attacks from its destination. (changes position)',
    'relay': 'Instead of this card attacking, an adjacent card you '
             'control attacks from its own position. (changes attack '
             'origin)',
    'prism': 'Choose one edge of this card. For this placement, that '
             'edge matches any sigil. (changes matching)',
}
SIDES = ('n', 'e', 's', 'w')


def card_json(idx, sigils, ability):
    return {
        'id': f'{idx + 1:02d}',
        'sigils': {s: SIGILS[v] for s, v in zip(SIDES, sigils)},
        'short': '/'.join(SIGILS[v][0].upper() for v in sigils),
        'shape': P.shape(sigils),
        'ability': ability,
        'ability_text': ABILITY_TEXT[ability],
    }


def build(rng):
    """20 cards. Abilities are laid out so the first 12, 16 and 20 each
    hold an equal number of each -- 3, 4 and 5 respectively."""
    order = []
    for block in (3, 1, 1):          # 12 cards, then +4, then +4
        for _ in range(block):
            order.extend(P.ABILITIES)
    shapes = ['versatile', 'focused', 'specialized']
    deck = []
    used = set()
    for i, ability in enumerate(order):
        sh = shapes[i % 3]
        while True:
            c = rng.choice(P.BY_SHAPE[sh])
            if c not in used:
                used.add(c)
                break
        deck.append((c, ability))
    return deck


# ---------------------------------------------------------------------------
# scenario search, from the deck's own cards
# ---------------------------------------------------------------------------
def turns_of(base, placed):
    c = base
    for k in range(4):
        if c == placed:
            return k
        c = P.rot90(c)
    return 0


def ref(deck, idx, placed):
    base = deck[idx][0]
    k = turns_of(base, placed)
    return {'id': f'{idx + 1:02d}',
            'short': '/'.join(SIGILS[v][0].upper() for v in placed),
            'sigils': {s: SIGILS[v] for s, v in zip(SIDES, placed)},
            'ability': deck[idx][1],
            'turn': f'{k * 90}° clockwise from the card as printed'}


def board_json(deck, idxs, cards, own):
    out = []
    for i in range(P.NCELLS):
        if cards[i] is None:
            out.append(None)
            continue
        r = ref(deck, idxs[i], cards[i])
        r['cell'] = i
        r['owner'] = 'P1' if (own[0] >> i) & 1 else 'P2'
        out.append(r)
    return out


def layout(rng, deck, n, owner, pool=12):
    cards = [None] * P.NCELLS
    idxs = [None] * P.NCELLS
    own = [0, 0]
    picks = rng.sample(range(pool), n)
    for cell, pi in zip(rng.sample(range(P.NCELLS), n), picks):
        c = deck[pi][0]
        for _ in range(rng.randrange(4)):
            c = P.rot90(c)
        cards[cell] = c
        idxs[cell] = pi
        own[rng.randrange(2) if owner is None else owner] |= 1 << cell
    return cards, idxs, own, set(picks)


def plain_caps(cards, own, cell, card, player, cap=P.CASCADE_CAP):
    c = [x for x in cards]
    o = own[:]
    hands = [[], []]
    hands[player] = [(card, 'pivot')]
    # placed_so_far = -1 keeps the ability off, so this is the bare rule
    return P.apply_move(c, o, hands, player, (0, cell, card, None), cap, -1)


def find_rotation_swing(rng, deck, tries=400000):
    for _ in range(tries):
        cards, idxs, own, used = layout(rng, deck, rng.randint(3, 5), 1)
        empt = [i for i in range(P.NCELLS) if cards[i] is None]
        free = [i for i in range(12) if i not in used]
        if not empt or not free:
            continue
        cell, pi = rng.choice(empt), rng.choice(free)
        got = []
        for k in range(4):
            cv = deck[pi][0]
            for _ in range(k):
                cv = P.rot90(cv)
            got.append(plain_caps(cards, own, cell, cv, 0))
        if max(got) >= 2 and min(got) == 0:
            return cards, idxs, own, cell, pi, got
    return None


def best_versatile(cards, own, cell):
    """The most any four-different-sigil card could take here, in any
    rotation. Used to prove a repeated-sigil scenario really does need
    the repeat -- a first version of this claimed a focused card was
    required and was simply wrong, because a versatile card can also take
    several neighbours when they show DIFFERENT sigils."""
    best = 0
    for v in P.BY_SHAPE['versatile']:
        cv = v
        for _ in range(4):
            best = max(best, plain_caps(cards, own, cell, cv, 0))
            cv = P.rot90(cv)
    return best


def find_multi(rng, deck, tries=600000):
    """Two neighbours showing the SAME sigil, taken by one card that
    carries that sigil twice. This is the only thing a versatile card
    cannot do, since it holds each sigil once -- so the scenario is only
    worth printing when no versatile card can equal it."""
    focused = [i for i in range(12) if P.shape(deck[i][0]) != 'versatile']
    for _ in range(tries):
        cards, idxs, own, used = layout(rng, deck, rng.randint(3, 6), 1)
        empt = [i for i in range(P.NCELLS) if cards[i] is None]
        free = [i for i in focused if i not in used]
        if not empt or not free:
            continue
        cell, pi = rng.choice(empt), rng.choice(free)
        for k in range(4):
            cv = deck[pi][0]
            for _ in range(k):
                cv = P.rot90(cv)
            got = plain_caps(cards, own, cell, cv, 0)
            if got >= 2 and got > best_versatile(cards, own, cell):
                return (cards, idxs, own, cell, pi, cv, got,
                        best_versatile(cards, own, cell))
    return None


def find_fuse(rng, deck, tries=600000):
    for _ in range(tries):
        cards, idxs, own, used = layout(rng, deck, 4, 0)
        empt = [i for i in range(P.NCELLS) if cards[i] is None]
        free = [i for i in range(12) if i not in used]
        if not empt or not free:
            continue
        cell, pi = rng.choice(empt), rng.choice(free)
        for k in range(4):
            cv = deck[pi][0]
            for _ in range(k):
                cv = P.rot90(cv)
            c = [x for x in cards]
            o = own[:]
            hands = [[], [(cv, 'pivot')]]
            got = P.apply_move(c, o, hands, 1, (0, cell, cv, None),
                               P.CASCADE_CAP, -1)
            # was it a chain? compare against a single wave
            c2 = [x for x in cards]
            o2 = own[:]
            h2 = [[], [(cv, 'pivot')]]
            direct = P.apply_move(c2, o2, h2, 1, (0, cell, cv, None), 0, -1)
            if got >= 3 and got > direct:
                return cards, idxs, own, cell, pi, cv, direct, got
    return None


def find_ability(rng, deck, ability, gain, tries=400000):
    """A position where the ability captures `gain` more than declining."""
    idxs_with = [i for i in range(12) if deck[i][1] == ability]
    for _ in range(tries):
        cards, idxs, own, used = layout(rng, deck, rng.randint(3, 6), None)
        ab_idx = rng.choice(idxs_with)
        if ab_idx in used:
            continue
        empt = [i for i in range(P.NCELLS) if cards[i] is None]
        if not empt:
            continue
        cell = rng.choice(empt)
        placed = deck[ab_idx][0]
        for _ in range(rng.randrange(4)):
            placed = P.rot90(placed)
        live = P.ABILITY_FROM_PLACEMENT - 1
        opts = P.options(cards, own, 0, ability, cell, True)
        base = best = None
        bestopt = None
        for opt in opts:
            c = [x for x in cards]
            o = own[:]
            hands = [[(placed, ability)], []]
            got = P.apply_move(c, o, hands, 0, (0, cell, placed, opt),
                               P.CASCADE_CAP, live)
            if opt is None:
                base = got
            elif best is None or got > best:
                best, bestopt = got, opt
        if base is not None and best is not None and best >= base + gain:
            return cards, idxs, own, cell, ab_idx, placed, base, best, bestopt
    return None


def opt_json(opt):
    if opt is None:
        return None
    if opt[0] == 'prism':
        return {'kind': 'prism',
                'edge': ['top', 'right', 'bottom', 'left'][opt[1]]}
    return {'kind': opt[0], 'cell': opt[1]}


def main():
    rng = random.Random(20261101)
    P.set_board(3, 3, (5, 5))
    deck = build(rng)

    assert len(deck) == 20
    assert len({c for c, _ in deck}) == 20, 'duplicate card'
    for n in (12, 16, 20):
        counts = Counter(a for _, a in deck[:n])
        assert len(set(counts.values())) == 1, (n, counts)

    cards_out = [card_json(i, c, a) for i, (c, a) in enumerate(deck)]

    scen = []
    r = find_rotation_swing(rng, deck)
    if r:
        cards, idxs, own, cell, pi, got = r
        scen.append({
            'name': 'rotation decides the turn',
            'question': 'Does aiming the card feel like the main decision?',
            'setup': {'board': board_json(deck, idxs, cards, own),
                      'your_card': ref(deck, pi, deck[pi][0]),
                      'place_on_cell': cell,
                      'note': 'ignore the ability here; try all four turns'},
            'verified': {f'{k * 90}°': got[k] for k in range(4)},
            'watch_for': f'{max(got)} captures one way, {min(got)} another'})

    r = find_multi(rng, deck)
    if r:
        cards, idxs, own, cell, pi, cv, got, vbest = r
        c = ref(deck, pi, cv)
        scen.append({
            'name': 'a repeated sigil takes what a versatile card cannot',
            'question': 'Is it clear why you would ever want a narrower '
                        'card?',
            'setup': {'board': board_json(deck, idxs, cards, own),
                      'your_card': c, 'place_on_cell': cell},
            'verified': {'captures': got,
                         'shape': P.shape(cv),
                         'best_any_versatile_card_could_do': vbest},
            'watch_for': f'this {P.shape(cv)} card takes {got}; the best '
                         f'ANY four-different-sigil card could do on this '
                         f'cell is {vbest}'})

    r = find_fuse(rng, deck)
    if r:
        cards, idxs, own, cell, pi, cv, direct, got = r
        scen.append({
            'name': 'your own wall is a fuse',
            'question': 'Is it obvious that clustering your cards is '
                        'risky?',
            'setup': {'board': board_json(deck, idxs, cards, own),
                      'opponent_card': ref(deck, pi, cv),
                      'opponent_places_on_cell': cell},
            'verified': {'direct': direct, 'with_chain': got},
            'watch_for': f'{direct} taken directly, {got} once the chain '
                         f'runs'})

    for ability, gain in (('pivot', 1), ('exchange', 1), ('relay', 1),
                          ('prism', 1)):
        r = find_ability(rng, deck, ability, gain)
        if not r:
            continue
        cards, idxs, own, cell, ab_idx, placed, base, best, opt = r
        c = ref(deck, ab_idx, placed)
        scen.append({
            'name': f'{ability} earns its slot',
            'question': f'Is it clear why you would use {ability.upper()}, '
                        'and does it feel worth a card?',
            'setup': {'board': board_json(deck, idxs, cards, own),
                      'your_card': c, 'place_on_cell': cell,
                      'use': opt_json(opt)},
            'verified': {'captures_declining': base,
                         'captures_using_it': best},
            'watch_for': f'{base} captures without it, {best} with it'})

    doc = {
        'format': 'cascade-proto-a-deck',
        'generated_by': 'gen_protodeck.py, verified against proto.py',
        'the_whole_rule': 'Matching facing sigils capture. Different '
                          'sigils do nothing. Only the card you place '
                          'attacks.',
        'sigils': {s: n for s, n in zip(
            SIGILS, ['a ring', 'a cut diamond', 'a four-pointed star',
                     'a four-armed pinwheel'])},
        'cells': 'numbered left to right then top to bottom, starting at 0',
        'boards': {
            '3x3': {'use_cards': '01-12', 'deal': '5 and 5',
                    'unseen': 2, 'placements': 9,
                    'note': 'nine cells, all filled',
                    'measured_p1_win': '45.4%'},
            '3x4': {'use_cards': '01-16', 'deal': '6 and 7',
                    'unseen': 3, 'placements': 11,
                    'note': 'one cell stays empty, which forbids a draw',
                    'measured_p1_win': '46.6%'},
            '4x4': {'use_cards': '01-20', 'deal': '8 and 8',
                    'unseen': 4, 'placements': 15,
                    'note': 'one cell stays empty, which forbids a draw',
                    'measured_p1_win': '45.1%'},
        },
        'how_to_use': {
            'pick_a_board': 'The board is still an open decision. Cut all '
                            'twenty cards and the first 12 / 16 / 20 each '
                            'hold an equal number of every ability, so '
                            'the same deck plays all three.',
            'placing': 'Any empty cell, turned any of four ways.',
            'abilities': 'Every card has one. Usable from your second '
                         'placement onward, always optional, declared as '
                         'you place the card.',
            'cascade': 'Each card you capture attacks its own neighbours '
                       'once, then stops. The final placement captures '
                       'but starts no chain.',
            'winning': 'Most cards owned at the end. The placement count '
                       'is always odd, so there are no draws.',
        },
        'card_shapes': SHAPE_NOTE,
        'shape_counts': dict(Counter(c['shape'] for c in cards_out)),
        'cards': cards_out,
        'scenarios': scen,
        'open_questions': [
            'Which board feels best — 9, 11 or 15 placements?',
            'Are four abilities enough variety, or does it get samey?',
            'Does the matching rule stay obvious once a chain runs?',
            'Do you ever want a focused or specialized card, or is '
            'versatile always right?',
            'Is PRISM too strong? It makes one direction a guaranteed '
            'capture.',
        ],
    }
    json.dump(doc, sys.stdout, indent=2, ensure_ascii=False)
    print()
    print(f'# 20 cards, {len(scen)} scenarios, '
          f'shapes {doc["shape_counts"]}', file=sys.stderr)


if __name__ == '__main__':
    main()
