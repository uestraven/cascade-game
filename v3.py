#!/usr/bin/env python3
"""
v3 reference implementation. This file is the normative definition of the
rules; RULES.md is its plain-language counterpart.

No numbers anywhere. A card is four elements, one per edge, and a capture is
decided purely by which element faces which.

    Board      3x3. Nine cards are placed, so a draw is impossible.
    Cards      four DISTINCT elements, one per edge -> 1,680 cards.
    Order      A B A B A B A B A  (strict alternation)
    Hands      dealt ONCE at the start and never replenished: P1 draws 5,
               P2 draws 6. P1 plays all five; P2 plays four of six, so P2
               always holds something in reserve.
    Placement  any empty cell, in ANY of four rotations -- on every turn.
    Capture    compare the two facing elements only.
    Cascade    captured cards attack their own neighbours once --
               EXCEPT on the final placement, which sets off no chain.
    Score      cards owned when the board fills.

Why the final card starts no chain: strict alternation on an odd board
gives the first player both the first and the last move, and a live cascade
there converts most of the board. Muting only the CHAIN is the restraint
that works. Two alternatives were tried and rejected:

  - Also forcing the last card to be played "as drawn" balanced better
    (2.7% vs 7.1%) but is not a real rule: with free rotation on every
    other turn a card has no meaningful "up", and a card in hand is
    oriented however the player is holding it, so it cannot be enforced.
  - Letting the last card capture nothing at all is far worse: seat edge
    72.2% and depth 12.8%, because it turns the ninth placement into a
    non-decision.

Run this file to reproduce the headline measurements.
"""

import itertools
import random
from collections import Counter

# ---------------------------------------------------------------------------
# The wheel. Every element beats 3, loses to 3, and is NEUTRAL with exactly
# one twin -- its natural opposite. An even-sized wheel cannot be both
# regular and neutral-free, so one neutral pairing each is the tightest
# achievable, and the twins double as the memorable layer for players.
# ---------------------------------------------------------------------------
FIRE, WATER, EARTH, AIR, LIGHTNING, ICE, LIGHT, SHADOW = range(1, 9)
NAMES = {FIRE: 'Fire', WATER: 'Water', EARTH: 'Earth', AIR: 'Air',
         LIGHTNING: 'Lightning', ICE: 'Ice', LIGHT: 'Light', SHADOW: 'Shadow'}
ELEMENTS = tuple(NAMES)

TWIN = {FIRE: WATER, WATER: FIRE, EARTH: AIR, AIR: EARTH,
        LIGHTNING: ICE, ICE: LIGHTNING, LIGHT: SHADOW, SHADOW: LIGHT}

# Twin pairs form four groups in a cycle; each group beats the next outright,
# and splits the opposite group one-for-one. That forces 3 out / 3 in.
_GROUPS = ((FIRE, WATER), (EARTH, AIR), (LIGHTNING, ICE), (LIGHT, SHADOW))
_CROSS = ((FIRE, ICE), (WATER, LIGHTNING), (EARTH, LIGHT), (AIR, SHADOW),
          (LIGHTNING, FIRE), (ICE, WATER), (LIGHT, AIR), (SHADOW, EARTH))

BEATS = {e: set() for e in ELEMENTS}
for _i, _g in enumerate(_GROUPS):
    for _a in _g:
        BEATS[_a].update(_GROUPS[(_i + 1) % 4])
for _a, _b in _CROSS:
    BEATS[_a].add(_b)


def beats(attacker, defender):
    """Does `attacker` take `defender`? Twins and equals never resolve."""
    return defender in BEATS[attacker]


def wheel_is_regular():
    for e in ELEMENTS:
        losses = {a for a in ELEMENTS if e in BEATS[a]}
        neutral = set(ELEMENTS) - {e} - BEATS[e] - losses
        if len(BEATS[e]) != 3 or len(losses) != 3 or neutral != {TWIN[e]}:
            return False
    return True


# ---------------------------------------------------------------------------
# Board geometry
# ---------------------------------------------------------------------------
GRID, NCELLS = 3, 9
NORTH, EAST, SOUTH, WEST = 0, 1, 2, 3
OPPSIDE = (SOUTH, WEST, NORTH, EAST)
_DELTA = ((-1, 0), (0, 1), (1, 0), (0, -1))
NB = tuple(
    tuple(((r + dr) * GRID + (c + dc))
          if 0 <= r + dr < GRID and 0 <= c + dc < GRID else -1
          for dr, dc in _DELTA)
    for r, c in ((i // GRID, i % GRID) for i in range(NCELLS))
)

# ---------------------------------------------------------------------------
# Tunables. These are the measured values; changing one invalidates the rest.
# ---------------------------------------------------------------------------
ORDER = (0, 1, 0, 1, 0, 1, 0, 1, 0)   # ABABABABA
HANDS = (5, 6)                        # dealt once, no draws
DECK_SIZE = 12
CASCADE_CAP = 1                       # one ripple after the placement
FINAL_CASCADE_CAP = 0                 # the ninth card sets off no chain
ROTATIONS = 4                         # any quarter turn

CARDS = tuple(itertools.permutations(ELEMENTS, 4))
assert len(CARDS) == 1680


# Two-letter codes. Lightning and Light both start "Li", so LN and LT.
CODES = {FIRE: 'Fi', WATER: 'Wa', EARTH: 'Ea', AIR: 'Ai',
         LIGHTNING: 'Ln', ICE: 'Ic', LIGHT: 'Lt', SHADOW: 'Sh'}


def card_name(card):
    """North/East/South/West, clockwise from the top."""
    return '/'.join(CODES[e] for e in card)


def rot90(card):
    """A quarter turn clockwise: the west edge moves to the top."""
    n, e, s, w = card
    return (w, n, e, s)


def orientations(card, turn=None):
    """The rotations a placement may choose between: all four, every turn.

    `turn` is accepted and ignored, so callers need not care.
    """
    out = [card]
    c = card
    for _ in range(ROTATIONS - 1):
        c = rot90(rot90(c)) if ROTATIONS == 2 else rot90(c)
        out.append(c)
    return out


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------
def resolve(cards, own, cell, card, player, cap=CASCADE_CAP):
    """Place `card` for `player`, then capture and cascade.

    Mutates `cards` and `own`. Returns (captured, waves). Every capture in a
    chain accrues to `player`, so the opponent's count strictly falls each
    wave and the chain always terminates.
    """
    cards[cell] = card
    own[player] |= 1 << cell
    opponent = 1 - player
    frontier = 1 << cell
    captured, waves, depth = 0, 0, 0
    while frontier and depth <= cap:
        newly = 0
        for src in range(NCELLS):
            if not (frontier >> src) & 1:
                continue
            src_card = cards[src]
            for d in range(4):
                target = NB[src][d]
                if target < 0 or not (own[opponent] >> target) & 1:
                    continue
                if beats(src_card[d], cards[target][OPPSIDE[d]]):
                    newly |= 1 << target
        if newly:
            own[player] |= newly
            own[opponent] &= ~newly
            captured += bin(newly).count('1')
            waves += 1
        frontier = newly
        depth += 1
    return captured, waves


def cap_for_turn(turn):
    return FINAL_CASCADE_CAP if turn == len(ORDER) - 1 else CASCADE_CAP


# ---------------------------------------------------------------------------
# Moves and policies
# ---------------------------------------------------------------------------
def legal_moves(cards, hand, empties, turn=None):
    """(hand index, cell, oriented card) for every placement available."""
    return [(i, cell, cv)
            for i, card in enumerate(hand)
            for cv in orientations(card, turn)
            for cell in empties]


def _scored(cards, own, hand, player, empties, cap, turn=None):
    return [(i, cell, cv,
             resolve(cards[:], own[:], cell, cv, player, cap)[0])
            for i, cell, cv in legal_moves(cards, hand, empties, turn)]


def exposure(cards, cell):
    """Open edges left behind. Every element loses to exactly three others,
    so the count of open edges is the whole risk measure."""
    return sum(1 for d in range(4)
               if NB[cell][d] >= 0 and cards[NB[cell][d]] is None) * 3


def pol_random(cards, own, hand, player, empties, rng, cap, turn=None):
    return rng.choice(legal_moves(cards, hand, empties, turn))


def pol_greedy(cards, own, hand, player, empties, rng, cap, turn=None):
    sc = _scored(cards, own, hand, player, empties, cap, turn)
    best = max(x[3] for x in sc)
    return rng.choice([x[:3] for x in sc if x[3] == best])


def pol_normal(cards, own, hand, player, empties, rng, cap, turn=None):
    """Captures first, then leave the least exposed position behind."""
    sc = _scored(cards, own, hand, player, empties, cap, turn)
    best = max(x[3] for x in sc)
    top = [x for x in sc if x[3] == best]
    low = min(exposure(cards, x[1]) for x in top)
    return rng.choice([x[:3] for x in top if exposure(cards, x[1]) == low])


POLICIES = {'random': pol_random, 'greedy': pol_greedy, 'normal': pol_normal}


# ---------------------------------------------------------------------------
# Game
# ---------------------------------------------------------------------------
def deal(rng, hands=None, deck=None):
    """Deal both hands once. There is no draw step.

    Read the module globals at CALL time: binding them as default values
    made every sweep silently measure the original HANDS.
    """
    hands = HANDS if hands is None else hands
    deck = DECK_SIZE if deck is None else deck
    piles = [[rng.choice(CARDS) for _ in range(max(deck, max(hands)))]
             for _ in range(2)]
    return ([piles[0][:hands[0]], piles[1][:hands[1]]],
            [piles[0][hands[0]:], piles[1][hands[1]:]])


def play(rng, policies, dealt=None):
    hands, decks = dealt if dealt else deal(rng)
    hands = [h[:] for h in hands]
    decks = [d[:] for d in decks]
    cards = [None] * NCELLS
    own = [0, 0]
    total, waves, log = 0, Counter(), []

    for turn, player in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        cap = cap_for_turn(turn)
        i, cell, oriented = policies[player](
            cards, own, hands[player], player, empties, rng, cap, turn)
        hands[player].pop(i)
        got, wv = resolve(cards, own, cell, oriented, player, cap)
        total += got
        waves[wv] += 1
        log.append((player, cell, oriented, got))

    score = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    return score, total, waves, log


def winner(score):
    if score[0] == score[1]:
        raise AssertionError('draw on an odd board -- rules violated')
    return 0 if score[0] > score[1] else 1


def run(games, policies, seed=1234):
    rng = random.Random(seed)
    wins = [0, 0]
    caps = close = 0
    waves = Counter()
    for _ in range(games):
        score, c, wv, _ = play(rng, policies)
        wins[winner(score)] += 1
        caps += c
        waves.update(wv)
        if abs(score[0] - score[1]) == 1:
            close += 1
    n = games
    tot = sum(waves.values())
    return dict(p1=wins[0] / n, p2=wins[1] / n, caps=caps / n,
                close=close / n,
                mw=sum(v for k, v in waves.items() if k > 1) / tot)


def pct(x):
    return f"{100*x:5.1f}%"


def main():
    print("=" * 74)
    print("THE WHEEL")
    print("=" * 74)
    for e in ELEMENTS:
        print(f"  {NAMES[e]:<10} beats "
              f"{', '.join(sorted(NAMES[v] for v in BEATS[e])):<30}"
              f" twin {NAMES[TWIN[e]]}")
    print(f"\n  regular: {wheel_is_regular()}    cards: {len(CARDS)}")
    print(f"  order: {''.join('AB'[p] for p in ORDER)}    "
          f"hands: P1 {HANDS[0]} / P2 {HANDS[1]}    "
          f"rotations: {ROTATIONS}")

    print()
    print("=" * 74)
    print("MEASUREMENTS")
    print("=" * 74)
    for name in ('greedy', 'normal'):
        pol = POLICIES[name]
        r = run(16000, (pol, pol))
        print(f"  {name:<7} P1 {pct(r['p1'])}  P2 {pct(r['p2'])}"
              f"  edge {pct(r['p2']-r['p1'])}  caps {r['caps']:.2f}"
              f"  one-card {pct(r['close'])}  multiwave {pct(r['mw'])}")
    gr = run(4000, (pol_greedy, pol_random), seed=11)['p1']
    nv = run(4000, (pol_normal, pol_greedy), seed=22)['p1']
    print(f"  greedy beats random {pct(gr)}    "
          f"heuristic beats greedy {pct(nv)}")

    print()
    print("=" * 74)
    print("ONE GAME")
    print("=" * 74)
    rng = random.Random(7)
    score, total, _, log = play(rng, (pol_normal, pol_normal))
    for t, (p, cell, card, got) in enumerate(log, 1):
        tail = f"  captures {got}" if got else ""
        print(f"  T{t}  P{p+1}  cell {cell}  {card_name(card)}{tail}")
    print(f"\n  final {score[0]}-{score[1]}, winner P{winner(score)+1}")


if __name__ == '__main__':
    main()
