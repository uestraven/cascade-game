#!/usr/bin/env python3
"""
v2: null edges for variance, and a re-derived turn order.

NULL EDGES. An edge with no element. It can never capture; anything with an
element captures it. Null-vs-null does nothing. This is the weak-flank idea
with zero arithmetic.

The important distinction measured below: a FIXED number of nulls per card
keeps every card equally strong, so bad hands still cannot exist. Only a
VARYING number of nulls creates card inequality, and therefore bad draws and
genuinely lost deals.
"""

import itertools
import random
from collections import Counter

from elemental import (
    ALL_CARDS, BEATS, CASCADE_CAP, DECK_SIZE, ELEMENTS, HAND_SIZE, NB, NAMES,
    NCELLS, OPPSIDE, TURN_ORDER, pct,
)

NULL = 0

# How many of a card's four edges are blank. The spread is what creates
# strong and weak cards.
NULL_MIXES = {
    'none':   {0: 1.0},
    'one':    {1: 1.0},
    'mild':   {0: 0.55, 1: 0.35, 2: 0.10},
    'mixed':  {0: 0.40, 1: 0.40, 2: 0.20},
    'harsh':  {0: 0.25, 1: 0.40, 2: 0.25, 3: 0.10},
}


def beats(att, dfn):
    if att == NULL:
        return False          # a blank edge can never take anything
    if dfn == NULL:
        return True           # and anything takes a blank edge
    return dfn in BEATS[att]


def make_card(rng, mix):
    r = rng.random()
    acc = 0.0
    nulls = 0
    for k, p in mix.items():
        acc += p
        if r <= acc:
            nulls = k
            break
    els = rng.sample(ELEMENTS, 4 - nulls)
    card = list(els) + [NULL] * nulls
    rng.shuffle(card)
    return tuple(card)


def resolve(cards, own, cell, card, player, cap=CASCADE_CAP, protected=0):
    cards[cell] = card
    own[player] |= 1 << cell
    opp = 1 - player
    frontier = 1 << cell
    captured, waves, depth = 0, [], 0
    while frontier and depth <= cap:
        newly = 0
        for src in range(NCELLS):
            if not (frontier >> src) & 1:
                continue
            scard = cards[src]
            for d in range(4):
                t = NB[src][d]
                if t < 0 or (protected >> t) & 1:
                    continue
                if not (own[opp] >> t) & 1:
                    continue
                if beats(scard[d], cards[t][OPPSIDE[d]]):
                    newly |= 1 << t
        if newly:
            own[player] |= newly
            own[opp] &= ~newly
            captured += bin(newly).count('1')
            waves.append(newly)
        frontier = newly
        depth += 1
    return captured, waves


# ---------------------------------------------------------------------------
# Policies
# ---------------------------------------------------------------------------
def pol_random(cards, own, hand, p, empties, rng):
    return rng.randrange(len(hand)), rng.choice(empties)


def _caps(cards, own, hand, p, empties):
    out = []
    for i, card in enumerate(hand):
        for cell in empties:
            got, _ = resolve(cards[:], own[:], cell, card, p)
            out.append((i, cell, got, card))
    return out


def pol_greedy(cards, own, hand, p, empties, rng):
    scored = _caps(cards, own, hand, p, empties)
    best = max(s[2] for s in scored)
    return rng.choice([(i, c) for i, c, g, _ in scored if g == best])


def _exposure(cards, own, cell, card):
    """Risk left behind: for each edge still facing an empty cell, how many
    elements could take it. A blank edge is beaten by all eight."""
    risk = 0
    for d in range(4):
        t = NB[cell][d]
        if t < 0:
            continue
        if cards[t] is not None:
            continue
        risk += 8 if card[d] == NULL else 3
    return risk


def pol_normal(cards, own, hand, p, empties, rng):
    """Captures first, then leave the least exposed edges behind."""
    scored = _caps(cards, own, hand, p, empties)
    best = max(s[2] for s in scored)
    top = [(i, c, card) for i, c, g, card in scored if g == best]
    low = min(_exposure(cards, own, c, card) for _, c, card in top)
    return rng.choice([(i, c) for i, c, card in top
                       if _exposure(cards, own, c, card) == low])


POLICIES = {'random': pol_random, 'greedy': pol_greedy, 'normal': pol_normal}


# ---------------------------------------------------------------------------
# Game
# ---------------------------------------------------------------------------
def new_deal(rng, mix):
    decks = [[make_card(rng, mix) for _ in range(DECK_SIZE)] for _ in range(2)]
    return ([decks[0][:HAND_SIZE], decks[1][:HAND_SIZE]],
            [decks[0][HAND_SIZE:], decks[1][HAND_SIZE:]])


def play(rng, policy, mix, order=TURN_ORDER, deal=None):
    hands, decks = deal if deal else new_deal(rng, mix)
    hands = [h[:] for h in hands]
    decks = [d[:] for d in decks]
    cards = [None] * NCELLS
    own = [0, 0]
    caps = 0
    waves = Counter()
    for p in order:
        empties = [i for i in range(NCELLS) if cards[i] is None]
        i, cell = policy(cards, own, hands[p], p, empties, rng)
        card = hands[p].pop(i)
        got, wv = resolve(cards, own, cell, card, p)
        caps += got
        waves[len(wv)] += 1
        if decks[p]:
            hands[p].append(decks[p].pop(0))
    cnt = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    return cnt, caps, waves


def run(games, policy, mix, order=TURN_ORDER, seed=5150):
    rng = random.Random(seed)
    wins = [0, 0]
    caps = 0
    waves = Counter()
    close = 0
    for _ in range(games):
        cnt, c, wv = play(rng, policy, mix, order)
        wins[0 if cnt[0] > cnt[1] else 1] += 1
        caps += c
        waves.update(wv)
        if abs(cnt[0] - cnt[1]) == 1:
            close += 1
    tot = sum(waves.values())
    return {
        'p1': wins[0] / games, 'p2': wins[1] / games,
        'caps': caps / games, 'close': close / games,
        'mw': sum(v for k, v in waves.items() if k > 1) / tot,
    }


def locked_rate(deals, policy, mix, replays=12, seed=4242):
    """Share of deals where the same player wins every replay."""
    rng = random.Random(seed)
    locked = lp1 = 0
    for _ in range(deals):
        deal = new_deal(rng, mix)
        outs = set()
        for _ in range(replays):
            r2 = random.Random(rng.randrange(1 << 30))
            cnt, _, _ = play(r2, policy, mix, deal=deal)
            outs.add(0 if cnt[0] > cnt[1] else 1)
            if len(outs) > 1:
                break
        if len(outs) == 1:
            locked += 1
            lp1 += 1 if outs == {0} else 0
    return locked / deals, lp1 / deals


def main():
    print("=" * 84)
    print("A. NULL EDGES: do they create bad hands?")
    print("=" * 84)
    print("  'none'/'one' give every card the same strength. Only a VARYING")
    print("  null count makes some hands genuinely worse than others.")
    print()
    print(f"{'mix':<8}{'edge capture':>14}{'dead edges':>12}"
          f"{'caps/game':>11}{'multiwave':>11}{'locked deals':>14}")
    for name, mix in NULL_MIXES.items():
        rng = random.Random(7)
        n = 200000
        w = dead = 0
        for _ in range(n):
            a, b = make_card(rng, mix), make_card(rng, mix)
            d = rng.randrange(4)
            x, y = a[d], b[OPPSIDE[d]]
            if beats(x, y):
                w += 1
            elif not beats(y, x):
                dead += 1
        r = run(8000, pol_greedy, mix)
        lk, _ = locked_rate(700, pol_greedy, mix)
        print(f"{name:<8}{pct(w/n):>14}{pct(dead/n):>12}"
              f"{r['caps']:>11.2f}{pct(r['mw']):>11}{pct(lk):>14}")

    print()
    print("=" * 84)
    print("B. TURN ORDER SEARCH for v2  [mix='mixed', all 126 orders]")
    print("=" * 84)
    MIX = NULL_MIXES['mixed']
    rows = []
    for combo in itertools.combinations(range(9), 4):
        order = tuple(1 if i in combo else 0 for i in range(9))
        g = run(1200, pol_greedy, MIX, order, seed=31337)
        eg = g['p2'] - g['p1']
        if abs(eg) > 0.20:
            continue
        n = run(1200, pol_normal, MIX, order, seed=90210)
        en = n['p2'] - n['p1']
        rows.append((max(abs(eg), abs(en)), eg, en,
                     ''.join('AB'[p] for p in order)))
    rows.sort()
    print(f"{'order':<12}{'greedy edge':>13}{'normal edge':>13}{'worst':>9}")
    for w, eg, en, s in rows[:12]:
        print(f"{s:<12}{pct(eg):>13}{pct(en):>13}{pct(w):>9}")
    print(f"   [{len(rows)} of 126 survived the greedy screen]")

    print()
    print("=" * 84)
    print("C. REFINED: best v2 orders at full sample")
    print("=" * 84)
    print(f"{'order':<12}{'policy':<9}{'P1':>8}{'P2':>8}{'edge':>8}"
          f"{'caps':>8}{'5-4':>8}{'locked':>9}")
    for w, eg, en, s in rows[:4]:
        order = tuple(0 if ch == 'A' else 1 for ch in s)
        for pol in ('greedy', 'normal'):
            r = run(12000, POLICIES[pol], MIX, order, seed=777)
            print(f"{s:<12}{pol:<9}{pct(r['p1']):>8}{pct(r['p2']):>8}"
                  f"{pct(r['p2']-r['p1']):>8}{r['caps']:>8.2f}"
                  f"{pct(r['close']):>8}", end='')
            if pol == 'greedy':
                lk, _ = locked_rate(900, pol_greedy, MIX, seed=2024)
                print(f"{pct(lk):>9}")
            else:
                print()
        print()

    print("=" * 84)
    print("D. FOR REFERENCE: the old order under v2 rules")
    print("=" * 84)
    for pol in ('greedy', 'normal'):
        r = run(12000, POLICIES[pol], MIX, TURN_ORDER, seed=777)
        print(f"  AABBAABBA  {pol:<8} P1 {pct(r['p1'])}  P2 {pct(r['p2'])}"
              f"  edge {pct(r['p2']-r['p1'])}")


if __name__ == '__main__':
    main()
