#!/usr/bin/env python3
"""
What Ambush would cost: the two properties that make Cascade resolvable.

Cascade currently guarantees, verified over 40,000 chains:

  * the opponent NEVER gains a card during your turn
  * no card's orientation changes during a chain
  * therefore ownership only ever moves one way, so within-wave order is
    irrelevant (0 disagreements in 40,000 positions) and the chain always
    terminates -- the opponent's count strictly falls each wave

Ambush -- "if this card is flipped, it immediately attacks the card that
flipped it and flips it back" -- removes the first bullet by construction.
This measures what that does to the other two, because they are what let
the rulebook say "pick the cards up in any order" instead of specifying a
sequence.

Interpretation used: when the placer captures an Ambush card at t from
source s, t compares its edge facing s against s's edge facing t. If t
wins, s flips to the DEFENDER's side. t stays captured -- you lose the
Ambush card and take the attacker, which is the stated trap.

Measured:
  A  does the chain still terminate?
  B  does within-wave order still not matter?
"""

import random
import sys

import v3
from v3 import CARDS, NB, NCELLS, OPPSIDE, beats, pct, rot90

CAP = v3.CASCADE_CAP
STEP_LIMIT = 500          # far above anything a terminating chain needs


def chain_with_ambush(cards, own, ambush, origin, player, cap,
                      src_order=None, dir_order=None):
    """`ambush` is a bitmask of cells carrying the ability.

    `src_order` / `dir_order` let the caller fix the pickup sequence, which
    is how section B asks whether the sequence matters. Returns
    (net_captures_for_placer, steps, hit_step_limit).
    """
    opp = 1 - player
    frontier, got, depth, steps = origin, 0, 0, 0
    while frontier and depth <= cap:
        newly = 0
        srcs = [s for s in range(NCELLS) if (frontier >> s) & 1 and cards[s]]
        if src_order is not None:
            srcs.sort(key=src_order.index)
        for src in srcs:
            dirs = list(range(4)) if dir_order is None else list(dir_order)
            for d in dirs:
                t = NB[src][d]
                if t < 0 or cards[t] is None:
                    continue
                if not (own[opp] >> t) & 1:
                    continue
                steps += 1
                if steps > STEP_LIMIT:
                    return got, steps, True
                if not beats(cards[src][d], cards[t][OPPSIDE[d]]):
                    continue
                # the capture happens
                own[player] |= 1 << t
                own[opp] &= ~(1 << t)
                got += 1
                newly |= 1 << t
                # ...and then Ambush strikes back at the attacker.
                #
                # NOTE the repair. As written, Ambush re-compares the same
                # touching pair -- but the capture required attacker >
                # defender and the wheel is antisymmetric, so the reverse
                # can never hold and the ability could never trigger. This
                # is the weakest repair that lets it fire at all: the
                # Ambush card counter-attacks with the edge of ITS choice,
                # the way Beacon does.
                if ((ambush >> t) & 1
                        and any(beats(e, cards[src][d])
                                for e in cards[t])):
                    # src flips to the defender: the opponent GAINS a card
                    # on the placer's own turn, which cannot happen today
                    own[opp] |= 1 << src
                    own[player] &= ~(1 << src)
                    got -= 1
                    newly &= ~(1 << src)
        frontier = newly
        depth += 1
    return got, steps, False


def position(rng, ambush_rate=0.4):
    cards = [None] * NCELLS
    own = [0, 0]
    ambush = 0
    for c in rng.sample(range(NCELLS), rng.randint(4, 8)):
        x = rng.choice(CARDS)
        for _ in range(rng.randrange(4)):
            x = rot90(x)
        cards[c] = x
        own[rng.randrange(2)] |= 1 << c
        if rng.random() < ambush_rate:
            ambush |= 1 << c
    empt = [i for i in range(NCELLS) if cards[i] is None]
    if not empt:
        return None
    cell = rng.choice(empt)
    card = rng.choice(CARDS)
    for _ in range(rng.randrange(4)):
        card = rot90(card)
    return cards, own, ambush, cell, card


def main():
    N = int(sys.argv[1]) if len(sys.argv) > 1 else 60000
    rng = random.Random(1234)

    print("=" * 72)
    print("A. DOES THE OPPONENT GAIN CARDS ON YOUR TURN?")
    print("=" * 72)
    n = backfires = limit = 0
    for _ in range(N):
        p = position(rng)
        if not p:
            continue
        cards, own, ambush, cell, card = p
        c = [x for x in cards]
        o = own[:]
        before_opp = o[1]
        c[cell] = card
        o[0] |= 1 << cell
        got, steps, hit = chain_with_ambush(c, o, ambush, 1 << cell, 0, CAP)
        n += 1
        if o[1] & ~before_opp & ~(1 << cell):
            backfires += 1
        if hit:
            limit += 1
    print(f"  {n} chains, {pct(backfires / n)} in which the opponent ended")
    print(f"  the turn owning a cell they did not own before it")
    print(f"  chains that blew the {STEP_LIMIT}-step limit: {limit}")
    print()
    print("  Today that first figure is 0.0% by construction, and it is")
    print("  what makes the chain's termination provable: the opponent's")
    print("  count strictly falls each wave.")

    print()
    print("=" * 72)
    print("B. DOES WITHIN-WAVE ORDER NOW MATTER?")
    print("=" * 72)
    print("  Same position, same rules, cards picked up in different orders.")
    print("  Cascade today: 0 disagreements in 40,000 positions.")
    n = diff = 0
    for _ in range(N // 2):
        p = position(rng)
        if not p:
            continue
        cards, own, ambush, cell, card = p
        results = set()
        for trial in range(6):
            order = list(range(NCELLS))
            rng.shuffle(order)
            c = [x for x in cards]
            o = own[:]
            c[cell] = card
            o[0] |= 1 << cell
            dirs = list(range(4))
            rng.shuffle(dirs)
            got, _, _ = chain_with_ambush(c, o, ambush, 1 << cell, 0, CAP,
                                          order, dirs)
            results.add((got, o[0], o[1]))
        n += 1
        if len(results) > 1:
            diff += 1
    print(f"  {n} positions, {diff} where the order changed the outcome "
          f"({pct(diff / max(n, 1))})")
    print()
    if diff:
        print("  -> Ambush makes resolution ORDER-DEPENDENT. The rulebook")
        print("     would have to specify a pickup sequence, and two")
        print("     players resolving the same turn could legitimately")
        print("     disagree.")
    else:
        print("  -> order still does not matter")


if __name__ == '__main__':
    main()
