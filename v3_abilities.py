#!/usr/bin/env python3
"""
Ability candidates measured against the CURRENT v3 rules (four rotations,
hands 1/2, final card starts no chain).

Design rules, all learned the hard way:
  1. It must add a BRANCH -- optional or targeted. Passive immunities
     measured worse than no ability at all (depth 56.0% -> 55.4%).
  2. It must bend AIMING -- rotation, redirection or reach. That is the
     only axis that ever cleared the depth bar; abilities that moved cards
     around on some other axis failed (Current, 58.9%).
  3. It must not remove a card from the board. That breaks the
     nine-cards-fill-nine-cells guarantee and brings draws back.
  4. Cost is free or one affinity. Two affinity fires in 25-62% of games,
     which is a gamble rather than a price.

Also measures ability DENSITY, to price the proposed "at most N ability
cards in a deck" rule rather than assuming a number.
"""

import itertools
import random
import sys
from collections import Counter

import v3
from v3 import (CARDS, DECK_SIZE, ELEMENTS, HANDS, NAMES, NB, NCELLS,
                OPPSIDE, ORDER, TWIN, beats, pct, rot90)

FIRE, WATER, EARTH, AIR, LIGHTNING, ICE, LIGHT, SHADOW = range(1, 9)

# diagonals, and the edge that points at each
DIAG = []
for i in range(NCELLS):
    r, c = divmod(i, 3)
    row = []
    for dr, dc, near in ((-1, -1, 0), (-1, 1, 0), (1, -1, 2), (1, 1, 2)):
        nr, nc = r + dr, c + dc
        if 0 <= nr < 3 and 0 <= nc < 3:
            row.append((nr * 3 + nc, near))
    DIAG.append(tuple(row))
DIAG = tuple(DIAG)

# the three rows and three columns, as cell masks, for cycloneline
EDGE_CELLS = frozenset((1, 3, 5, 7))

LINES = tuple(
    [sum(1 << (r * 3 + c) for c in range(3)) for r in range(3)]
    + [sum(1 << (r * 3 + c) for r in range(3)) for c in range(3)])

# straight-line cell two away, and the edge pointing at it
LINE = []
for i in range(NCELLS):
    r, c = divmod(i, 3)
    row = []
    for d, (dr, dc) in enumerate(((-1, 0), (0, 1), (1, 0), (0, -1))):
        mr, mc = r + dr, c + dc
        fr, fc = r + 2 * dr, c + 2 * dc
        if 0 <= fr < 3 and 0 <= fc < 3:
            row.append((mr * 3 + mc, fr * 3 + fc, d))
    LINE.append(tuple(row))
LINE = tuple(LINE)

# name -> (element, cost)
ABIL = {
    # the five already measured and shipped
    'conduit':   (LIGHTNING, 0),
    'scorch':    (FIRE, 1),
    'gust':      (AIR, 1),
    'tremor':    (EARTH, 1),
    'eclipse':   (SHADOW, 1),
    # new candidates
    'tide':      (WATER, 1),     # swap with an adjacent card you control
    'glaciate':  (ICE, 1),       # all four edges count as Ice this turn
    'beacon':    (LIGHT, 1),     # hit one neighbour with the edge you choose
    'backlash':  (FIRE, 1),      # reach through one empty cell in a line
    'arc':       (LIGHTNING, 1),  # chain may start from ANY card you control
    'upheaval':  (EARTH, 1),     # rotate this and your neighbours 90
    'umbra':     (SHADOW, 1),    # an enemy's facing edge counts as its twin
    'cyclone':   (AIR, 1),       # rotate every card on the board 90
    'surge':     (LIGHTNING, 1),  # the chain starts from ALL your cards
}
NEW = ['tide', 'glaciate', 'beacon', 'backlash', 'arc', 'upheaval', 'cyclone',
       'umbra']

# Experimental redesigns, deliberately kept OUT of ABIL. The ability
# fixture iterates ABIL and is replayed against game.ts, so an ability the
# TypeScript does not implement would break that test rather than inform
# it. These live here until one of them is chosen and ported.
#
#   scorchany    reach from ANY card you control, including the one just
#                placed -- decouples the payoff from the placement only
#                partly, since the placed card is still a legal source
#   scorchprior  reach from any card you control EXCEPT the one just
#                placed -- full decoupling
#   gustown      Gust restricted to cards YOU control, so it cannot
#                re-aim an enemy's edge into a loss
#   beacon2      Beacon restricted to two edges (the facing one and its
#                opposite) instead of a free choice of all four
#   scorchsafe   as scorchprior, but the source must be a card with NO
#                open edges -- a power dial that also rewards the
#                positional play the game is about
#   beaconopp    Beacon with no choice at all: the single alternative is
#                the edge OPPOSITE the one facing the target. Beacon is
#                already "re-aim when the normal attack would fail",
#                since its reach is a no-op if the chain took the card;
#                its strength is that four edges almost never all fail.
#   surge        PRINCE and TANTALUS as an ability card: the chain starts
#                from EVERY card you control, not just the one placed.
#                As a leader this was a free action worth +15 to +18 and
#                fired on turn 9 in ~78% of games. As a card it costs a
#                placement, which is the whole point of the merge.
#   surge1       the same, but ONE wave rather than a full chain -- this
#                is PRINCE's original form and the obvious power dial
#   surgesafe    the candidate: only your ENTRENCHED cards (no exposed
#                edges) attack. Keeps the multi-wave shape, which the
#                "ninth card starts no chain" rule already disciplines
#                into not wanting the last turn, while cutting the size
#                of the effect and rewarding positional play.
#   blink        Tide with unlimited range: swap with ANY card you
#                control, not just an adjacent one
# ---- pricing candidates, one per hot ability -------------------------
# Each dials the SOURCE of that ability's power, not an arbitrary number.
# Two dials are reused because Conduit and Arc already pay them and are
# the best-priced abilities in the game, which is evidence the costs are
# correctly sized:
#
#   "resolves after the chain"  -- it can no longer set up your own
#                                  capture this turn; it becomes
#                                  disruption instead of enablement
#   "your placed card does not  -- you trade your own attack for the
#    attack"                      effect, exactly as Conduit does
#
#   gustafter     Gust, but the rotation happens after your chain
#   tremorafter   Tremor, likewise
#   cyclonenoatk  Cyclone, but your placed card does not attack
#   beaconnoatk   Beacon, but your placed card does not otherwise attack
#   scorchnoatk   reach from any PRIOR card you control, and your placed
#                 card does not attack (fixes the lure and the power)
#   umbraone      Umbra twins only the ONE edge facing your card
#   tideally      Tide, but the chain starts from the cell you placed on,
#                 so the ally attacks and your card merely relocates
# ---- round two: SCOPE cuts ------------------------------------------
# Round one tried phase and cost dials and both failed. The cost dial
# ("your placed card does not attack") rested on a false premise -- I
# claimed Conduit and Arc pay it, but they REDIRECT the attack rather
# than forfeit it, and forfeiting is ruinous because capture is never in
# doubt. The phase dial made Tremor STRONGER, because rotating before the
# chain also risks exposing your own cards, so moving it after removed a
# cost rather than a benefit.
#
# The one success was umbraone: narrowing the EXTENT of the effect kept
# the power flat but lifted depth from 66.0% to 74.8%. These follow it.
#
#   tremorone    rotate ONE adjacent card 180°, not all four
#   cycloneline  rotate one row or column 90°, not the whole board
#   gustnocap    Gust still resolves before the chain, but the card you
#                rotate is immune to your chain this turn -- surgical
#                removal of the free-capture combo that is its power
# ---- round three: charge CELL FREEDOM -------------------------------
# The only currency left. Rotation cannot be charged -- a deterministic
# self-rotation of k is free, since you just place at (desired - k) and
# get what you wanted. Forfeiting the attack is ruinous. Scope cuts
# either hand you selectivity (a buff) or remove the thinking.
#
# Cell choice is worth 34.8 points of win rate by ablation and CANNOT be
# pre-compensated: a restricted cell set is a real loss.
#
# The restriction is to the EDGE cells (1,3,5,7), not the corners.
# Corners are the cheap cells -- 2 open sides, and the reference bot
# opens on one unprompted in every game. Edge cells carry 3 open sides,
# so requiring one is a genuine exposure cost rather than a free
# redirection.
# ---- deliberately board-volatile, but deterministic and readable ----
# The depth leaders are the abilities that transform the most state:
# Cyclone (all nine rotate) 73.5%, Eclipse 73-75%, Upheaval 73.0%. A big
# visible change is something both players must re-read, which rewards
# reading. Randomness would add chaos without that.
#
#   quake      every card on the board turns 180 degrees
#   inversion  EVERY card's edges become their twins -- board-wide
#              Eclipse. Twin-flip is an involution, so the board stays
#              legal and the change is perfectly reversible to reason
#              about
EXPERIMENTAL = {
    'quake':       (EARTH, 1),
    'inversion':   (SHADOW, 1),
    'cycloneedge': (AIR, 1),
    'tremoredge':  (EARTH, 1),
    'beaconedge':  (LIGHT, 1),
    'tideedge':    (WATER, 1),
    'scorchedge':  (FIRE, 1),
    'tremorone':   (EARTH, 1),
    'cycloneline': (AIR, 1),
    'gustnocap':   (AIR, 1),
    'gustafter':   (AIR, 1),
    'tremorafter': (EARTH, 1),
    'cyclonenoatk': (AIR, 1),
    'beaconnoatk': (LIGHT, 1),
    'scorchnoatk': (FIRE, 1),
    'umbraone':    (SHADOW, 1),
    'tideally':    (WATER, 1),
    'blink':       (WATER, 1),
    'surge1':      (LIGHTNING, 1),
    'surgesafe':   (LIGHTNING, 1),
    'scorchany':   (FIRE, 1),
    'scorchprior': (FIRE, 1),
    'scorchsafe':  (FIRE, 1),
    'gustown':     (AIR, 1),
    'beacon2':     (LIGHT, 1),
    'beaconopp':   (LIGHT, 1),
}
ALL_ABIL = {**ABIL, **EXPERIMENTAL}

edges = lambda c: c[0]
sigil = lambda c: c[1]
abil = lambda c: c[2]
PLAYED = [Counter(), Counter()]


def make_card(rng, ability=None):
    return (rng.choice(CARDS), rng.choice(ELEMENTS), ability)


def with_edges(card, e):
    return (e, card[1], card[2])


def live(player, card):
    a = abil(card)
    if not a:
        return False
    el, cost = ALL_ABIL[a]
    return PLAYED[player][el] >= cost


def cascade(cards, own, origin, player, cap):
    opp = 1 - player
    frontier, captured, depth = origin, 0, 0
    while frontier and depth <= cap:
        newly = 0
        for src in range(NCELLS):
            if not (frontier >> src) & 1 or cards[src] is None:
                continue
            se = edges(cards[src])
            for d in range(4):
                t = NB[src][d]
                if t < 0 or not (own[opp] >> t) & 1 or cards[t] is None:
                    continue
                if beats(se[d], edges(cards[t])[OPPSIDE[d]]):
                    newly |= 1 << t
        if newly:
            own[player] |= newly
            own[opp] &= ~newly
            captured += bin(newly).count('1')
        frontier = newly
        depth += 1
    return captured


def options(cards, own, player, card, cell):
    """Every ability choice for this placement, plus declining."""
    if not live(player, card):
        return [None]
    a = abil(card)
    out = [None]
    mine, theirs = own[player], own[1 - player]
    if a in ('eclipse', 'tremor', 'glaciate', 'cyclone', 'upheaval',
             'surge', 'surge1', 'quake', 'inversion'):
        out.append(('use',))
    elif a == 'gust':
        out += [('gust', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and cards[NB[cell][d]]]
    elif a == 'blink':
        out += [('tide', t) for t in range(NCELLS) if (mine >> t) & 1]
    elif a == 'surgesafe':
        def _filled(i):
            return cards[i] is not None or i == cell

        def _ent(s_):
            return all(NB[s_][d] < 0 or _filled(NB[s_][d]) for d in range(4))
        if any(((mine >> s_) & 1 or s_ == cell) and _filled(s_) and _ent(s_)
               for s_ in range(NCELLS)):
            out.append(('use',))
    elif a == 'cycloneedge':
        if cell in EDGE_CELLS:
            out.append(('use',))
    elif a == 'tremoredge':
        if cell in EDGE_CELLS:
            out.append(('use',))
    elif a == 'beaconedge':
        if cell in EDGE_CELLS:
            for d in range(4):
                t = NB[cell][d]
                if t < 0 or not (theirs >> t) & 1 or cards[t] is None:
                    continue
                for e in range(4):
                    out.append(('beacon', t, d, e))
    elif a == 'tideedge':
        if cell in EDGE_CELLS:
            out += [('tide', t) for d in range(4)
                    for t in (NB[cell][d],)
                    if t >= 0 and (mine >> t) & 1]
    elif a == 'scorchedge':
        if cell in EDGE_CELLS:
            for src in [s_ for s_ in range(NCELLS)
                        if (mine >> s_) & 1 and cards[s_]]:
                for t, near in DIAG[src]:
                    if cards[t] and (theirs >> t) & 1:
                        out.append(('scorchnoatk', src, t, near))
    elif a == 'tremorone':
        out += [('tremorone', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and cards[NB[cell][d]]]
    elif a == 'cycloneline':
        out += [('cycloneline', i) for i, m in enumerate(LINES)
                if any(cards[t] for t in range(NCELLS) if (m >> t) & 1)]
    elif a == 'gustnocap':
        out += [('gust', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and cards[NB[cell][d]]]
    elif a == 'gustafter':
        out += [('gust', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and cards[NB[cell][d]]]
    elif a == 'tremorafter':
        out.append(('use',))
    elif a == 'cyclonenoatk':
        out.append(('use',))
    elif a == 'umbraone':
        out += [('umbra', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and (theirs >> NB[cell][d]) & 1]
    elif a == 'tideally':
        out += [('tide', t) for d in range(4)
                for t in (NB[cell][d],)
                if t >= 0 and (mine >> t) & 1]
    elif a == 'beaconnoatk':
        for d in range(4):
            t = NB[cell][d]
            if t < 0 or not (theirs >> t) & 1 or cards[t] is None:
                continue
            for e in range(4):
                out.append(('beacon', t, d, e))
    elif a == 'scorchnoatk':
        srcs = [s_ for s_ in range(NCELLS) if (mine >> s_) & 1 and cards[s_]]
        for src in srcs:
            for t, near in DIAG[src]:
                if cards[t] and (theirs >> t) & 1:
                    out.append(('scorchnoatk', src, t, near))
    elif a == 'gustown':
        out += [('gust', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and cards[NB[cell][d]]
                and (mine >> NB[cell][d]) & 1]
    elif a in ('scorchany', 'scorchprior', 'scorchsafe'):
        srcs = [s for s in range(NCELLS) if (mine >> s) & 1 and cards[s]]
        if a == 'scorchany':
            srcs.append(cell)        # not in `mine` yet; it lands below
        if a == 'scorchsafe':
            # only entrenched cards: every orthogonal neighbour filled
            srcs = [s for s in srcs
                    if all(NB[s][d] < 0 or cards[NB[s][d]] is not None
                           for d in range(4))]
        for src in srcs:
            for t, near in DIAG[src]:
                if cards[t] and (theirs >> t) & 1:
                    out.append((a, src, t, near))
    elif a in ('beacon2', 'beaconopp'):
        for d in range(4):
            t = NB[cell][d]
            if t < 0 or not (theirs >> t) & 1 or cards[t] is None:
                continue
            picks = (d, OPPSIDE[d]) if a == 'beacon2' else (OPPSIDE[d],)
            for e in picks:
                out.append((a, t, d, e))
    elif a == 'conduit':
        out += [('conduit', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and (mine >> NB[cell][d]) & 1]
    elif a == 'arc':
        out += [('arc', t) for t in range(NCELLS)
                if (mine >> t) & 1 and t != cell]
    elif a == 'scorch':
        out += [('scorch', t, near) for t, near in DIAG[cell]
                if cards[t] and (theirs >> t) & 1]
    elif a == 'backlash':
        out += [('backlash', far, d) for mid, far, d in LINE[cell]
                if cards[mid] is None and cards[far] and (theirs >> far) & 1]
    elif a == 'tide':
        out += [('tide', t) for d in range(4)
                for t in (NB[cell][d],)
                if t >= 0 and (mine >> t) & 1]
    elif a == 'beacon':
        for d in range(4):
            t = NB[cell][d]
            if t < 0 or not (theirs >> t) & 1 or cards[t] is None:
                continue
            for e in range(4):
                out.append(('beacon', t, d, e))
    elif a == 'umbra':
        out += [('umbra', NB[cell][d]) for d in range(4)
                if NB[cell][d] >= 0 and (theirs >> NB[cell][d]) & 1]
    return out


def apply_move(cards, own, hands, decks, player, mv, cap, rng):
    i, cell, oe, opt = mv
    card = with_edges(hands[player][i], oe)
    a = abil(card) if live(player, card) else None
    kind = opt[0] if opt else None

    # --- modifiers that resolve BEFORE any comparison ---------------------
    if a == 'eclipse' and kind == 'use':
        card = with_edges(card, tuple(TWIN[x] for x in edges(card)))
    if a == 'glaciate' and kind == 'use':
        card = with_edges(card, (ICE, ICE, ICE, ICE))
    if a == 'tremorone' and kind == 'tremorone':
        t = opt[1]
        cards[t] = with_edges(cards[t], rot90(rot90(edges(cards[t]))))
    if a == 'cycloneline' and kind == 'cycloneline':
        m = LINES[opt[1]]
        for t in range(NCELLS):
            if (m >> t) & 1 and cards[t]:
                cards[t] = with_edges(cards[t], rot90(edges(cards[t])))
    if a in ('gust', 'gustown', 'gustnocap') and kind == 'gust':
        t = opt[1]
        cards[t] = with_edges(cards[t], rot90(edges(cards[t])))
    if a == 'tremoredge' and kind == 'use':
        for d in range(4):
            t = NB[cell][d]
            if t >= 0 and cards[t]:
                cards[t] = with_edges(cards[t],
                                      rot90(rot90(edges(cards[t]))))
    if a == 'tremor' and kind == 'use':
        for d in range(4):
            t = NB[cell][d]
            if t >= 0 and cards[t]:
                cards[t] = with_edges(cards[t], rot90(rot90(edges(cards[t]))))
    if a == 'cycloneedge' and kind == 'use':
        for t in range(NCELLS):
            if cards[t]:
                cards[t] = with_edges(cards[t], rot90(edges(cards[t])))
    if a == 'cyclonenoatk' and kind == 'use':
        for t in range(NCELLS):
            if cards[t]:
                cards[t] = with_edges(cards[t], rot90(edges(cards[t])))
    if a == 'quake' and kind == 'use':
        for t in range(NCELLS):
            if cards[t]:
                cards[t] = with_edges(cards[t],
                                      rot90(rot90(edges(cards[t]))))
    if a == 'inversion' and kind == 'use':
        for t in range(NCELLS):
            if cards[t]:
                cards[t] = with_edges(
                    cards[t], tuple(TWIN[x] for x in edges(cards[t])))
    if a == 'cyclone' and kind == 'use':
        for t in range(NCELLS):
            if cards[t]:
                cards[t] = with_edges(cards[t], rot90(edges(cards[t])))
    if a == 'upheaval' and kind == 'use':
        card = with_edges(card, rot90(edges(card)))
        for d in range(4):
            t = NB[cell][d]
            if t >= 0 and cards[t] and (own[player] >> t) & 1:
                cards[t] = with_edges(cards[t], rot90(edges(cards[t])))
    if a == 'umbraone' and kind == 'umbra':
        t = opt[1]
        d = next(k for k in range(4) if NB[cell][k] == t)
        e = list(edges(cards[t]))
        e[OPPSIDE[d]] = TWIN[e[OPPSIDE[d]]]
        cards[t] = with_edges(cards[t], tuple(e))
    if a == 'umbra' and kind == 'umbra':
        t = opt[1]
        cards[t] = with_edges(cards[t],
                              tuple(TWIN[x] for x in edges(cards[t])))

    hands[player].pop(i)
    cards[cell] = card
    own[player] |= 1 << cell

    if a in ('tide', 'blink', 'tideally', 'tideedge') and kind == 'tide':
        t = opt[1]
        cards[cell], cards[t] = cards[t], cards[cell]

    # Where the chain starts. For Tide this is the cell the placed card
    # MOVED TO, not the cell it was played on -- the card text is "swap this
    # card's position with an adjacent card you control", so the card
    # travels and then attacks from its new home. Starting the chain from
    # the vacated cell instead makes Tide a quite different ability (your
    # ally attacks, not your card), and that is what this oracle used to do
    # while game.ts did the other thing. The ability fixture caught it.
    origin = 1 << cell
    if a in ('conduit', 'arc') and kind in ('conduit', 'arc'):
        origin = 1 << opt[1]
    if a in ('tide', 'blink') and kind == 'tide':
        origin = 1 << opt[1]
    if a in ('surge', 'surge1') and kind == 'use':
        origin = own[player]          # every card you control attacks
        if a == 'surge1':
            cap = 0                   # one wave, no chain from it
    if a in ('cyclonenoatk', 'beaconnoatk', 'scorchnoatk') and kind:
        origin = 0                    # you trade your attack for the effect
    if a == 'tideally' and kind == 'tide':
        origin = 1 << cell            # the ally attacks; your card relocates
    if a == 'surgesafe' and kind == 'use':
        # computed here, not in options(), because the card has already
        # landed by this point and that is what entrenchment depends on
        origin = 0
        for s_ in range(NCELLS):
            if not (own[player] >> s_) & 1 or cards[s_] is None:
                continue
            if all(NB[s_][d] < 0 or cards[NB[s_][d]] is not None
                   for d in range(4)):
                origin |= 1 << s_
    # gustnocap: the card you re-aimed cannot be taken by this turn's
    # chain. Implemented by lifting it out of the opponent's mask for the
    # duration, which the cascade reads, then putting it back.
    shield = 0
    if a == 'gustnocap' and kind == 'gust':
        shield = (1 << opt[1]) & own[1 - player]
        own[1 - player] &= ~shield
    got = cascade(cards, own, origin, player, cap)
    own[1 - player] |= shield

    # --- reach, which resolves AFTER the chain ----------------------------
    # The attacker is always the PLACED card's edges, read from `card`
    # rather than from the board. Reading the board would be wrong for any
    # ability that moved the card, which is unreachable today only because
    # no card carries both Tide and a reach ability.
    placed_edges = edges(card)
    for key in ('scorch', 'backlash'):
        if a == key and kind == key:
            t = opt[1]
            near = opt[2]
            if cards[t] and (own[1 - player] >> t) & 1 and \
                    beats(placed_edges[near],
                          edges(cards[t])[OPPSIDE[near]]):
                own[player] |= 1 << t
                own[1 - player] &= ~(1 << t)
                got += 1
    if a == 'gustafter' and kind == 'gust':
        t = opt[1]
        cards[t] = with_edges(cards[t], rot90(edges(cards[t])))
    if a == 'tremorafter' and kind == 'use':
        for d in range(4):
            t = NB[cell][d]
            if t >= 0 and cards[t]:
                cards[t] = with_edges(cards[t], rot90(rot90(edges(cards[t]))))
    if a in ('scorchnoatk', 'scorchedge') and kind == 'scorchnoatk':
        src, t, near = opt[1], opt[2], opt[3]
        if cards[src] and cards[t] and (own[1 - player] >> t) & 1 and \
                beats(edges(cards[src])[near], edges(cards[t])[OPPSIDE[near]]):
            own[player] |= 1 << t
            own[1 - player] &= ~(1 << t)
            got += 1
    if a in ('beacon', 'beacon2', 'beaconopp', 'beaconnoatk',
             'beaconedge') and \
            kind in ('beacon', 'beacon2', 'beaconopp'):
        t, d, e = opt[1], opt[2], opt[3]
        if cards[t] and (own[1 - player] >> t) & 1 and \
                beats(placed_edges[e], edges(cards[t])[OPPSIDE[d]]):
            own[player] |= 1 << t
            own[1 - player] &= ~(1 << t)
            got += 1
    # Reach from an arbitrary card you control. The attacker's edges are
    # read off the BOARD, not from `card`, because the source may be any
    # of your cards rather than the one just placed. Orientations never
    # change during a chain, so a post-chain read is safe.
    if a in ('scorchany', 'scorchprior', 'scorchsafe') and kind == a:
        src, t, near = opt[1], opt[2], opt[3]
        if cards[src] and cards[t] and (own[1 - player] >> t) & 1 and \
                beats(edges(cards[src])[near], edges(cards[t])[OPPSIDE[near]]):
            own[player] |= 1 << t
            own[1 - player] &= ~(1 << t)
            got += 1
    return got


def moves(cards, own, hands, player, empties):
    out = []
    for i, card in enumerate(hands[player]):
        e = edges(card)
        for _ in range(4):
            for cell in empties:
                for opt in options(cards, own, player, with_edges(card, e),
                                   cell):
                    out.append((i, cell, e, opt))
            e = rot90(e)
    return out


def snap(cards, own, hands, decks):
    return ([c for c in cards], own[:], [h[:] for h in hands],
            [d[:] for d in decks])


def probe(cards, own, hands, decks, player, mv, cap, rng):
    c, o, h, d = snap(cards, own, hands, decks)
    return apply_move(c, o, h, d, player, mv, cap, rng)


def exposure(cards, cell):
    return sum(1 for d in range(4)
               if NB[cell][d] >= 0 and cards[NB[cell][d]] is None)


def pol_greedy(cards, own, hands, decks, player, empties, cap, rng):
    mv = moves(cards, own, hands, player, empties)
    sc = [(m, probe(cards, own, hands, decks, player, m, cap, rng))
          for m in mv]
    b = max(x[1] for x in sc)
    return rng.choice([m for m, g in sc if g == b])


def pol_normal(cards, own, hands, decks, player, empties, cap, rng):
    mv = moves(cards, own, hands, player, empties)
    sc = [(m, probe(cards, own, hands, decks, player, m, cap, rng))
          for m in mv]
    b = max(x[1] for x in sc)
    top = [m for m, g in sc if g == b]
    lo = min(exposure(cards, m[1]) for m in top)
    return rng.choice([m for m in top if exposure(cards, m[1]) == lo])


def build_deck(rng, ability, n_abil):
    """n_abil cards carry `ability`; the rest carry none."""
    deck = [make_card(rng, ability) for _ in range(n_abil)]
    deck += [make_card(rng, None) for _ in range(DECK_SIZE - n_abil)]
    rng.shuffle(deck)
    return deck


def play(rng, pols, abils, counts):
    piles = [build_deck(rng, abils[p], counts[p]) for p in (0, 1)]
    hands = [piles[0][:HANDS[0]], piles[1][:HANDS[1]]]
    decks = [piles[0][HANDS[0]:], piles[1][HANDS[1]:]]
    cards = [None] * NCELLS
    own = [0, 0]
    PLAYED[0].clear()
    PLAYED[1].clear()
    caps = 0
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = v3.FINAL_CASCADE_CAP if turn == len(ORDER) - 1 \
            else v3.CASCADE_CAP
        mv = pols[p](cards, own, hands, decks, p, empties, cap, rng)
        sg = sigil(hands[p][mv[0]])
        caps += apply_move(cards, own, hands, decks, p, mv, cap, rng)
        PLAYED[p][sg] += 1
        if decks[p]:
            hands[p].append(decks[p].pop(0))
    return ([bin(own[0]).count('1'), bin(own[1]).count('1')], caps)


def run(games, pols, abils, counts, seed=4242):
    rng = random.Random(seed)
    w = [0, 0]
    caps = 0
    close = 0
    for _ in range(games):
        s, c = play(rng, pols, abils, counts)
        w[0 if s[0] > s[1] else 1] += 1
        caps += c
        if abs(s[0] - s[1]) == 1:
            close += 1
    n = games
    return w[0] / n, w[1] / n, caps / n, close / n


def main():
    D = DECK_SIZE
    print("=" * 80)
    print(f"A. BASELINE  (no abilities, deck of {D}, hands {HANDS})")
    print("=" * 80)
    g = run(6000, (pol_greedy, pol_greedy), (None, None), (0, 0))
    n = run(6000, (pol_normal, pol_normal), (None, None), (0, 0), seed=8080)
    d = run(4000, (pol_normal, pol_greedy), (None, None), (0, 0), seed=22)
    print(f"  greedy P1 {pct(g[0])}  normal P1 {pct(n[0])}  "
          f"caps {g[2]:.2f}  1-card {pct(g[3])}  depth {pct(d[0])}")
    base_depth = d[0]

    print()
    print("=" * 80)
    print("B. EVERY ABILITY, 5 copies in a 12-card deck  [bar: depth > 60%]")
    print("=" * 80)
    print(f"  {'ability':<10}{'elem':<10}{'cost':<6}{'power':>8}{'depth':>8}"
          f"{'caps':>7}  verdict")
    rows = []
    for name in list(ABIL):
        el, cost = ABIL[name]
        pw = run(3000, (pol_greedy, pol_greedy), (name, None), (5, 0), seed=7)
        dp = run(2200, (pol_normal, pol_greedy), (name, name), (5, 5), seed=22)
        bo = run(3000, (pol_greedy, pol_greedy), (name, name), (5, 5), seed=55)
        ok = dp[0] > 0.60 and 0.42 <= pw[0] <= 0.60
        rows.append((name, el, cost, pw[0], dp[0], bo[2], ok))
        tag = 'keep' if ok else ('TOO STRONG' if pw[0] > 0.60
                                 else ('trap' if pw[0] < 0.42 else 'shallow'))
        print(f"  {name:<10}{NAMES[el]:<10}{('<>'*cost or 'free'):<6}"
              f"{pct(pw[0]):>8}{pct(dp[0]):>8}{bo[2]:>7.2f}  {tag}")

    print()
    print("=" * 80)
    print(f"C. ABILITY DENSITY -- how many in a {D}-card deck is too many?")
    print("=" * 80)
    print("  both players run the same count of a mixed ability pool")
    print(f"  {'count':<7}{'greedy edge':>13}{'normal edge':>13}{'worst':>8}"
          f"{'caps':>7}{'1-card':>9}{'depth':>8}")
    keep = [r[0] for r in rows if r[6]] or list(ABIL)

    def mixed(rng, n_abil):
        deck = [make_card(rng, rng.choice(keep)) for _ in range(n_abil)]
        deck += [make_card(rng, None) for _ in range(D - n_abil)]
        rng.shuffle(deck)
        return deck

    def play_mixed(rng, pols, counts):
        piles = [mixed(rng, counts[p]) for p in (0, 1)]
        hands = [piles[0][:HANDS[0]], piles[1][:HANDS[1]]]
        decks = [piles[0][HANDS[0]:], piles[1][HANDS[1]:]]
        cards = [None] * NCELLS
        own = [0, 0]
        PLAYED[0].clear()
        PLAYED[1].clear()
        caps = 0
        for turn, p in enumerate(ORDER):
            empties = [i for i in range(NCELLS) if cards[i] is None]
            if not empties or not hands[p]:
                continue
            cap = v3.FINAL_CASCADE_CAP if turn == len(ORDER) - 1 \
                else v3.CASCADE_CAP
            mv = pols[p](cards, own, hands, decks, p, empties, cap, rng)
            sg = sigil(hands[p][mv[0]])
            caps += apply_move(cards, own, hands, decks, p, mv, cap, rng)
            PLAYED[p][sg] += 1
            if decks[p]:
                hands[p].append(decks[p].pop(0))
        return [bin(own[0]).count('1'), bin(own[1]).count('1')], caps

    def run_mixed(games, pols, counts, seed=99):
        rng = random.Random(seed)
        w = [0, 0]
        caps = 0
        close = 0
        for _ in range(games):
            s, c = play_mixed(rng, pols, counts)
            w[0 if s[0] > s[1] else 1] += 1
            caps += c
            if abs(s[0] - s[1]) == 1:
                close += 1
        return w[0] / games, w[1] / games, caps / games, close / games

    for k in (0, 2, 4, 5, 6, 8, 12):
        g2 = run_mixed(3000, (pol_greedy, pol_greedy), (k, k))
        n2 = run_mixed(3000, (pol_normal, pol_normal), (k, k), seed=8080)
        d2 = run_mixed(2200, (pol_normal, pol_greedy), (k, k), seed=22)
        eg, en = g2[1] - g2[0], n2[1] - n2[0]
        print(f"  {k:<7}{pct(eg):>13}{pct(en):>13}"
              f"{pct(max(abs(eg), abs(en))):>8}{g2[2]:>7.2f}"
              f"{pct(g2[3]):>9}{pct(d2[0]):>8}")

    print()
    print("=" * 80)
    print("D. ASYMMETRIC DENSITY -- does running MORE abilities just win?")
    print("=" * 80)
    print(f"  {'P1 count':<10}{'P2 count':<10}{'P1 win':>9}")
    for a, b in ((12, 0), (8, 4), (6, 5), (5, 5), (5, 0), (2, 5)):
        r = run_mixed(3000, (pol_greedy, pol_greedy), (a, b), seed=5)
        print(f"  {a:<10}{b:<10}{pct(r[0]):>9}")


if __name__ == '__main__':
    main()
