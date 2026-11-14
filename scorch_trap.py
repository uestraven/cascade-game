#!/usr/bin/env python3
"""
Is Scorch weak, or is it a lure?

Those are different defects with different fixes. Scorch measures at 46%
holder win rate while being used in 73% of games. If it were merely weak,
a player would decline it and sit at 50% -- declining is free, the card is
otherwise ordinary. Losing 4 points while using it a lot means the USE is
what costs, which is the lure hypothesis: the promise of a diagonal
capture pulls the placement onto a worse cell.

Three usage policies, same ability, same bot otherwise:

  never      the ability is never used (the floor: what the card is
             worth as a plain card)
  tie-break  choose the placement as if the card had no ability, THEN
             use the ability if it adds anything. The ability can never
             change where you place.
  greedy     the placement and the ability are chosen together, so the
             ability's payoff can pull the placement. (current bot)

If `never` ~ 50% and `greedy` < `tie-break` < `never`, the ability is a
lure and the fix is to stop its payoff entering the placement decision.
Run against Gust as a control: Gust measures 59%, so if the method is
sound Gust should get BETTER as the policy gets greedier.
"""

import random
import sys

import v3
import v3_abilities as A
from v3 import ELEMENTS, NCELLS, ORDER, pct

import ability_power as P


def pick(cards, own, hands, player, empties, cap, placed_so_far, rng,
         policy):
    """Choose a move under one of the three usage policies."""
    if policy == 'never':
        mv = P.moves(cards, own, hands, player, empties, -1)   # gate shut
        sc = [(m, P.probe(cards, own, hands, player, m, cap, -1, rng))
              for m in mv]
        b = max(x[1] for x in sc)
        return rng.choice([m for m, g in sc if g == b])

    if policy == 'greedy':
        return P.pick(cards, own, hands, player, empties, cap,
                      placed_so_far, rng, False)

    # tie-break: pick the placement blind to the ability, then bolt it on
    blind = P.moves(cards, own, hands, player, empties, -1)
    sc = [(m, P.probe(cards, own, hands, player, m, cap, -1, rng))
          for m in blind]
    b = max(x[1] for x in sc)
    i, cell, oe, _ = rng.choice([m for m, g in sc if g == b])
    card = A.with_edges(hands[player][i], oe)
    best, bestg = None, None
    for opt in P.options(cards, own, player, card, cell, placed_so_far):
        g = P.probe(cards, own, hands, player, (i, cell, oe, opt), cap,
                    placed_so_far, rng)
        if bestg is None or g > bestg:
            best, bestg = opt, g
    return (i, cell, oe, best)


def play(rng, ability, policies, counts):
    hands = [P.build_hand(rng, P.HANDS[p], ability if counts[p] else None,
                          counts[p]) for p in (0, 1)]
    cards = [None] * NCELLS
    own = [0, 0]
    A.PLAYED[0].clear()
    A.PLAYED[1].clear()
    placed = [0, 0]
    used = [0, 0]
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = v3.cap_for_turn(turn)
        mv = pick(cards, own, hands, p, empties, cap, placed[p], rng,
                  policies[p])
        if mv[3] is not None:
            used[p] += 1
        P.apply_move(cards, own, hands, p, mv, cap, placed[p], rng)
        placed[p] += 1
    return [bin(own[0]).count('1'), bin(own[1]).count('1')], used


def holder(games, ability, policy, seed=4242):
    """Holder win rate, seats swapped. The opponent holds no abilities."""
    rng = random.Random(seed)
    w = n = fired = 0
    for _ in range(games):
        for seat in (0, 1):
            cnt = [0, 0]
            cnt[seat] = P.MAX_ABIL
            pol = ['never', 'never']
            pol[seat] = policy
            s, used = play(rng, ability, pol, cnt)
            n += 1
            if used[seat]:
                fired += 1
            if (s[0] > s[1]) == (seat == 0):
                w += 1
    return w / n, fired / n


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 500
    abilities = sys.argv[2].split(',') if len(sys.argv) > 2 \
        else ['scorch', 'gust']
    print("=" * 70)
    print("IS IT WEAK, OR IS IT A LURE?")
    print("=" * 70)
    print(f"  holder win rate, seats swapped, {G * 2} games per cell")
    print()
    print(f"  {'ability':<10}{'never':>16}{'tie-break':>18}{'greedy':>16}")
    for ab in abilities:
        row = ""
        for pol in ('never', 'tie-break', 'greedy'):
            w, f = holder(G, ab, pol)
            row += f"{pct(w)} (used {pct(f)})".rjust(
                16 if pol != 'tie-break' else 18)
        print(f"  {ab:<10}{row}")
    print()
    print("  A lure looks like: never ~ 50%, and the win rate FALLS as the")
    print("  ability is allowed more say in the placement.")
    print("  A fair ability looks like: the win rate RISES with greed.")


if __name__ == '__main__':
    main()
