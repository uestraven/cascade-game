"""Fun proxies, not fairness: is the game tense, varied, and decided late?"""
import random
from collections import Counter
import engine as E

def analyse(games=4000, seed=42):
    rng = random.Random(seed)
    spread = Counter(); changes = Counter(); late = 0
    unique_best = 0; total_turns = 0; tie_sizes = []
    for _ in range(games):
        g = E.Game(E.deal(rng))
        lead = None; nchange = 0; lead_hist = []
        while not g.is_over():
            # how decisive is this decision?
            p = g.to_move; hand = g.hands[p]
            vals = []
            for i, cell in g.legal_moves():
                b = g.board.copy()
                vals.append(E.place(b, cell, hand[i], p, g.cap, g.bonus))
            best = max(vals); nbest = vals.count(best)
            second = max([v for v in vals if v < best], default=None)
            if second is not None and nbest == 1:
                unique_best += 1
            tie_sizes.append(nbest)
            total_turns += 1
            i, cell = E.policy_greedy(g, rng)
            g.play(i, cell)
            a, b2 = g.score()
            cur = 0 if a > b2 else (1 if b2 > a else -1)
            lead_hist.append(cur)
            if lead is not None and cur != lead and cur != -1:
                nchange += 1
            lead = cur
        a, b2 = g.score()
        spread[f'{max(a,b2)}-{min(a,b2)}'] += 1
        changes[nchange] += 1
        if len(lead_hist) >= 3 and lead_hist[-1] != lead_hist[-3]:
            late += 1
    n = games
    print("final score spread:")
    for k in sorted(spread, reverse=True):
        print(f"   {k}   {100*spread[k]/n:5.1f}%")
    print("\nlead changes per game:")
    for k in sorted(changes):
        print(f"   {k}   {100*changes[k]/n:5.1f}%")
    print(f"\nmean lead changes: {sum(k*v for k,v in changes.items())/n:.2f}")
    print(f"lead differs from 2 turns before the end: {100*late/n:.1f}%")
    print(f"\ndecisions with a UNIQUE best move: {100*unique_best/total_turns:.1f}%")
    print(f"mean number of tied-best moves: {sum(tie_sizes)/len(tie_sizes):.1f}")

analyse()
