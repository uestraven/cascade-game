#!/usr/bin/env python3
"""
Simulator for a 3x3 cascade-capture card game.

Rules modelled:
  - 3x3 grid, one cell locked as an Obstacle (chosen by P1 pre-game).
  - 8 playable cells, 4 cards per player, strict alternation, P1 first.
    => P2 holds the final placement (T8).
  - Cards have 4 side values (N,E,S,W) and optionally one element.
  - On placement: the placed card compares its facing side against each
    adjacent opponent-owned card's facing side. Strictly greater => capture.
  - Cascade: newly captured cards then attack their own opponent-owned
    neighbours. Depth cap `cap` = number of ADDITIONAL waves after placement.
      cap=0 -> 1 wave (placement only)
      cap=1 -> 2 waves (the spec under discussion)
      cap=99 -> unbounded
  - All captures in a chain accrue to the placing player (guarantees termination).
  - Score = cards owned when the board is full. Equal => draw.
  - Element: if attacker's element beats defender's, attacker's facing value
    gets +bonus; if defender's beats attacker's, defender gets +bonus.
"""

import itertools
import random
import sys
from collections import Counter

GRID = 3
NS = 9
N_, E_, S_, W_ = 0, 1, 2, 3
OPPSIDE = (S_, W_, N_, E_)          # index by side -> facing side
DELTA = ((-1, 0), (0, 1), (1, 0), (0, -1))

# ---- neighbour table -------------------------------------------------------
NB = []
for idx in range(NS):
    r, c = divmod(idx, GRID)
    row = []
    for (dr, dc) in DELTA:
        nr, nc = r + dr, c + dc
        row.append(nr * GRID + nc if 0 <= nr < GRID and 0 <= nc < GRID else -1)
    NB.append(tuple(row))
NB = tuple(NB)

BLOCK = object()

# ---- element wheel ---------------------------------------------------------
ELEMENTS = ('Fire', 'Water', 'Earth', 'Air', 'Lightning', 'Ice', 'Shadow', 'Light')
BEATS = {
    'Fire':      frozenset({'Ice', 'Air'}),
    'Water':     frozenset({'Fire', 'Lightning'}),
    'Earth':     frozenset({'Water', 'Shadow'}),
    'Air':       frozenset({'Earth', 'Light'}),
    'Lightning': frozenset({'Air', 'Shadow'}),
    'Ice':       frozenset({'Earth', 'Lightning'}),
    'Shadow':    frozenset({'Light', 'Fire'}),
    'Light':     frozenset({'Ice', 'Water'}),
}


def audit_wheel():
    out = []
    beaten_by = {e: set() for e in ELEMENTS}
    for a in ELEMENTS:
        for b in BEATS[a]:
            beaten_by[b].add(a)
    regular = all(len(BEATS[e]) == 2 and len(beaten_by[e]) == 2 for e in ELEMENTS)
    mutual = [(a, b) for a in ELEMENTS for b in BEATS[a] if a in BEATS[b]]
    # transitive shortcut: A beats B and C, and B beats C
    shortcut = []
    for a in ELEMENTS:
        vs = list(BEATS[a])
        for x, y in itertools.permutations(vs, 2):
            if y in BEATS[x]:
                shortcut.append((a, x, y))
    # predator pairs interacting
    pred_int = []
    for e in ELEMENTS:
        ps = list(beaten_by[e])
        for x, y in itertools.permutations(ps, 2):
            if y in BEATS[x]:
                pred_int.append((e, x, y))
    out.append(f"regular (each beats 2 / loses to 2): {regular}")
    out.append(f"mutual-beat pairs: {len(mutual)}")
    out.append(f"victim-pair interactions: {len(shortcut)}")
    out.append(f"predator-pair interactions: {len(pred_int)}")
    return out


# ---- card distributions ----------------------------------------------------
def budget_pool(total, lo, hi):
    return [t for t in itertools.product(range(lo, hi + 1), repeat=4)
            if sum(t) == total]


POOLS = {}


def make_dist(name):
    """Return a sampler f(rng) -> sides tuple."""
    if name.startswith('uniform'):
        lo, hi = [int(x) for x in name[name.index('(') + 1:-1].split(',')]
        return lambda rng: (rng.randint(lo, hi), rng.randint(lo, hi),
                            rng.randint(lo, hi), rng.randint(lo, hi))
    if name.startswith('budget'):
        total, lo, hi = [int(x) for x in name[name.index('(') + 1:-1].split(',')]
        key = (total, lo, hi)
        if key not in POOLS:
            POOLS[key] = budget_pool(total, lo, hi)
        pool = POOLS[key]
        return lambda rng: rng.choice(pool)
    raise ValueError(name)


def make_card(rng, dist, elem_frac):
    sides = dist(rng)
    elem = rng.choice(ELEMENTS) if (elem_frac and rng.random() < elem_frac) else None
    return (sides, elem)


# ---- edge statistics -------------------------------------------------------
def edge_stats(dist, elem_frac, bonus, trials=400000, seed=1):
    rng = random.Random(seed)
    win = tie = lose = 0
    for _ in range(trials):
        a = make_card(rng, dist, elem_frac)
        b = make_card(rng, dist, elem_frac)
        d = rng.randrange(4)
        av = a[0][d]
        bv = b[0][OPPSIDE[d]]
        if a[1] and b[1]:
            if b[1] in BEATS[a[1]]:
                av += bonus
            elif a[1] in BEATS[b[1]]:
                bv += bonus
        if av > bv:
            win += 1
        elif av == bv:
            tie += 1
        else:
            lose += 1
    return win / trials, tie / trials, lose / trials


# ---- placement resolution --------------------------------------------------
def resolve(board, idx, card, owner, cap, bonus):
    """Mutates board. Returns number of cards captured."""
    board[idx] = [card[0], card[1], owner]
    frontier = [idx]
    captured = 0
    depth = 0
    while frontier and depth <= cap:
        newly = []
        for src in frontier:
            s_sides, s_elem, _ = board[src]
            nbrow = NB[src]
            for d in range(4):
                t = nbrow[d]
                if t < 0:
                    continue
                cell = board[t]
                if cell is None or cell is BLOCK:
                    continue
                if cell[2] == owner:
                    continue
                av = s_sides[d]
                dv = cell[0][OPPSIDE[d]]
                if s_elem and cell[1]:
                    if cell[1] in BEATS[s_elem]:
                        av += bonus
                    elif s_elem in BEATS[cell[1]]:
                        dv += bonus
                if av > dv:
                    cell[2] = owner
                    newly.append(t)
        captured += len(newly)
        frontier = newly
        depth += 1
    return captured


def copy_board(board):
    return [e if (e is None or e is BLOCK) else e[:] for e in board]


# ---- policies --------------------------------------------------------------
def moves(empties, hand):
    for i in range(len(hand)):
        for cell in empties:
            yield i, cell


def choose_random(board, empties, hands, owner, cap, bonus, rng):
    hand = hands[owner]
    return rng.randrange(len(hand)), rng.choice(empties)


def choose_greedy(board, empties, hands, owner, cap, bonus, rng):
    hand = hands[owner]
    best = -1
    ties = []
    for i, cell in moves(empties, hand):
        b2 = copy_board(board)
        f = resolve(b2, cell, hand[i], owner, cap, bonus)
        if f > best:
            best = f
            ties = [(i, cell)]
        elif f == best:
            ties.append((i, cell))
    return rng.choice(ties)


def choose_greedy2(board, empties, hands, owner, cap, bonus, rng):
    """Maximise (my captures - opponent's best immediate reply captures)."""
    hand = hands[owner]
    opp = 1 - owner
    opphand = hands[opp]
    best = None
    ties = []
    for i, cell in moves(empties, hand):
        b2 = copy_board(board)
        gain = resolve(b2, cell, hand[i], owner, cap, bonus)
        rem = [c for c in empties if c != cell]
        if rem and opphand:
            worst = 0
            for j, cell2 in moves(rem, opphand):
                b3 = copy_board(b2)
                worst = max(worst, resolve(b3, cell2, opphand[j], opp, cap, bonus))
        else:
            worst = 0
        val = gain - worst
        if best is None or val > best:
            best = val
            ties = [(i, cell)]
        elif val == best:
            ties.append((i, cell))
    return rng.choice(ties)


POLICIES = {'random': choose_random, 'greedy': choose_greedy, 'greedy2': choose_greedy2}

# ---- topology --------------------------------------------------------------
TOPO = {'center': 4, 'corner': 0, 'edgemid': 1}


def topo_profile(blocked):
    board = [None] * NS
    board[blocked] = BLOCK
    edges = 0
    deg = {}
    for idx in range(NS):
        if idx == blocked:
            continue
        d = 0
        for t in NB[idx]:
            if t >= 0 and t != blocked:
                d += 1
        deg[idx] = d
        edges += d
    return edges // 2, sorted(deg.values(), reverse=True)


# ---- one game --------------------------------------------------------------
def play(rng, blocked, dist, elem_frac, bonus, cap, policy):
    board = [None] * NS
    board[blocked] = BLOCK
    empties = [i for i in range(NS) if i != blocked]
    hands = [[make_card(rng, dist, elem_frac) for _ in range(4)],
             [make_card(rng, dist, elem_frac) for _ in range(4)]]
    pick = POLICIES[policy]
    final_caps = 0
    lead_before = None
    for turn in range(8):
        owner = turn % 2
        if turn == 7:
            cnt = [0, 0]
            for e in board:
                if e is not None and e is not BLOCK:
                    cnt[e[2]] += 1
            lead_before = (0 if cnt[0] > cnt[1] else (1 if cnt[1] > cnt[0] else -1))
            opp_cards_before = cnt[1 - owner]
        i, cell = pick(board, empties, hands, owner, cap, bonus, rng)
        card = hands[owner].pop(i)
        empties.remove(cell)
        caps = resolve(board, cell, card, owner, cap, bonus)
        if turn == 7:
            final_caps = caps
            final_cell = cell
    cnt = [0, 0]
    for e in board:
        if e is not None and e is not BLOCK:
            cnt[e[2]] += 1
    winner = 0 if cnt[0] > cnt[1] else (1 if cnt[1] > cnt[0] else -1)
    return {
        'winner': winner,
        'p1': cnt[0], 'p2': cnt[1],
        'final_caps': final_caps,
        'final_sweep': (opp_cards_before > 0 and final_caps == opp_cards_before),
        'opp_before': opp_cards_before,
        'flipped_winner': (lead_before != winner),
        'final_cell': final_cell,
        'center_open_at_t8': (4 != blocked and final_cell == 4),
    }


def run(games, blocked, dist, elem_frac, bonus, cap, policy, seed=12345):
    rng = random.Random(seed)
    agg = Counter()
    caps_hist = Counter()
    for _ in range(games):
        r = play(rng, blocked, dist, elem_frac, bonus, cap, policy)
        if r['winner'] == 0:
            agg['p1win'] += 1
        elif r['winner'] == 1:
            agg['p2win'] += 1
        else:
            agg['draw'] += 1
        agg['final_caps'] += r['final_caps']
        agg['sweep'] += 1 if r['final_sweep'] else 0
        agg['flipped'] += 1 if r['flipped_winner'] else 0
        agg['center_t8'] += 1 if r['center_open_at_t8'] else 0
        caps_hist[r['final_caps']] += 1
    n = games
    return {
        'p1': agg['p1win'] / n, 'p2': agg['p2win'] / n, 'draw': agg['draw'] / n,
        'mean_final_caps': agg['final_caps'] / n,
        'sweep': agg['sweep'] / n,
        'flipped': agg['flipped'] / n,
        'center_t8': agg['center_t8'] / n,
        'hist': caps_hist,
    }


def pct(x):
    return f"{100*x:5.1f}%"


def main():
    print("=" * 78)
    print("A. ELEMENT WHEEL AUDIT")
    print("=" * 78)
    for line in audit_wheel():
        print("   " + line)

    print()
    print("=" * 78)
    print("B. EDGE STATISTICS  (random card vs random card, one edge)")
    print("=" * 78)
    print(f"{'distribution':<22}{'attacker wins':>15}{'tie (wall)':>13}{'defender':>11}")
    dists = ['uniform(1,5)', 'uniform(1,6)', 'uniform(1,8)', 'uniform(1,10)',
             'budget(20,1,10)', 'budget(16,1,10)', 'budget(24,1,10)']
    for dn in dists:
        d = make_dist(dn)
        w, t, l = edge_stats(d, 0.0, 0)
        extra = ''
        if dn.startswith('budget'):
            key = tuple(int(x) for x in dn[dn.index('(') + 1:-1].split(','))
            extra = f"  [{len(POOLS[(key[0],key[1],key[2])])} legal cards]"
        print(f"{dn:<22}{pct(w):>15}{pct(t):>13}{pct(l):>11}{extra}")

    print()
    print("=" * 78)
    print("C. TOPOLOGY PROFILE  (which cell P1 locks)")
    print("=" * 78)
    print(f"{'P1 locks':<12}{'edges':>7}{'degree sequence':>34}")
    for name, idx in TOPO.items():
        e, degs = topo_profile(idx)
        print(f"{name:<12}{e:>7}{str(degs):>34}")

    print()
    print("=" * 78)
    print("D. CASCADE CAP vs FINAL-MOVE SWEEP   [uniform(1,10), no elements, greedy]")
    print("=" * 78)
    GAMES = 20000
    d = make_dist('uniform(1,10)')
    print(f"{'topology':<10}{'cap':>5}{'P1 win':>9}{'draw':>8}{'P2 win':>9}"
          f"{'avg T8 caps':>13}{'T8 sweep':>10}{'T8 flips winner':>18}")
    for name, bidx in TOPO.items():
        for cap in (0, 1, 2, 99):
            r = run(GAMES, bidx, d, 0.0, 0, cap, 'greedy')
            capn = 'inf' if cap == 99 else str(cap)
            print(f"{name:<10}{capn:>5}{pct(r['p1']):>9}{pct(r['draw']):>8}"
                  f"{pct(r['p2']):>9}{r['mean_final_caps']:>13.2f}"
                  f"{pct(r['sweep']):>10}{pct(r['flipped']):>18}")

    print()
    print("=" * 78)
    print("E. FINAL-MOVE CAPTURE DISTRIBUTION  [cap=1, uniform(1,10), greedy]")
    print("=" * 78)
    for name, bidx in TOPO.items():
        r = run(GAMES, bidx, d, 0.0, 0, 1, 'greedy')
        h = r['hist']
        tot = sum(h.values())
        row = "  ".join(f"{k}:{100*h.get(k,0)/tot:4.1f}%" for k in range(0, 8))
        print(f"{name:<10}{row}")
    print("   (how many cards the T8 placement captures)")

    print()
    print("=" * 78)
    print("F. SEAT ADVANTAGE under stronger play (1-ply lookahead)")
    print("=" * 78)
    G2 = 3000
    print(f"{'topology':<10}{'cap':>5}{'policy':<10}{'P1 win':>9}{'draw':>8}{'P2 win':>9}"
          f"{'P2 edge':>10}")
    for name, bidx in TOPO.items():
        for pol in ('greedy', 'greedy2'):
            r = run(G2, bidx, d, 0.0, 0, 1, pol)
            edge = r['p2'] - r['p1']
            print(f"{name:<10}{1:>5}{pol:<10}{pct(r['p1']):>9}{pct(r['draw']):>8}"
                  f"{pct(r['p2']):>9}{pct(edge):>10}")

    print()
    print("=" * 78)
    print("G. ELEMENT BONUS CALIBRATION  (all cards elemental)")
    print("=" * 78)
    print(f"{'distribution':<18}{'bonus':>6}{'attacker wins':>15}{'tie':>8}"
          f"{'P1 win':>9}{'P2 win':>9}{'avg T8 caps':>13}")
    for dn in ('uniform(1,10)', 'uniform(1,5)'):
        dd = make_dist(dn)
        for bonus in (0, 1, 2, 3):
            w, t, l = edge_stats(dd, 1.0, bonus)
            r = run(8000, 0, dd, 1.0, bonus, 1, 'greedy')
            print(f"{dn:<18}{bonus:>6}{pct(w):>15}{pct(t):>8}"
                  f"{pct(r['p1']):>9}{pct(r['p2']):>9}{r['mean_final_caps']:>13.2f}")

    print()
    print("=" * 78)
    print("H. SIDE-SUM BUDGET vs UNCONSTRAINED  [corner locked, cap=1, greedy]")
    print("=" * 78)
    print(f"{'distribution':<20}{'P1 win':>9}{'draw':>8}{'P2 win':>9}"
          f"{'avg T8 caps':>13}{'T8 sweep':>10}")
    for dn in ('uniform(1,10)', 'budget(20,1,10)', 'budget(22,1,10)', 'uniform(1,6)',
               'budget(14,1,6)'):
        dd = make_dist(dn)
        r = run(12000, 0, dd, 0.0, 0, 1, 'greedy')
        print(f"{dn:<20}{pct(r['p1']):>9}{pct(r['draw']):>8}{pct(r['p2']):>9}"
              f"{r['mean_final_caps']:>13.2f}{pct(r['sweep']):>10}")


if __name__ == '__main__':
    main()
