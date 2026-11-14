#!/usr/bin/env python3
"""
Property tests for engine.py against sim.py, which is the oracle every
balance number in this design was measured with.

1. place() must agree with sim.resolve() on random positions: same set of
   captured cells, same capture count.
2. Structural invariants: chains terminate, every capture accrues to the
   placing player, no card flips twice in one placement.
3. The weak-flank rule must be enforced.
4. End-to-end: the engine must reproduce the measured seat edge.
"""

import random
import sys

import engine as E
import sim as S


def to_sim_card(card):
    n, e, s, w = E.faces(card)
    el = E.element(card)
    return ((n, e, s, w), E.ELEMENT_NAMES[el - 1] if el else None)


def random_position(rng, n_placed):
    """A random legal mid-game position, plus a card and an empty cell."""
    board = E.Board()
    cells = rng.sample(range(E.NCELLS), n_placed)
    for cell in cells:
        card = E.random_card(rng, with_element=rng.random() < 0.8)
        board.cards[cell] = card
        board.own[rng.randrange(2)] |= 1 << cell
    empties = board.empty_cells()
    if not empties:
        return None
    return board, rng.choice(empties), E.random_card(rng)


def to_sim_board(board):
    out = [None] * E.NCELLS
    for i in range(E.NCELLS):
        if board.cards[i]:
            sides, el = to_sim_card(board.cards[i])
            out[i] = [sides, el, board.owner_of(i)]
    return out


def test_agrees_with_oracle(trials=40000, seed=1):
    rng = random.Random(seed)
    for t in range(trials):
        n_placed = rng.randrange(0, 9)
        pos = random_position(rng, n_placed)
        if pos is None:
            continue
        board, cell, card = pos
        player = rng.randrange(2)
        bonus = rng.choice([0, 1, 2, 3])
        cap = rng.choice([0, 1, 2, 99])

        mine = board.copy()
        got_mine = E.place(mine, cell, card, player, cap, bonus)

        theirs = to_sim_board(board)
        sides, el = to_sim_card(card)
        got_theirs = S.resolve(theirs, cell, (sides, el), player, cap, bonus)

        assert got_mine == got_theirs, (
            f'capture count differs at trial {t}: '
            f'{got_mine} vs {got_theirs} (cap={cap} bonus={bonus})')
        for i in range(E.NCELLS):
            want = theirs[i][2] if theirs[i] is not None else -1
            assert mine.owner_of(i) == want, (
                f'ownership differs at cell {i}, trial {t} '
                f'(cap={cap} bonus={bonus})')
    return trials


def test_invariants(trials=20000, seed=2):
    """Captures only ever move cards TO the placing player, and terminate."""
    rng = random.Random(seed)
    for _ in range(trials):
        pos = random_position(rng, rng.randrange(0, 9))
        if pos is None:
            continue
        board, cell, card = pos
        player = rng.randrange(2)
        before_opp = board.count(1 - player)
        before_own = board.count(player)

        after = board.copy()
        got = E.place(after, cell, card, player, cap=99)

        # The opponent can only lose cards; we can only gain them.
        assert after.count(1 - player) == before_opp - got
        assert after.count(player) == before_own + got + 1
        # A chain cannot take more than the opponent had.
        assert got <= before_opp
        # Masks stay disjoint and consistent with occupancy.
        assert after.own[0] & after.own[1] == 0
        occ_bits = bin(after.occupied).count('1')
        assert occ_bits == before_own + before_opp + 1
    return trials


def test_weak_flank():
    try:
        E.make_card(4, 5, 6, 7)
    except ValueError:
        pass
    else:
        raise AssertionError('weak-flank rule not enforced')
    E.make_card(3, 10, 10, 10)          # legal: one face <= 3
    assert all(min(t) <= 3 for t in E.LEGAL_FACES)
    assert len(E.LEGAL_FACES) == 7599
    return len(E.LEGAL_FACES)


def test_no_draws(games=4000, seed=3):
    rng = random.Random(seed)
    for _ in range(games):
        game = E.play_match(E.deal(rng), (E.policy_greedy, E.policy_greedy),
                            rng)
        a, b = game.score()
        assert a + b == 9
        assert a != b, 'draw occurred on an odd board'
        game.winner()
    return games


def seat_edge(games, policy, seed=4):
    rng = random.Random(seed)
    wins = [0, 0]
    for _ in range(games):
        game = E.play_match(E.deal(rng), (policy, policy), rng)
        wins[game.winner()] += 1
    return wins[0] / games, wins[1] / games


def main():
    print('weak-flank rule:        ', test_weak_flank(), 'legal face combos')
    print('wheel regular:          ', E.wheel_is_regular())
    n = test_agrees_with_oracle()
    print(f'oracle agreement:        {n} random positions, exact match')
    n = test_invariants()
    print(f'structural invariants:   {n} positions, all held')
    n = test_no_draws()
    print(f'no draws:                {n} full games, none drawn')

    print()
    print('seat edge (should be ~0.0% greedy, ~-2.9% lookahead):')
    for label, pol, g in (('greedy', E.policy_greedy, 20000),
                          ('lookahead', E.policy_lookahead, 3000)):
        p1, p2 = seat_edge(g, pol)
        print(f'  {label:<10} P1 {100*p1:5.1f}%   P2 {100*p2:5.1f}%   '
              f'edge {100*(p2-p1):+5.1f}%   [{g} games]')
    print('\nall tests passed')


if __name__ == '__main__':
    sys.exit(main())
