#!/usr/bin/env python3
"""
Measurement of the five draft leaders: persistent rules, chosen before the
game, each rewarding a different deck shape.

  PRINCE    when you attack, twin matchups count as wins
  TANTALUS  your abilities cost no affinity
  ABYSSAL   you choose your hand instead of drawing it
  LETO      your cascades go one wave deeper
  LOVER     a card captured from you rotates 90 as it changes hands

Power is measured with the SEATS SWAPPED: every deal is played twice, once
with each player holding the leader, and the figure reported is the
holder's win rate. 50% is neutral. A one-sided test would measure the seat,
which is the mistake that broke an earlier skill test.

Two modelling notes, disclosed rather than hidden:

  ABYSSAL  "choose your hand" has no meaning to a bot unless something
           makes one hand better than another, and every card is equally
           strong. Modelled as picking, from a 40-card pool, the hand whose
           edges between them can beat the widest set of elements -- i.e.
           maximum coverage, so you always hold an answer.
  LOVER    its rotation is optional in the draft, but a bot cannot value a
           defensive option mid-chain. Modelled as always rotating, which
           bounds the effect rather than estimating it.
"""

import random
import sys
from collections import Counter

import v3
import v3_abilities as A
from v3 import (BEATS, CARDS, ELEMENTS, NB, NCELLS, OPPSIDE, ORDER, TWIN,
                pct, rot90)

HANDS = (5, 6)
DECK = 12
MAX_ABIL = 5
LEADERS = ['none', 'PRINCE', 'TANTALUS', 'ABYSSAL', 'LETO', 'LOVER']

# ---------------------------------------------------------------------------
# capture, with the leaders that touch it
# ---------------------------------------------------------------------------
def wins(att, dfn, prince):
    """Does `att` take `dfn`? Prince also wins twin matchups."""
    if dfn in BEATS[att]:
        return True
    if prince and TWIN[att] == dfn:
        return True
    return False


def cascade(cards, own, origin, player, cap, lead):
    """Returns (captured, waves). Leto deepens, Lover rotates on loss."""
    opp = 1 - player
    prince = lead[player] == 'PRINCE'
    vengeful = lead[opp] == 'LOVER'
    if lead[player] == 'LETO':
        cap += 1
    frontier, captured, waves, depth = origin, 0, 0, 0
    while frontier and depth <= cap:
        newly = 0
        for src in range(NCELLS):
            if not (frontier >> src) & 1 or cards[src] is None:
                continue
            se = A.edges(cards[src])
            for d in range(4):
                t = NB[src][d]
                if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
                    continue
                if wins(se[d], A.edges(cards[t])[OPPSIDE[d]], prince):
                    newly |= 1 << t
        if newly:
            own[player] |= newly
            own[opp] &= ~newly
            captured += bin(newly).count('1')
            waves += 1
            if vengeful:
                # resolved after the wave, never mid-chain, so the chain
                # cannot become order-dependent
                for t in range(NCELLS):
                    if (newly >> t) & 1 and cards[t] is not None:
                        cards[t] = A.with_edges(cards[t],
                                                rot90(A.edges(cards[t])))
        frontier = newly
        depth += 1
    return captured, waves


def live(player, card, lead):
    a = A.abil(card)
    if not a:
        return False
    if lead[player] == 'TANTALUS':
        return True
    el, cost = A.ABIL[a]
    return A.PLAYED[player][el] >= cost


def apply_move(cards, own, hands, player, mv, cap, lead, rng):
    i, cell, oe, opt = mv
    card = A.with_edges(hands[player][i], oe)
    a = A.abil(card) if live(player, card, lead) else None
    kind = opt[0] if opt else None

    if a == 'eclipse' and kind == 'use':
        card = A.with_edges(card, tuple(TWIN[x] for x in A.edges(card)))
    if a == 'glaciate' and kind == 'use':
        card = A.with_edges(card, (6, 6, 6, 6))
    if a == 'gust' and kind == 'gust':
        t = opt[1]
        cards[t] = A.with_edges(cards[t], rot90(A.edges(cards[t])))
    if a == 'tremor' and kind == 'use':
        for d in range(4):
            t = NB[cell][d]
            if t >= 0 and cards[t]:
                cards[t] = A.with_edges(cards[t],
                                        rot90(rot90(A.edges(cards[t]))))
    if a == 'cyclone' and kind == 'use':
        for t in range(NCELLS):
            if cards[t]:
                cards[t] = A.with_edges(cards[t], rot90(A.edges(cards[t])))
    if a == 'upheaval' and kind == 'use':
        card = A.with_edges(card, rot90(A.edges(card)))
        for d in range(4):
            t = NB[cell][d]
            if t >= 0 and cards[t] and (own[player] >> t) & 1:
                cards[t] = A.with_edges(cards[t], rot90(A.edges(cards[t])))
    if a == 'umbra' and kind == 'umbra':
        t = opt[1]
        cards[t] = A.with_edges(cards[t],
                                tuple(TWIN[x] for x in A.edges(cards[t])))

    hands[player].pop(i)
    cards[cell] = card
    own[player] |= 1 << cell
    if a == 'tide' and kind == 'tide':
        t = opt[1]
        cards[cell], cards[t] = cards[t], cards[cell]

    origin = 1 << cell
    if a in ('conduit', 'arc') and kind in ('conduit', 'arc'):
        origin = 1 << opt[1]
    if a == 'tide' and kind == 'tide':
        # the placed card travels and attacks from its new cell; see the
        # note in v3_abilities.apply_move
        origin = 1 << opt[1]
    got, _ = cascade(cards, own, origin, player, cap, lead)

    prince = lead[player] == 'PRINCE'
    if a in ('scorch', 'backlash') and kind == a:
        t, near = opt[1], opt[2]
        if cards[t] and (own[1 - player] >> t) & 1 and \
                wins(A.edges(cards[cell])[near],
                     A.edges(cards[t])[OPPSIDE[near]], prince):
            own[player] |= 1 << t
            own[1 - player] &= ~(1 << t)
            got += 1
    if a == 'beacon' and kind == 'beacon':
        t, d, e = opt[1], opt[2], opt[3]
        if cards[t] and (own[1 - player] >> t) & 1 and \
                wins(A.edges(cards[cell])[e],
                     A.edges(cards[t])[OPPSIDE[d]], prince):
            own[player] |= 1 << t
            own[1 - player] &= ~(1 << t)
            got += 1
    return got


def options(cards, own, player, card, cell, lead):
    if not live(player, card, lead):
        return [None]
    saved = A.PLAYED[player].copy()
    if lead[player] == 'TANTALUS':
        for e in ELEMENTS:
            A.PLAYED[player][e] = 99     # everything affordable
    out = A.options(cards, own, player, card, cell)
    A.PLAYED[player].clear()
    A.PLAYED[player].update(saved)
    return out


def moves(cards, own, hands, player, empties, lead):
    out = []
    for i, card in enumerate(hands[player]):
        e = A.edges(card)
        for _ in range(4):
            for cell in empties:
                for opt in options(cards, own, player,
                                   A.with_edges(card, e), cell, lead):
                    out.append((i, cell, e, opt))
            e = rot90(e)
    return out


def probe(cards, own, hands, player, mv, cap, lead, rng):
    c = [x for x in cards]
    o = own[:]
    h = [list(x) for x in hands]
    return apply_move(c, o, h, player, mv, cap, lead, rng)


def exposure(cards, cell):
    return sum(1 for d in range(4)
               if NB[cell][d] >= 0 and cards[NB[cell][d]] is None)


def pol_greedy(cards, own, hands, player, empties, cap, lead, rng):
    mv = moves(cards, own, hands, player, empties, lead)
    sc = [(m, probe(cards, own, hands, player, m, cap, lead, rng))
          for m in mv]
    b = max(x[1] for x in sc)
    return rng.choice([m for m, g in sc if g == b])


def pol_normal(cards, own, hands, player, empties, cap, lead, rng):
    mv = moves(cards, own, hands, player, empties, lead)
    sc = [(m, probe(cards, own, hands, player, m, cap, lead, rng))
          for m in mv]
    b = max(x[1] for x in sc)
    top = [m for m, g in sc if g == b]
    lo = min(exposure(cards, m[1]) for m in top)
    return rng.choice([m for m in top if exposure(cards, m[1]) == lo])


# ---------------------------------------------------------------------------
# hands
# ---------------------------------------------------------------------------
def coverage(hand):
    """How many distinct elements this hand can beat from some edge."""
    s = set()
    for c in hand:
        for e in A.edges(c):
            s |= BEATS[e]
    return len(s)


def build_hand(rng, n, leader):
    """A deck of DECK with at most MAX_ABIL abilities, dealt down to n --
    except Abyssal, which picks the widest-coverage hand from a big pool."""
    def card(with_abil):
        return A.make_card(rng, rng.choice(list(A.ABIL)) if with_abil else None)

    if leader == 'ABYSSAL':
        pool = [card(i < MAX_ABIL * 3) for i in range(40)]
        rng.shuffle(pool)
        hand = []
        for _ in range(n):
            best, bi = -1, 0
            for i, c in enumerate(pool):
                if A.abil(c) and sum(1 for x in hand if A.abil(x)) >= MAX_ABIL:
                    continue
                cov = coverage(hand + [c])
                if cov > best:
                    best, bi = cov, i
            hand.append(pool.pop(bi))
        return hand

    deck = [card(i < MAX_ABIL) for i in range(DECK)]
    rng.shuffle(deck)
    return deck[:n]


def play(rng, pols, lead):
    hands = [build_hand(rng, HANDS[0], lead[0]),
             build_hand(rng, HANDS[1], lead[1])]
    cards = [None] * NCELLS
    own = [0, 0]
    A.PLAYED[0].clear()
    A.PLAYED[1].clear()
    caps = 0
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = v3.FINAL_CASCADE_CAP if turn == len(ORDER) - 1 \
            else v3.CASCADE_CAP
        mv = pols[p](cards, own, hands, p, empties, cap, lead, rng)
        sg = A.sigil(hands[p][mv[0]])
        caps += apply_move(cards, own, hands, p, mv, cap, lead, rng)
        A.PLAYED[p][sg] += 1
        # no draw step
    return [bin(own[0]).count('1'), bin(own[1]).count('1')], caps


def holder_winrate(games, pols, leader, seed=4242):
    """Every deal played twice, seats swapped. Returns the leader holder's
    win rate, plus captures and one-card-game rate."""
    rng = random.Random(seed)
    wins_ = 0
    n = 0
    caps = 0
    close = 0
    for _ in range(games):
        for seat in (0, 1):
            lead = ['none', 'none']
            lead[seat] = leader
            s, c = play(rng, pols, lead)
            n += 1
            caps += c
            if abs(s[0] - s[1]) == 1:
                close += 1
            if (s[0] > s[1]) == (seat == 0):
                wins_ += 1
    return wins_ / n, caps / n, close / n


def mirror(games, pols, leader, seed=55):
    rng = random.Random(seed)
    w = [0, 0]
    caps = 0
    for _ in range(games):
        s, c = play(rng, pols, [leader, leader])
        w[0 if s[0] > s[1] else 1] += 1
        caps += c
    n = games
    return w[0] / n, w[1] / n, caps / n


def depth(games, leader, seed=22):
    """Heuristic vs greedy, seats swapped, both holding the leader."""
    rng = random.Random(seed)
    wins_ = 0
    n = 0
    for _ in range(games):
        for smart in (0, 1):
            pols = [pol_greedy, pol_greedy]
            pols[smart] = pol_normal
            s, _ = play(rng, tuple(pols), [leader, leader])
            n += 1
            if (s[0] > s[1]) == (smart == 0):
                wins_ += 1
    return wins_ / n


def main():
    G = 1400
    print("=" * 82)
    print("LEADERS -- holder win rate, seats swapped (50% = neutral)")
    print("=" * 82)
    print(f"  {'leader':<10}{'holder win':>12}{'vs neutral':>12}"
          f"{'caps':>8}{'1-card':>9}{'mirror edge':>13}{'depth':>8}")
    base = None
    for L in LEADERS:
        hw, caps, close = holder_winrate(G, (pol_greedy, pol_greedy), L)
        m1, m2, mc = mirror(G, (pol_greedy, pol_greedy), L)
        dp = depth(600, L)
        if L == 'none':
            base = hw
        delta = hw - base
        print(f"  {L:<10}{pct(hw):>12}{pct(delta):>12}{caps:>8.2f}"
              f"{pct(close):>9}{pct(m2 - m1):>13}{pct(dp):>8}")
    print()
    print("  'vs neutral' is the gain over holding no leader at all.")
    print("  A leader inside +/-3 points is priced; beyond that it needs work.")


if __name__ == '__main__':
    main()
