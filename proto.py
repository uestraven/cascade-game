#!/usr/bin/env python3
"""
Cascade -- Simplified Prototype A.

  symbols provide constraints   -- which edges can interact
  abilities provide opportunity -- what you can change
  positioning decides           -- whether it works

Four sigils, no hierarchy, no twins, no wheel. MATCHING FACING SYMBOLS
CAPTURE; different symbols do nothing. Only the acting card attacks, so
two stationary cards showing the same symbol never trade.

Four abilities, each modifying exactly one understood thing:
  pivot     rotate one adjacent card 90 clockwise, either player's,
            before attacking                     (orientation)
  exchange  swap the placed card with an adjacent card you control; it
            attacks from its destination         (position)
  relay     an adjacent card you control attacks from its own position
            instead of the placed card           (attack origin)
  prism     one edge of the placed card matches ANY symbol, this
            placement only                       (matching)

Nothing here is assumed from the eight-element game. The capture rule is
different, so first-player balance, capture volume and depth are all
measured from scratch -- which is what the proposal asked for.

Two structural facts to check rather than inherit:

  * matching is SYMMETRIC where the old wheel was antisymmetric. The
    termination argument should still hold, because captures accrue only
    to the placer and so ownership moves one way, but it is verified
    below rather than assumed.
  * a card with four DISTINCT symbols holds every symbol, so some
    rotation matches any single exposed edge -- single captures become
    guaranteed. Only repeats make a card unable to answer, and only the
    fixed cyclic order stops it matching two neighbours at once.
"""

import itertools
import random
import sys
from collections import Counter

NSYM = 4
SYMS = tuple(range(NSYM))
NORTH, EAST, SOUTH, WEST = range(4)
OPPSIDE = (SOUTH, WEST, NORTH, EAST)
_DELTA = ((-1, 0), (0, 1), (1, 0), (0, -1))

ROWS, COLS, NCELLS, NB = 3, 3, 9, None
ORDER = ()
HANDS = (5, 5)


def set_board(rows, cols, hands, stop=None):
    """Rebind the geometry. `stop` caps the number of placements, which is
    how a cell is left empty on an even board to force an odd margin."""
    global ROWS, COLS, NCELLS, NB, ORDER, HANDS
    ROWS, COLS = rows, cols
    NCELLS = rows * cols
    NB = tuple(
        tuple(((r + dr) * cols + (c + dc))
              if 0 <= r + dr < rows and 0 <= c + dc < cols else -1
              for dr, dc in _DELTA)
        for r, c in (divmod(i, NCELLS // rows if False else cols)
                     for i in range(NCELLS)))
    n = NCELLS if stop is None else stop
    ORDER = tuple(i % 2 for i in range(n))
    HANDS = tuple(hands)


set_board(3, 3, (5, 5))
CASCADE_CAP = 1
FINAL_CAP = 0
DECK = 12   # grown with the board in the sweep
ABILITY_FROM_PLACEMENT = 2
ABILITIES = ('pivot', 'exchange', 'relay', 'prism')

ALL_CARDS = tuple(itertools.product(SYMS, repeat=4))


def shape(card):
    """Classify a card by its symbol multiset."""
    c = sorted(Counter(card).values(), reverse=True)
    return {(1, 1, 1, 1): 'versatile',   # four different
            (2, 1, 1): 'focused',        # one repeated
            (2, 2): 'specialized',       # two pairs
            (3, 1): 'triple',
            (4,): 'mono'}[tuple(c)]


BY_SHAPE = {}
for c in ALL_CARDS:
    BY_SHAPE.setdefault(shape(c), []).append(c)


def rot90(c):
    n, e, s, w = c
    return (w, n, e, s)


def cap_for_turn(turn):
    return FINAL_CAP if turn == len(ORDER) - 1 else CASCADE_CAP


# ---------------------------------------------------------------------------
# resolution
# ---------------------------------------------------------------------------
def cascade(cards, own, origin, player, cap, wild=None):
    """`wild` is (cell, edge) whose symbol matches anything, for Prism.
    Returns (captured, waves)."""
    opp = 1 - player
    frontier, captured, waves, depth = origin, 0, 0, 0
    while frontier and depth <= cap:
        newly = 0
        for src in range(NCELLS):
            if not (frontier >> src) & 1 or cards[src] is None:
                continue
            for d in range(4):
                t = NB[src][d]
                if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
                    continue
                if wild is not None and wild == (src, d):
                    newly |= 1 << t
                elif cards[src][d] == cards[t][OPPSIDE[d]]:
                    newly |= 1 << t
        if newly:
            own[player] |= newly
            own[opp] &= ~newly
            captured += bin(newly).count('1')
            waves += 1
        frontier = newly
        depth += 1
    return captured, waves


def options(cards, own, player, ability, cell, live):
    """Every ability choice for this placement, plus declining."""
    if not live or ability is None:
        return [None]
    out = [None]
    mine = own[player]
    if ability == 'pivot':
        out += [('pivot', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and cards[NB[cell][d]] is not None]
    elif ability == 'exchange':
        out += [('exchange', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and (mine >> NB[cell][d]) & 1]
    elif ability == 'relay':
        out += [('relay', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and (mine >> NB[cell][d]) & 1]
    elif ability == 'prism':
        out += [('prism', e) for e in range(4)]
    return out


def apply_move(cards, own, hands, player, mv, cap, placed_so_far):
    i, cell, edges, opt = mv
    live = placed_so_far >= ABILITY_FROM_PLACEMENT - 1
    ability = hands[player][i][1] if live else None
    kind = opt[0] if opt else None

    # orientation, before anything is compared
    if ability == 'pivot' and kind == 'pivot':
        t = opt[1]
        cards[t] = rot90(cards[t])

    hands[player].pop(i)
    cards[cell] = edges
    own[player] |= 1 << cell

    origin = 1 << cell
    wild = None
    if ability == 'exchange' and kind == 'exchange':
        t = opt[1]
        cards[cell], cards[t] = cards[t], cards[cell]
        origin = 1 << t              # the placed card attacks from there
    if ability == 'relay' and kind == 'relay':
        origin = 1 << opt[1]         # the ally attacks instead
    if ability == 'prism' and kind == 'prism':
        wild = (cell, opt[1])
    got, _ = cascade(cards, own, origin, player, cap, wild)
    return got


def moves(cards, own, hands, player, empties, placed_so_far):
    live = placed_so_far >= ABILITY_FROM_PLACEMENT - 1
    out = []
    for i, (card, ability) in enumerate(hands[player]):
        e = card
        for _ in range(4):
            for cell in empties:
                for opt in options(cards, own, player, ability, cell, live):
                    out.append((i, cell, e, opt))
            e = rot90(e)
    return out


def probe(cards, own, hands, player, mv, cap, placed_so_far):
    return apply_move([x for x in cards], own[:],
                      [list(h) for h in hands], player, mv, cap,
                      placed_so_far)


def exposure(cards, own, player):
    n = 0
    for i in range(NCELLS):
        if not (own[player] >> i) & 1 or cards[i] is None:
            continue
        for d in range(4):
            t = NB[i][d]
            if t >= 0 and cards[t] is None:
                n += 1
    return n


LAM = 0.5


def pick(cards, own, hands, player, empties, cap, placed_so_far, rng,
         faculty='full'):
    """`faculty` names what to remove, for the ablation."""
    lam = 0.0 if faculty == 'no defence' else LAM
    idxs = range(len(hands[player]))
    cells = empties
    if faculty == 'no hand choice':
        idxs = [rng.randrange(len(hands[player]))]
    if faculty == 'no cell choice':
        cells = [rng.choice(empties)]
    live = placed_so_far >= ABILITY_FROM_PLACEMENT - 1
    if faculty == 'no abilities':
        live = False

    best, ties = None, []
    for i in idxs:
        card, ability = hands[player][i]
        e = card
        rots = 1 if faculty == 'no rotation' else 4
        for _ in range(rots):
            for cell in cells:
                for opt in options(cards, own, player, ability, cell, live):
                    mv = (i, cell, e, opt)
                    c = [x for x in cards]
                    o = own[:]
                    h = [list(x) for x in hands]
                    # the chain-blind bot must also read exposure off the
                    # board IT believes in, not off a post-cascade one it
                    # cannot see
                    seen_cap = 0 if faculty == 'no chain sight' else cap
                    got = apply_move(c, o, h, player, mv, seen_cap,
                                     placed_so_far)
                    s = got - lam * exposure(c, o, player)
                    if best is None or s > best:
                        best, ties = s, [mv]
                    elif s == best:
                        ties.append(mv)
            e = rot90(e)
    return rng.choice(ties)


# ---------------------------------------------------------------------------
# decks
# ---------------------------------------------------------------------------
def build_deck(rng, shapes=('versatile',), abilities=ABILITIES, n=DECK):
    """A shared deck of n cards: symbol shapes cycled from `shapes`,
    abilities cycled from `abilities`."""
    deck = []
    for i in range(n):
        sh = shapes[i % len(shapes)]
        card = rng.choice(BY_SHAPE[sh])
        deck.append((card, abilities[i % len(abilities)]))
    rng.shuffle(deck)
    return deck


def play(rng, deck_args, facs=('full', 'full'), track=None):
    deck = build_deck(rng, *deck_args)
    hands = [list(deck[:HANDS[0]]), list(deck[HANDS[0]:HANDS[0] + HANDS[1]])]
    cards = [None] * NCELLS
    own = [0, 0]
    placed = [0, 0]
    caps = 0
    biggest = 0
    used = [0, 0]
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = cap_for_turn(turn)
        mv = pick(cards, own, hands, p, empties, cap, placed[p], rng,
                  facs[p])
        if mv[3] is not None:
            used[p] += 1
        got = apply_move(cards, own, hands, p, mv, cap, placed[p])
        caps += got
        biggest = max(biggest, got)
        if track is not None:
            track[got] += 1
        placed[p] += 1
    return ([bin(own[0]).count('1'), bin(own[1]).count('1')], caps,
            biggest, used)


# ---------------------------------------------------------------------------
# measurement
# ---------------------------------------------------------------------------
def pct(x):
    return f'{100 * x:5.1f}%'


def survey(games, deck_args, seed=606):
    rng = random.Random(seed)
    p1 = n = 0
    caps = 0.0
    margins = Counter()
    bigs = Counter()
    hist = Counter()
    for _ in range(games):
        s, c, b, _ = play(rng, deck_args, track=hist)
        n += 1
        caps += c
        margins[abs(s[0] - s[1])] += 1
        bigs[b] += 1
        if s[0] > s[1]:
            p1 += 1
    return dict(p1=p1 / n, caps=caps / n,
                margins={k: v / n for k, v in margins.items()},
                bigs={k: v / n for k, v in bigs.items()},
                hist={k: v / max(sum(hist.values()), 1)
                      for k, v in hist.items()})


def duel(games, deck_args, fa, fb, seed=77):
    """fa's win rate against fb, seats swapped."""
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for seat in (0, 1):
            facs = [fb, fb]
            facs[seat] = fa
            s, _, _, _ = play(rng, deck_args, tuple(facs))
            n += 1
            if (s[0] > s[1]) == (seat == 0):
                w += 1
    return w / n


def terminates(trials=40000, seed=5):
    """Matching is symmetric where the old wheel was not, so the
    termination and one-way-ownership properties are verified rather
    than inherited."""
    rng = random.Random(seed)
    bad_owner = bad_count = 0
    for _ in range(trials):
        cards = [None] * NCELLS
        own = [0, 0]
        for c in rng.sample(range(NCELLS), rng.randint(3, 8)):
            cards[c] = rng.choice(ALL_CARDS)
            own[rng.randrange(2)] |= 1 << c
        empt = [i for i in range(NCELLS) if cards[i] is None]
        if not empt:
            continue
        cell = rng.choice(empt)
        before = own[1]
        mine = bin(own[0]).count('1')
        got, _ = cascade(cards, own, 1 << cell, 0, CASCADE_CAP) \
            if False else (0, 0)
        c2 = [x for x in cards]
        o2 = own[:]
        c2[cell] = rng.choice(ALL_CARDS)
        o2[0] |= 1 << cell
        got, _ = cascade(c2, o2, 1 << cell, 0, CASCADE_CAP)
        if o2[1] & ~before:
            bad_owner += 1
        if bin(o2[0]).count('1') != mine + 1 + got:
            bad_count += 1
    return bad_owner, bad_count
