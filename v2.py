#!/usr/bin/env python3
"""
Cascade v2: deployment and command.

Phase I  -- The Convergence. Nine placements, alternating, P1 first.
            Direct matching captures only. No abilities, no chains.
Phase II -- The Dominion. No new cards. Six commands, alternating,
            P2 FIRST, so P1 commands last. A command is: pick a card you
            control, optionally use its ability, attack adjacent enemies
            from the appropriate card, then let one newly captured card
            make a single follow-up attack. Score after the sixth.

Two rules the proposal leaves open, so both are parameters here rather
than silently decided:

  followup_needs_multi
      The text says "if you capture multiple cards, choose one newly
      captured card to make a follow-up". Read strictly that denies a
      follow-up to a single capture; read loosely it only explains how
      to pick one. Measured both ways.

  exhaust
      Nothing in the proposal stops you commanding the same strong card
      all three times. 'none' allows it, 'round' forbids reusing your
      previous pick, 'once' allows each card one command per game.

The geometry, sigils and matching rule are shared with v1 via proto.py,
so this is a different game on a verified engine rather than a second
engine that could disagree with the first.
"""

import itertools
import random
import sys
from collections import Counter

import proto as P

ABILITIES = ('pivot', 'exchange', 'relay', 'prism')
PHASE2 = 6          # commands


def deal_for(cells=None):
    """Hands big enough to fill the board, plus one spare each so the
    last placement is still a choice, plus two never dealt.

    Getting this wrong is silent: short hands leave cells empty and the
    board never fills, which looks like a balance finding rather than a
    bookkeeping error."""
    n = len(P.ORDER) if cells is None else cells
    p1 = (n + 1) // 2
    p2 = n // 2
    hands = (p1 + 1, p2 + 1)
    return hands, sum(hands) + 2


# ---------------------------------------------------------------------------
# Phase I: placement, direct captures only
# ---------------------------------------------------------------------------
def direct(cards, own, src, player, locked=None):
    """Captures made by `src` attacking its neighbours. No chain.

    A `locked` cell has already changed hands this phase and cannot
    change again. That is what lets a gain accumulate: without it every
    capture is immediately reciprocal and the phase nets to nothing."""
    opp = 1 - player
    got = []
    for d in range(4):
        t = P.NB[src][d]
        if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
            continue
        if locked is not None and t in locked:
            continue
        if cards[src][d] == cards[t][P.OPPSIDE[d]]:
            got.append(t)
    return got


def apply_direct(cards, own, src, player, targets, locked=None):
    opp = 1 - player
    for t in targets:
        own[player] |= 1 << t
        own[opp] &= ~(1 << t)
        if locked is not None:
            locked.add(t)
    return len(targets)


def place_options(cards, own, hands, player, empties):
    """(hand index, cell, rotated card) for every legal placement."""
    for i, (card, _ab) in enumerate(hands[player]):
        e = card
        for _ in range(4):
            for cell in empties:
                yield i, cell, e
            e = P.rot90(e)


def phase1(cards, own, hands, abil, rng, greed=1.0):
    """Fills the board. `abil` is written as cards land: Phase II needs to
    know which ability each cell carries, and a card's ability cannot be
    recovered from its sigils afterwards."""
    caps = 0
    for turn in range(len(P.ORDER)):
        player = turn % 2
        empties = [i for i in range(P.NCELLS) if cards[i] is None]
        if not empties or not hands[player]:
            continue
        best, ties = None, []
        for i, cell, e in place_options(cards, own, hands, player, empties):
            c2 = [x for x in cards]
            o2 = own[:]
            c2[cell] = e
            o2[player] |= 1 << cell
            got = len(direct(c2, o2, cell, player))
            # `greed` lets the deployment bot be told to value captures
            # less than reach, which is the crude stand-in for "building
            # a position" that a one-ply bot can manage
            reach = sum(1 for d in range(4)
                        if P.NB[cell][d] >= 0 and c2[P.NB[cell][d]] is None)
            s = greed * got + 0.15 * reach
            if best is None or s > best:
                best, ties = s, [(i, cell, e)]
            elif s == best:
                ties.append((i, cell, e))
        i, cell, e = rng.choice(ties)
        _card, ability = hands[player].pop(i)
        cards[cell] = e
        abil[cell] = ability
        own[player] |= 1 << cell
        caps += apply_direct(cards, own, cell, player,
                             direct(cards, own, cell, player))
    return caps


# ---------------------------------------------------------------------------
# Phase II: command
# ---------------------------------------------------------------------------
def command_options(cards, own, player, abil, src):
    """Every way to command the card on `src`. Yields (opt, describe)."""
    mine = own[player]
    yield None
    ab = abil.get(src)
    if ab is None:
        return
    if ab == 'pivot':
        for d in range(4):
            t = P.NB[src][d]
            if t >= 0 and cards[t] is not None:
                yield ('pivot', t)
    elif ab in ('exchange', 'relay'):
        for d in range(4):
            t = P.NB[src][d]
            if t >= 0 and cards[t] is not None and (mine >> t) & 1:
                yield (ab, t)
    elif ab == 'prism':
        for e in range(4):
            yield ('prism', e)


def run_command(cards, own, abil, player, src, opt, followup_needs_multi,
                only_edge=None, locked=None):
    """Resolve one command on a working copy. Returns captures.

    `only_edge` restricts the attack to a single chosen direction. On a
    full board an unrestricted command reaches up to four neighbours at
    once, which is most of a nine-card opponent's position -- see
    measure_v2.py section A for what that does to the last mover."""
    opp = 1 - player
    attacker = src
    wild = None
    if opt is not None:
        kind = opt[0]
        if kind == 'pivot':
            cards[opt[1]] = P.rot90(cards[opt[1]])
        elif kind == 'exchange':
            t = opt[1]
            cards[src], cards[t] = cards[t], cards[src]
            abil[src], abil[t] = abil.get(t), abil.get(src)
            attacker = t
        elif kind == 'relay':
            attacker = opt[1]
        elif kind == 'prism':
            wild = (src, opt[1])

    got = []
    dirs = range(4) if only_edge is None else (only_edge,)
    for d in dirs:
        t = P.NB[attacker][d]
        if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
            continue
        if locked is not None and t in locked:
            continue
        if (wild is not None and wild == (attacker, d)) \
                or cards[attacker][d] == cards[t][P.OPPSIDE[d]]:
            got.append(t)
    n = apply_direct(cards, own, attacker, player, got, locked)
    if not got:
        return 0
    if followup_needs_multi and len(got) < 2:
        return n
    # one newly captured card makes a single follow-up attack; the player
    # picks whichever takes most
    best = 0
    for f in got:
        best = max(best, len(direct(cards, own, f, player, locked)))
    if best:
        for f in got:
            extra = direct(cards, own, f, player, locked)
            if len(extra) == best:
                n += apply_direct(cards, own, f, player, extra, locked)
                break
    return n


def phase2(cards, own, abil, rng, *, commands=PHASE2, exhaust='none',
           followup_needs_multi=False, one_edge=False, p2_first=True,
           lock=False, track=None, passes=None):
    """Returns captures. `p2_first` decides who opens; with an even
    command count the other player closes. Holding the count fixed and
    flipping this is the only way to measure the last mover without also
    changing how many commands each player gets."""
    caps = 0
    used = {0: set(), 1: set()}
    last = {0: None, 1: None}
    locked = set() if lock else None
    for k in range(commands):
        player = (1 - (k % 2)) if p2_first else (k % 2)
        mine = [c for c in range(P.NCELLS)
                if cards[c] is not None and (own[player] >> c) & 1]
        if exhaust == 'once':
            mine = [c for c in mine if c not in used[player]]
        elif exhaust == 'round':
            mine = [c for c in mine if c != last[player]] or mine
        if not mine:
            # nothing on the board to command; the turn is consumed
            if passes is not None:
                passes[player] += 1
            continue
        best, ties = None, []
        edges = range(4) if one_edge else (None,)
        for src in mine:
            for opt in command_options(cards, own, player, abil, src):
                for e in edges:
                    c2 = [x for x in cards]
                    o2 = own[:]
                    a2 = dict(abil)
                    got = run_command(c2, o2, a2, player, src, opt,
                                      followup_needs_multi, e,
                                      set(locked) if lock else None)
                    if best is None or got > best:
                        best, ties = got, [(src, opt, e)]
                    elif got == best:
                        ties.append((src, opt, e))
        src, opt, edge = rng.choice(ties)
        used[player].add(src)
        last[player] = src
        n = run_command(cards, own, abil, player, src, opt,
                        followup_needs_multi, edge, locked)
        caps += n
        if track is not None:
            track[n] += 1
    return caps


# ---------------------------------------------------------------------------
# a whole game
# ---------------------------------------------------------------------------
def build_deck(rng, size):
    deck = []
    for i in range(size):
        deck.append((rng.choice(P.BY_SHAPE['versatile']),
                     ABILITIES[i % len(ABILITIES)]))
    rng.shuffle(deck)
    return deck


def play(rng, *, commands=PHASE2, exhaust='none',
         followup_needs_multi=False, one_edge=False, p2_first=True,
         lock=False, greed=1.0, track=None, passes=None, hands=None,
         deck_size=None):
    hsz, dsz = deal_for()
    if hands is not None:
        hsz = hands
        dsz = deck_size if deck_size is not None else sum(hands) + 2
    deck = build_deck(rng, dsz)
    hands = [list(deck[:hsz[0]]), list(deck[hsz[0]:sum(hsz)])]
    cards = [None] * P.NCELLS
    own = [0, 0]
    abil = {}
    c1 = phase1(cards, own, hands, abil, rng, greed=greed)
    mid = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    c2 = phase2(cards, own, abil, rng, commands=commands, exhaust=exhaust,
                followup_needs_multi=followup_needs_multi,
                one_edge=one_edge, p2_first=p2_first, lock=lock,
                track=track, passes=passes)
    end = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    return mid, end, c1, c2
