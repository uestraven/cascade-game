#!/usr/bin/env python3
"""
Ability TIMING as a design axis, not just ability effect.

Every ability in the game resolves instantly on placement. The timings
that exist in principle, and what is known about each:

  instant         all 13 shipped abilities; creates a decision; measured
  on capture      Ambush -- cannot fire at all as written (the wheel is
                  antisymmetric), and the repaired version breaks the
                  order-independence of resolution
  persistent      Leto's pivot, the only well-behaved leader; but passive
                  immunities measured worse than no ability at all
  DELAYED         never measured
  on capturing    Vampiric -- there is no scalar to grow on a regular
                  wheel

Delayed is worth testing for a structural reason rather than novelty.
Every big effect measured wants to be played on the final placement,
because the board only gets fuller -- surge-one-wave 75%, Arc 58-77%,
entrenched-Scorch 79.5%. A delayed effect CANNOT be played last, because
it would never fire. Delay inverts that incentive by construction.

It also makes a big effect answerable: the pending effect fires only if
you STILL CONTROL the card at the start of your next turn, so the
opponent can cancel it by capturing that card. A bomb becomes a visible
threat rather than a surprise.

Measured per ability, instant against delayed:
  power, depth, how often it is used, and WHEN in the game it is played
  -- the last being the actual test of the last-turn problem.
"""

import random
import sys
from collections import Counter

import v3
import v3_abilities as A
from v3 import ELEMENTS, NCELLS, ORDER, pct

import ability_power as P

# the abilities that failed for being too strong or badly timed
CANDIDATES = ['surge', 'gust', 'beacon', 'cyclone', 'tremor']


def fire_pending(cards, own, player, pend, rng):
    """Resolve a delayed effect, if its card is still ours."""
    if not pend:
        return 0
    ability, cell = pend
    if cards[cell] is None or not (own[player] >> cell) & 1:
        return 0                     # cancelled: we lost the card
    got = 0
    if ability == 'surge':
        got = A.cascade(cards, own, own[player], player, v3.CASCADE_CAP)
    elif ability == 'cyclone':
        for t in range(NCELLS):
            if cards[t]:
                cards[t] = A.with_edges(cards[t],
                                        v3.rot90(A.edges(cards[t])))
        got = A.cascade(cards, own, 1 << cell, player, v3.CASCADE_CAP)
    elif ability == 'tremor':
        for d in range(4):
            t = v3.NB[cell][d]
            if t >= 0 and cards[t]:
                cards[t] = A.with_edges(
                    cards[t], v3.rot90(v3.rot90(A.edges(cards[t]))))
        got = A.cascade(cards, own, 1 << cell, player, v3.CASCADE_CAP)
    elif ability == 'gust':
        # rotate the neighbour that most helps, then re-check
        best, bt = -1, None
        for d in range(4):
            t = v3.NB[cell][d]
            if t < 0 or cards[t] is None:
                continue
            c2 = [x for x in cards]
            o2 = own[:]
            c2[t] = A.with_edges(c2[t], v3.rot90(A.edges(c2[t])))
            g = A.cascade(c2, o2, 1 << cell, player, v3.CASCADE_CAP)
            if g > best:
                best, bt = g, t
        if bt is not None:
            cards[bt] = A.with_edges(cards[bt],
                                     v3.rot90(A.edges(cards[bt])))
            got = A.cascade(cards, own, 1 << cell, player, v3.CASCADE_CAP)
    elif ability == 'beacon':
        opp = 1 - player
        for d in range(4):
            t = v3.NB[cell][d]
            if t < 0 or cards[t] is None or not (own[opp] >> t) & 1:
                continue
            pe = A.edges(cards[cell])
            if any(v3.beats(pe[e], A.edges(cards[t])[v3.OPPSIDE[d]])
                   for e in range(4)):
                own[player] |= 1 << t
                own[opp] &= ~(1 << t)
                got += 1
                break
    return got


def pick_ordered(cards, own, hands, player, empties, cap, rng, smart,
                 more_turns):
    """Best placement by immediate captures, but break ties by playing an
    ability card while placements remain and a plain card on the last."""
    mv = P.moves(cards, own, hands, player, empties, -1)
    best, ties = None, []
    for m in mv:
        g = P.probe(cards, own, hands, player, m, cap, -1, rng)
        if best is None or g > best:
            best, ties = g, [m]
        elif g == best:
            ties.append(m)
    want = bool(more_turns)
    pref = [m for m in ties
            if (A.abil(hands[player][m[0]]) is not None) == want]
    return rng.choice(pref or ties)


def play(rng, ability, mode, counts, smarts, turnlog=None):
    """mode: 'instant' uses the shipped resolution; 'delayed' queues the
    effect to the start of that player's next turn."""
    hands = [P.build_hand(rng, P.HANDS[p], ability if counts[p] else None,
                          counts[p]) for p in (0, 1)]
    cards = [None] * NCELLS
    own = [0, 0]
    A.PLAYED[0].clear()
    A.PLAYED[1].clear()
    placed = [0, 0]
    pending = [None, None]
    used = [0, 0]
    for turn, p in enumerate(ORDER):
        # a queued effect resolves before this player places
        if mode != 'instant':
            fire_pending(cards, own, p, pending[p], rng)
            pending[p] = None
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = v3.cap_for_turn(turn)
        live = placed[p] >= P.ABILITY_FROM_PLACEMENT - 1
        if mode == 'instant':
            mv = P.pick(cards, own, hands, p, empties, cap, placed[p], rng,
                        smarts[p])
            if mv[3] is not None:
                used[p] += 1
                if turnlog is not None:
                    turnlog[(p, placed[p] + 1)] += 1
            P.apply_move(cards, own, hands, p, mv, cap, placed[p], rng)
        else:
            # choose a placement on immediate captures only; the ability
            # is a commitment for next turn, so it cannot be scored now
            more = any(q == p for q in ORDER[turn + 1:])
            if mode == 'delayed_order':
                mv = pick_ordered(cards, own, hands, p, empties, cap, rng,
                                  smarts[p], more)
            else:
                mv = P.pick(cards, own, hands, p, empties, cap, -1, rng,
                            smarts[p])
            i, cell, oe, _ = mv
            card = hands[p][i]
            is_ab = A.abil(card) is not None and live
            if mode in ('delayed_wise', 'delayed_order') and not more:
                is_ab = False
            P.apply_move(cards, own, hands, p, (i, cell, oe, None), cap,
                         -1, rng)
            if is_ab:
                pending[p] = (A.abil(card), cell)
                used[p] += 1
                if turnlog is not None:
                    turnlog[(p, placed[p] + 1)] += 1
        placed[p] += 1
    return [bin(own[0]).count('1'), bin(own[1]).count('1')], used


def holder(games, ability, mode, seed=4242, turnlog=None):
    rng = random.Random(seed)
    w = n = fired = 0
    for _ in range(games):
        for seat in (0, 1):
            cnt = [0, 0]
            cnt[seat] = P.MAX_ABIL
            s, used = play(rng, ability, mode, cnt, [False, False],
                           turnlog)
            n += 1
            if used[seat]:
                fired += 1
            if (s[0] > s[1]) == (seat == 0):
                w += 1
    return w / n, fired / n


def depth(games, ability, mode, seed=22):
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for smart in (0, 1):
            sm = [False, False]
            sm[smart] = True
            s, _ = play(rng, ability, mode, (P.MAX_ABIL, P.MAX_ABIL), sm)
            n += 1
            if (s[0] > s[1]) == (smart == 0):
                w += 1
    return w / n


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 500
    print("=" * 78)
    print("INSTANT vs DELAYED -- the effect fires at the start of your")
    print("next turn, and only if you still control the card")
    print("=" * 78)
    print(f"  {G * 2} games per cell, seats swapped. 50% is neutral.")
    base, _ = holder(G, None, 'instant')
    print(f"  no-ability baseline: {pct(base)}")
    print()
    print(f"  {'ability':<10}{'instant':>10}{'delayed':>10}"
          f"{'+sequenced':>11}{'used':>10}{'depth (i)':>11}"
          f"{'depth (d)':>11}")
    for ab in CANDIDATES:
        hi, _ = holder(G, ab, 'instant')
        hw, fw = holder(G, ab, 'delayed_order')
        tl = Counter()
        hd, fd = holder(G, ab, 'delayed', turnlog=tl)
        di = depth(max(G // 2, 200), ab, 'instant')
        dd = depth(max(G // 2, 200), ab, 'delayed')
        # P1 places five, so their fifth placement is the final turn
        tot = sum(v for (p, k), v in tl.items() if p == 0)
        last = sum(v for (p, k), v in tl.items() if p == 0 and k == 5)
        print(f"  {ab:<10}{pct(hi):>10}{pct(hd):>10}{pct(hw):>10}"
              f"{pct(fw):>10}{pct(di):>11}{pct(dd):>11}")
    print()
    print("  '+sequenced' adds one human habit: play the ability card")
    print("  while placements remain, keep a plain card for the last one.")
    print("  Declining to commit on the final placement is NOT a separate")
    print("  variable -- committing there and not committing are the same")
    print("  outcome, since the effect never fires either way.")


if __name__ == '__main__':
    main()
