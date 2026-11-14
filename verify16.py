#!/usr/bin/env python3
"""
One hand-built position per ability, asserting the stated mechanic.

Liveness proves an ability does *something*. It does not prove it does
what the card says: the elemental game shipped an ability implemented one
way in Python and another way in TypeScript, and both passed every
liveness check, because both were live. These scenarios pin the mechanic.

Board, with NB = (north, east, south, west):

    0 1 2
    3 4 5
    6 7 8

A card is (N, E, S, W). Sigils are 0-3.
"""

import sys

import proto as P
import proto16 as X

FAILED = []


def setup(mine, theirs):
    """mine/theirs: {cell: card}. Returns (cards, own)."""
    cards = [None] * P.NCELLS
    own = [0, 0]
    for c, v in mine.items():
        cards[c] = v
        own[0] |= 1 << c
    for c, v in theirs.items():
        cards[c] = v
        own[1] |= 1 << c
    return cards, own


def run(cards, own, cell, card, ability, opt, cap=P.CASCADE_CAP,
        shields=None, turn=0):
    c = [x for x in cards]
    o = own[:]
    h = [[(card, ability)], [(card, ability)]]
    s = {} if shields is None else dict(shields)
    got = X.apply16(c, o, h, 0, (0, cell, card, opt), cap, 5, s, turn)
    return got, c, o, s


def check(name, cond, detail=''):
    if cond:
        print(f'  ok    {name}')
    else:
        print(f'  FAIL  {name}  {detail}')
        FAILED.append(name)


def owned(own, p=0):
    return {i for i in range(P.NCELLS) if (own[p] >> i) & 1}


# ---------------------------------------------------------------------------
print('edges')

# MIRROR: swapping two ADJACENT edges aims a sigil that was pointing the
# wrong way -- a reordering no rotation can produce.
cards, own = setup({}, {1: (0, 0, 2, 0)})          # enemy north, shows S=2
card = (0, 2, 1, 3)                                 # my N=0, E=2
g0, _, _, _ = run(cards, own, 4, card, 'mirror', None)
g1, _, o1, _ = run(cards, own, 4, card, 'mirror',
                   ('mirror', P.NORTH, P.EAST))
check('mirror: declining matches nothing', g0 == 0, f'got {g0}')
check('mirror: swapping N with E aims the 2 north', g1 == 1
      and 1 in owned(o1), f'got {g1}')
check('mirror: equal adjacent sigils offer no swap',
      not any(o and o[0] == 'mirror' for o in
              X.options16(cards, own, 0, 'mirror', 4, True, {},
                          (1, 1, 1, 1))),
      'a mono card should have no legal swap')
check('mirror: a versatile card offers all four swaps',
      len([o for o in X.options16(cards, own, 0, 'mirror', 4, True, {},
                                  (0, 1, 2, 3)) if o]) == 4)

# ECHO: copying a sigil onto a second edge.
cards, own = setup({}, {1: (0, 0, 1, 0)})          # enemy north shows S=1
card = (0, 1, 2, 3)                                 # my N=0, E=1
g0, _, _, _ = run(cards, own, 4, card, 'echo', None)
g1, _, o1, _ = run(cards, own, 4, card, 'echo', ('echo', P.EAST, P.NORTH))
check('echo: declining matches nothing', g0 == 0, f'got {g0}')
check('echo: E copied onto N captures north', g1 == 1, f'got {g1}')

# ATTUNE: the chosen edge also counts as the sigil the ally shows me.
cards, own = setup({3: (0, 2, 0, 0)},               # ally west, shows E=2
                   {1: (0, 0, 2, 0)})               # enemy north, shows S=2
card = (0, 0, 0, 0)                                 # my N=0, matches nothing
g0, _, _, _ = run(cards, own, 4, card, 'attune', None)
g1, _, _, _ = run(cards, own, 4, card, 'attune', ('attune', 3, P.NORTH))
check('attune: declining matches nothing', g0 == 0, f'got {g0}')
check('attune: N borrows the ally\'s 2 and captures', g1 == 1, f'got {g1}')

# CONVERGE: BOTH chosen edges match EITHER sigil, so one option can take
# two cards that need different sigils.
cards, own = setup({}, {1: (0, 0, 1, 0),            # north shows S=1
                        5: (0, 0, 0, 0)})           # east shows W=0
card = (0, 1, 2, 3)                                 # N=0, E=1
g0, _, _, _ = run(cards, own, 4, card, 'converge', None)
g1, _, o1, _ = run(cards, own, 4, card, 'converge',
                   ('converge', P.NORTH, P.EAST))
check('converge: declining matches nothing', g0 == 0, f'got {g0}')
check('converge: N and E each match either, taking both',
      g1 == 2 and {1, 5} <= owned(o1), f'got {g1}')

# ---------------------------------------------------------------------------
print('geometry')

# LANCE: fires past an empty cell at the card beyond, and does NOT give up
# the normal attack.
cards, own = setup({}, {0: (0, 0, 2, 0),            # two north of 6, shows S=2
                        7: (0, 0, 0, 1)})           # east of 6, shows W=1
card = (2, 1, 0, 0)                                 # N=2, E=1
g0, _, _, _ = run(cards, own, 6, card, 'lance', None)
g1, _, o1, _ = run(cards, own, 6, card, 'lance', ('lance', P.NORTH))
check('lance: without it, only the adjacent card falls', g0 == 1,
      f'got {g0}')
check('lance: reaches cell 0 through empty cell 3, keeping the normal '
      'capture', g1 == 2 and {0, 7} <= owned(o1), f'got {g1}')

# CORNER: takes a diagonal, and gives up every orthogonal attack.
#   the diagonal target is cell 8, whose own neighbours (5 and 7) are
#   empty, so nothing it does afterwards can be mistaken for the ability.
cards, own = setup({}, {8: (0, 0, 0, 2),            # diagonal, shows W=2
                        1: (0, 0, 2, 0),            # north, shows S=2
                        3: (0, 2, 0, 0)})           # west, shows E=2
card = (2, 2, 0, 2)                                 # N=2, E=2, W=2
g0, _, o0, _ = run(cards, own, 4, card, 'corner', None)
g1, _, o1, _ = run(cards, own, 4, card, 'corner', ('corner', 8, P.EAST))
check('corner: declining takes both orthogonals',
      g0 == 2 and {1, 3} <= owned(o0), f'got {g0}')
check('corner: taking the diagonal forfeits both orthogonals',
      g1 == 1 and 8 in owned(o1) and not {1, 3} & owned(o1), f'got {g1}')

# BRIDGE: reaches the enemy beyond an ally, additively.
cards, own = setup({3: (0, 0, 0, 0)},               # my ally, north of 6
                   {0: (0, 0, 2, 0)})               # enemy beyond it
card = (2, 0, 0, 0)
g0, _, _, _ = run(cards, own, 6, card, 'bridge', None)
g1, _, o1, _ = run(cards, own, 6, card, 'bridge', ('bridge', 3, 0, P.NORTH))
check('bridge: declining reaches nothing', g0 == 0, f'got {g0}')
check('bridge: reaches cell 0 through the ally at 3',
      g1 == 1 and 0 in owned(o1), f'got {g1}')

# CROSSING: one axis only, then advance into the cell opposite the capture.
cards, own = setup({}, {1: (0, 0, 2, 0),            # north, shows S=2
                        5: (0, 0, 0, 2)})           # east, shows W=2
card = (2, 2, 0, 0)                                 # N=2, E=2
g0, _, _, _ = run(cards, own, 4, card, 'crossing', None)
g1, c1, o1, _ = run(cards, own, 4, card, 'crossing', ('crossing', 0))
check('crossing: declining takes both axes', g0 == 2, f'got {g0}')
check('crossing: restricted to N/S, only the north card falls',
      g1 == 1 and 1 in owned(o1) and 5 not in owned(o1), f'got {g1}')
check('crossing: advances to cell 7, opposite the capture',
      c1[4] is None and c1[7] == card and 7 in owned(o1),
      f'4={c1[4]} 7={c1[7]}')

# ---------------------------------------------------------------------------
print('cascade')

# HINGE: rotate the captured card BEFORE it makes its own attack.
#   card at 1 is taken, then turned so its west edge faces cell 0.
cards, own = setup({}, {1: (1, 1, 0, 2),            # shows S=0 to me; W=2
                        0: (0, 0, 0, 0)})           # east edge = 0
card = (0, 0, 0, 0)                                 # my N=0 takes cell 1
g0, _, o0, _ = run(cards, own, 4, card, 'hinge', None)
g1, _, o1, _ = run(cards, own, 4, card, 'hinge', ('hinge', 1))
check('hinge: unrotated, the chain stops at cell 1',
      g0 == 1 and 0 not in owned(o0), f'got {g0}')
check('hinge: rotating cell 1 turns its S=0 west, so the chain reaches 0',
      g1 == 2 and {0, 1} <= owned(o1), f'got {g1}')

# AMPLIFY: one edge only, and the card it takes captures with no match.
cards, own = setup({}, {1: (3, 3, 0, 1),            # shows S=0; W=1
                        0: (3, 3, 3, 3),            # E=3 and S=3: no chain
                        3: (0, 0, 0, 0)})           # west of me, shows E=0
card = (0, 0, 0, 0)                                 # N=0 and W=0 both match
g0, _, o0, _ = run(cards, own, 4, card, 'amplify', None)
g1, _, o1, _ = run(cards, own, 4, card, 'amplify', ('amplify', P.NORTH, 0))
check('amplify: declining takes both neighbours, chain stops',
      g0 == 2 and {1, 3} <= owned(o0) and 0 not in owned(o0), f'got {g0}')
check('amplify: north edge only, and cell 1 takes cell 0 unmatched',
      g1 == 2 and {0, 1} <= owned(o1) and 3 not in owned(o1), f'got {g1}')

# ...and the captured card's OTHER edges make no attack. Cell 1 is given a
# matching neighbour at cell 2 that it would normally take for free.
cards, own = setup({}, {1: (3, 0, 0, 1),            # shows S=0; E=0
                        2: (3, 3, 3, 0),            # W=0: a normal match
                        0: (3, 3, 3, 3)})           # the nominated target
card = (0, 0, 0, 0)
g0, _, o0, _ = run(cards, own, 4, card, 'amplify', None)
g1, _, o1, _ = run(cards, own, 4, card, 'amplify', ('amplify', P.NORTH, 0))
check('amplify: without it, cell 1 chains normally into cell 2',
      g0 == 2 and 2 in owned(o0), f'got {g0}')
check('amplify: the nominated attack replaces every other edge',
      g1 == 2 and 0 in owned(o1) and 2 not in owned(o1), f'got {g1}')
check('amplify: nominating nobody means the captured card does not attack',
      run(cards, own, 4, card, 'amplify', ('amplify', P.NORTH, None))[0]
      == 1)

# ANCHOR: spend the whole cascade to walk a captured card one cell.
cards, own = setup({}, {1: (1, 1, 0, 0),            # I take this; W=0
                        0: (0, 0, 0, 0)})           # its chain would take 0
card = (0, 1, 2, 3)
g0, _, o0, _ = run(cards, own, 4, card, 'anchor', None)
g1, c1, o1, _ = run(cards, own, 4, card, 'anchor', ('anchor', 1, 2))
check('anchor: declining lets the chain reach cell 0',
      g0 == 2 and {0, 1} <= owned(o0), f'got {g0}')
check('anchor: the chain is forfeited, and the capture stands',
      g1 == 1 and 0 not in owned(o1), f'got {g1}')
check('anchor: the captured card walks from 1 to the empty cell 2, '
      'keeping its orientation',
      c1[1] is None and c1[2] == (1, 1, 0, 0) and 2 in owned(o1)
      and 1 not in owned(o1), f'1={c1[1]} 2={c1[2]}')
check('anchor: the moved card makes no attack of its own',
      g1 == 1, f'got {g1}')
# it needs a cascade to spend, so it is not on offer on a final placement
check('anchor: no option on a placement that gets no cascade',
      len([o for o in X.options16(cards, own, 0, 'anchor', 4, True, {},
                                  card, 0) if o]) == 0)
check('anchor: offered when a cascade is available',
      len([o for o in X.options16(cards, own, 0, 'anchor', 4, True, {},
                                  card, 1) if o]) > 0)

# HANDOFF: an ally makes the chain attack, from its own position.
cards, own = setup({3: (0, 0, 0, 0)},               # ally west of me; S=0
                   {1: (1, 1, 0, 1),                # I take this, it chains
                                                    #   nothing (W=1)
                    0: (0, 0, 3, 3),                # reachable from neither
                    6: (0, 0, 0, 0)})               # south of the ally; N=0
card = (0, 3, 3, 3)                                 # N=0 takes cell 1 only
g0, _, o0, _ = run(cards, own, 4, card, 'handoff', None)
g1, _, o1, _ = run(cards, own, 4, card, 'handoff', ('handoff', 1, 3))
check('handoff: normally the captured card chains, and reaches nothing',
      g0 == 1 and 6 not in owned(o0), f'got {g0}')
check('handoff: the ally at 3 makes the attack instead, taking 6',
      g1 == 2 and 6 in owned(o1), f'got {g1}')

# ---------------------------------------------------------------------------
print('aftermath')

# FORTIFY: the chosen edge cannot be captured through, until the end of
# the opponent's next turn -- then it can again.
cards, own = setup({}, {})
card = (0, 0, 0, 0)
_, c1, o1, sh = run(cards, own, 4, card, 'fortify', ('fortify', P.NORTH),
                    turn=2)
check('fortify: a shield is recorded on the chosen edge',
      (4, P.NORTH) in sh, f'got {sh}')
# the opponent now plays a card north of it that would normally capture
attacker = (0, 0, 0, 0)                             # S=0 faces my N=0
for t, expect in ((3, 0), (5, 1)):
    c = [x for x in c1]
    o = o1[:]
    h = [[(attacker, 'fortify')], [(attacker, 'fortify')]]
    got = X.apply16(c, o, h, 1, (0, 1, attacker, None), P.CASCADE_CAP, 5,
                    dict(sh), t)
    check(f'fortify: turn {t} capture through the shielded edge '
          f'{"blocked" if expect == 0 else "allowed again"}',
          got == expect, f'got {got}')

# WITHDRAW: only when the placement captured nothing.
cards, own = setup({}, {1: (0, 0, 3, 0)})           # north, shows S=3
card = (0, 0, 0, 0)                                 # matches nothing
g0, c0, o0, _ = run(cards, own, 4, card, 'withdraw', ('withdraw', 7))
check('withdraw: having taken nothing, the card relocates to 7',
      g0 == 0 and c0[4] is None and c0[7] == card and 7 in owned(o0),
      f'4={c0[4]} 7={c0[7]}')
cards, own = setup({}, {1: (0, 0, 0, 0)})           # north, shows S=0
g1, c1, _, _ = run(cards, own, 4, card, 'withdraw', ('withdraw', 7))
check('withdraw: having taken a card, it must stay put',
      g1 == 1 and c1[4] == card and c1[7] is None, f'4={c1[4]}')

# REORIENT: turn an ally that was already on the board.
ally = (0, 1, 2, 3)
cards, own = setup({3: ally}, {})
card = (3, 3, 3, 3)
_, c0, _, _ = run(cards, own, 4, card, 'reorient', ('reorient', 3, 0))
_, c1, _, _ = run(cards, own, 4, card, 'reorient', ('reorient', 3, 1))
check('reorient: clockwise turns the ally 90',
      c0[3] == P.rot90(ally), f'got {c0[3]}')
check('reorient: anticlockwise turns it the other way',
      c1[3] == P.rot90(P.rot90(P.rot90(ally))), f'got {c1[3]}')

# MEND: advance into the cell you just took.
cards, own = setup({}, {1: (3, 3, 0, 3)})           # north, shows S=0
card = (0, 1, 2, 3)
g0, c0, o0, _ = run(cards, own, 4, card, 'mend', ('mend', P.NORTH))
check('mend: the placed card and the captured one swap places',
      g0 == 1 and c0[1] == card and c0[4] == (3, 3, 0, 3)
      and {1, 4} <= owned(o0), f'1={c0[1]} 4={c0[4]}')

# ---------------------------------------------------------------------------
print()
if FAILED:
    print(f'{len(FAILED)} scenario(s) FAILED: {", ".join(FAILED)}')
    sys.exit(1)
print('all scenarios pass')
