#!/usr/bin/env python3
"""
Sweep SCAVENGER and LETO against the established leaders.

Reported: net value by slot and cast ordering, seat asymmetry, mirror skew,
and -- for Leto -- the draw rate, since petrifying a card leaves only 8
scoring cards on 9 cells.
"""

import random
from collections import Counter

import engine as E
import leaders as L
import newleaders as N

P1_SLOTS = [i for i, p in enumerate(E.TURN_ORDER) if p == 0]
P2_SLOTS = [i for i, p in enumerate(E.TURN_ORDER) if p == 1]
GAMES = 3500

RULES = {'prince': 'turns2', 'lover': 'both', 'tantalus': 'flat'}

CONFIGS = [
    ('SCAVENGER', N.SCAVENGER),
    ('LETO', N.LETO),
    ('LOVER (ref)', L.LOVER),
]


def fire(game, rng):
    p = game.to_move
    opts = game.leader_actions()
    if not opts:
        return False
    if game.leaders[p] == N.LETO:
        t = N.leto_target(game, p)
        if t is None:
            return False
        game.apply_leader(t, rng)
        return True
    best, ties = -1, []
    for a in opts:
        probe = game.copy()
        got = probe.apply_leader(a[1], rng)
        if got > best:
            best, ties = got, [a]
        elif got == best:
            ties.append(a)
    game.apply_leader(rng.choice(ties)[1], rng)
    return True


def greedy_place(game, rng):
    p = game.to_move
    hand = game.hands[p]
    best, ties = -1, []
    for i, cell in game.placements_pairs():
        probe = game.copy()
        got = E.place(probe.board, cell, hand[i], p, probe.cap, probe.bonus,
                      probe.atk(p))
        if got > best:
            best, ties = got, [(i, cell)]
        elif got == best:
            ties.append((i, cell))
    return rng.choice(ties)


# small helper bolted on so greedy_place can enumerate (i, cell) pairs
N.NewLeaderGame.placements_pairs = lambda self: [
    (a[1], a[2]) for a in self.placements()]


def play(hands, leaders, schedule, mode, rng):
    game = N.NewLeaderGame(hands, leaders, RULES)
    fired = [False, False]
    while not game.is_over():
        p = game.to_move
        due = (schedule[p] is not None and game.turn == schedule[p]
               and not game.used[p])
        if due and mode == 'before':
            fired[p] |= fire(game, rng)
        i, cell = greedy_place(game, rng)
        game.act(('place', i, cell), rng)
        if due and mode == 'after':
            saved, game.turn = game.turn, schedule[p]
            fired[p] |= fire(game, rng)
            game.turn = saved
    return game, fired


def run(games, leaders, schedule, mode, seed=31415):
    rng = random.Random(seed)
    a = Counter()
    for _ in range(games):
        game, fired = play(E.deal(rng), leaders, schedule, mode, rng)
        raw, tb = game.result()
        a['raw_dr' if raw == -1 else f'raw_p{raw+1}'] += 1
        a['tb_dr' if tb == -1 else f'tb_p{tb+1}'] += 1
        a['f1'] += 1 if fired[0] else 0
        a['f2'] += 1 if fired[1] else 0
    n = games
    return {k: v / n for k, v in a.items()}


def pct(x):
    return f"{100*x:5.1f}%"


def main():
    base = run(GAMES, (None, None), (None, None), 'before')
    b = (base.get('tb_p1', 0), base.get('tb_p2', 0))
    print("=" * 100)
    print(f"BASELINE: P1 {pct(b[0])}  P2 {pct(b[1])}  edge {pct(b[1]-b[0])}"
          f"  draws {pct(base.get('raw_dr',0))}")
    print("=" * 100)

    best = {}
    for label, kind in CONFIGS:
        print()
        print(f"--- {label} " + "-" * (96 - len(label)))
        print(f"{'owner':<6}{'slot':<6}{'fired':>8}{'net B':>9}{'net A':>9}"
              f"{'best':>8}{'raw draw (best)':>17}")
        for who, slots in ((0, P1_SLOTS), (1, P2_SLOTS)):
            for s in slots:
                sched = (s, None) if who == 0 else (None, s)
                lead = (kind, None) if who == 0 else (None, kind)
                vals = {}
                for mode in ('before', 'after'):
                    r = run(GAMES, lead, sched, mode)
                    vals[mode] = (r.get(f'tb_p{who+1}', 0) - b[who],
                                  r.get(f'f{who+1}', 0), r.get('raw_dr', 0))
                nb = vals['before'][0]
                na = vals['after'][0]
                pick = 'after' if na > nb else 'before'
                fired = vals[pick][1]
                dr = vals[pick][2]
                print(f"{'P1' if who == 0 else 'P2':<6}T{s+1:<5}"
                      f"{pct(fired):>8}{pct(nb):>9}{pct(na):>9}{pick:>8}"
                      f"{pct(dr):>17}")
                key = (label, who)
                cand = (max(nb, na), s, pick)
                if key not in best or cand[0] > best[key][0]:
                    best[key] = cand

    print()
    print("=" * 100)
    print("OPTIMA AND MIRROR MATCHES  (mirror uses each player's own ordering)")
    print("=" * 100)
    print(f"{'leader':<14}{'P1':>13}{'P1 net':>9}{'P2':>13}{'P2 net':>9}"
          f"{'asym':>8}{'mirror':>9}{'vs base':>9}{'draw':>8}")
    for label, kind in CONFIGS:
        n1, s1, m1 = best[(label, 0)]
        n2, s2, m2 = best[(label, 1)]
        # mirror with per-player ordering
        rng = random.Random(2718)
        a = Counter()
        for _ in range(GAMES):
            game = N.NewLeaderGame(E.deal(rng), (kind, kind), RULES)
            while not game.is_over():
                p = game.to_move
                sched = (s1, s2)
                modes = (m1, m2)
                due = game.turn == sched[p] and not game.used[p]
                if due and modes[p] == 'before':
                    fire(game, rng)
                i, cell = greedy_place(game, rng)
                game.act(('place', i, cell), rng)
                if due and modes[p] == 'after':
                    saved, game.turn = game.turn, sched[p]
                    fire(game, rng)
                    game.turn = saved
            raw, tb = game.result()
            a['raw_dr' if raw == -1 else 'x'] += 1
            a['tb_dr' if tb == -1 else f'tb_p{tb+1}'] += 1
        p1 = a['tb_p1'] / GAMES
        p2 = a['tb_p2'] / GAMES
        print(f"{label:<14}{'T'+str(s1+1)+' '+m1:>13}{pct(n1):>9}"
              f"{'T'+str(s2+1)+' '+m2:>13}{pct(n2):>9}{pct(n1-n2):>8}"
              f"{pct(p2-p1):>9}{pct((p2-p1)-(b[1]-b[0])):>9}"
              f"{pct(a['raw_dr']/GAMES):>8}")


if __name__ == '__main__':
    main()
