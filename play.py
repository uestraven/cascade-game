#!/usr/bin/env python3
"""
Playable terminal version. Human vs bot.

    python3 play.py            play as P1 (five cards, moves first and last)
    python3 play.py 2          play as P2 (four cards)
    python3 play.py 1 --seed 7 reproducible deal

Rules as shipped:
    3x3 board, P1 five cards, P2 four, turn order A A B B A A B B A
    faces 1-10, every card has one face <= 3, 15-card cube under 300 points
    8-element wheel, +2 to the facing value
    capture on the facing edge, strictly greater; ties hold
    cascade depth cap 1 (captured cards hit their own neighbours, once)
    one leader each, free to use once per match, before or after a placement
    board always fills, so draws are impossible
"""

import random
import sys

import engine as E
import leaders as L
import newleaders as N
import variants as V

ABYSSAL = 'ABYSSAL'
POOL = (L.PRINCE, L.LOVER, L.TANTALUS, ABYSSAL, N.SCAVENGER, N.LETO)
REVEAL = 4

BLURB = {
    L.PRINCE:   '+1 to your faces when ATTACKING, for your next 2 placements',
    L.LOVER:    'swap two adjacent cards you own; both then attack their neighbours',
    L.TANTALUS: "an enemy card loses 1 from every face (min 1); your neighbours then strike it",
    ABYSSAL:    "reveal the opponent's hand for the rest of the match",
    N.SCAVENGER: 'rotate any card 90 degrees clockwise (no attack follows)',
    N.LETO:     "freeze any card: it keeps its owner but can never be captured",
}

RULES = {'prince': 'turns2', 'lover': 'both', 'tantalus': 'flat'}


class PlayGame(V.VariantGame):
    """Adds Abyssal, Scavenger and Leto on top of the measured variants."""

    def __init__(self, *a, wild=False, **kw):
        super().__init__(*a, **kw)
        self.revealed = [False, False]
        self.frozen = 0
        self.wild = wild

    def copy(self):
        g = super().copy()
        g.__class__ = PlayGame
        g.revealed = self.revealed[:]
        g.frozen = self.frozen
        g.wild = self.wild
        return g

    # frozen cells keep their owner, so they stay occupied and keep scoring;
    # they are simply immune to capture.
    def atk(self, player):
        return super().atk(player)

    def leader_actions(self):
        p = self.to_move
        kind = self.leaders[p]
        if self.used[p]:
            return []
        if kind == ABYSSAL:
            return [('leader', None)]
        if kind in (N.SCAVENGER, N.LETO):
            live = self.board.own[0] | self.board.own[1]
            cells = [t for t in range(E.NCELLS) if live >> t & 1]
            if kind == N.LETO:
                cells = [t for t in cells if not self.frozen >> t & 1]
            return [('leader', t) for t in cells]
        return super().leader_actions()

    def apply_leader(self, payload, rng):
        p = self.to_move
        kind = self.leaders[p]

        if kind == ABYSSAL:
            self.used[p] = True
            self.revealed[1 - p] = True
            return 0

        if kind == N.SCAVENGER:
            self.used[p] = True
            self.board.cards[payload] = N.rotate_cw(self.board.cards[payload])
            if self.wild:               # the +49%/-94% version, for contrast
                return E.cascade(self.board, 1 << payload, p, self.cap,
                                 self.bonus, self.atk(p), self.frozen)
            return 0

        if kind == N.LETO:
            self.used[p] = True
            self.frozen |= 1 << payload
            return 0

        # PRINCE / LOVER / TANTALUS, re-implemented here only so their
        # capture waves respect the frozen mask.
        b = self.board
        self.used[p] = True
        if kind == L.PRINCE:
            self.aura_left[p] = 2
            return 0
        if kind == L.LOVER:
            a, c = payload
            b.cards[a], b.cards[c] = b.cards[c], b.cards[a]
            return (E.cascade(b, 1 << a, p, self.cap, self.bonus,
                              self.atk(p), self.frozen)
                    + E.cascade(b, 1 << c, p, self.cap, self.bonus,
                                self.atk(p), self.frozen))
        if kind == L.TANTALUS:
            b.cards[payload] = L.weaken(b.cards[payload])
            if self.frozen >> payload & 1:
                return 0
            for side in range(4):
                src = E.NEIGHBOURS[payload][side]
                if src < 0 or not b.own[p] >> src & 1:
                    continue
                if E.beats(b.cards[src], E.OPPOSITE[side], b.cards[payload],
                           self.bonus, self.atk(p)):
                    b.own[p] |= 1 << payload
                    b.own[1 - p] &= ~(1 << payload)
                    return 1
            return 0
        raise ValueError(kind)

    def act(self, action, rng):
        """Same as the parent, but captures respect the frozen mask."""
        if self.is_over():
            raise ValueError('game is over')
        p = self.to_move
        if action[0] == 'place':
            _, i, cell = action
            card = self.hands[p].pop(i)
            got = E.place(self.board, cell, card, p, self.cap, self.bonus,
                          self.atk(p), self.frozen)
            if self.rules['prince'] == 'turns2' and self.aura_left[p] > 0:
                self.aura_left[p] -= 1
            self.history.append((p, 'place', cell, got))
        else:
            got = self.apply_leader(action[1], rng)
            self.history.append((p, f'leader:{self.leaders[p]}',
                                 action[1], got))
        self.turn += 1
        return got


# ---------------------------------------------------------------------------
# Deck building
# ---------------------------------------------------------------------------
def build_cube(rng, size=15, budget=300):
    """Random legal cube whose face points stay under the budget."""
    while True:
        faces = [rng.choice(E.LEGAL_FACES) for _ in range(size)]
        if sum(sum(f) for f in faces) <= budget:
            return [E.make_card(*f, rng.randint(1, 8)) for f in faces]


# ---------------------------------------------------------------------------
# Bot
# ---------------------------------------------------------------------------
def bot_place(game, rng):
    """Captures now, minus the opponent's best immediate reply."""
    p = game.to_move
    opp = 1 - p
    hand = game.hands[p]
    opp_hand = game.hands[opp]
    best, ties = None, []
    for i, cell in [(i, c) for i in range(len(hand))
                    for c in game.board.empty_cells()]:
        probe = game.copy()
        gain = E.place(probe.board, cell, hand[i], p, probe.cap, probe.bonus,
                       probe.atk(p), probe.frozen)
        reply = 0
        for j in range(len(opp_hand)):
            for c2 in probe.board.empty_cells():
                deeper = probe.copy()
                reply = max(reply, E.place(deeper.board, c2, opp_hand[j], opp,
                                           deeper.cap, deeper.bonus,
                                           deeper.atk(opp), deeper.frozen))
        value = gain - reply
        if best is None or value > best:
            best, ties = value, [(i, cell)]
        elif value == best:
            ties.append((i, cell))
    return rng.choice(ties)


def bot_turn(game, rng, fire_on):
    p = game.to_move
    fired = None
    if game.turn == fire_on and not game.used[p]:
        opts = game.leader_actions()
        if opts:
            best, ties = -1, []
            for a in opts:
                probe = game.copy()
                got = probe.apply_leader(a[1], rng)
                if got > best:
                    best, ties = got, [a]
                elif got == best:
                    ties.append(a)
            choice = rng.choice(ties)
            game.apply_leader(choice[1], rng)
            fired = game.leaders[p]
    i, cell = bot_place(game, rng)
    card = game.hands[p][i]
    got = game.act(('place', i, cell), rng)
    return fired, card, cell, got


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------
KEY = """ cell indices
   0 1 2
   3 4 5
   6 7 8"""


def show(game, me, bot_leader):
    print()
    print(KEY)
    print()
    print(E.render(game.board))
    a, b = game.score()
    print(f"\n  score   you {(a, b)[me]}   bot {(a, b)[1 - me]}"
          f"      cards left: you {len(game.hands[me])}, "
          f"bot {len(game.hands[1 - me])}")
    if game.frozen:
        cells = [i for i in range(E.NCELLS) if game.frozen >> i & 1]
        print(f"  FROZEN cells (cannot be captured): "
              f"{', '.join(map(str, cells))}")
    if game.revealed[me]:
        print(f"  bot hand (revealed): "
              + ' | '.join(E.card_name(c) for c in game.hands[1 - me]))
    lead = game.leaders[me]
    state = 'spent' if game.used[me] else 'ready'
    print(f"  your leader: {lead} ({state})   bot leader: {bot_leader}"
          f" ({'spent' if game.used[1 - me] else 'ready'})")
    if game.rules['prince'] == 'turns2' and game.aura_left[me]:
        print(f"  PRINCE aura active for your next {game.aura_left[me]} "
              f"placement(s)")
    print("\n  your hand")
    for i, c in enumerate(game.hands[me]):
        print(f"    {i}) {E.card_name(c)}")


def ask(prompt):
    try:
        return input(prompt).strip()
    except (EOFError, KeyboardInterrupt):
        print('\nbye')
        sys.exit(0)


def choose_leader_target(game, me):
    """Returns a payload, or None to cancel."""
    kind = game.leaders[me]
    opts = game.leader_actions()
    if not opts:
        print(f"  {kind} has no legal target right now.")
        return None
    if kind in (L.PRINCE, ABYSSAL):
        return opts[0][1]
    print(f"  {kind} targets:")
    for i, (_, payload) in enumerate(opts):
        if kind == L.LOVER:
            a, c = payload
            print(f"    {i}) swap cell {a} <-> cell {c}")
        else:
            card = game.board.cards[payload]
            who = 'yours' if game.board.owner_of(payload) == me else 'theirs'
            extra = ''
            if kind == N.SCAVENGER:
                n, e, s_, w = E.faces(N.rotate_cw(card))
                extra = f"  -> {n}/{e}/{s_}/{w}"
            print(f"    {i}) cell {payload} ({who})  "
                  f"{E.card_name(card)}{extra}")
    raw = ask("  target number (or blank to cancel): ")
    if not raw.isdigit() or int(raw) >= len(opts):
        return None
    return opts[int(raw)][1]


def human_turn(game, me, rng):
    while True:
        hand = game.hands[me]
        extra = "   L = use leader" if not game.used[me] else ""
        raw = ask(f"\n  your move  'card cell' (e.g. 0 4){extra}  > ")
        if raw.lower() in ('q', 'quit'):
            print('bye')
            sys.exit(0)
        if raw.lower() == 'l' and not game.used[me]:
            payload = choose_leader_target(game, me)
            if payload is None and game.leaders[me] not in (L.PRINCE, ABYSSAL):
                continue
            got = game.apply_leader(payload, rng)
            print(f"  >> {game.leaders[me]} resolves"
                  + (f", capturing {got}" if got else ""))
            show(game, me, game.leaders[1 - me])
            continue
        parts = raw.split()
        if len(parts) != 2 or not all(p.isdigit() for p in parts):
            print("  format is: <card index> <cell index>")
            continue
        ci, cell = int(parts[0]), int(parts[1])
        if ci >= len(hand):
            print(f"  no card {ci}; you hold 0..{len(hand)-1}")
            continue
        if cell > 8 or not game.board.is_empty(cell):
            print("  that cell is taken or out of range")
            continue
        got = game.act(('place', ci, cell), rng)
        print(f"  >> you place on {cell}"
              + (f" and capture {got}" if got else " and capture nothing"))
        # Model 1 allows casting before OR after the placement, and after is
        # usually stronger for Lover and Tantalus, so offer it here too.
        if not game.used[me]:
            game.turn -= 1          # still this player's turn for targeting
            if game.leader_actions() and \
                    ask(f"  use {game.leaders[me]} now? [y/N] ").lower() == 'y':
                payload = choose_leader_target(game, me)
                if payload is not None or game.leaders[me] in (L.PRINCE,
                                                               ABYSSAL):
                    g = game.apply_leader(payload, rng)
                    print(f"  >> {game.leaders[me]} resolves"
                          + (f", capturing {g}" if g else ""))
            game.turn += 1
        return


# ---------------------------------------------------------------------------
def main():
    args = [a for a in sys.argv[1:]]
    me = 0
    seed = random.randrange(1 << 30)
    if args and args[0] in ('1', '2'):
        me = int(args[0]) - 1
    if '--seed' in args:
        seed = int(args[args.index('--seed') + 1])
    rng = random.Random(seed)

    print(__doc__.split('Rules as shipped:')[0].strip())
    print(f"  seed {seed}   you are P{me+1}"
          f" ({'five cards, first and last' if me == 0 else 'four cards'})")

    wild = '--wild' in args
    revealed = rng.sample(POOL, REVEAL)
    print(f"\n  leaders revealed this match ({REVEAL} of {len(POOL)})")
    for i, k in enumerate(revealed):
        print(f"    {i}) {k:<10} {BLURB[k]}")
    if wild:
        print("  [--wild: SCAVENGER's rotation also triggers a cascade]")
    pick = ask(f"  choose yours (0-{REVEAL-1}): ")
    mine = (revealed[int(pick)] if pick.isdigit() and int(pick) < REVEAL
            else revealed[0])
    theirs = rng.choice([k for k in revealed if k != mine])
    print(f"  you: {mine}     bot: {theirs} -- {BLURB[theirs]}")

    cubes = (build_cube(rng), build_cube(rng))
    hands = [rng.sample(cubes[0], 5), rng.sample(cubes[1], 4)]
    leaders = [None, None]
    leaders[me] = mine
    leaders[1 - me] = theirs
    game = PlayGame(hands, tuple(leaders), RULES, wild=wild)

    # bot fires on its third slot, a reasonable mid-game default
    bot_slots = [i for i, p in enumerate(E.TURN_ORDER) if p == 1 - me]
    fire_on = bot_slots[min(2, len(bot_slots) - 1)]

    while not game.is_over():
        if game.to_move == me:
            show(game, me, theirs)
            print(f"\n  --- turn {game.turn + 1} of 9: yours ---")
            human_turn(game, me, rng)
        else:
            print(f"\n  --- turn {game.turn + 1} of 9: bot ---")
            fired, card, cell, got = bot_turn(game, rng, fire_on)
            if fired:
                print(f"  >> bot activates {fired}")
            print(f"  >> bot plays {E.card_name(card)} on {cell}"
                  + (f" and captures {got}" if got else ""))

    show(game, me, theirs)
    a, b = game.score()
    mine_score, theirs_score = (a, b)[me], (a, b)[1 - me]
    print()
    print("=" * 40)
    print(f"  final  you {mine_score} - {theirs_score} bot   "
          f"{'YOU WIN' if mine_score > theirs_score else 'BOT WINS'}")
    print("=" * 40)


if __name__ == '__main__':
    main()
