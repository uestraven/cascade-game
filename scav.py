"""SCAVENGER under both readings, plus LETO as 'frozen, not neutral'."""
import random
from collections import Counter
import engine as E, leaders as L, newleaders as N
from sim13 import fire, greedy_place, P1_SLOTS, P2_SLOTS, GAMES, pct

class FrozenGame(N.NewLeaderGame):
    """LETO keeps the card with its owner; it just can't be captured."""
    def copy(self):
        g = super().copy(); g.__class__ = FrozenGame; return g
    def apply_leader(self, payload, rng):
        if self.leaders[self.to_move] != N.LETO:
            return super().apply_leader(payload, rng)
        self.used[self.to_move] = True
        self.frozen = getattr(self, 'frozen', 0) | (1 << payload)
        # owner unchanged -> still scores. Uncapturable: hide from cascades
        # by parking it in a shadow mask the engine never reads as a target.
        self.shadow = getattr(self, 'shadow', [])
        self.shadow.append((payload, self.board.owner_of(payload)))
        self.board.own[0] &= ~(1 << payload)
        self.board.own[1] &= ~(1 << payload)
        self.petrified |= 1 << payload
        return 0
    def result(self):
        for cell, owner in getattr(self, 'shadow', []):
            self.board.own[owner] |= 1 << cell      # restore for scoring
        self.petrified = 0
        return super().result()

def play(cls, hands, leaders, rules, schedule, modes, rng):
    game = cls(hands, leaders, rules)
    while not game.is_over():
        p = game.to_move
        due = schedule[p] is not None and game.turn == schedule[p] and not game.used[p]
        if due and modes[p] == 'before': fire(game, rng)
        i, cell = greedy_place(game, rng)
        game.act(('place', i, cell), rng)
        if due and modes[p] == 'after':
            saved, game.turn = game.turn, schedule[p]
            fire(game, rng); game.turn = saved
    return game

def run(cls, leaders, rules, schedule, modes, games=GAMES, seed=55555):
    rng = random.Random(seed); a = Counter()
    for _ in range(games):
        g = play(cls, E.deal(rng), leaders, rules, schedule, modes, rng)
        raw, tb = g.result()
        a['raw_dr' if raw == -1 else 'x'] += 1
        a['tb_dr' if tb == -1 else f'p{tb+1}'] += 1
    return {k: v/games for k, v in a.items()}

RB = {'prince':'turns2','lover':'both','tantalus':'flat'}
base = run(N.NewLeaderGame, (None,None), RB, (None,None), ('before','before'))
b1, b2 = base.get('p1',0), base.get('p2',0)
print(f"baseline  P1 {pct(b1)}  P2 {pct(b2)}  edge {pct(b2-b1)}\n")

print("SCAVENGER, 'nosteal' reading (card stays theirs, cascade credits you)")
print(f"{'owner':<6}{'slot':<6}{'net':>9}")
R = dict(RB, scavenger='nosteal')
best = {}
for who, slots in ((0,P1_SLOTS),(1,P2_SLOTS)):
    for s in slots:
        sched = (s,None) if who==0 else (None,s)
        lead = (N.SCAVENGER,None) if who==0 else (None,N.SCAVENGER)
        vals=[]
        for m in ('before','after'):
            modes = (m,m)
            r = run(N.NewLeaderGame, lead, R, sched, modes)
            vals.append((r.get(f'p{who+1}',0) - (b1 if who==0 else b2), m))
        v, m = max(vals)
        print(f"{'P1' if who==0 else 'P2':<6}T{s+1:<5}{pct(v):>9}  ({m})")
        if who not in best or v > best[who][0]: best[who] = (v, s, m)
print()
v1,s1,m1 = best[0]; v2,s2,m2 = best[1]
r = run(N.NewLeaderGame, (N.SCAVENGER,N.SCAVENGER), R, (s1,s2), (m1,m2))
p1,p2 = r.get('p1',0), r.get('p2',0)
print(f"mirror T{s1+1} {m1} / T{s2+1} {m2}:  P1 {pct(p1)}  P2 {pct(p2)}  "
      f"edge {pct(p2-p1)}  vs base {pct((p2-p1)-(b2-b1))}  asym {pct(v1-v2)}")

print("\nLETO as 'frozen, not neutral' (owner keeps it; uncapturable)")
r1 = run(FrozenGame, (N.LETO,None), RB, (8,None), ('after','after'))
r2 = run(FrozenGame, (None,N.LETO), RB, (None,7), ('after','after'))
rm = run(FrozenGame, (N.LETO,N.LETO), RB, (8,7), ('after','after'))
print(f"  P1 T9 net {pct(r1.get('p1',0)-b1)}   draws {pct(r1.get('raw_dr',0))}")
print(f"  P2 T8 net {pct(r2.get('p2',0)-b2)}   draws {pct(r2.get('raw_dr',0))}")
print(f"  mirror edge {pct(rm.get('p2',0)-rm.get('p1',0))}"
      f"  vs base {pct((rm.get('p2',0)-rm.get('p1',0))-(b2-b1))}"
      f"  draws {pct(rm.get('raw_dr',0))}")
