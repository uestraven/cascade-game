#!/usr/bin/env python3
"""
Is Usurp's bias a turn-order artifact, or is the ability itself skewed?

Four diagnostics, each compared to its OWN seat-matched baseline,
because full-board command order is already known to be worth about 15
points on its own and an unmatched comparison would just re-measure
that.

  1. the same ability with Dominion order reversed
  2. Usurp against an abilities-off control, both seatings
  3. Usurp's effect by the ownership lead held when Dominion began
  4. how often Usurp is the UNIQUELY best command available

(4) is the one that matters most. Being chosen 72% of the time is only a
problem if it is chosen because nothing else is worth considering. If it
usually ties with a plain attack, 72% is a coin-flip the bot breaks one
way and tells us nothing.

    python3 exp_usurp.py [games]
"""

import random
import sys
from collections import Counter, defaultdict

import proto as P
import v22


def survey(games, roster, *, p2_first=True, no_abilities=False,
           seed=5150):
    rng = random.Random(seed)
    w = [0, 0]
    dr = 0
    c2 = 0.0
    rev = lead = 0
    bylead = defaultdict(lambda: [0, 0])
    n = 0
    for _ in range(games):
        mid, end, a, b = v22.play(rng, roster=roster, p2_first=p2_first,
                                  no_abilities=no_abilities)
        n += 1
        c2 += b
        if end[0] > end[1]:
            w[0] += 1
        elif end[1] > end[0]:
            w[1] += 1
        else:
            dr += 1
        d = mid[0] - mid[1]
        bylead[d][0] += 1 if end[0] > end[1] else 0
        bylead[d][1] += 1
        if d != 0 and end[0] != end[1]:
            lead += 1
            if (d > 0) != (end[0] > end[1]):
                rev += 1
    return dict(p1=w[0] / n, p2=w[1] / n, draws=dr / n, c2=c2 / n,
                rev=rev / max(lead, 1), bylead=bylead)


def uniqueness(games, roster, seed=99):
    """How often is Usurp strictly better than every alternative, and how
    often does it merely tie?"""
    rng = random.Random(seed)
    best_only = tie = never = offered = commands = 0
    for _ in range(games):
        P.set_board(*v22.BOARD)
        deck = v22.build_deck(rng, sum(v22.HANDS) + 2, roster)
        hands = [list(deck[:v22.HANDS[0]]),
                 list(deck[v22.HANDS[0]:sum(v22.HANDS)])]
        cards = [None] * P.NCELLS
        own = [0, 0]
        passive, active, prov = {}, {}, {}
        v22.convergence(cards, own, hands, passive, active, rng, prov)
        recent = {0: set(), 1: set()}
        retrib = {}
        for k in range(v22.COMMANDS):
            player = 1 - (k % 2)
            mine = [c for c in range(P.NCELLS)
                    if cards[c] is not None and (own[player] >> c) & 1]
            if not mine:
                continue
            commands += 1
            scores = []
            for src in mine:
                for opt in v22.command_options(cards, own, passive, active,
                                               player, src, prov, recent):
                    c3 = [x for x in cards]
                    o3 = own[:]
                    got = v22.run_command(c3, o3, dict(passive),
                                          dict(active), player, src, opt,
                                          rng, {}, {})
                    scores.append((got, opt[0]))
            if not scores:
                continue
            top = max(s for s, _ in scores)
            kinds_at_top = {kind for s, kind in scores if s == top}
            if 'usurp' not in {k for _, k in scores}:
                never += 1
            elif kinds_at_top == {'usurp'}:
                best_only += 1
            elif 'usurp' in kinds_at_top:
                tie += 1
            # pick greedily to advance the game
            cand = [(s, src, opt) for src in mine
                    for opt in v22.command_options(cards, own, passive,
                                                   active, player, src,
                                                   prov, recent)
                    for s in [0]]
            bs, bsrc, bopt = None, None, None
            for src in mine:
                for opt in v22.command_options(cards, own, passive, active,
                                               player, src, prov, recent):
                    c3 = [x for x in cards]
                    o3 = own[:]
                    got = v22.run_command(c3, o3, dict(passive),
                                          dict(active), player, src, opt,
                                          rng, {}, {})
                    if bs is None or got > bs:
                        bs, bsrc, bopt = got, src, opt
            before = own[1 - player]
            v22.run_command(cards, own, passive, active, player, bsrc,
                            bopt, rng, prov, retrib)
            lost = before & ~own[1 - player]
            recent[1 - player] = {c for c in range(P.NCELLS)
                                  if (lost >> c) & 1}
            if bopt[0] == 'usurp':
                offered += 1
    return dict(commands=commands, best_only=best_only, tie=tie,
                never=never, chosen=offered)


def pct(x):
    return f'{100 * x:5.1f}%'


if __name__ == '__main__':
    games = int(sys.argv[1]) if len(sys.argv) > 1 else 1500
    USURP = [(None, 'usurp')]
    PLAIN = [(None, 'plain')]

    print('=' * 78)
    print('1 & 2. SEAT-MATCHED: USURP vs CONTROL, BOTH COMMAND ORDERS')
    print('=' * 78)
    print('  Command order alone is worth about 15 points on a full')
    print('  board, so each row is compared with its own baseline.')
    print()
    print(f'  {"deck":<18}{"opens":>7}{"P1":>8}{"P2":>8}{"draw":>8}'
          f'{"dom":>7}{"rev":>8}')
    res = {}
    for label, roster, no_ab in (('plain (control)', PLAIN, False),
                                 ('abilities off', PLAIN, True),
                                 ('usurp', USURP, False)):
        for p2f in (True, False):
            r = survey(games, roster, p2_first=p2f, no_abilities=no_ab)
            res[(label, p2f)] = r
            print(f'  {label if p2f else "":<18}'
                  f'{"P2" if p2f else "P1":>7}'
                  f'{pct(r["p1"]):>8}{pct(r["p2"]):>8}{pct(r["draws"]):>8}'
                  f'{r["c2"]:>7.1f}{pct(r["rev"]):>8}')
    print()
    for p2f in (True, False):
        c = res[('plain (control)', p2f)]
        u = res[('usurp', p2f)]
        who = 'P2 opens' if p2f else 'P1 opens'
        d1 = 100 * (u['p1'] - c['p1'])
        d2 = 100 * (u['p2'] - c['p2'])
        print(f'  {who}: adding Usurp moves P1 {d1:+.1f} and P2 {d2:+.1f}')
    print()
    print('  If Usurp helped whoever opens, the two rows above would')
    print('  disagree in sign. If it helps P2 in both, the skew is in')
    print('  the ability.')

    print()
    print('=' * 78)
    print('3. USURP BY DEPLOYMENT LEAD')
    print('=' * 78)
    print('  P1 win rate by the lead P1 held entering Dominion, with and')
    print('  without Usurp in the deck, P2 opening in both.')
    print()
    cu = res[('usurp', True)]['bylead']
    cp = res[('plain (control)', True)]['bylead']
    print(f'  {"P1 lead":>8}{"games":>8}{"plain":>9}{"usurp":>9}{"delta":>8}')
    for d in sorted(set(cu) | set(cp)):
        wu, nu = cu.get(d, [0, 0])
        wp, np_ = cp.get(d, [0, 0])
        if nu < games * 0.03 or np_ < games * 0.03:
            continue
        print(f'  {d:>+8}{nu:>8}{pct(wp / np_):>9}{pct(wu / nu):>9}'
              f'{100 * (wu / nu - wp / np_):>+7.1f}')

    print()
    print('=' * 78)
    print('4. IS USURP THE *UNIQUELY* BEST COMMAND?')
    print('=' * 78)
    u = uniqueness(min(games, 600), USURP)
    tot = u['commands']
    print(f'  {tot} commands examined')
    print(f'    Usurp strictly best        {pct(u["best_only"] / tot)}')
    print(f'    Usurp tied with the best   {pct(u["tie"] / tot)}')
    print(f'    Usurp not even available   {pct(u["never"] / tot)}')
    print(f'    Usurp actually chosen      {pct(u["chosen"] / tot)}')
    print()
    print('  Chosen often while rarely strictly best means the 72% is a')
    print('  tie broken one way, not an ability that crowds out thought.')
