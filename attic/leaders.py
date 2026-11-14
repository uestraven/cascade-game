#!/usr/bin/env python3
"""
Leader system, implemented to the corrected specs.

  PRINCE     Activated aura. For the rest of the game, this player's cards
             get +1 to their facing value WHEN ATTACKING. Card data is never
             mutated, so every weak flank stays weak on defence.
  LOVER      Swap the positions of two directly adjacent cells you own.
             Ownership is uniform, so one front: cascade from A, then from B.
  TANTALUS   Target an enemy card; all its faces -1, floor 1 (the floor
             keeps a 1/1/1/1 card from packing to 0, the empty sentinel).
             Then only YOUR adjacent cards attempt a depth-0 capture on it.
  DISRUPTER  Stand-in for ABYSSMAL, whose hand-revelation is a no-op against
             a perfect-information policy. Forces the opponent to discard one
             random unplayed card and replace it from the global pool.

Every activation CONSUMES THE PLAYER'S TURN PLACEMENT, per spec. That means
the board no longer fills: if exactly one player activates, 8 cards sit on
9 cells and a 4-4 draw is reachable, so a tie-break is required again.
"""

import random

import engine as E

PRINCE, LOVER, TANTALUS, DISRUPTER = 'PRINCE', 'LOVER', 'TANTALUS', 'DISRUPTER'
ALL_LEADERS = (PRINCE, LOVER, TANTALUS, DISRUPTER)


def weaken(card, amount=1, floor=1):
    """Lower every face by `amount`, never below `floor`. Packs directly:
    this mutates an existing card rather than constructing a new one."""
    n, e, s, w = (max(floor, v - amount) for v in E.faces(card))
    return n | e << 4 | s << 8 | w << 12 | E.element(card) << E._ELEM_SHIFT


class LeaderGame:
    def __init__(self, hands, leaders=(None, None), order=E.TURN_ORDER,
                 cap=E.CASCADE_CAP, bonus=E.ELEMENT_BONUS):
        self.board = E.Board()
        self.hands = [list(h) for h in hands]
        self.leaders = tuple(leaders)
        self.used = [False, False]
        self.aura = [0, 0]
        self.order = tuple(order)
        self.cap = cap
        self.bonus = bonus
        self.turn = 0
        self.history = []

    # -- state ------------------------------------------------------------
    @property
    def to_move(self):
        return self.order[self.turn] if not self.is_over() else -1

    def is_over(self):
        return self.turn >= len(self.order)

    def copy(self):
        g = LeaderGame.__new__(LeaderGame)
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
        return g

    # -- legal actions ----------------------------------------------------
    def placements(self):
        hand = self.hands[self.to_move]
        cells = self.board.empty_cells()
        return [('place', i, c) for i in range(len(hand)) for c in cells]

    def leader_actions(self):
        p = self.to_move
        kind = self.leaders[p]
        if kind is None or self.used[p]:
            return []
        b = self.board
        if kind == PRINCE:
            return [('leader', None)] if not self.aura[p] else []
        if kind == LOVER:
            out = []
            for a in range(E.NCELLS):
                if not b.own[p] >> a & 1:
                    continue
                for side in range(4):
                    nb = E.NEIGHBOURS[a][side]
                    if nb > a and b.own[p] >> nb & 1:
                        out.append(('leader', (a, nb)))
            return out
        if kind == TANTALUS:
            opp = 1 - p
            return [('leader', t) for t in range(E.NCELLS)
                    if b.own[opp] >> t & 1]
        if kind == DISRUPTER:
            return [('leader', None)] if self.hands[1 - p] else []
        raise ValueError(kind)

    def legal_actions(self):
        if self.is_over():
            return []
        return self.placements() + self.leader_actions()

    # -- execution --------------------------------------------------------
    def apply_leader(self, payload, rng):
        p = self.to_move
        kind = self.leaders[p]
        b = self.board
        self.used[p] = True
        captured = 0

        if kind == PRINCE:
            self.aura[p] = 1

        elif kind == LOVER:
            a, c = payload
            b.cards[a], b.cards[c] = b.cards[c], b.cards[a]
            captured += E.cascade(b, 1 << a, p, self.cap, self.bonus,
                                  self.aura[p])
            captured += E.cascade(b, 1 << c, p, self.cap, self.bonus,
                                  self.aura[p])

        elif kind == TANTALUS:
            target = payload
            b.cards[target] = weaken(b.cards[target])
            # depth-0 only: just this player's neighbours, no ripple
            for side in range(4):
                src = E.NEIGHBOURS[target][side]
                if src < 0 or not b.own[p] >> src & 1:
                    continue
                back = E.OPPOSITE[side]
                if E.beats(b.cards[src], back, b.cards[target], self.bonus,
                           self.aura[p]):
                    b.own[p] |= 1 << target
                    b.own[1 - p] &= ~(1 << target)
                    captured = 1
                    break

        elif kind == DISRUPTER:
            opp_hand = self.hands[1 - p]
            if opp_hand:
                opp_hand[rng.randrange(len(opp_hand))] = E.random_card(rng)

        return captured

    def act(self, action, rng):
        if self.is_over():
            raise ValueError('game is over')
        p = self.to_move
        if action[0] == 'place':
            _, i, cell = action
            card = self.hands[p].pop(i)
            got = E.place(self.board, cell, card, p, self.cap, self.bonus,
                          self.aura[p])
            self.history.append((p, 'place', cell, got))
        else:
            got = self.apply_leader(action[1], rng)
            self.history.append((p, f'leader:{self.leaders[p]}',
                                 action[1], got))
        self.turn += 1
        return got

    # -- result -----------------------------------------------------------
    def score(self):
        return (self.board.count(0), self.board.count(1))

    def result(self):
        """(winner_by_cards, winner_after_power_tiebreak); -1 = still drawn."""
        a, b = self.score()
        if a != b:
            w = 0 if a > b else 1
            return w, w
        pa = sum(sum(E.faces(self.board.cards[i])) for i in range(E.NCELLS)
                 if self.board.owner_of(i) == 0)
        pb = sum(sum(E.faces(self.board.cards[i])) for i in range(E.NCELLS)
                 if self.board.owner_of(i) == 1)
        if pa == pb:
            return -1, -1
        return -1, (0 if pa > pb else 1)


# ---------------------------------------------------------------------------
# Policies
# ---------------------------------------------------------------------------
def _score_action(game, action, rng):
    probe = game.copy()
    return probe.act(action, rng)


def greedy_action(game, rng, candidates=None):
    """Most immediate captures; ties broken at random."""
    cands = candidates if candidates is not None else game.placements()
    best, ties = -1, []
    for a in cands:
        got = _score_action(game, a, rng)
        if got > best:
            best, ties = got, [a]
        elif got == best:
            ties.append(a)
    return rng.choice(ties)


def make_policy(activate_turn=None):
    """Greedy placement, with the leader fired on a scheduled turn index.

    Prince and Disrupter have no immediate capture payoff, so a greedy agent
    would never choose them. Scheduling the activation and sweeping the slot
    gives each leader its best-case value instead of its greedy-case value.
    """
    def policy(game, rng):
        p = game.to_move
        if activate_turn is not None and game.turn == activate_turn \
                and not game.used[p]:
            opts = game.leader_actions()
            if opts:
                return greedy_action(game, rng, opts)
        return greedy_action(game, rng, game.placements())
    return policy


def play_match(hands, leaders, policies, rng, order=E.TURN_ORDER,
               cap=E.CASCADE_CAP, bonus=E.ELEMENT_BONUS):
    game = LeaderGame(hands, leaders, order, cap, bonus)
    while not game.is_over():
        action = policies[game.to_move](game, rng)
        game.act(action, rng)
    return game


def demo():
    rng = random.Random(3)
    hands = E.deal(rng)
    game = play_match(hands, (TANTALUS, LOVER),
                      (make_policy(4), make_policy(6)), rng)
    for t, (p, what, where, got) in enumerate(game.history, 1):
        print(f'T{t}  P{p+1}  {what:<18} {str(where):<8} captures {got}')
    print()
    print(E.render(game.board))
    print('\nscore', game.score(), 'result', game.result())


if __name__ == '__main__':
    demo()
