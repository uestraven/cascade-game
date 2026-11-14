#!/usr/bin/env python3
"""
The sixteen proposed abilities, implemented and measurable.

proto.py stays untouched: it is the oracle the TypeScript port is verified
against, and the four shipped abilities must keep behaving identically.
Anything from the original four is delegated straight to it; only the new
sixteen are handled here.

Option encodings, so the measurement and the rules text cannot drift:

  EDGES
    mirror    ('mirror', axis)            axis 0 = N/S, 1 = E/W
    echo      ('echo', src, dst)          copy src's sigil onto dst
    attune    ('attune', ally, edge)      edge matches its own OR ally's
    converge  ('converge', e1, e2)        both match either original
  GEOMETRY
    lance     ('lance', edge)             fire through one empty cell
    corner    ('corner', target, edge)    one diagonal, nothing else
    bridge    ('bridge', ally, target, edge)
    crossing  ('crossing', axis)          one axis, then maybe retreat
  CASCADE
    hinge     ('hinge', cell)             rotate that card before it chains
    amplify   ('amplify', edge)           one edge; its capture chains free
    anchor    ('anchor',)                 no chain, then turn 180
    handoff   ('handoff', taken, ally)    ally makes the chain attack
  AFTERMATH
    fortify   ('fortify', edge)           that edge cannot be captured
    withdraw  ('withdraw', dest)          only if nothing was captured
    reorient  ('reorient', ally, dir)     dir 0 = cw, 1 = ccw
    mend      ('mend', edge)              advance into what that edge took

FORTIFY needs state that outlives a placement, which nothing else in this
engine does. It is threaded as a `shields` dict rather than bolted onto
the board, so a game without Fortify behaves exactly as before.
"""

import itertools
import random
import sys
from collections import Counter

import proto as P

NEW16 = (
    'mirror', 'echo', 'attune', 'converge',
    'lance', 'corner', 'bridge', 'crossing',
    'hinge', 'amplify', 'anchor', 'handoff',
    'fortify', 'withdraw', 'reorient', 'mend',
)
ALL20 = tuple(P.ABILITIES) + NEW16

FAMILY = {
    'edges': ('mirror', 'echo', 'attune', 'converge'),
    'geometry': ('lance', 'corner', 'bridge', 'crossing'),
    'cascade': ('hinge', 'amplify', 'anchor', 'handoff'),
    'aftermath': ('fortify', 'withdraw', 'reorient', 'mend'),
}


# ---------------------------------------------------------------------------
# geometry helpers, rebuilt whenever the board changes
# ---------------------------------------------------------------------------
def diagonals(cell):
    """(target, (edgeA, edgeB)) for each diagonal neighbour -- the two
    edges pointing toward it."""
    r, c = divmod(cell, P.COLS)
    out = []
    for dr, dc, pair in ((-1, -1, (P.NORTH, P.WEST)),
                         (-1, 1, (P.NORTH, P.EAST)),
                         (1, -1, (P.SOUTH, P.WEST)),
                         (1, 1, (P.SOUTH, P.EAST))):
        nr, nc = r + dr, c + dc
        if 0 <= nr < P.ROWS and 0 <= nc < P.COLS:
            out.append((nr * P.COLS + nc, pair))
    return out


def line_beyond(cell, d):
    """The cell two steps from `cell` in direction `d`, and the one
    between, or None."""
    mid = P.NB[cell][d]
    if mid < 0:
        return None
    far = P.NB[mid][d]
    if far < 0:
        return None
    return mid, far


AXES = ((P.NORTH, P.SOUTH), (P.EAST, P.WEST))


# ---------------------------------------------------------------------------
# options
# ---------------------------------------------------------------------------
ADJ = ((P.NORTH, P.EAST), (P.EAST, P.SOUTH),
       (P.SOUTH, P.WEST), (P.WEST, P.NORTH))


def options16(cards, own, player, ability, cell, live, shields=None,
              edges=None, cap=P.CASCADE_CAP):
    """`edges` is the card as it would be laid down, rotation included --
    Mirror needs it to know which swaps are legal. `cap` is needed
    because Anchor spends a cascade and so cannot be used on a placement
    that does not get one."""
    if not live or ability is None:
        return [None]
    if ability in P.ABILITIES:
        return P.options(cards, own, player, ability, cell, live)

    out = [None]
    mine, theirs = own[player], own[1 - player]
    nb = P.NB[cell]

    if ability == 'mirror':
        # adjacent edges, and only where they differ: swapping two equal
        # sigils is not a move. Verified exhaustively -- an adjacent swap
        # is never reachable by rotation on a versatile, focused or
        # specialized card, which is the whole deck. It is always
        # reachable on a triple, and a mono card has no legal swap.
        if edges is None:
            out += [('mirror', a, b) for a, b in ADJ]
        else:
            out += [('mirror', a, b) for a, b in ADJ
                    if edges[a] != edges[b]]
    elif ability == 'echo':
        out += [('echo', s, d) for s in range(4) for d in range(4)
                if s != d]
    elif ability == 'attune':
        out += [('attune', nb[d], e) for d in range(4) for e in range(4)
                if nb[d] >= 0 and (mine >> nb[d]) & 1]
    elif ability == 'converge':
        out += [('converge', a, b) for a, b in
                itertools.combinations(range(4), 2)]
    elif ability == 'lance':
        for d in range(4):
            lb = line_beyond(cell, d)
            if lb and cards[lb[0]] is None and cards[lb[1]] is not None \
                    and (theirs >> lb[1]) & 1:
                out.append(('lance', d))
    elif ability == 'corner':
        for t, pair in diagonals(cell):
            if cards[t] is not None and (theirs >> t) & 1:
                out += [('corner', t, e) for e in pair]
    elif ability == 'bridge':
        for d in range(4):
            lb = line_beyond(cell, d)
            if not lb:
                continue
            mid, far = lb
            if cards[mid] is not None and (mine >> mid) & 1 \
                    and cards[far] is not None and (theirs >> far) & 1:
                out.append(('bridge', mid, far, d))
    elif ability == 'crossing':
        out += [('crossing', a) for a in (0, 1)]
    elif ability == 'hinge':
        out += [('hinge', nb[d]) for d in range(4)
                if nb[d] >= 0 and cards[nb[d]] is not None
                and (theirs >> nb[d]) & 1]
    elif ability == 'amplify':
        # the free capture is the player's choice, not the scan order's:
        # enumerate every enemy the card you might take could reach, and
        # let the option carry it. `None` covers taking the edge without
        # a follow-up, which is also what happens if the capture misses.
        for d in range(4):
            t = nb[d]
            if t < 0 or cards[t] is None or not (theirs >> t) & 1:
                continue
            out.append(('amplify', d, None))
            for e in range(4):
                u = P.NB[t][e]
                if u >= 0 and u != cell and cards[u] is not None \
                        and (theirs >> u) & 1:
                    out.append(('amplify', d, u))
    elif ability == 'anchor':
        # spend the cascade to walk a captured card one cell. Needs a
        # cascade to spend, a card to take, and somewhere to put it.
        if cap > 0:
            for d in range(4):
                t = nb[d]
                if t < 0 or cards[t] is None or not (theirs >> t) & 1:
                    continue
                for e in range(4):
                    dest = P.NB[t][e]
                    if dest >= 0 and cards[dest] is None and dest != cell:
                        out.append(('anchor', t, dest))
    elif ability == 'handoff':
        for d in range(4):
            t = nb[d]
            if t < 0 or cards[t] is None or not (theirs >> t) & 1:
                continue
            for e in range(4):
                a = nb[e]
                if a >= 0 and cards[a] is not None and (mine >> a) & 1:
                    out.append(('handoff', t, a))
    elif ability == 'fortify':
        out += [('fortify', e) for e in range(4)]
    elif ability == 'withdraw':
        out += [('withdraw', nb[d]) for d in range(4)
                if nb[d] >= 0 and cards[nb[d]] is None]
    elif ability == 'reorient':
        out += [('reorient', nb[d], k) for d in range(4) for k in (0, 1)
                if nb[d] >= 0 and cards[nb[d]] is not None
                and (mine >> nb[d]) & 1]
    elif ability == 'mend':
        out += [('mend', d) for d in range(4)
                if nb[d] >= 0 and cards[nb[d]] is not None
                and (theirs >> nb[d]) & 1]
    return out


# ---------------------------------------------------------------------------
# resolution
# ---------------------------------------------------------------------------
def matches(a, b, extra=None):
    """`extra` is a set of sigils an edge additionally counts as."""
    if a == b:
        return True
    return extra is not None and b in extra


def shielded(shields, cell, edge, turn):
    """Fortify: an edge that cannot be captured through, until the end of
    the opponent's next turn."""
    if not shields:
        return False
    s = shields.get((cell, edge))
    return s is not None and turn <= s


def cascade16(cards, own, origin, player, cap, *, wild=None, extras=None,
              only=None, free=None, shields=None, turn=0):
    """wild   -- (cell, edge) matching anything (Prism)
       extras -- {(cell, edge): {sigils}} an edge additionally counts as
       only   -- {(cell, edge)} restrict the FIRST wave to these edges
       free   -- (cell, edge) captures with no match needed (Amplify)"""
    opp = 1 - player
    frontier, captured, depth = origin, 0, 0
    while frontier and depth <= cap:
        newly = 0
        for src in range(P.NCELLS):
            if not (frontier >> src) & 1 or cards[src] is None:
                continue
            for d in range(4):
                if depth == 0 and only is not None and (src, d) not in only:
                    continue
                t = P.NB[src][d]
                if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
                    continue
                if shielded(shields, t, P.OPPSIDE[d], turn):
                    continue
                ok = False
                if wild is not None and wild == (src, d):
                    ok = True
                elif free is not None and free == (src, d):
                    ok = True
                else:
                    ex = extras.get((src, d)) if extras else None
                    ok = matches(cards[src][d], cards[t][P.OPPSIDE[d]], ex)
                if ok:
                    newly |= 1 << t
        if newly:
            own[player] |= newly
            own[opp] &= ~newly
            captured += bin(newly).count('1')
        frontier = newly
        depth += 1
    return captured, frontier


def apply16(cards, own, hands, player, mv, cap, placed_so_far,
            shields=None, turn=0):
    """One placement. Returns captures."""
    i, cell, edges, opt = mv
    live = placed_so_far >= P.ABILITY_FROM_PLACEMENT - 1
    ability = hands[player][i][1] if live else None

    if ability is None or ability in P.ABILITIES:
        return P.apply_move(cards, own, hands, player, mv, cap,
                            placed_so_far)

    kind = opt[0] if opt else None
    opp = 1 - player
    edges = list(edges)
    extras = {}
    wild = None
    free = None
    only = None
    post = None

    # --- edge changes, before anything is compared --------------------
    if kind == 'mirror':
        a, b = opt[1], opt[2]
        edges[a], edges[b] = edges[b], edges[a]
    elif kind == 'echo':
        edges[opt[2]] = edges[opt[1]]
    elif kind == 'attune':
        ally, e = opt[1], opt[2]
        d = next(k for k in range(4) if P.NB[cell][k] == ally)
        borrowed = cards[ally][P.OPPSIDE[d]]
        extras[(cell, e)] = {borrowed}
    elif kind == 'converge':
        a, b = opt[1], opt[2]
        both = {edges[a], edges[b]}
        extras[(cell, a)] = both
        extras[(cell, b)] = both

    hands[player].pop(i)
    cards[cell] = tuple(edges)
    own[player] |= 1 << cell

    # --- geometry ----------------------------------------------------
    if kind == 'lance':
        d = opt[1]
        mid, far = line_beyond(cell, d)
        # the lance fires into the far cell; the other edges attack as
        # normal, so the restriction is additive rather than exclusive
        got, _ = cascade16(cards, own, 1 << cell, player, cap,
                           shields=shields, turn=turn)
        if cards[far] is not None and (own[opp] >> far) & 1 \
                and not shielded(shields, far, P.OPPSIDE[d], turn) \
                and cards[cell][d] == cards[far][P.OPPSIDE[d]]:
            own[player] |= 1 << far
            own[opp] &= ~(1 << far)
            got += 1
        return got
    if kind == 'corner':
        # the one ability whose text does say "gives up all orthogonal",
        # so this is the only geometry option that replaces the normal
        # attack rather than adding to it. The card it takes still chains,
        # because the cascade is a property of the board and not of the
        # attack that started it.
        t, e = opt[1], opt[2]
        d = P.OPPSIDE[e]
        if cards[t] is None or not (own[opp] >> t) & 1 \
                or shielded(shields, t, d, turn) \
                or cards[cell][e] != cards[t][d]:
            return 0
        own[player] |= 1 << t
        own[opp] &= ~(1 << t)
        if cap <= 0:
            return 1
        return 1 + cascade16(cards, own, 1 << t, player, cap - 1,
                             shields=shields, turn=turn)[0]
    if kind == 'bridge':
        # additive: the text says "attack through an adjacent friendly
        # card", not "and nothing else". Corner, Amplify and Crossing all
        # state their exclusivity explicitly; this one does not.
        mid, far, d = opt[1], opt[2], opt[3]
        got, _ = cascade16(cards, own, 1 << cell, player, cap,
                           shields=shields, turn=turn)
        if cards[far] is not None and (own[opp] >> far) & 1 \
                and not shielded(shields, far, P.OPPSIDE[d], turn) \
                and cards[cell][d] == cards[far][P.OPPSIDE[d]]:
            own[player] |= 1 << far
            own[opp] &= ~(1 << far)
            got += 1
        return got
    if kind == 'crossing':
        a, b = AXES[opt[1]]
        only = {(cell, a), (cell, b)}
        # remember which way the enemies lay, so "the card you just took"
        # cannot be confused with an ally that was already there
        pre = tuple(e for e in (a, b)
                    if P.NB[cell][e] >= 0
                    and cards[P.NB[cell][e]] is not None
                    and (own[opp] >> P.NB[cell][e]) & 1)
        post = ('crossing', pre)

    # --- cascade changes ---------------------------------------------
    if kind == 'amplify':
        d = opt[1]
        only = {(cell, d)}
    if kind == 'fortify':
        post = ('fortify', opt[1])
    if kind == 'withdraw':
        post = ('withdraw', opt[1])
    if kind == 'reorient':
        post = ('reorient', opt[1], opt[2])
    if kind == 'mend':
        post = ('mend', opt[1])

    # first wave, then the chain, with hinge/amplify/handoff intervening
    if kind == 'anchor':
        # the direct captures happen, then the whole cascade is spent to
        # walk one of them a single cell. The moved card keeps its
        # orientation and makes no attack, so nothing about this can
        # start a second wave -- which is exactly what it paid for.
        before = own[player]
        got, _ = cascade16(cards, own, 1 << cell, player, 0,
                           shields=shields, turn=turn)
        taken, dest = opt[1], opt[2]
        if got and (own[player] >> taken) & 1 \
                and not (before >> taken) & 1 and cards[dest] is None:
            cards[dest] = cards[taken]
            cards[taken] = None
            own[player] = (own[player] & ~(1 << taken)) | (1 << dest)
        return got

    if kind in ('hinge', 'amplify', 'handoff'):
        # the direct wave has to be run separately so Hinge can turn a
        # card, and Handoff can substitute an attacker, in between it and
        # the chain. `before` is what makes "just captured" mean exactly
        # that: an ally that was already adjacent is not part of the
        # frontier, and chaining from it would be inventing an extra wave.
        before = own[player]
        direct, _ = cascade16(cards, own, 1 << cell, player, 0,
                              only=only, shields=shields, turn=turn)
        got = direct
        if cap > 0 and direct:
            taken = own[player] & ~before
            fresh = [t for t in range(P.NCELLS) if (taken >> t) & 1]
            if kind == 'hinge' and opt[1] in fresh:
                cards[opt[1]] = P.rot90(cards[opt[1]])
            origin = taken
            fr = None
            if kind == 'amplify' and opt[2] is not None:
                # the nominated card takes the nominated enemy, matching
                # or not -- provided the capture it depends on happened
                src, u = P.NB[cell][opt[1]], opt[2]
                if (taken >> src) & 1 and (own[opp] >> u) & 1:
                    d = next((k for k in range(4) if P.NB[src][k] == u),
                             None)
                    if d is not None:
                        fr = (src, d)
            if kind == 'handoff' and opt[1] in fresh:
                origin = (origin & ~(1 << opt[1])) | (1 << opt[2])
            # Amplify's captured card makes exactly the one unmatched
            # attack it was pointed at and nothing else -- its other
            # edges are spent, so the chain wave is restricted to `fr`.
            # With no enemy nominated it makes no attack at all.
            chain_only = None
            if kind == 'amplify':
                chain_only = {fr} if fr else set()
            got += cascade16(cards, own, origin, player, 0, free=fr,
                             only=chain_only, shields=shields,
                             turn=turn)[0]
        return got

    got, _ = cascade16(cards, own, 1 << cell, player, cap, wild=wild,
                       extras=extras, only=only, shields=shields, turn=turn)

    # --- aftermath ---------------------------------------------------
    if post:
        if post[0] == 'fortify' and shields is not None:
            # lasts through the opponent's next turn
            shields[(cell, post[1])] = turn + 2
        elif post[0] == 'withdraw' and got == 0:
            dest = post[1]
            if cards[dest] is None:
                cards[dest] = cards[cell]
                cards[cell] = None
                own[player] = (own[player] & ~(1 << cell)) | (1 << dest)
        elif post[0] == 'reorient':
            ally, k = post[1], post[2]
            if cards[ally] is not None and (own[player] >> ally) & 1:
                r = P.rot90(cards[ally]) if k == 0 else \
                    P.rot90(P.rot90(P.rot90(cards[ally])))
                cards[ally] = r
        elif post[0] == 'crossing' and got == 1:
            # "move into the opposite cell" means opposite the card you
            # just took, not whichever cell on the axis happens to be
            # free -- you advance away from the capture, not toward it.
            took = None
            for e in post[1]:
                if (own[player] >> P.NB[cell][e]) & 1:
                    took = e
            if took is not None:
                back = P.NB[cell][P.OPPSIDE[took]]
                if back >= 0 and cards[back] is None:
                    cards[back] = cards[cell]
                    cards[cell] = None
                    own[player] = (own[player] & ~(1 << cell)) \
                        | (1 << back)
        elif post[0] == 'mend':
            d = post[1]
            t = P.NB[cell][d]
            if t >= 0 and cards[t] is not None and (own[player] >> t) & 1:
                cards[cell], cards[t] = cards[t], cards[cell]
    return got


# ---------------------------------------------------------------------------
# a bot that can use them
# ---------------------------------------------------------------------------
def moves16(cards, own, hands, player, empties, placed, shields, turn,
            cap=P.CASCADE_CAP):
    live = placed >= P.ABILITY_FROM_PLACEMENT - 1
    out = []
    for i, (card, ability) in enumerate(hands[player]):
        e = card
        for _ in range(4):
            for cell in empties:
                for opt in options16(cards, own, player, ability, cell,
                                     live, shields, e, cap):
                    out.append((i, cell, e, opt))
            e = P.rot90(e)
    return out


def pick16(cards, own, hands, player, empties, cap, placed, rng, lam,
           shields, turn, use_abilities=True, bias=True, require=False):
    """`require` forbids declining: among placements where the ability
    offers something, only the options that use it are considered. A
    placement with nothing on offer is still legal, or there would be
    turns with no move at all."""
    best, ties = None, []
    allmv = moves16(cards, own, hands, player, empties, placed, shields,
                    turn, cap)
    if require:
        usable = {(mv[0], mv[1], mv[2]) for mv in allmv
                  if mv[3] is not None}
    for mv in allmv:
        if not use_abilities and mv[3] is not None:
            continue
        if not bias and mv[3] is not None:
            continue
        if require and mv[3] is None \
                and (mv[0], mv[1], mv[2]) in usable:
            continue
        c = [x for x in cards]
        o = own[:]
        h = [list(x) for x in hands]
        sh = dict(shields) if shields is not None else None
        got = apply16(c, o, h, player, mv, cap, placed, sh, turn)
        s = got - lam * P.exposure(c, o, player)
        if best is None or s > best:
            best, ties = s, [mv]
        elif s == best:
            ties.append(mv)
    if not ties:
        return None
    return rng.choice(ties)
