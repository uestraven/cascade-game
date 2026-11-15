#!/usr/bin/env python3
"""
Cascade v2.2: five abilities designed from intended experience.

The two-phase structure is held fixed as the verified baseline (3x4,
twelve placements, six cards each, Dominion opening with P2, six
commands). The four old abilities are discarded rather than rebalanced:
all of them only modified HOW you attack, so switching every one off
cost 1.5 captures out of 17 and 1.7 points of reversal.

What each of these is FOR, and the rules text as implemented:

  SANCTUARY   the Guardian -- "I built a stronghold you had to dismantle"
              Passive, Convergence. Cannot be captured while it has at
              least two adjacent friendly characters.

  USURP       the Empress -- "I turned your own formation against you"
              Active, Dominion. Choose an adjacent enemy. It attacks its
              OWN owner's neighbours on your behalf, by normal matching.
              Captures are yours. The usurped card does not change
              hands.

  TRANSPOSE   the Weaver -- "I rearranged the battlefield"
              Active, Dominion. Swap two cards that are adjacent to each
              other, one of which must be adjacent to the Weaver.
              Orientations and owners travel with them. No capture.

  RETRIBUTION the Justiciar -- "your easy capture cost you"
              Passive, Dominion. When this card is captured, its FORMER
              owner immediately attacks one card adjacent to it, chosen
              by them, using this card's edges by normal matching. The
              card itself stays with its captor. Once per opposing
              command.

  RECLAIM     the Shepherd -- "I took back what was mine"
              Active, Dominion. Choose a card you previously owned that
              the opponent now holds and that is adjacent to a card you
              control. Take it back with no sigil comparison.

  PLAIN       the control. Attack every edge by matching, follow-up only
              after a multiple capture. This is what v2.1 shipped minus
              its ability, and it is the bar every design above has to
              clear.

Three of these need state the engine did not have: a protection check
during Convergence, provenance (who owned a card before), and a
reactive trigger fired by the OPPONENT's command. Retribution is the
first reactive ability in Cascade at all.
"""

import random
import sys
from collections import Counter

import proto as P

# Two slots, not one list. A character has a Convergence TRAIT and a
# Dominion COMMAND, and they are different kinds of thing: a trait is
# passive or deployment-triggered and expires when Convergence ends, a
# command is an action chosen on your turn. Either slot may be empty.
TRAITS = (None, 'sanctuary', 'retribution')
COMMANDS_SET = ('plain', 'usurp', 'usurp_one', 'transpose', 'reclaim',
                'reclaim_recent')

#: a roster entry is (trait, command); decks cycle through one
Roster = tuple

BOARD = (3, 4, (6, 6), 12)
HANDS = (6, 6)
COMMANDS = 6


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def friends_adj(own, cards, cell, player):
    n = 0
    for d in range(4):
        t = P.NB[cell][d]
        if t >= 0 and cards[t] is not None and (own[player] >> t) & 1:
            n += 1
    return n


def protected(cards, own, passive, cell, owner, phase):
    """Sanctuary: a Convergence-only shield that needs two neighbours."""
    if phase != 'convergence':
        return False
    if passive.get(cell) != 'sanctuary':
        return False
    return friends_adj(own, cards, cell, owner) >= 2


def matches(cards, src, d, t):
    return cards[src][d] == cards[t][P.OPPSIDE[d]]


def attack_from(cards, own, passive, src, player, phase,
                restrict_owner=None):
    """Cells `src` takes by matching. `restrict_owner` limits targets to
    cards owned by that player, which is how Usurp makes a card attack
    its own side."""
    opp = 1 - player
    out = []
    for d in range(4):
        t = P.NB[src][d]
        if t < 0 or cards[t] is None:
            continue
        target_owner = 0 if (own[0] >> t) & 1 else 1
        if restrict_owner is None:
            if target_owner != opp:
                continue
        elif target_owner != restrict_owner:
            continue
        if protected(cards, own, passive, t, target_owner, phase):
            continue
        if matches(cards, src, d, t):
            out.append(t)
    return out


def seize(own, player, cells, prov=None):
    opp = 1 - player
    for t in cells:
        if prov is not None:
            prev = 0 if (own[0] >> t) & 1 else 1
            prov.setdefault(t, set()).add(prev)
        own[player] |= 1 << t
        own[opp] &= ~(1 << t)
    return len(cells)


# ---------------------------------------------------------------------------
# Convergence
# ---------------------------------------------------------------------------
def convergence(cards, own, hands, passive, active, rng, prov):
    caps = 0
    for turn in range(len(P.ORDER)):
        player = turn % 2
        empties = [i for i in range(P.NCELLS) if cards[i] is None]
        if not empties or not hands[player]:
            continue
        best, ties = None, []
        for i, (card, pas, act) in enumerate(hands[player]):
            e = card
            for _ in range(4):
                for cell in empties:
                    c2 = [x for x in cards]
                    o2 = own[:]
                    pv2 = dict(passive)
                    c2[cell] = e
                    o2[player] |= 1 << cell
                    pv2[cell] = pas
                    got = len(attack_from(c2, o2, pv2, cell, player,
                                          'convergence'))
                    reach = sum(1 for d in range(4)
                                if P.NB[cell][d] >= 0
                                and c2[P.NB[cell][d]] is None)
                    # a Sanctuary holder wants neighbours, so the
                    # deployment bot is allowed to see that much
                    sanct = 0.0
                    if pas == 'sanctuary':
                        sanct = 0.35 * min(friends_adj(o2, c2, cell,
                                                       player), 2)
                    s = got + 0.15 * reach + sanct
                    if best is None or s > best:
                        best, ties = s, [(i, cell, e, pas, act)]
                    elif s == best:
                        ties.append((i, cell, e, pas, act))
                e = P.rot90(e)
        i, cell, e, pas, act = rng.choice(ties)
        hands[player].pop(i)
        cards[cell] = e
        passive[cell] = pas
        active[cell] = act
        own[player] |= 1 << cell
        caps += seize(own, player,
                      attack_from(cards, own, passive, cell, player,
                                  'convergence'), prov)
    return caps


# ---------------------------------------------------------------------------
# Dominion
# ---------------------------------------------------------------------------
def command_options(cards, own, passive, active, player, src, prov,
                    recent=None):
    """Every command available from `src`, as (kind, *args)."""
    opp = 1 - player
    act = active.get(src)
    recent = recent or {}
    out = []
    if act in (None, 'plain'):
        out.append(('plain',))
        return out
    if act == 'plain':
        out.append(('plain',))
    elif act == 'usurp':
        # the plain attack stays available; the ability is a choice, not
        # a replacement, or declining would never be an option
        out.append(('plain',))
        for d in range(4):
            t = P.NB[src][d]
            if t >= 0 and cards[t] is not None and (own[opp] >> t) & 1:
                out.append(('usurp', t))
    elif act == 'usurp_one':
        # the single-target cut: the usurped card strikes ONE named
        # neighbour of its own side rather than every one at once, which
        # caps the command at a single capture
        out.append(('plain',))
        for d in range(4):
            t = P.NB[src][d]
            if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
                continue
            for e in range(4):
                u = P.NB[t][e]
                if u < 0 or cards[u] is None or u == src:
                    continue
                if (own[opp] >> u) & 1:
                    out.append(('usurp_one', t, u))
    elif act == 'transpose':
        out.append(('plain',))
        for d in range(4):
            a = P.NB[src][d]
            if a < 0 or cards[a] is None:
                continue
            for e in range(4):
                b = P.NB[a][e]
                if b < 0 or cards[b] is None or b == a:
                    continue
                if a < b:
                    out.append(('transpose', a, b))
    elif act in ('reclaim', 'reclaim_recent'):
        out.append(('plain',))
        for t in range(P.NCELLS):
            if cards[t] is None or not (own[opp] >> t) & 1:
                continue
            if act == 'reclaim':
                # full ownership history: every player who ever held it
                if player not in prov.get(t, set()):
                    continue
            else:
                # physically representable: only a card the opponent took
                # from you on their LAST command, which on a table is one
                # temporary marker rather than a log of allegiances
                if t not in recent.get(player, ()):
                    continue
            if friends_adj(own, cards, t, player) >= 1:
                out.append((act, t))
    return out


def retribution_strike(cards, own, passive, active, taken, former, rng,
                       prov):
    """The Justiciar's answer: its former owner attacks one neighbour of
    the captured card, using that card's edges."""
    best = None
    for d in range(4):
        t = P.NB[taken][d]
        if t < 0 or cards[t] is None:
            continue
        owner = 0 if (own[0] >> t) & 1 else 1
        if owner == former:
            continue
        if matches(cards, taken, d, t):
            best = t
            break
    if best is None:
        return 0
    return seize(own, former, [best], prov)


def run_command(cards, own, passive, active, player, src, opt, rng, prov,
                retrib_used):
    """One command. Returns captures credited to `player`."""
    opp = 1 - player
    kind = opt[0]
    got = []

    if kind == 'plain':
        got = attack_from(cards, own, passive, src, player, 'dominion')
    elif kind == 'usurp':
        # their card attacks their own side; the spoils are ours
        got = attack_from(cards, own, passive, opt[1], player, 'dominion',
                          restrict_owner=opp)
    elif kind == 'usurp_one':
        t, u = opt[1], opt[2]
        d = next((k for k in range(4) if P.NB[t][k] == u), None)
        if d is not None and (own[opp] >> u) & 1 \
                and not protected(cards, own, passive, u, opp, 'dominion') \
                and matches(cards, t, d, u):
            got = [u]
    elif kind == 'transpose':
        a, b = opt[1], opt[2]
        cards[a], cards[b] = cards[b], cards[a]
        passive[a], passive[b] = passive.get(b), passive.get(a)
        active[a], active[b] = active.get(b), active.get(a)
        oa = (own[0] >> a) & 1
        ob = (own[0] >> b) & 1
        for p in (0, 1):
            own[p] &= ~((1 << a) | (1 << b))
        own[0 if ob else 1] |= 1 << a
        own[0 if oa else 1] |= 1 << b
        pa, pb = prov.get(a), prov.get(b)
        if pa is not None or pb is not None:
            prov[a], prov[b] = pb or set(), pa or set()
        return 0
    elif kind in ('reclaim', 'reclaim_recent'):
        return seize(own, player, [opt[1]], prov)

    n = seize(own, player, got, prov)

    # the follow-up, unchanged from v2.1: only after a multiple capture
    if len(got) > 1:
        best = []
        for f in got:
            extra = attack_from(cards, own, passive, f, player, 'dominion')
            if len(extra) > len(best):
                best = extra
        n += seize(own, player, best, prov)

    # Retribution answers each captured Justiciar once per command
    fired = False
    for t in got:
        if fired or retrib_used.get(t):
            continue
        if passive.get(t) == 'retribution':
            retrib_used[t] = True
            fired = True
            n -= retribution_strike(cards, own, passive, active, t, opp,
                                    rng, prov)
    return n


def dominion(cards, own, passive, active, rng, prov, *, commands=COMMANDS,
             p2_first=True, track=None, no_abilities=False):
    caps = 0
    retrib_used = {}
    recent = {0: set(), 1: set()}
    for k in range(commands):
        player = (1 - (k % 2)) if p2_first else (k % 2)
        mine = [c for c in range(P.NCELLS)
                if cards[c] is not None and (own[player] >> c) & 1]
        if not mine:
            continue
        best, ties = None, []
        for src in mine:
            opts = [('plain',)] if no_abilities else command_options(
                cards, own, passive, active, player, src, prov, recent)
            for opt in opts:
                c2 = [x for x in cards]
                o2 = own[:]
                pv2 = dict(passive)
                ac2 = dict(active)
                pr2 = {k2: set(v) for k2, v in prov.items()}
                got = run_command(c2, o2, pv2, ac2, player, src, opt, rng,
                                  pr2, dict(retrib_used))
                # a Transposition takes nothing now, so score the board it
                # leaves: what the same card could take next command
                look = 0
                if opt[0] == 'transpose':
                    for s2 in range(P.NCELLS):
                        if c2[s2] is None or not (o2[player] >> s2) & 1:
                            continue
                        look = max(look, len(attack_from(
                            c2, o2, pv2, s2, player, 'dominion')))
                s = got + 0.5 * look
                if best is None or s > best:
                    best, ties = s, [(src, opt)]
                elif s == best:
                    ties.append((src, opt))
        src, opt = rng.choice(ties)
        before = own[1 - player]
        n = run_command(cards, own, passive, active, player, src, opt, rng,
                        prov, retrib_used)
        # what this command took from the opponent is what they may
        # reclaim on their next command, and nothing older
        lost = before & ~own[1 - player]
        recent[1 - player] = {c for c in range(P.NCELLS)
                              if (lost >> c) & 1}
        caps += n
        if track is not None:
            track[opt[0]] += 1
    return caps


# ---------------------------------------------------------------------------
# a whole game
# ---------------------------------------------------------------------------
def build_deck(rng, size, roster):
    """`roster` is a list of (trait, command) pairs, cycled. Passing a
    single pair makes a uniform deck, which is how one ability is
    isolated for measurement."""
    deck = []
    for i in range(size):
        trait, command = roster[i % len(roster)]
        deck.append((rng.choice(P.BY_SHAPE['versatile']), trait, command))
    rng.shuffle(deck)
    return deck


def play(rng, *, roster=None, passive_kind=None, active_kind='plain',
         commands=COMMANDS, p2_first=True, track=None,
         no_abilities=False):
    P.set_board(*BOARD)
    if roster is None:
        roster = [(passive_kind, active_kind)]
    deck = build_deck(rng, sum(HANDS) + 2, roster)
    hands = [list(deck[:HANDS[0]]), list(deck[HANDS[0]:sum(HANDS)])]
    cards = [None] * P.NCELLS
    own = [0, 0]
    passive, active, prov = {}, {}, {}
    c1 = convergence(cards, own, hands, passive, active, rng, prov)
    mid = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    c2 = dominion(cards, own, passive, active, rng, prov,
                  commands=commands, p2_first=p2_first, track=track,
                  no_abilities=no_abilities)
    end = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    return mid, end, c1, c2
