#!/usr/bin/env python3
"""
SCAVENGER and LETO.

SCAVENGER -- rotate a card's faces 90 degrees clockwise, then cascade.
    Clockwise means the LEFT face moves to the TOP:
        new (N,E,S,W) = old (W,N,E,S)
    which matches the spec's [U,R,D,L] -> [L,U,R,D].
    SPEC GAP: the spec allows targeting an enemy card, but does not say who
    receives captures when an ENEMY card is the one attacking. Assumed here:
    captures accrue to the SCAVENGER player, preserving the invariant that
    every flip in a chain goes to the acting player (which is what makes
    chains provably terminate).

LETO -- petrify a card into a neutral obstacle.
    SPEC ERROR: "bitmask the card to the empty-cell sentinel (0/0/0/0)" would
    make the cell indistinguishable from empty, because engine.Board derives
    occupancy from own[0]|own[1] and treats cards[i]==0 as vacant. A player
    could then place on top of it. Implemented instead with a third mask:
    the card data is left intact, ownership is cleared, and the cell is
    tracked as petrified so it is neither placeable nor a capture target.
    A petrified cell is never in either ownership mask, so engine.cascade
    already skips it both as a target and as an attacker -- no change to the
    validated engine was needed.

    CONSEQUENCE: a petrified cell scores for nobody, so 9 cells hold only 8
    scoring cards and a 4-4 DRAW becomes reachable again.
"""

import engine as E
import leaders as L
import variants as V

SCAVENGER, LETO = 'SCAVENGER', 'LETO'


def rotate_cw(card):
    n, e, s, w = E.faces(card)
    return w | n << 4 | e << 8 | s << 12 | E.element(card) << E._ELEM_SHIFT


class NewLeaderGame(V.VariantGame):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.petrified = 0

    def copy(self):
        g = super().copy()
        g.__class__ = NewLeaderGame
        g.petrified = self.petrified
        return g

    # -- petrified cells are occupied but ownerless -----------------------
    def open_cells(self):
        occ = self.board.occupied | self.petrified
        return [i for i in range(E.NCELLS) if not occ >> i & 1]

    def placements(self):
        hand = self.hands[self.to_move]
        cells = self.open_cells()
        return [('place', i, c) for i in range(len(hand)) for c in cells]

    # -- legal actions ----------------------------------------------------
    def leader_actions(self):
        p = self.to_move
        kind = self.leaders[p]
        if kind not in (SCAVENGER, LETO):
            return super().leader_actions()
        if self.used[p]:
            return []
        live = self.board.own[0] | self.board.own[1]
        return [('leader', t) for t in range(E.NCELLS) if live >> t & 1]

    # -- execution --------------------------------------------------------
    def apply_leader(self, payload, rng):
        p = self.to_move
        kind = self.leaders[p]
        if kind not in (SCAVENGER, LETO):
            return super().apply_leader(payload, rng)
        self.used[p] = True
        target = payload
        b = self.board

        if kind == SCAVENGER:
            b.cards[target] = rotate_cw(b.cards[target])
            # 'steal'   : rotating an enemy card also flips it to you (the
            #             stronger reading; not actually in the spec).
            # 'nosteal' : the card stays with its owner and the cascade it
            #             triggers still credits you -- a pure fuse
            #             detonator, and the likelier intent.
            flipped_in = 0
            if self.rules.get('scavenger', 'nosteal') == 'steal' \
                    and b.own[1 - p] >> target & 1:
                b.own[p] |= 1 << target
                b.own[1 - p] &= ~(1 << target)
                flipped_in = 1
            got = E.cascade(b, 1 << target, p, self.cap, self.bonus,
                            self.atk(p))
            return got + flipped_in

        # LETO
        self.petrified |= 1 << target
        b.own[0] &= ~(1 << target)
        b.own[1] &= ~(1 << target)
        return 0


def leto_target(game, player):
    """Greedy is blind to denial, so give Leto a human-like heuristic:
    petrify the opponent's beefiest card."""
    b = game.board
    opp = 1 - player
    cands = [t for t in range(E.NCELLS) if b.own[opp] >> t & 1]
    if not cands:
        cands = [t for t in range(E.NCELLS) if b.own[player] >> t & 1]
    if not cands:
        return None
    return max(cands, key=lambda t: sum(E.faces(b.cards[t])))
