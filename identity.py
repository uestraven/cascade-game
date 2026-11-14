#!/usr/bin/env python3
"""
Where does skill in this game actually live?

The design question is: should the game's identity be hand management,
positional control, or predicting chain reactions? Opinion is cheap here,
so this measures it.

METHOD -- ablation, not advocacy. Build one reference bot that uses every
faculty, then CRIPPLE EXACTLY ONE and play the cripple against the full
bot with seats swapped. The win-rate deficit is what that faculty is
worth. A faculty you can remove for free is not where skill lives,
whatever the designer intended.

  full            picks card, cell and rotation to maximise
                  (cascade captures - lambda * exposure created)

  no hand choice  must play a uniformly random card from hand;
                  still optimises cell and rotation
  no cell choice  must place on a uniformly random empty cell;
                  still optimises card and rotation
  no rotation     must place the card as drawn; optimises card and cell
  no chain sight  scores only the DIRECT captures, blind to the cascade
  no defence      ignores exposure entirely (lambda = 0)

The exposure term is deliberately hand-agnostic. A real player cannot see
the opponent's hand, and it turns out an opponent holding the right card
can take essentially any of your cards adjacent to an empty cell -- each
of your edges has exactly three beaters, and a four-distinct-element card
can nearly always cover several at once. So "how exposed am I" has to be
counted as open edges, not as a search over their actual replies.
Modelling their real hand would measure clairvoyance, not positional
control.

Abilities are OFF for this measurement. Three of the eight are
mispriced (Gust 59%, Scorch 46%), so leaving them in would measure the
mispricing rather than the core game.

Also reported, because both were asked for directly:
  * first-player win rate at MATCHED skill, every bot against itself
  * comeback rate -- how often a player behind by k at turn t still wins
"""

import random
import sys
from collections import Counter, defaultdict

import v3
from v3 import CARDS, NB, NCELLS, OPPSIDE, ORDER, beats, pct, rot90

HANDS = (5, 6)
LAMBDA = 0.5          # set by the sweep in section A
FACULTIES = ['full', 'no hand choice', 'no cell choice', 'no rotation',
             'no chain sight', 'no defence']


def exposure(cards, own, player):
    """How many of my edges face an empty cell: the openings an opponent
    can place against. Hand-agnostic on purpose."""
    n = 0
    for i in range(NCELLS):
        if not (own[player] >> i) & 1 or cards[i] is None:
            continue
        for d in range(4):
            t = NB[i][d]
            if t >= 0 and cards[t] is None:
                n += 1
    return n


def direct_only(cards, own, cell, card, player):
    """Captures from the placement itself, with no cascade -- what a player
    who does not look past the first wave would count."""
    opp = 1 - player
    n = 0
    for d in range(4):
        t = NB[cell][d]
        if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
            continue
        if beats(card[d], cards[t][OPPSIDE[d]]):
            n += 1
    return n


def resolve_direct(cards, own, cell, card, player):
    """Place and take only the first wave. Used by the chain-blind bot so
    that it reads exposure off the board IT believes in, rather than off a
    post-cascade board it cannot see."""
    opp = 1 - player
    cards[cell] = card
    own[player] |= 1 << cell
    newly = 0
    for d in range(4):
        t = NB[cell][d]
        if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
            continue
        if beats(card[d], cards[t][OPPSIDE[d]]):
            newly |= 1 << t
    own[player] |= newly
    own[opp] &= ~newly
    return bin(newly).count('1')


def score_move(cards, own, cell, card, player, cap, lam, chain_sight):
    """Returns the bot's valuation of one placement."""
    c = [x for x in cards]
    o = own[:]
    if chain_sight:
        got, _ = v3.resolve(c, o, cell, card, player, cap)
    else:
        got = resolve_direct(c, o, cell, card, player)
    if lam == 0:
        return got
    return got - lam * exposure(c, o, player)


def orientations(card, allow_rotation):
    if not allow_rotation:
        return [card]
    out, c = [], card
    for _ in range(4):
        out.append(c)
        c = rot90(c)
    return out


def choose(cards, own, hand, player, empties, cap, rng, faculty):
    """One move: (hand index, cell, oriented card)."""
    lam = 0.0 if faculty == 'no defence' else LAMBDA
    chain_sight = faculty != 'no chain sight'
    allow_rot = faculty != 'no rotation'

    idxs = range(len(hand))
    cells = empties
    if faculty == 'no hand choice':
        idxs = [rng.randrange(len(hand))]
    if faculty == 'no cell choice':
        cells = [rng.choice(empties)]

    best, ties = None, []
    for i in idxs:
        for cv in orientations(hand[i], allow_rot):
            for cell in cells:
                s = score_move(cards, own, cell, cv, player, cap, lam,
                               chain_sight)
                if best is None or s > best:
                    best, ties = s, [(i, cell, cv)]
                elif s == best:
                    ties.append((i, cell, cv))
    return rng.choice(ties)


def play(rng, faculties, track=None):
    hands = [[rng.choice(CARDS) for _ in range(HANDS[p])] for p in (0, 1)]
    cards = [None] * NCELLS
    own = [0, 0]
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = v3.cap_for_turn(turn)
        i, cell, cv = choose(cards, own, hands[p], p, empties, cap, rng,
                             faculties[p])
        hands[p].pop(i)
        v3.resolve(cards, own, cell, cv, p, cap)
        if track is not None:
            track.append((turn, bin(own[0]).count('1'),
                          bin(own[1]).count('1')))
    return [bin(own[0]).count('1'), bin(own[1]).count('1')]


def duel(games, a, b, seed=4242):
    """`a`'s win rate against `b`, seats swapped on every deal."""
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for seat in (0, 1):
            f = [b, b]
            f[seat] = a
            s = play(rng, f)
            n += 1
            if (s[0] > s[1]) == (seat == 0):
                w += 1
    return w / n


def seat_balance(games, faculty, seed=99):
    rng = random.Random(seed)
    p1 = n = 0
    for _ in range(games):
        s = play(rng, [faculty, faculty])
        n += 1
        if s[0] > s[1]:
            p1 += 1
    return p1 / n


def volatility(games, faculty, seed=7):
    """Is the game decided early, or does the lead keep moving?

    Three earlier attempts at this conditioned on (deficit, turn) and each
    was confounded. Keying on turn gave ~50% everywhere. Banding the
    deficit mixed board states, because the deficit's parity is fixed by
    how many cards are down. Splitting on who moves next emptied one table
    entirely -- which turned out to be a real finding rather than a bug:
    captures accrue to whoever just placed, so the player behind is almost
    always the one about to move. And conditioning on cells remaining
    still mixed the two seats, which have different numbers of placements
    left at the same board count.

    So this drops conditioning and measures the thing directly:
      * how often the lead changes hands
      * whether the eventual winner was ever behind
      * the final placement, which is always P1's turn 9 and therefore
        needs no seat split at all
    """
    rng = random.Random(seed)
    changes = Counter()
    ever_behind = was_behind_at_8 = decided = n = 0
    final = defaultdict(lambda: [0, 0])
    for _ in range(games):
        track = []
        s = play(rng, [faculty, faculty], track)
        winner = 0 if s[0] > s[1] else 1
        n += 1
        leader = None
        flips = 0
        behind = False
        for turn, a, b in track:
            cur = None if a == b else (0 if a > b else 1)
            if cur is not None and leader is not None and cur != leader:
                flips += 1
            if cur is not None:
                leader = cur
            if cur is not None and cur != winner:
                behind = True
            # turn 7 is the last index before P1's final placement (turn 8)
            if turn == len(ORDER) - 2:
                d = [a, b][1 - winner] - [a, b][winner]
                if d > 0:
                    was_behind_at_8 += 1
                # P1 always places the ninth card, so this table is
                # unconfounded: the player to move is always P1
                dp1 = b - a
                if dp1 >= 1:
                    final[dp1][1] += 1
                    if winner == 0:
                        final[dp1][0] += 1
        changes[flips] += 1
        if behind:
            ever_behind += 1
        if flips == 0:
            decided += 1
    return dict(n=n, changes=changes, ever_behind=ever_behind / n,
                behind_at_8=was_behind_at_8 / n, never_flipped=decided / n,
                final=final)


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 500
    global LAMBDA

    print("=" * 76)
    print("A. TUNING THE REFERENCE BOT -- how much should it fear exposure?")
    print("=" * 76)
    print(f"  each lambda plays lambda=0, seats swapped, {G * 2} games")
    print(f"  {'lambda':<10}{'win vs no-defence':>20}")
    best_lam, best_w = 0.0, 0.5
    for lam in (0.0, 0.25, 0.5, 0.75, 1.0):
        LAMBDA = lam
        w = duel(G, 'full', 'no defence')
        if lam == 0.0:
            w = 0.5     # identical bots by construction
        print(f"  {lam:<10}{pct(w):>20}")
        if w > best_w:
            best_lam, best_w = lam, w
    LAMBDA = best_lam if best_w > 0.5 else 0.5
    print(f"  -> using lambda = {LAMBDA}")

    print()
    print("=" * 76)
    print("B. ABLATION -- what is each faculty worth?")
    print("=" * 76)
    print(f"  each cripple plays the full bot, seats swapped, {G * 2} games")
    print(f"  50% = the faculty is free; lower = it matters that much")
    print()
    print(f"  {'faculty removed':<18}{'cripple win':>13}{'cost':>9}")
    rows = []
    for f in FACULTIES[1:]:
        w = duel(G, f, 'full')
        rows.append((f, w))
    for f, w in sorted(rows, key=lambda r: r[1]):
        print(f"  {f:<18}{pct(w):>13}{pct(0.5 - w):>9}")
    print()
    worst = min(rows, key=lambda r: r[1])
    print(f"  Biggest single loss: {worst[0]} "
          f"({pct(0.5 - worst[1])} of win rate).")

    print()
    print("=" * 76)
    print("C. FIRST-PLAYER ADVANTAGE AT MATCHED SKILL")
    print("=" * 76)
    print(f"  both seats run the same bot, {G * 3} games each")
    print(f"  {'bot':<18}{'P1 win':>9}{'seat edge':>12}")
    for f in FACULTIES:
        p1 = seat_balance(G * 3, f)
        print(f"  {f:<18}{pct(p1):>9}{pct(abs(p1 - 0.5)):>12}")

    print()
    print("=" * 76)
    print("D. COMEBACK POTENTIAL -- can you recover from behind?")
    print("=" * 76)
    print(f"  full bot both seats, {G * 3} games")
    v = volatility(G * 3, 'full')
    print()
    print(f"  the lead changed hands this many times per game:")
    tot = sum(v['changes'].values())
    for k in sorted(v['changes']):
        bar = '#' * round(40 * v['changes'][k] / tot)
        print(f"    {k}x {pct(v['changes'][k] / tot):>7}  {bar}")
    print(f"    mean {sum(k * c for k, c in v['changes'].items()) / tot:.2f}")
    print()
    print(f"  the eventual winner was behind at some point: "
          f"{pct(v['ever_behind'])}")
    print(f"  the eventual winner was behind going into the final "
          f"placement: {pct(v['behind_at_8'])}")
    print(f"  the lead never changed hands at all: "
          f"{pct(v['never_flipped'])}")
    print()
    print("  P1 behind by d before placing the ninth card -- P1 still wins:")
    print("    " + "behind by".ljust(12) + "P1 wins".rjust(10)
          + "games".rjust(9))
    for d in sorted(v['final']):
        won, t = v['final'][d]
        if t >= 40:
            print(f"    {('-' + str(d)):<12}{pct(won / t):>10}{t:>9}")


if __name__ == '__main__':
    main()
