#!/usr/bin/env python3
"""
Re-run of the Model 1 co-cast sweep with the revised leaders:

  PRINCE   aura bounded to your next 2 placements
  LOVER    'one'  = swap, cascade from ONE chosen cell
           'none' = swap only, no cascade
  TANTALUS debuff = -min(3, empty cells), inverting its value curve

Target: asymmetry and mirror skew inside +/-5 points for all four.
"""

import random
from collections import Counter

import engine as E
import leaders as L
import variants as V

P1_SLOTS = [i for i, p in enumerate(E.TURN_ORDER) if p == 0]
P2_SLOTS = [i for i, p in enumerate(E.TURN_ORDER) if p == 1]
GAMES = 3500

CONFIGS = [
    ('PRINCE/2turn',  L.PRINCE,   {'prince': 'turns2'}),
    ('LOVER/one',     L.LOVER,    {'lover': 'one'}),
    ('LOVER/none',    L.LOVER,    {'lover': 'none'}),
    ('TANTALUS/empty', L.TANTALUS, {'tantalus': 'empty',
                                    'tantalus_cap': 3}),
]


def fire(game, rng):
    opts = game.leader_actions()
    if not opts:
        return False
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


def play(hands, leaders, rules, schedule, mode, rng):
    game = V.VariantGame(hands, leaders, rules)
    fired = [False, False]
    while not game.is_over():
        p = game.to_move
        due = (schedule[p] is not None and game.turn == schedule[p]
               and not game.used[p])
        if due and mode == 'before':
            fired[p] |= fire(game, rng)
        game.act(L.greedy_action(game, rng, game.placements()), rng)
        if due and mode == 'after':
            saved, game.turn = game.turn, schedule[p]
            fired[p] |= fire(game, rng)
            game.turn = saved
    return game, fired


def run(games, leaders, rules, schedule, mode, seed=24680):
    rng = random.Random(seed)
    a = Counter()
    for _ in range(games):
        game, fired = play(E.deal(rng), leaders, rules, schedule, mode, rng)
        _, tb = game.result()
        a['tb_dr' if tb == -1 else f'tb_p{tb+1}'] += 1
        a['f1'] += 1 if fired[0] else 0
        a['f2'] += 1 if fired[1] else 0
    n = games
    return {k: v / n for k, v in a.items()}


def pct(x):
    return f"{100*x:5.1f}%"


def main():
    base = run(GAMES, (None, None), {}, (None, None), 'before')
    b = (base.get('tb_p1', 0), base.get('tb_p2', 0))
    print("=" * 98)
    print(f"BASELINE, no leaders:  P1 {pct(b[0])}  P2 {pct(b[1])}  "
          f"edge {pct(b[1]-b[0])}   draws {pct(base.get('tb_dr',0))}")
    print("=" * 98)

    best = {}
    for label, kind, rules in CONFIGS:
        print()
        print(f"--- {label} " + "-" * (94 - len(label)))
        print(f"{'owner':<6}{'slot':<6}{'fired B':>9}{'net B':>9}"
              f"{'fired A':>9}{'net A':>9}{'best':>8}")
        for who, slots in ((0, P1_SLOTS), (1, P2_SLOTS)):
            for s in slots:
                sched = (s, None) if who == 0 else (None, s)
                lead = (kind, None) if who == 0 else (None, kind)
                vals = {}
                for mode in ('before', 'after'):
                    r = run(GAMES, lead, rules, sched, mode)
                    mine = r.get(f'tb_p{who+1}', 0)
                    vals[mode] = (mine - b[who], r.get(f'f{who+1}', 0))
                nb, fb = vals['before']
                na, fa = vals['after']
                pick = 'after' if na > nb else 'before'
                print(f"{'P1' if who == 0 else 'P2':<6}T{s+1:<5}"
                      f"{pct(fb):>9}{pct(nb):>9}{pct(fa):>9}{pct(na):>9}"
                      f"{pick:>8}")
                key = (label, who)
                cand = (max(nb, na), s, pick)
                if key not in best or cand[0] > best[key][0]:
                    best[key] = cand

    print()
    print("=" * 98)
    print("OPTIMA AND MIRROR MATCHES")
    print("=" * 98)
    print(f"{'leader':<17}{'P1':>13}{'P1 net':>9}{'P2':>13}{'P2 net':>9}"
          f"{'asym':>8}{'mirror edge':>13}{'vs base':>10}")
    for label, kind, rules in CONFIGS:
        n1, s1, m1 = best[(label, 0)]
        n2, s2, m2 = best[(label, 1)]
        r = run(GAMES, (kind, kind), rules, (s1, s2), m1)
        p1, p2 = r.get('tb_p1', 0), r.get('tb_p2', 0)
        print(f"{label:<17}{'T'+str(s1+1)+' '+m1:>13}{pct(n1):>9}"
              f"{'T'+str(s2+1)+' '+m2:>13}{pct(n2):>9}{pct(n1-n2):>8}"
              f"{pct(p2-p1):>13}{pct((p2-p1)-(b[1]-b[0])):>10}")
    print()
    print("   Target: |asym| and |vs base| both under 5 points.")
    print("   NOTE: LOVER/none has no immediate capture payoff, so the greedy")
    print("   chooser picks a swap at random. Its measured value is therefore")
    print("   a FLOOR, not an estimate -- positional setup is invisible here.")


if __name__ == '__main__':
    main()
