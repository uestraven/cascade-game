#!/usr/bin/env python3
"""
Ability power under the SHIPPED rules, seat-swapped.

The per-ability figures quoted in RULES.md and game.ts ("50.7 / 63.1" and
friends) are stale. They were measured through v3_abilities.play(), which
still deals from a deck and DRAWS A CARD EVERY TURN -- a hand model the
game dropped in favour of dealing 5 and 6 once. Through that path the
no-ability baseline is P1 71.4%, so those numbers were never absolute win
rates against a 50% neutral; they came from an era when the baseline was
near 50% and they have not been regenerated since.

This measures what the shipped rules do:

  * hands dealt once, 5 and 6, no draws
  * at most MAX_ABIL ability cards in a deck
  * abilities live from your second placement (the affinity gate is gone)
  * SEATS SWAPPED on every deal, so the figure is the holder's win rate
    against a 50% neutral rather than a seat effect

Reported per ability: the holder's win rate, how often the ability is
actually used, and depth (heuristic vs greedy with both sides holding it).
"""

import random
import sys

import v3
import v3_abilities as A
from v3 import CARDS, ELEMENTS, NCELLS, ORDER, pct

HANDS = (5, 6)
MAX_ABIL = 5
ABILITY_FROM_PLACEMENT = 2
EIGHT = ['gust', 'scorch', 'tremor', 'conduit', 'eclipse', 'tide', 'beacon',
         'arc']


def live(placed_so_far):
    return placed_so_far >= ABILITY_FROM_PLACEMENT - 1


def options(cards, own, player, card, cell, placed_so_far):
    """A.options gated on the turn count instead of on affinity."""
    if not A.abil(card) or not live(placed_so_far):
        return [None]
    saved = A.PLAYED[player].copy()
    for e in ELEMENTS:
        A.PLAYED[player][e] = 99
    out = A.options(cards, own, player, card, cell)
    A.PLAYED[player].clear()
    A.PLAYED[player].update(saved)
    return out


def apply_move(cards, own, hands, player, mv, cap, placed_so_far, rng):
    saved = A.PLAYED[player].copy()
    if live(placed_so_far):
        for e in ELEMENTS:
            A.PLAYED[player][e] = 99
    else:
        # -1, not cleared. A.live() tests PLAYED[el] >= cost, and Conduit's
        # cost is 0, so a cleared counter leaves it live and the turn gate
        # leaks for exactly that one ability.
        for e in ELEMENTS:
            A.PLAYED[player][e] = -1
    got = A.apply_move(cards, own, hands, [[], []], player, mv, cap, rng)
    A.PLAYED[player].clear()
    A.PLAYED[player].update(saved)
    return got


def moves(cards, own, hands, player, empties, placed_so_far):
    out = []
    for i, card in enumerate(hands[player]):
        e = A.edges(card)
        for _ in range(4):
            for cell in empties:
                for opt in options(cards, own, player,
                                   A.with_edges(card, e), cell,
                                   placed_so_far):
                    out.append((i, cell, e, opt))
            e = v3.rot90(e)
    return out


def probe(cards, own, hands, player, mv, cap, placed_so_far, rng):
    return apply_move([x for x in cards], own[:],
                      [list(h) for h in hands], player, mv, cap,
                      placed_so_far, rng)


def exposure(cards, cell):
    return sum(1 for d in range(4)
               if v3.NB[cell][d] >= 0 and cards[v3.NB[cell][d]] is None)


def pick(cards, own, hands, player, empties, cap, placed_so_far, rng, smart):
    mv = moves(cards, own, hands, player, empties, placed_so_far)
    sc = [(m, probe(cards, own, hands, player, m, cap, placed_so_far, rng))
          for m in mv]
    b = max(x[1] for x in sc)
    top = [m for m, g in sc if g == b]
    if smart:
        lo = min(exposure(cards, m[1]) for m in top)
        top = [m for m in top if exposure(cards, m[1]) == lo]
    return rng.choice(top)


def build_hand(rng, n, ability, n_abil):
    """A legal deck of 12 dealt down to n, with n_abil ability cards."""
    deck = [A.make_card(rng, ability) for _ in range(min(n_abil, MAX_ABIL))]
    deck += [A.make_card(rng, None)
             for _ in range(v3.DECK_SIZE - min(n_abil, MAX_ABIL))]
    rng.shuffle(deck)
    return deck[:n]


def play(rng, abils, counts, smarts):
    hands = [build_hand(rng, HANDS[p], abils[p], counts[p]) for p in (0, 1)]
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
        cap = v3.FINAL_CASCADE_CAP if turn == len(ORDER) - 1 \
            else v3.CASCADE_CAP
        mv = pick(cards, own, hands, p, empties, cap, placed[p], rng,
                  smarts[p])
        if mv[3] is not None:
            used[p] += 1
        apply_move(cards, own, hands, p, mv, cap, placed[p], rng)
        placed[p] += 1
        # no draw step
    return [bin(own[0]).count('1'), bin(own[1]).count('1')], used


def holder(games, ability, seed=4242):
    """Holder win rate with seats swapped; 50% is neutral."""
    rng = random.Random(seed)
    w = n = fired = 0
    for _ in range(games):
        for seat in (0, 1):
            ab = [None, None]
            cnt = [0, 0]
            ab[seat] = ability
            cnt[seat] = MAX_ABIL
            s, used = play(rng, ab, cnt, [False, False])
            n += 1
            if used[seat]:
                fired += 1
            if (s[0] > s[1]) == (seat == 0):
                w += 1
    return w / n, fired / n


def depth(games, ability, seed=22):
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for smart in (0, 1):
            sm = [False, False]
            sm[smart] = True
            cnt = (MAX_ABIL, MAX_ABIL) if ability else (0, 0)
            s, _ = play(rng, (ability, ability), cnt, sm)
            n += 1
            if (s[0] > s[1]) == (smart == 0):
                w += 1
    return w / n


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 700
    which = EIGHT
    if len(sys.argv) > 2:
        which = list(A.ABIL) if sys.argv[2] == 'all' else sys.argv[2].split(',')
    print("=" * 72)
    print("ABILITY POWER UNDER THE SHIPPED RULES (seats swapped)")
    print("=" * 72)
    print(f"  hands {HANDS} dealt once, no draws, <={MAX_ABIL} ability "
          f"cards, live from placement {ABILITY_FROM_PLACEMENT}")
    print(f"  {G * 2} games per row")
    print()
    base, _ = holder(G, None)
    based = depth(max(G // 2, 200), None)
    print(f"  {'ability':<10}{'holder win':>12}{'vs neutral':>12}"
          f"{'used':>8}{'depth':>8}")
    print(f"  {'(none)':<10}{pct(base):>12}{'--':>12}{'--':>8}"
          f"{pct(based):>8}")
    rows = []
    for ab in which:
        hw, fired = holder(G, ab)
        dp = depth(max(G // 2, 200), ab)
        rows.append((ab, hw, fired, dp))
        print(f"  {ab:<10}{pct(hw):>12}{pct(hw - 0.5):>12}"
              f"{pct(fired):>8}{pct(dp):>8}")
    print()
    lo = min(r[1] for r in rows)
    hi = max(r[1] for r in rows)
    print(f"  holder win rate spans {pct(lo)}-{pct(hi)}; a neutral ability "
          f"sits at 50%")
    print(f"  baseline depth {pct(based)}; with abilities "
          f"{pct(min(r[3] for r in rows))}-{pct(max(r[3] for r in rows))}")


if __name__ == '__main__':
    main()
