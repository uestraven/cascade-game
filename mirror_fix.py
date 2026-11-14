"""Mirror matches with PER-PLAYER cast ordering (sim12 forced P1's choice on both)."""
import random
from collections import Counter
import engine as E, leaders as L, variants as V
from sim12 import fire, GAMES

def play(hands, leaders, rules, schedule, modes, rng):
    game = V.VariantGame(hands, leaders, rules)
    while not game.is_over():
        p = game.to_move
        due = (schedule[p] is not None and game.turn == schedule[p]
               and not game.used[p])
        if due and modes[p] == 'before':
            fire(game, rng)
        game.act(L.greedy_action(game, rng, game.placements()), rng)
        if due and modes[p] == 'after':
            saved, game.turn = game.turn, schedule[p]
            fire(game, rng)
            game.turn = saved
    return game

def run(games, leaders, rules, schedule, modes, seed=13579):
    rng = random.Random(seed); a = Counter()
    for _ in range(games):
        g = play(E.deal(rng), leaders, rules, schedule, modes, rng)
        _, tb = g.result()
        a['dr' if tb == -1 else f'p{tb+1}'] += 1
    return {k: v/games for k, v in a.items()}

def pct(x): return f"{100*x:5.1f}%"

base = run(GAMES, (None, None), {}, (None, None), ('before','before'))
b1, b2 = base.get('p1',0), base.get('p2',0)
print(f"baseline  P1 {pct(b1)}  P2 {pct(b2)}  edge {pct(b2-b1)}\n")

OPT = [
    ('PRINCE/2turn',   L.PRINCE,   {'prince':'turns2'},               (4,6), ('after','before')),
    ('LOVER/one',      L.LOVER,    {'lover':'one'},                   (8,7), ('after','after')),
    ('LOVER/none',     L.LOVER,    {'lover':'none'},                  (5,7), ('after','after')),
    ('TANTALUS/empty', L.TANTALUS, {'tantalus':'empty','tantalus_cap':3}, (8,7), ('before','after')),
]
print(f"{'leader':<17}{'P1 slot/cast':<16}{'P2 slot/cast':<16}{'P1':>8}{'P2':>8}{'edge':>8}{'vs base':>9}")
for label, kind, rules, sched, modes in OPT:
    r = run(GAMES, (kind, kind), rules, sched, modes)
    p1, p2 = r.get('p1',0), r.get('p2',0)
    print(f"{label:<17}{'T'+str(sched[0]+1)+' '+modes[0]:<16}"
          f"{'T'+str(sched[1]+1)+' '+modes[1]:<16}"
          f"{pct(p1):>8}{pct(p2):>8}{pct(p2-p1):>8}{pct((p2-p1)-(b2-b1)):>9}")
