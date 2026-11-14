#!/usr/bin/env python3
"""
Leader variants aimed at turning monotone-increasing value curves into
peaked ones, so that timing is a real decision and the player with the
final placement stops winning the race by default.

  prince   = 'permanent' | 'turns2'
               turns2: the aura covers only your next 2 placements.
  lover    = 'both' | 'one' | 'none'
               both: cascade from A and B (original; +30.9 at T9-after)
               one:  cascade from ONE chosen cell (halves the payoff)
               none: pure repositioning, no cascade at all
  tantalus = 'flat' | 'empty'
               flat:  -1 to all faces (original; peaks on the last turn)
               empty: -min(cap, empty cells remaining), inverting the curve
                      so the ability is strongest on a sparse board
  tantalus_cap = int, used by 'empty'
"""

import engine as E
import leaders as L

DEFAULT_RULES = {
    'prince': 'permanent',
    'lover': 'both',
    'tantalus': 'flat',
    'tantalus_cap': 3,
}


class VariantGame(L.LeaderGame):
    def __init__(self, hands, leaders=(None, None), rules=None,
                 order=E.TURN_ORDER, cap=E.CASCADE_CAP,
                 bonus=E.ELEMENT_BONUS):
        super().__init__(hands, leaders, order, cap, bonus)
        self.rules = dict(DEFAULT_RULES, **(rules or {}))
        self.aura_left = [0, 0]

    def copy(self):
        g = VariantGame.__new__(VariantGame)
        g.board = self.board.copy()
        g.hands = [h[:] for h in self.hands]
        g.leaders = self.leaders
        g.used = self.used[:]
        g.aura = self.aura[:]
        g.order = self.order
        g.cap = self.cap
        g.bonus = self.bonus
        g.turn = self.turn
        g.history = []
        g.rules = self.rules
        g.aura_left = self.aura_left[:]
        return g

    def atk(self, player):
        """Current offence modifier for `player`."""
        if self.rules['prince'] == 'turns2':
            return 1 if self.aura_left[player] > 0 else 0
        return self.aura[player]

    def n_empty(self):
        return E.NCELLS - bin(self.board.occupied).count('1')

    # -- legal actions ----------------------------------------------------
    def leader_actions(self):
        p = self.to_move
        if self.leaders[p] == L.LOVER and self.rules['lover'] == 'one' \
                and not self.used[p]:
            b = self.board
            out = []
            for a in range(E.NCELLS):
                if not b.own[p] >> a & 1:
                    continue
                for side in range(4):
                    nb = E.NEIGHBOURS[a][side]
                    if nb > a and b.own[p] >> nb & 1:
                        out.append(('leader', (a, nb, a)))
                        out.append(('leader', (a, nb, nb)))
            return out
        return super().leader_actions()

    # -- execution --------------------------------------------------------
    def apply_leader(self, payload, rng):
        p = self.to_move
        kind = self.leaders[p]
        b = self.board
        self.used[p] = True
        captured = 0

        if kind == L.PRINCE:
            if self.rules['prince'] == 'turns2':
                self.aura_left[p] = 2
            else:
                self.aura[p] = 1

        elif kind == L.LOVER:
            mode = self.rules['lover']
            if mode == 'one':
                a, c, origin = payload
                b.cards[a], b.cards[c] = b.cards[c], b.cards[a]
                captured += E.cascade(b, 1 << origin, p, self.cap,
                                      self.bonus, self.atk(p))
            else:
                a, c = payload
                b.cards[a], b.cards[c] = b.cards[c], b.cards[a]
                if mode == 'both':
                    captured += E.cascade(b, 1 << a, p, self.cap,
                                          self.bonus, self.atk(p))
                    captured += E.cascade(b, 1 << c, p, self.cap,
                                          self.bonus, self.atk(p))
                # mode == 'none': repositioning only, no capture wave

        elif kind == L.TANTALUS:
            target = payload
            if self.rules['tantalus'] == 'empty':
                amount = min(self.rules['tantalus_cap'], self.n_empty())
            else:
                amount = 1
            if amount > 0:
                b.cards[target] = L.weaken(b.cards[target], amount)
                for side in range(4):
                    src = E.NEIGHBOURS[target][side]
                    if src < 0 or not b.own[p] >> src & 1:
                        continue
                    if E.beats(b.cards[src], E.OPPOSITE[side],
                               b.cards[target], self.bonus, self.atk(p)):
                        b.own[p] |= 1 << target
                        b.own[1 - p] &= ~(1 << target)
                        captured = 1
                        break

        elif kind == L.DISRUPTER:
            opp = self.hands[1 - p]
            if opp:
                opp[rng.randrange(len(opp))] = E.random_card(rng)

        return captured

    def act(self, action, rng):
        if self.is_over():
            raise ValueError('game is over')
        p = self.to_move
        if action[0] == 'place':
            _, i, cell = action
            card = self.hands[p].pop(i)
            got = E.place(self.board, cell, card, p, self.cap, self.bonus,
                          self.atk(p))
            if self.rules['prince'] == 'turns2' and self.aura_left[p] > 0:
                self.aura_left[p] -= 1
            self.history.append((p, 'place', cell, got))
        else:
            got = self.apply_leader(action[1], rng)
            self.history.append((p, f'leader:{self.leaders[p]}',
                                 action[1], got))
        self.turn += 1
        return got
