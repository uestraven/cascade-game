#!/usr/bin/env python3
"""
Differential fixture for v2.2's commands and the Sanctuary trait.

v22.py is the oracle, web/src/v22/game.ts the port. Five commands and a
Convergence protection check, each written twice from the same prose --
which has silently diverged twice before in this project.

    python3 gen_v22_fixture.py 2500 > web/test/fixtures/v22.json
"""
import json, random, sys
from collections import Counter
import proto as P
import v22

CMDS = ('plain', 'usurp', 'usurp_one', 'transpose', 'reclaim_recent')
TS = {'plain': 'plain', 'usurp': 'usurp', 'usurp_one': 'usurpOne',
      'transpose': 'transpose', 'reclaim_recent': 'reclaimRecent'}


def enc(opt):
    k = opt[0]
    if k == 'plain':
        return {'kind': 'plain'}
    if k == 'usurp':
        return {'kind': 'usurp', 'via': opt[1]}
    if k == 'usurp_one':
        return {'kind': 'usurpOne', 'via': opt[1], 'target': opt[2]}
    if k == 'transpose':
        return {'kind': 'transpose', 'a': opt[1], 'b': opt[2]}
    if k == 'reclaim_recent':
        return {'kind': 'reclaimRecent', 'target': opt[1]}
    raise AssertionError(opt)


def main():
    want = int(sys.argv[1]) if len(sys.argv) > 1 else 2500
    P.set_board(*v22.BOARD)
    rng = random.Random(8686)
    cases, cover = [], Counter()
    while len(cases) < want:
        n = P.NCELLS
        cards = [None] * n
        own = [0, 0]
        trait, cmd = {}, {}
        k = n if rng.random() < 0.85 else n - 1
        for i, c in enumerate(rng.sample(range(n), k)):
            cards[c] = rng.choice(P.BY_SHAPE['versatile'])
            own[i % 2] |= 1 << c
            trait[c] = rng.choice((None, 'sanctuary'))
            cmd[c] = rng.choice(CMDS)
        player = rng.randrange(2)
        mine = [c for c in range(n)
                if cards[c] is not None and (own[player] >> c) & 1]
        if not mine:
            continue
        src = rng.choice(mine)
        # a plausible "lost on their last command" set
        theirs = [c for c in range(n)
                  if cards[c] is not None and (own[1 - player] >> c) & 1]
        recent = {player: set(rng.sample(theirs, min(2, len(theirs))))
                  if theirs else set(), 1 - player: set()}
        opts = v22.command_options(cards, own, trait, cmd, player, src,
                                   {}, recent)
        results = []
        for opt in opts:
            c2 = [x for x in cards]
            o2 = own[:]
            t2, m2 = dict(trait), dict(cmd)
            got = v22.run_command(c2, o2, t2, m2, player, src, opt, rng,
                                  {}, {})
            results.append({
                'option': enc(opt), 'captured': got, 'own': o2,
                'cards': [None if x is None else list(x) for x in c2],
                'trait': [t2.get(i) for i in range(n)],
                'cmd': [TS.get(m2.get(i)) if m2.get(i) else None
                        for i in range(n)],
            })
            cover[opt[0]] += 1
        cases.append({
            'cells': n,
            'cards': [None if x is None else list(x) for x in cards],
            'own': own,
            'trait': [trait.get(i) for i in range(n)],
            'cmd': [TS.get(cmd.get(i)) if cmd.get(i) else None
                    for i in range(n)],
            'cell': src, 'player': player,
            'recent': sorted(recent[player]),
            'options': [enc(o) for o in opts],
            'results': results,
        })
    json.dump({'format': 'cascade-v22-fixture',
               'generator': 'gen_v22_fixture.py (oracle: v22.py)',
               'coverage': dict(cover), 'cases': cases},
              sys.stdout, separators=(',', ':'))
    print(f'\n{len(cases)} cases, '
          f'{sum(len(c["results"]) for c in cases)} outcomes',
          file=sys.stderr)
    print('coverage:', dict(cover), file=sys.stderr)
    missing = [c for c in CMDS if not cover[c]]
    if missing:
        print('NO COVERAGE:', missing, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
