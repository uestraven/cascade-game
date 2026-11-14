#!/usr/bin/env python3
"""
Physical test decks for the CURRENT format: one 12-card deck shared by
both players, every card carrying an ability, dealt 5 and 6 with one card
left unseen.

This replaces a 30-card two-deck generator written for the old format,
which is now wrong in three ways: the cap of five ability cards is gone,
decks are shared rather than per-player, and there are no leaders.

Six decks are emitted, one per measured archetype, because compositions
barely differ in who wins and differ a lot in how the game plays. Each
carries the figures it measured so a physical test can be compared
against them.

Everything is verified against v3.py and v3_abilities.py before it is
written: card legality, element balance, the ability on every card, and
every claim each scenario makes about what happens.

    python3 gen_testdeck.py > testdeck.json
"""

import json
import random
import sys
from collections import Counter

import v3
import v3_abilities as A
from v3 import (BEATS, CARDS, CODES, ELEMENTS, NAMES, NB, NCELLS, OPPSIDE,
                TWIN, beats, resolve, rot90)

SIDES = ('n', 'e', 's', 'w')
DECK = 12
DEAL = (5, 6)

ABILITY_TEXT = {
    'conduit':  'Trigger this card’s cascade from an adjacent card you '
                'control instead of from this one.',
    'arc':      'Trigger this card’s cascade from ANY card you control.',
    'surge':    'The chain starts from EVERY card you control, not just '
                'this one.',
    'scorch':   'Also attack one diagonal neighbour, using your top edge '
                'for the two above and your bottom edge for the two below.',
    'backlash': 'Also attack in a straight line through one empty cell.',
    'gust':     'Rotate one adjacent card 90° clockwise — either '
                'player’s, including your own.',
    'cyclone':  'Rotate every card on the board 90° clockwise.',
    'tremor':   'Rotate every card adjacent to this one 180° — yours too.',
    'upheaval': 'Rotate this card and every adjacent card you control 90°.',
    'eclipse':  'All four of this card’s edges become their twins. '
                'Permanent.',
    'umbra':    'One adjacent enemy card’s edges count as their twins '
                'this turn.',
    'tide':     'Swap this card’s position with an adjacent card you '
                'control; it attacks from its new cell.',
    'glaciate': 'All four of this card’s edges count as Ice this turn.',
    'beacon':   'Attack one adjacent enemy card with the edge of your '
                'choice. The defender still uses the edge facing you.',
}

# the measured archetypes, with the figures from smalldeck.py
ARCHETYPES = [
    ('chainers', ['arc', 'conduit'],
     'Out-think your opponent. The most skill-rewarding deck measured, '
     'and the most even.',
     {'depth': '70.2%', 'decided_by_play': '43.5%', 'close_finishes': '66.0%',
      'p1_win': '47.5%'}),
    ('priced-mix', ['arc', 'umbra', 'eclipse', 'glaciate', 'conduit'],
     'The all-rounder. Five abilities that all measured within a few '
     'points of neutral.',
     {'depth': '70.8%', 'decided_by_play': '44.0%', 'close_finishes': '70.5%',
      'p1_win': '53.2%'}),
    ('deniers', ['umbra', 'eclipse', 'glaciate'],
     'Nothing resolves the way it looks. The deepest deck measured — '
     'every matchup can be turned inside out.',
     {'depth': '75.5%', 'decided_by_play': '36.0%', 'close_finishes': '70.0%',
      'p1_win': '55.2%'}),
    ('rotators', ['gust', 'tremor', 'cyclone', 'upheaval'],
     'The board will not hold still. Closest finishes of any deck.',
     {'depth': '70.0%', 'decided_by_play': '33.0%', 'close_finishes': '76.8%',
      'p1_win': '60.8%'}),
    ('reach', ['beacon', 'scorch', 'backlash'],
     'Loose and grabby. The shallowest deck measured — captures come '
     'without having to read the board. Includes Scorch, which punishes '
     'greedy placement.',
     {'depth': '58.5%', 'decided_by_play': '32.5%', 'close_finishes': '63.7%',
      'p1_win': '52.2%'}),
    ('violent', ['surge', 'cyclone', 'tremor'],
     'Deliberately unfair. Surge alone swings the seat 10.6 points toward '
     'Player 2. Play it for the spectacle, not for a fair match.',
     {'depth': '~65%', 'decided_by_play': '~34%', 'close_finishes': '~55%',
      'p1_win': '39.4% with one Surge in twelve'}),
]


def balanced_deck(rng, abilities, n=DECK, tries=40000):
    """n distinct cards with element counts as even as possible, each
    carrying an ability cycled from `abilities`."""
    best, spread = None, 99
    for _ in range(tries):
        pick = [rng.choice(CARDS) for _ in range(n)]
        if len(set(pick)) < n:
            continue
        c = Counter(e for card in pick for e in card)
        if len(c) < 8:
            continue
        sp = max(c.values()) - min(c.values())
        if sp < spread:
            best, spread = pick, sp
            if sp <= 1:
                break
    return best, spread


def card_json(idx, card, ability):
    vict = set()
    for e in card:
        vict |= BEATS[e]
    return {
        'id': f'{idx + 1:02d}',
        'edges': {s: NAMES[e] for s, e in zip(SIDES, card)},
        'short': '/'.join(CODES[e] for e in card),
        'ability': ability,
        'ability_text': ABILITY_TEXT[ability],
        'coverage': len(vict),
    }


# ---------------------------------------------------------------------------
# scenarios, searched from one named deck so they can be laid out for real
# ---------------------------------------------------------------------------
def turns_of(base, placed):
    c = base
    for k in range(4):
        if c == placed:
            return k
        c = rot90(c)
    return 0


def ref(deck, idx, card):
    k = turns_of(deck[idx], card)
    return {'id': f'{idx + 1:02d}',
            'short': '/'.join(CODES[e] for e in card),
            'edges': {s: NAMES[e] for s, e in zip(SIDES, card)},
            'turn': f'{k * 90}° clockwise from the card as printed'}


def board_json(deck, idxs, cards, own):
    out = []
    for i in range(NCELLS):
        if cards[i] is None:
            out.append(None)
            continue
        r = ref(deck, idxs[i], cards[i])
        r['cell'] = i
        r['owner'] = 'P1' if (own[0] >> i) & 1 else 'P2'
        out.append(r)
    return out


def layout(rng, deck, n, owner):
    cards = [None] * NCELLS
    idxs = [None] * NCELLS
    own = [0, 0]
    picks = rng.sample(range(len(deck)), n)
    for cell, pi in zip(rng.sample(range(NCELLS), n), picks):
        c = deck[pi]
        for _ in range(rng.randrange(4)):
            c = rot90(c)
        cards[cell] = c
        idxs[cell] = pi
        own[rng.randrange(2) if owner is None else owner] |= 1 << cell
    return cards, idxs, own, set(picks)


def find_rotation_swing(rng, deck, tries=400000):
    for _ in range(tries):
        cards, idxs, own, used = layout(rng, deck, rng.randint(3, 5), 1)
        empt = [i for i in range(NCELLS) if cards[i] is None]
        free = [i for i in range(len(deck)) if i not in used]
        if not empt or not free:
            continue
        cell, pi = rng.choice(empt), rng.choice(free)
        got = []
        for k in range(4):
            cv = deck[pi]
            for _ in range(k):
                cv = rot90(cv)
            got.append(resolve([x for x in cards], own[:], cell, cv, 0,
                               v3.CASCADE_CAP)[0])
        if max(got) >= 3 and min(got) == 0:
            return cards, idxs, own, cell, pi, got
    return None


def find_fuse(rng, deck, tries=600000):
    for _ in range(tries):
        cards, idxs, own, used = layout(rng, deck, 4, 0)
        empt = [i for i in range(NCELLS) if cards[i] is None]
        free = [i for i in range(len(deck)) if i not in used]
        if not empt or not free:
            continue
        cell, pi = rng.choice(empt), rng.choice(free)
        for k in range(4):
            cv = deck[pi]
            for _ in range(k):
                cv = rot90(cv)
            got, waves = resolve([x for x in cards], own[:], cell, cv, 1,
                                 v3.CASCADE_CAP)
            if got >= 3 and waves >= 2:
                return cards, idxs, own, cell, pi, cv, got, waves
    return None


def find_twin_lock(rng, deck, tries=600000):
    for _ in range(tries):
        cards, idxs, own, _ = layout(rng, deck, 2, None)
        on = [i for i in range(NCELLS) if cards[i] is not None]
        a, b = on
        d = next((k for k in range(4) if NB[a][k] == b), None)
        if d is None:
            continue
        own[0], own[1] = 1 << a, 1 << b
        x, y = cards[a][d], cards[b][OPPSIDE[d]]
        if (x == y or TWIN[x] == y) and not beats(x, y) and not beats(y, x):
            return cards, idxs, own, a, b, x, y
    return None


def find_surge(rng, deck, tries=300000):
    """A position where Surge takes far more than a plain placement."""
    for _ in range(tries):
        plain, idxs, own, used = layout(rng, deck, rng.randint(4, 7), None)
        empt = [i for i in range(NCELLS) if plain[i] is None]
        free = [i for i in range(len(deck)) if i not in used]
        if not empt or not free:
            continue
        cell, pi = rng.choice(empt), rng.choice(free)
        placed = deck[pi]
        for _ in range(rng.randrange(4)):
            placed = rot90(placed)
        wrapped = [None if c is None else (c, ELEMENTS[0], None)
                   for c in plain]
        card = (placed, ELEMENTS[0], 'surge')
        A.PLAYED[0].clear()
        for e in ELEMENTS:
            A.PLAYED[0][e] = 99
        got = {}
        for opt in (None, ('use',)):
            got[opt] = A.apply_move([x for x in wrapped], own[:],
                                    [[card], []], [[], []], 0,
                                    (0, cell, placed, opt),
                                    v3.CASCADE_CAP, rng)
        if got[('use',)] >= got[None] + 3:
            return plain, idxs, own, cell, pi, placed, got[None], \
                got[('use',)]
    return None


def main():
    rng = random.Random(20261030)
    out_decks = []

    for name, abilities, blurb, measured in ARCHETYPES:
        deck, spread = balanced_deck(rng, abilities)
        assert all(len(set(c)) == 4 for c in deck), name
        assert len(set(deck)) == DECK, name
        counts = Counter(e for c in deck for e in c)
        cards = [card_json(i, c, abilities[i % len(abilities)])
                 for i, c in enumerate(deck)]
        out_decks.append({
            'name': name,
            'play_it_for': blurb,
            'abilities_used': sorted(set(abilities)),
            'measured': measured,
            'element_balance': {NAMES[e]: counts[e] for e in ELEMENTS},
            'element_spread': spread,
            'cards': cards,
        })

    # scenarios are laid out from the priced-mix deck, plus one from the
    # violent deck for Surge
    mix = [tuple(
        [k for k, v in NAMES.items() if v == c['edges'][s]][0]
        for s in SIDES) for c in out_decks[1]['cards']]
    violent = [tuple(
        [k for k, v in NAMES.items() if v == c['edges'][s]][0]
        for s in SIDES) for c in out_decks[5]['cards']]

    scen = []
    r = find_rotation_swing(rng, mix)
    if r:
        cards, idxs, own, cell, pi, got = r
        scen.append({
            'deck': 'priced-mix',
            'name': 'rotation decides the turn',
            'question': 'Does aiming the card feel like the main decision?',
            'setup': {'board': board_json(mix, idxs, cards, own),
                      'your_card': ref(mix, pi, mix[pi]),
                      'place_on_cell': cell,
                      'note': 'try all four turns of it on that one cell'},
            'verified': {f'{k * 90}°': got[k] for k in range(4)},
            'watch_for': f'{max(got)} captures one way, {min(got)} another'})

    r = find_fuse(rng, mix)
    if r:
        cards, idxs, own, cell, pi, cv, got, waves = r
        scen.append({
            'deck': 'priced-mix',
            'name': 'your own wall is a fuse',
            'question': 'Is it obvious that clustering your cards is risky?',
            'setup': {'board': board_json(mix, idxs, cards, own),
                      'opponent_card': ref(mix, pi, cv),
                      'opponent_places_on_cell': cell},
            'verified': {'captures': got, 'waves': waves},
            'watch_for': f'one placement takes {got} of your four cards in '
                         f'{waves} waves'})

    r = find_twin_lock(rng, mix)
    if r:
        cards, idxs, own, a, b, x, y = r
        scen.append({
            'deck': 'priced-mix',
            'name': 'a twin deadlock',
            'question': 'Does a dead matchup read as a wall or as the game '
                        'refusing to resolve?',
            'setup': {'board': board_json(mix, idxs, cards, own)},
            'verified': {'cells': [a, b], 'facing': [NAMES[x], NAMES[y]],
                         'resolves': False},
            'watch_for': f'{NAMES[x]} against {NAMES[y]} across cells {a} '
                         f'and {b} can never resolve either way'})

    r = find_surge(rng, violent)
    if r:
        plain, idxs, own, cell, pi, placed, base, with_ = r
        c = ref(violent, pi, placed)
        c['ability'] = 'surge'
        c['ability_text'] = ABILITY_TEXT['surge']
        scen.append({
            'deck': 'violent',
            'name': 'surge is the unfair one',
            'question': 'Is a board-wide sweep exciting or just arbitrary?',
            'setup': {'board': board_json(violent, idxs, plain, own),
                      'your_card': c, 'place_on_cell': cell},
            'verified': {'captures_without_surge': base,
                         'captures_with_surge': with_},
            'watch_for': f'{base} captures without it, {with_} with it'})

    doc = {
        'format': 'cascade-shared-12',
        'generated_by': 'gen_testdeck.py, verified against v3.py and '
                        'v3_abilities.py',
        'cells': 'numbered 0-8, left to right then top to bottom: '
                 '0 1 2 / 3 4 5 / 6 7 8',
        'how_to_use': {
            'pick_a_deck': 'Choose ONE of the decks below. Both players '
                           'share it — you are building the scenario, not '
                           'a side.',
            'deal': 'Shuffle the 12. Player 1 draws 5, Player 2 draws 6. '
                    'One card stays in the deck, unseen. No drawing after '
                    'that.',
            'turn_order': 'P1 P2 P1 P2 P1 P2 P1 P2 P1 — P1 places five, '
                          'P2 places four and keeps two.',
            'why_the_spare': 'P2 keeping two cards is the only thing that '
                             'pays for P1 moving first, moving last, and '
                             'placing one more card. P1 must play every '
                             'card dealt; P2 chooses four of six.',
            'placing': 'Any empty cell, turned any of four ways.',
            'capturing': 'Compare only the two facing elements. Beating it '
                         'takes the card. Twins and equals do nothing. '
                         'Your own cards never fight each other.',
            'cascade': 'A card you capture attacks its own neighbours '
                       'once, then stops. The ninth card captures but '
                       'starts no chain.',
            'abilities': 'Every card has one. Usable from your second '
                         'placement onward, always optional, declared as '
                         'you place the card.',
            'winning': 'Most cards owned when the board fills. Nine cells '
                       'cannot split evenly, so there are no draws.',
        },
        'wheel': {NAMES[e]: {'beats': sorted(NAMES[v] for v in BEATS[e]),
                             'twin': NAMES[TWIN[e]]} for e in ELEMENTS},
        'decks': out_decks,
        'scenarios': scen,
        'open_questions': [
            'Does the deck you built change how the game feels, or just '
            'which cards appear?',
            'Is the wheel learnable from play, without the reference?',
            'Does the rotation choice carry the game?',
            'Is Surge exciting or just unfair?',
            'After five matches, do you want another?',
        ],
    }
    json.dump(doc, sys.stdout, indent=2, ensure_ascii=False)
    print()
    print(f'# {len(out_decks)} decks of {DECK}, {len(scen)} scenarios',
          file=sys.stderr)


if __name__ == '__main__':
    main()
