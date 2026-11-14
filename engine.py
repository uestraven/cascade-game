#!/usr/bin/env python3
"""
Reference implementation of the 9-cell cascade-capture card game.

NORMATIVE RULES
---------------
Board      Full 3x3 grid, 9 cells, indexed 0..8 left-to-right top-to-bottom.

Cards      Four face values, one per side (N, E, S, W), each in 1..10.
           Exactly one element, drawn from an 8-element wheel.
           WEAK-FLANK RULE: every legal card has at least one face <= 3,
           so no card is invulnerable from every direction.
           7,599 face combinations x 8 elements = 60,792 legal cards.

Hands      Player 1 holds 5 cards, Player 2 holds 4. All nine cards are
           played, so the board fills exactly and no card goes unused.

Order      A A B B A A B B A   ("AABB twice, then A")
           P1 takes turns 1, 2, 5, 6, 9; P2 takes 3, 4, 7, 8.
           NOT a palindrome -- do not assert symmetry on it.

Placement  A card is placed on any empty cell. It then compares its facing
           side against each adjacent opponent-owned card's facing side.
           Strictly greater captures. Equal values hold -- no capture.

Elements   If the attacker's element beats the defender's, the attacker's
           facing value gains ELEMENT_BONUS. If the defender's beats the
           attacker's, the defender gains it. The wheel is regular (every
           element beats exactly two and loses to exactly two), so at most
           one side is ever boosted.

Cascade    Cards captured by a placement then attack their own adjacent
           opponent-owned cards, by the same facing-edge rule. CASCADE_CAP
           is the number of ADDITIONAL waves after the placement wave:
             cap=0 -> placement only
             cap=1 -> placement, then one ripple   [the validated value]
           Every capture in a chain accrues to the placing player, so a
           chain strictly decreases the opponent's card count and always
           terminates. No card can flip twice within one placement.

Scoring    Cards owned when the board fills. Nine cells cannot split evenly,
           so draws are impossible and no tie-breaker is required.

Balance    Measured seat edge 0.0% (greedy) / -2.9% (1-ply lookahead).
           Under strict alternation the same board gives P1 +30% to +49%:
           the turn order is what balances the game, not the board.
"""

import itertools
import random

# ---------------------------------------------------------------------------
# Tunable constants. These are the validated values; changing them
# invalidates the balance measurements quoted above.
# ---------------------------------------------------------------------------
CASCADE_CAP = 1
ELEMENT_BONUS = 2
TURN_ORDER = (0, 0, 1, 1, 0, 0, 1, 1, 0)
HAND_SIZES = (5, 4)

GRID = 3
NCELLS = GRID * GRID

# Side indices and the side that faces you when you look that way.
NORTH, EAST, SOUTH, WEST = 0, 1, 2, 3
OPPOSITE = (SOUTH, WEST, NORTH, EAST)
_DELTA = ((-1, 0), (0, 1), (1, 0), (0, -1))

# NEIGHBOURS[cell][direction] -> cell index, or -1 if off the board.
NEIGHBOURS = tuple(
    tuple(
        (r + dr) * GRID + (c + dc)
        if 0 <= r + dr < GRID and 0 <= c + dc < GRID else -1
        for dr, dc in _DELTA
    )
    for r, c in ((i // GRID, i % GRID) for i in range(NCELLS))
)

# ---------------------------------------------------------------------------
# Elements. Stored 1..8; 0 means "no element".
# ---------------------------------------------------------------------------
ELEMENT_NAMES = ('Fire', 'Water', 'Earth', 'Air',
                 'Lightning', 'Ice', 'Shadow', 'Light')
NO_ELEMENT = 0
FIRE, WATER, EARTH, AIR, LIGHTNING, ICE, SHADOW, LIGHT = range(1, 9)

_WHEEL = {
    FIRE:      (ICE, AIR),
    WATER:     (FIRE, LIGHTNING),
    EARTH:     (WATER, SHADOW),
    AIR:       (EARTH, LIGHT),
    LIGHTNING: (AIR, SHADOW),
    ICE:       (EARTH, LIGHTNING),
    SHADOW:    (LIGHT, FIRE),
    LIGHT:     (ICE, WATER),
}

# BEATS[e] is a bitmask of the elements e defeats. Index 0 (no element)
# beats nothing and is beaten by nothing.
BEATS = [0] * 9
for _e, _victims in _WHEEL.items():
    for _v in _victims:
        BEATS[_e] |= 1 << _v


def wheel_is_regular():
    """Every element beats exactly two and loses to exactly two."""
    for e in range(1, 9):
        if bin(BEATS[e]).count('1') != 2:
            return False
        losses = sum(1 for a in range(1, 9) if BEATS[a] >> e & 1)
        if losses != 2:
            return False
    return True


# ---------------------------------------------------------------------------
# Card encoding: four 4-bit faces plus a 4-bit element in a single int.
#
#   bits  0-3   north face      bits 12-15  west face
#   bits  4-7   east face       bits 16-19  element (0 = none)
#   bits  8-11  south face
#
# A packed card is never 0, because every face is at least 1. That lets 0
# double as "empty cell".
# ---------------------------------------------------------------------------
_ELEM_SHIFT = 16
_NIBBLE = 0xF


def make_card(north, east, south, west, element=NO_ELEMENT):
    for v in (north, east, south, west):
        if not 1 <= v <= 10:
            raise ValueError(f'face {v} outside 1..10')
    if not 0 <= element <= 8:
        raise ValueError(f'element {element} outside 0..8')
    if min(north, east, south, west) > 3:
        raise ValueError('weak-flank rule: at least one face must be <= 3')
    return (north
            | east << 4
            | south << 8
            | west << 12
            | element << _ELEM_SHIFT)


def face(card, side):
    return card >> (side * 4) & _NIBBLE


def faces(card):
    return (card & _NIBBLE, card >> 4 & _NIBBLE,
            card >> 8 & _NIBBLE, card >> 12 & _NIBBLE)


def element(card):
    return card >> _ELEM_SHIFT & _NIBBLE


def card_name(card):
    n, e, s, w = faces(card)
    el = element(card)
    tag = ELEMENT_NAMES[el - 1] if el else '-'
    return f'{n}/{e}/{s}/{w} {tag}'


# ---------------------------------------------------------------------------
# The legal card pool.
# ---------------------------------------------------------------------------
LEGAL_FACES = tuple(
    t for t in itertools.product(range(1, 11), repeat=4) if min(t) <= 3
)
assert len(LEGAL_FACES) == 7599


def random_card(rng, with_element=True):
    n, e, s, w = rng.choice(LEGAL_FACES)
    el = rng.randint(1, 8) if with_element else NO_ELEMENT
    return make_card(n, e, s, w, el)


def deal(rng, with_elements=True):
    """Returns (p1_hand, p2_hand) as lists of packed cards."""
    return tuple([random_card(rng, with_elements) for _ in range(n)]
                 for n in HAND_SIZES)


# ---------------------------------------------------------------------------
# Board state. Ownership is two 9-bit masks; cards are packed ints.
# ---------------------------------------------------------------------------
class Board:
    __slots__ = ('cards', 'own')

    def __init__(self):
        self.cards = [0] * NCELLS
        self.own = [0, 0]

    def copy(self):
        b = Board.__new__(Board)
        b.cards = self.cards[:]
        b.own = self.own[:]
        return b

    @property
    def occupied(self):
        return self.own[0] | self.own[1]

    def is_empty(self, cell):
        return not self.occupied >> cell & 1

    def empty_cells(self):
        occ = self.occupied
        return [i for i in range(NCELLS) if not occ >> i & 1]

    def owner_of(self, cell):
        if self.own[0] >> cell & 1:
            return 0
        if self.own[1] >> cell & 1:
            return 1
        return -1

    def count(self, player):
        return bin(self.own[player]).count('1')

    def is_full(self):
        return self.occupied == (1 << NCELLS) - 1


def beats(attacker_card, attack_side, defender_card, bonus=ELEMENT_BONUS,
          attack_bonus=0):
    """Does attacker_card capture defender_card across attack_side?

    `attack_bonus` is an offence-only modifier belonging to the attacking
    player (the Prince aura). It never mutates card data, so a card's weak
    flank stays weak whenever that card is the one defending.
    """
    att = face(attacker_card, attack_side) + attack_bonus
    dfn = face(defender_card, OPPOSITE[attack_side])
    ae, de = element(attacker_card), element(defender_card)
    if ae and de:
        if BEATS[ae] >> de & 1:
            att += bonus
        elif BEATS[de] >> ae & 1:
            dfn += bonus
    return att > dfn


def cascade(board, origin_mask, player, cap=CASCADE_CAP, bonus=ELEMENT_BONUS,
            attack_bonus=0, protected=0, trace=None):
    """Run a capture wave from `origin_mask`, then up to `cap` ripples.

    Every capture accrues to `player`, so the opponent's card count strictly
    decreases each wave and the chain always terminates.

    `protected` is a bitmask of cells that cannot be captured (Leto's frozen
    cards). A protected cell keeps its owner, so it still scores; it simply
    never changes hands. It can never attack either, because a cell only
    becomes an attacker by first being captured.

    `trace`, if given a list, receives one bitmask per wave that captured
    anything. The UI needs this to animate a cascade step by step; the
    capture count alone is not enough to render it.
    """
    opponent = 1 - player
    frontier = origin_mask
    captured = 0
    depth = 0
    while frontier and depth <= cap:
        newly = 0
        remaining = frontier
        while remaining:
            src = (remaining & -remaining).bit_length() - 1
            remaining &= remaining - 1
            src_card = board.cards[src]
            for side in range(4):
                target = NEIGHBOURS[src][side]
                if target < 0:
                    continue
                if protected >> target & 1:
                    continue
                if not board.own[opponent] >> target & 1:
                    continue
                if beats(src_card, side, board.cards[target], bonus,
                         attack_bonus):
                    newly |= 1 << target
        if newly:
            board.own[player] |= newly
            board.own[opponent] &= ~newly
            captured += bin(newly).count('1')
            if trace is not None:
                trace.append(newly)
        frontier = newly
        depth += 1
    return captured


def place(board, cell, card, player, cap=CASCADE_CAP, bonus=ELEMENT_BONUS,
          attack_bonus=0, protected=0, trace=None):
    """Place `card` for `player` on `cell`, resolve captures and cascades.

    Mutates `board`. Returns the number of cards captured.
    """
    if not board.is_empty(cell):
        raise ValueError(f'cell {cell} is occupied')
    board.cards[cell] = card
    board.own[player] |= 1 << cell
    return cascade(board, 1 << cell, player, cap, bonus, attack_bonus,
                   protected, trace)


# ---------------------------------------------------------------------------
# Game driver.
# ---------------------------------------------------------------------------
class Game:
    """A single match. Draws are impossible: 9 cells cannot split evenly."""

    def __init__(self, hands, order=TURN_ORDER, cap=CASCADE_CAP,
                 bonus=ELEMENT_BONUS):
        if tuple(len(h) for h in hands) != tuple(
                sum(1 for o in order if o == p) for p in (0, 1)):
            raise ValueError('hand sizes do not match the turn order')
        self.board = Board()
        self.hands = [list(h) for h in hands]
        self.order = tuple(order)
        self.cap = cap
        self.bonus = bonus
        self.turn = 0
        self.history = []

    @property
    def to_move(self):
        return self.order[self.turn] if not self.is_over() else -1

    def is_over(self):
        return self.turn >= len(self.order)

    def legal_moves(self):
        """(hand_index, cell) pairs available to the player to move."""
        if self.is_over():
            return []
        hand = self.hands[self.to_move]
        cells = self.board.empty_cells()
        return [(i, c) for i in range(len(hand)) for c in cells]

    def play(self, hand_index, cell):
        if self.is_over():
            raise ValueError('game is over')
        player = self.to_move
        card = self.hands[player].pop(hand_index)
        captured = place(self.board, cell, card, player, self.cap, self.bonus)
        self.history.append((player, card, cell, captured))
        self.turn += 1
        return captured

    def score(self):
        return (self.board.count(0), self.board.count(1))

    def winner(self):
        """0 or 1. Raises if called before the board is full."""
        if not self.is_over():
            raise ValueError('game is not finished')
        a, b = self.score()
        if a == b:                     # unreachable on an odd board
            raise AssertionError('draw on an odd board -- rules violated')
        return 0 if a > b else 1


# ---------------------------------------------------------------------------
# Policies, for testing and as a baseline opponent.
# ---------------------------------------------------------------------------
def policy_random(game, rng):
    return rng.choice(game.legal_moves())


def policy_greedy(game, rng):
    """Maximise cards captured this placement."""
    best, ties = -1, []
    player = game.to_move
    hand = game.hands[player]
    for i, cell in game.legal_moves():
        probe = game.board.copy()
        got = place(probe, cell, hand[i], player, game.cap, game.bonus)
        if got > best:
            best, ties = got, [(i, cell)]
        elif got == best:
            ties.append((i, cell))
    return rng.choice(ties)


def policy_lookahead(game, rng):
    """Maximise (captures now - opponent's best immediate reply)."""
    player = game.to_move
    opponent = 1 - player
    hand = game.hands[player]
    opp_hand = game.hands[opponent]
    best, ties = None, []
    for i, cell in game.legal_moves():
        probe = game.board.copy()
        gain = place(probe, cell, hand[i], player, game.cap, game.bonus)
        reply = 0
        if opp_hand:
            for j in range(len(opp_hand)):
                for c2 in probe.empty_cells():
                    deeper = probe.copy()
                    reply = max(reply, place(deeper, c2, opp_hand[j],
                                             opponent, game.cap, game.bonus))
        value = gain - reply
        if best is None or value > best:
            best, ties = value, [(i, cell)]
        elif value == best:
            ties.append((i, cell))
    return rng.choice(ties)


def play_match(hands, policies, rng, order=TURN_ORDER, cap=CASCADE_CAP,
               bonus=ELEMENT_BONUS):
    game = Game(hands, order, cap, bonus)
    while not game.is_over():
        i, cell = policies[game.to_move](game, rng)
        game.play(i, cell)
    return game


# ---------------------------------------------------------------------------
# Rendering.
# ---------------------------------------------------------------------------
def render(board):
    """Three text rows per board row: north face, then west/owner/east, then south."""
    out = []
    for r in range(GRID):
        top, mid, bot = [], [], []
        for c in range(GRID):
            i = r * GRID + c
            card = board.cards[i]
            if not card:
                top.append(' ' * 8)
                mid.append('   .    ')
                bot.append(' ' * 8)
                continue
            n, e, s, w = faces(card)
            who = board.owner_of(i)
            el = element(card)
            tag = ELEMENT_NAMES[el - 1][:2] if el else '--'
            top.append(f'  {n:<2}    ')
            mid.append(f'{w:>2} {"P1" if who == 0 else "P2"} {e:>2}')
            bot.append(f'  {s:<2} {tag:<2} ')
        out.extend(['|'.join(top), '|'.join(mid), '|'.join(bot)])
        if r < GRID - 1:
            out.append('-' * 26)
    return '\n'.join(out)


# ---------------------------------------------------------------------------
def main():
    print('element wheel regular:', wheel_is_regular())
    print('legal face combinations:', len(LEGAL_FACES))
    print('legal cards (with element):', len(LEGAL_FACES) * 8)
    print('turn order:', ''.join('AB'[p] for p in TURN_ORDER))
    print()

    rng = random.Random(1)
    hands = deal(rng)
    game = play_match(hands, (policy_greedy, policy_greedy), rng)

    for turn, (player, card, cell, got) in enumerate(game.history, 1):
        print(f'T{turn}  {"P1" if player == 0 else "P2"}  '
              f'cell {cell}  {card_name(card):<18} captures {got}')
    print()
    print(render(game.board))
    a, b = game.score()
    print(f'\nfinal {a}-{b}, winner P{game.winner() + 1}')


if __name__ == '__main__':
    main()
