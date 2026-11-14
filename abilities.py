#!/usr/bin/env python3
"""
Draft measurement of the sigil/affinity system and the 15 abilities.

A card is now (edges, sigil): four distinct elements for combat, plus one
sigil in the centre for identity and cost. Affinity cost "<>X" means you
must already control a card with sigil X; "<><>X" means two.

Measured per ability:
  power  -- P1 win rate when only P1's cards carry it (vs 51.6% baseline)
  depth  -- how often the positional heuristic beats plain greedy (bar: 60%)
  draws  -- some abilities remove cards from the board, which breaks the
            "nine cards fill nine cells" guarantee that makes draws
            impossible. Those are flagged rather than silently accepted.

Abilities whose value is defensive or informational cannot be evaluated by
these bots at all; they are listed as UNMEASURABLE instead of scored.
"""

import itertools
import random
from collections import Counter

from v3 import (BEATS, CODES, ELEMENTS, GRID, NAMES, NB, NCELLS, OPPSIDE,
                ORDER, TWIN, beats, pct)

HANDS = (2, 4)
DECK = 12
CAP, FINAL_CAP = 1, 0
EDGE_SETS = tuple(itertools.permutations(ELEMENTS, 4))

# diagonal neighbours, and the edge index that points at each
DIAG = []
for i in range(NCELLS):
    r, c = divmod(i, GRID)
    row = []
    for dr, dc, near in ((-1, -1, 0), (-1, 1, 0), (1, -1, 2), (1, 1, 2)):
        nr, nc = r + dr, c + dc
        row.append(((nr * GRID + nc), near)
                   if 0 <= nr < GRID and 0 <= nc < GRID else None)
    DIAG.append(tuple(x for x in row if x))
DIAG = tuple(DIAG)


def make_card(rng, ability=None):
    return (rng.choice(EDGE_SETS), rng.choice(ELEMENTS), ability)


edges = lambda c: c[0]
sigil = lambda c: c[1]
abil = lambda c: c[2]


def rot90(e):
    n, ea, s, w = e
    return (w, n, ea, s)


def rot180(e):
    return rot90(rot90(e))


def with_edges(card, e):
    return (e, card[1], card[2])


def twin_edges(card):
    return with_edges(card, tuple(TWIN[x] for x in edges(card)))


# ---------------------------------------------------------------------------
# Affinity
# ---------------------------------------------------------------------------
# Affinity counts cards of that sigil you have PLAYED this game, not cards
# you still control. Board control cannot ramp: at ~1.9 captures per
# placement you do not keep cards, so a control-based cost never turns on
# (mono-sigil decks reached <><> only 23% of the time by turn 7). Played
# cards are monotone, so the curve is reliable and concentration buys
# consistency -- which is the pressure the system exists to create.
PLAYED = [Counter(), Counter()]


def affinity(cards, own, player, element):
    return PLAYED[player][element]


ABILITIES = {
    # Measured tiers. Only TWO cost levels fit a nine-turn game: free and
    # one affinity. At <><> an ability fires in 25-62% of games depending on
    # deck concentration, which makes it a gamble rather than a cost -- so
    # the heavy tier is reserved for a longer game, not used here.
    #
    # name:        (element, cost, measurable)
    'conduit':     ('Lightning', 0, True),    # power 51.5  depth 60.5
    'scorch':      ('Fire', 1, True),         # power 53.7  depth 65.8
    'gust':        ('Air', 1, True),          # power 54.8  depth 63.8
    'tremor':      ('Earth', 1, True),        # power 53.3  depth 62.6
    'eclipse':     ('Shadow', 1, True),       # power 51.7  depth 63.8

    # Defensive or informational: these bots cannot value not-losing-a-card,
    # so they need table playtesting rather than simulation.
    'backdraft':   ('Fire', 1, False),
    'bedrock':     ('Earth', 1, False),
    'rime':        ('Ice', 1, False),
    'sanctify':    ('Light', 1, False),
    'revelation':  ('Light', 1, False),

    # These remove a card from the board, which breaks the nine-cards-fill-
    # nine-cells guarantee that makes draws impossible. Blocked on a
    # tie-breaker decision.
    'undertow':    ('Water', 1, 'breaks-fill'),
    'updraft':     ('Air', 1, 'breaks-fill'),
    'pilfer':      ('Shadow', 1, 'breaks-fill'),

    # CUT.
    # 'current'  -- depth 58.9%, below the 60% bar.
    # 'chainarc' -- a trap. Free it measures power 33.5% and depth 26.6%:
    #               discarding to extend the cascade costs more than the
    #               extra wave returns, so taking the option makes you
    #               worse. It only enters the balance band at <><><>, where
    #               it never fires. Not salvageable by pricing.
}
ELEM_ID = {v: k for k, v in NAMES.items()}


def live(cards, own, player, card):
    """Is this card's ability affordable right now?"""
    a = abil(card)
    if not a:
        return False
    el, cost, _ = ABILITIES[a]
    return affinity(cards, own, player, ELEM_ID[el]) >= cost


# ---------------------------------------------------------------------------
# Resolution with ability hooks
# ---------------------------------------------------------------------------
def cascade(cards, own, origin_mask, player, cap):
    opp = 1 - player
    frontier = origin_mask
    captured, waves, depth = 0, 0, 0
    while frontier and depth <= cap:
        newly = 0
        for src in range(NCELLS):
            if not (frontier >> src) & 1 or not cards[src]:
                continue
            se = edges(cards[src])
            for d in range(4):
                t = NB[src][d]
                if t < 0 or not (own[opp] >> t) & 1 or not cards[t]:
                    continue
                if beats(se[d], edges(cards[t])[OPPSIDE[d]]):
                    newly |= 1 << t
        if newly:
            own[player] |= newly
            own[opp] &= ~newly
            captured += bin(newly).count('1')
            waves += 1
        frontier = newly
        depth += 1
    return captured, newly if captured else 0


def apply_move(cards, own, hands, decks, player, mv, cap, rng):
    """mv = (hand_index, cell, oriented_edges, option). Returns captures."""
    i, cell, oe, opt = mv
    card = hands[player][i]
    card = with_edges(card, oe)
    a = abil(card) if live(cards, own, player, card) else None

    if a == 'eclipse' and opt == 'use':
        card = twin_edges(card)
    if a == 'gust' and isinstance(opt, tuple) and opt[0] == 'gust':
        t = opt[1]
        cards[t] = with_edges(cards[t], rot90(edges(cards[t])))
    if a == 'tremor' and opt == 'use':
        for d in range(4):
            t = NB[cell][d]
            if t >= 0 and cards[t]:
                cards[t] = with_edges(cards[t], rot180(edges(cards[t])))
    if a == 'current' and isinstance(opt, tuple) and opt[0] == 'current':
        src, dst = opt[1], opt[2]
        cards[dst], cards[src] = cards[src], None
        own[player] |= 1 << dst
        own[player] &= ~(1 << src)

    hands[player].pop(i)
    cards[cell] = card
    own[player] |= 1 << cell

    eff_cap = cap
    if a == 'chainarc' and opt == 'use' and hands[player]:
        hands[player].pop(rng.randrange(len(hands[player])))
        eff_cap = cap + 1

    origin = 1 << cell
    if a == 'conduit' and isinstance(opt, tuple) and opt[0] == 'conduit':
        origin = 1 << opt[1]

    got, lastwave = cascade(cards, own, origin, player, eff_cap)

    if a == 'scorch' and isinstance(opt, tuple) and opt[0] == 'scorch':
        t, near = opt[1], opt[2]
        if cards[t] and (own[1 - player] >> t) & 1:
            if beats(edges(card)[near], edges(cards[t])[OPPSIDE[near]]):
                own[player] |= 1 << t
                own[1 - player] &= ~(1 << t)
                got += 1
    if a == 'pilfer' and opt == 'use' and lastwave:
        t = next(i for i in range(NCELLS) if (lastwave >> i) & 1)
        hands[player].append(cards[t])
        cards[t] = None
        own[player] &= ~(1 << t)
        got -= 1
    if a == 'undertow' and isinstance(opt, tuple) and opt[0] == 'undertow':
        t = opt[1]
        hands[player].append(cards[t])
        cards[t] = None
        own[player] &= ~(1 << t)
    if a == 'updraft' and isinstance(opt, tuple) and opt[0] == 'updraft':
        j, c2 = opt[1], opt[2]
        if j < len(hands[player]) and cards[c2] is None:
            extra = hands[player].pop(j)
            cards[c2] = extra
            own[player] |= 1 << c2
            g2, _ = cascade(cards, own, 1 << c2, player, cap)
            got += g2
            # "skip your next draw": burn one card off the deck rather
            # than clearing it. Clearing killed EVERY future draw, which
            # made Updraft measure at 35.8% power -- a bug, not a result.
            if decks[player]:
                decks[player].pop(0)
    return got


def options(cards, own, hands, player, i, cell, oe):
    """Every ability choice available for this placement, plus declining."""
    card = with_edges(hands[player][i], oe)
    if not live(cards, own, player, card):
        return [None]
    a = abil(card)
    out = [None]
    if a in ('eclipse', 'tremor', 'chainarc', 'pilfer'):
        out.append('use')
    elif a == 'gust':
        out += [('gust', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and cards[NB[cell][d]]]
    elif a == 'scorch':
        out += [('scorch', t, near) for t, near in DIAG[cell]
                if cards[t] and (own[1 - player] >> t) & 1]
    elif a == 'conduit':
        out += [('conduit', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and (own[player] >> NB[cell][d]) & 1]
    elif a == 'current':
        mine = [s for s in range(NCELLS)
                if (own[player] >> s) & 1 and cards[s] and s != cell]
        for s in mine:
            for d in range(4):
                t = NB[s][d]
                if t >= 0 and cards[t] is None and t != cell:
                    out.append(('current', s, t))
    elif a == 'undertow':
        out += [('undertow', s) for s in range(NCELLS)
                if (own[player] >> s) & 1 and cards[s] and s != cell]
    elif a == 'updraft':
        empt = [c for c in range(NCELLS) if cards[c] is None and c != cell]
        for j in range(len(hands[player]) - 1):
            for c2 in empt:
                if NB[cell].count(c2):
                    out.append(('updraft', j, c2))
    return out


def moves(cards, own, hands, player, empties):
    out = []
    for i, card in enumerate(hands[player]):
        for oe in (edges(card), rot180(edges(card))):
            for cell in empties:
                for opt in options(cards, own, hands, player, i, cell, oe):
                    out.append((i, cell, oe, opt))
    return out


def snapshot(cards, own, hands, decks):
    return ([c for c in cards], own[:], [h[:] for h in hands],
            [d[:] for d in decks])


def score_move(cards, own, hands, decks, player, mv, cap, rng):
    c2, o2, h2, d2 = snapshot(cards, own, hands, decks)
    return apply_move(c2, o2, h2, d2, player, mv, cap, rng)


def exposure(cards, cell):
    return sum(1 for d in range(4)
               if NB[cell][d] >= 0 and cards[NB[cell][d]] is None)


def pol_greedy(cards, own, hands, decks, player, empties, cap, rng):
    mv = moves(cards, own, hands, player, empties)
    sc = [(m, score_move(cards, own, hands, decks, player, m, cap, rng))
          for m in mv]
    b = max(x[1] for x in sc)
    return rng.choice([m for m, g in sc if g == b])


def pol_normal(cards, own, hands, decks, player, empties, cap, rng):
    mv = moves(cards, own, hands, player, empties)
    sc = [(m, score_move(cards, own, hands, decks, player, m, cap, rng))
          for m in mv]
    b = max(x[1] for x in sc)
    top = [m for m, g in sc if g == b]
    lo = min(exposure(cards, m[1]) for m in top)
    return rng.choice([m for m in top if exposure(cards, m[1]) == lo])


def pol_random(cards, own, hands, decks, player, empties, cap, rng):
    return rng.choice(moves(cards, own, hands, player, empties))


# ---------------------------------------------------------------------------
# Game
# ---------------------------------------------------------------------------
def play(rng, pols, ab=(None, None), track_affinity=False):
    piles = [[make_card(rng, ab[p]) for _ in range(DECK)] for p in (0, 1)]
    hands = [piles[0][:HANDS[0]], piles[1][:HANDS[1]]]
    decks = [piles[0][HANDS[0]:], piles[1][HANDS[1]:]]
    cards = [None] * NCELLS
    own = [0, 0]
    caps = 0
    uptime = Counter()
    PLAYED[0].clear()
    PLAYED[1].clear()
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = FINAL_CAP if turn == len(ORDER) - 1 else CAP
        if track_affinity:
            for lvl in (1, 2):
                if any(affinity(cards, own, p, e) >= lvl for e in ELEMENTS):
                    uptime[(turn, lvl)] += 1
        mv = pols[p](cards, own, hands, decks, p, empties, cap, rng)
        sig = sigil(hands[p][mv[0]])
        caps += apply_move(cards, own, hands, decks, p, mv, cap, rng)
        PLAYED[p][sig] += 1
        if decks[p]:
            hands[p].append(decks[p].pop(0))
    score = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    return score, caps, uptime


def run(games, pols, ab=(None, None), seed=1234, track=False):
    rng = random.Random(seed)
    w = [0, 0, 0]
    caps = 0
    up = Counter()
    for _ in range(games):
        s, c, u = play(rng, pols, ab, track)
        w[0 if s[0] > s[1] else (1 if s[1] > s[0] else 2)] += 1
        caps += c
        up.update(u)
    n = games
    return dict(p1=w[0] / n, p2=w[1] / n, draw=w[2] / n, caps=caps / n,
                up={k: v / n for k, v in up.items()})


def main():
    print("=" * 76)
    print("A. AFFINITY UPTIME  -- when does the curve actually turn on?")
    print("=" * 76)
    r = run(6000, (pol_greedy, pol_greedy), track=True)
    print("  share of games where a player already controls N of a sigil,")
    print("  measured at the start of each turn:")
    print(f"  {'turn':<6}{'>=1 sigil':>12}{'>=2 sigil':>12}")
    for t in range(9):
        print(f"  {t+1:<6}{pct(r['up'].get((t,1),0)):>12}"
              f"{pct(r['up'].get((t,2),0)):>12}")

    print()
    print("=" * 76)
    print("B. BASELINE (no abilities)")
    print("=" * 76)
    g = run(6000, (pol_greedy, pol_greedy))
    n = run(6000, (pol_normal, pol_normal), seed=99)
    d = run(4000, (pol_normal, pol_greedy), seed=22)
    print(f"  greedy P1 {pct(g['p1'])}  normal P1 {pct(n['p1'])}  "
          f"caps {g['caps']:.2f}  depth {pct(d['p1'])}  draws {pct(g['draw'])}")
    base_depth = d['p1']

    print()
    print("=" * 76)
    print("C. PER-ABILITY  [bar: depth > 60%, power near 51.6%, no draws]")
    print("=" * 76)
    print(f"  {'ability':<12}{'elem':<10}{'cost':<6}{'power':>8}{'depth':>8}"
          f"{'caps':>7}{'draws':>8}  verdict")
    rows = []
    for name, (el, cost, meas) in ABILITIES.items():
        if meas is not True:
            continue
        pw = run(4000, (pol_greedy, pol_greedy), (name, None), seed=7)
        dp = run(3000, (pol_normal, pol_greedy), (name, name), seed=22)
        both = run(4000, (pol_greedy, pol_greedy), (name, name), seed=55)
        verdict = ('keep' if dp['p1'] > 0.60 and both['draw'] < 0.02
                   else 'cut')
        rows.append((name, el, cost, pw['p1'], dp['p1'], both['caps'],
                     both['draw'], verdict))
        print(f"  {name:<12}{el:<10}{'<>'*cost or '-':<6}{pct(pw['p1']):>8}"
              f"{pct(dp['p1']):>8}{both['caps']:>7.2f}"
              f"{pct(both['draw']):>8}  {verdict}")

    print()
    print("=" * 76)
    print("D. NOT MEASURABLE BY THESE BOTS")
    print("=" * 76)
    for name, (el, cost, meas) in ABILITIES.items():
        if meas is True:
            continue
        why = ('removes a card from the board -- breaks the nine-cells-fill '
               'guarantee' if meas == 'breaks-fill'
               else 'defensive or informational; greedy cannot value it')
        print(f"  {name:<12}{el:<10}{'<>'*cost or '-':<6}{why}")


if __name__ == '__main__':
    main()
