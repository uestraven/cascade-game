#!/usr/bin/env python3
"""
Changing the turn's resolution order so abilities feed the capture check.

Proposed: place the card, the ability resolves, THEN the edges are
re-checked. Two readings, measured separately because they are not close
to each other:

  CURRENT   modifiers -> card lands -> chain from the placed card
            -> reach (Scorch/Beacon/Backlash), which starts no chain

  FEED      modifiers -> card lands -> reach resolves FIRST, and any card
            it takes joins the chain's starting frontier -> chain
            This is the "re-check after the ability" reading applied to
            the one phase that is currently sequenced the other way. The
            rule it removes was measured as load-bearing: outcomes differ
            in 36.4% of positions where Scorch has a target, worst case
            one capture becoming seven.

  SWEEP     modifiers -> card lands -> reach -> chain from EVERY card you
            control. The literal "all the edges are re-checked" reading.
            As a one-off ability (surge) this measured +18.5 win rate, so
            the question is what it does when both players get it every
            single turn.

Reported for each: captures per game, the biggest single turn, the margin
spread, depth, and whether the deal or the play decides -- volatility is
only worth having if skill survives it.
"""

import random
import sys
from collections import Counter

import v3
import v3_abilities as A
from v3 import ELEMENTS, NCELLS, ORDER, pct

import ability_power as P

POOL = [a for a in A.ABIL]
PRICED = ['arc', 'umbraone', 'eclipse', 'glaciate', 'conduit']
REACH = ('scorch', 'backlash', 'beacon')


def apply_move(mode, cards, own, hands, player, mv, cap, placed_so_far,
               rng):
    """One placement under the chosen resolution order.

    Returns captures. Mirrors v3_abilities.apply_move for the modifier
    and chain phases, then differs in where reach sits and where the
    chain starts.
    """
    i, cell, oe, opt = mv
    live = placed_so_far >= P.ABILITY_FROM_PLACEMENT - 1
    card = A.with_edges(hands[player][i], oe)
    a = A.abil(card) if live else None
    kind = opt[0] if opt else None
    opp = 1 - player

    # --- modifiers, before any comparison (unchanged in all modes) ---
    if a == 'eclipse' and kind == 'use':
        card = A.with_edges(card, tuple(v3.TWIN[x] for x in A.edges(card)))
    if a == 'glaciate' and kind == 'use':
        card = A.with_edges(card, (6, 6, 6, 6))
    if a in ('gust', 'gustown') and kind == 'gust':
        t = opt[1]
        cards[t] = A.with_edges(cards[t], v3.rot90(A.edges(cards[t])))
    if a == 'tremor' and kind == 'use':
        for d in range(4):
            t = v3.NB[cell][d]
            if t >= 0 and cards[t]:
                cards[t] = A.with_edges(
                    cards[t], v3.rot90(v3.rot90(A.edges(cards[t]))))
    if a == 'cyclone' and kind == 'use':
        for t in range(NCELLS):
            if cards[t]:
                cards[t] = A.with_edges(cards[t],
                                        v3.rot90(A.edges(cards[t])))
    if a == 'upheaval' and kind == 'use':
        card = A.with_edges(card, v3.rot90(A.edges(card)))
        for d in range(4):
            t = v3.NB[cell][d]
            if t >= 0 and cards[t] and (own[player] >> t) & 1:
                cards[t] = A.with_edges(cards[t],
                                        v3.rot90(A.edges(cards[t])))
    if a == 'umbraone' and kind == 'umbra':
        t = opt[1]
        d = next(k for k in range(4) if v3.NB[cell][k] == t)
        e = list(A.edges(cards[t]))
        e[v3.OPPSIDE[d]] = v3.TWIN[e[v3.OPPSIDE[d]]]
        cards[t] = A.with_edges(cards[t], tuple(e))
    if a == 'umbra' and kind == 'umbra':
        t = opt[1]
        cards[t] = A.with_edges(
            cards[t], tuple(v3.TWIN[x] for x in A.edges(cards[t])))

    hands[player].pop(i)
    cards[cell] = card
    own[player] |= 1 << cell
    if a == 'tide' and kind == 'tide':
        t = opt[1]
        cards[cell], cards[t] = cards[t], cards[cell]

    got = 0

    def do_reach():
        """The one extra attack. Returns the cell taken, or -1."""
        pe = A.edges(card)
        if a in ('scorch', 'backlash') and kind == a:
            t, near = opt[1], opt[2]
            if cards[t] and (own[opp] >> t) & 1 and \
                    v3.beats(pe[near], A.edges(cards[t])[v3.OPPSIDE[near]]):
                own[player] |= 1 << t
                own[opp] &= ~(1 << t)
                return t
        if a == 'beacon' and kind == 'beacon':
            t, d, e = opt[1], opt[2], opt[3]
            if cards[t] and (own[opp] >> t) & 1 and \
                    v3.beats(pe[e], A.edges(cards[t])[v3.OPPSIDE[d]]):
                own[player] |= 1 << t
                own[opp] &= ~(1 << t)
                return t
        return -1

    origin = 1 << cell
    if a in ('conduit', 'arc') and kind in ('conduit', 'arc'):
        origin = 1 << opt[1]
    if a == 'tide' and kind == 'tide':
        origin = 1 << opt[1]

    if mode == 'current':
        got += A.cascade(cards, own, origin, player, cap)
        if do_reach() >= 0:
            got += 1
    else:
        # the ability resolves, THEN the edges are re-checked
        t = do_reach()
        if t >= 0:
            got += 1
            origin |= 1 << t          # the reached card now cascades
        if mode == 'sweep':
            origin = own[player]      # re-check every edge you own
        got += A.cascade(cards, own, origin, player, cap)
    return got


def moves(cards, own, hands, player, empties, placed_so_far):
    return P.moves(cards, own, hands, player, empties, placed_so_far)


def pick(mode, cards, own, hands, player, empties, cap, placed_so_far,
         rng, smart):
    mv = moves(cards, own, hands, player, empties, placed_so_far)
    best, ties = None, []
    for m in mv:
        c = [x for x in cards]
        o = own[:]
        h = [list(x) for x in hands]
        g = apply_move(mode, c, o, h, player, m, cap, placed_so_far, rng)
        if best is None or g > best:
            best, ties = g, [m]
        elif g == best:
            ties.append(m)
    if smart:
        def expo(cell):
            return sum(1 for d in range(4)
                       if v3.NB[cell][d] >= 0
                       and cards[v3.NB[cell][d]] is None)
        lo = min(expo(m[1]) for m in ties)
        ties = [m for m in ties if expo(m[1]) == lo]
    return rng.choice(ties)


def play(mode, rng, pool, smarts, deck=None, track=None):
    if deck is None:
        deck = [A.make_card(rng, rng.choice(pool)) for _ in range(28)]
        rng.shuffle(deck)
    hands = [list(deck[:P.HANDS[0]]),
             list(deck[P.HANDS[0]:P.HANDS[0] + P.HANDS[1]])]
    cards = [None] * NCELLS
    own = [0, 0]
    A.PLAYED[0].clear()
    A.PLAYED[1].clear()
    placed = [0, 0]
    caps = 0
    biggest = 0
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = v3.cap_for_turn(turn)
        mv = pick(mode, cards, own, hands, p, empties, cap, placed[p], rng,
                  smarts[p])
        got = apply_move(mode, cards, own, hands, p, mv, cap, placed[p],
                         rng)
        caps += got
        biggest = max(biggest, got)
        if track is not None:
            track[got] += 1
        placed[p] += 1
    return ([bin(own[0]).count('1'), bin(own[1]).count('1')], caps,
            biggest, deck)


def survey(games, mode, pool, seed=4242):
    rng = random.Random(seed)
    caps = 0.0
    margins = Counter()
    bigs = Counter()
    turnhist = Counter()
    for _ in range(games):
        s, c, b, _ = play(mode, rng, pool, [False, False], track=turnhist)
        caps += c
        margins[abs(s[0] - s[1])] += 1
        bigs[b] += 1
    n = games
    return (caps / n, {k: v / n for k, v in margins.items()},
            {k: v / n for k, v in bigs.items()},
            {k: v / sum(turnhist.values()) for k, v in turnhist.items()})


def depth(games, mode, pool, seed=31):
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for smart in (0, 1):
            sm = [False, False]
            sm[smart] = True
            s, _, _, _ = play(mode, rng, pool, sm)
            if s[0] == s[1]:
                continue
            n += 1
            if (s[0] > s[1]) == (smart == 0):
                w += 1
    return w / max(n, 1)


def determinism(games, mode, pool, seed=99):
    rng = random.Random(seed)
    t = Counter()
    for _ in range(games):
        deck = [A.make_card(rng, rng.choice(pool)) for _ in range(28)]
        rng.shuffle(deck)
        s1 = play(mode, random.Random(5), pool, [True, False], deck)[0]
        s2 = play(mode, random.Random(5), pool, [False, True], deck)[0]
        w1 = 0 if s1[0] > s1[1] else 1
        w2 = 0 if s2[0] > s2[1] else 1
        if w1 == 0 and w2 == 1:
            t['play'] += 1
        elif w1 == 1 and w2 == 0:
            t['anti'] += 1
        else:
            t['deal'] += 1
    n = sum(t.values())
    return {k: v / n for k, v in t.items()}


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 400
    pool = POOL if len(sys.argv) < 3 else (
        PRICED if sys.argv[2] == 'priced' else POOL)
    label = 'all 13' if pool is POOL else 'the priced 5'

    print("=" * 76)
    print(f"RESOLUTION ORDER -- abilities from {label}, every card")
    print("=" * 76)
    print(f"  {G} games per row. CURRENT = reach after the chain.")
    print("  FEED = the ability resolves, then the edges are re-checked.")
    print("  SWEEP = ...and every edge you own is re-checked.")
    print()
    print(f"  {'mode':<9}{'caps/game':>11}{'biggest turn':>14}"
          f"{'depth':>8}{'play decides':>14}{'deal decides':>14}")
    rows = {}
    for mode in ('current', 'feed', 'sweep'):
        c, m, b, t = survey(G, mode, pool)
        dp = depth(max(G // 2, 200), mode, pool)
        d = determinism(max(G // 2, 200), mode, pool)
        rows[mode] = (c, m, b, t)
        top = max(b)
        print(f"  {mode:<9}{c:>11.2f}{top:>14}{pct(dp):>8}"
              f"{pct(d.get('play', 0)):>14}{pct(d.get('deal', 0)):>14}")

    print()
    print("  per-turn capture distribution:")
    for mode in ('current', 'feed', 'sweep'):
        _, _, _, t = rows[mode]
        print(f"    {mode:<9}" + "  ".join(
            f"{k}:{pct(v)}" for k, v in sorted(t.items())))
    print()
    print("  final margin:")
    for mode in ('current', 'feed', 'sweep'):
        _, m, _, _ = rows[mode]
        print(f"    {mode:<9}" + "  ".join(
            f"{k}:{pct(v)}" for k, v in sorted(m.items())))


if __name__ == '__main__':
    main()
