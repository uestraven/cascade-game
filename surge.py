#!/usr/bin/env python3
"""
Leaders folded into ability cards: does the merge fix them?

As LEADERS, PRINCE and TANTALUS were worth +15.1 and +18.0 and detonated
on turn 9 in ~78% of games. The diagnosis was that a leader is a FREE
action, so holding it costs nothing and the board only ever gets fuller --
later is strictly better and timing is not a decision. Barring the final
turn balanced them to about +4 but the bot then mostly declined to use
them at all, which is balance by absence.

As an ABILITY CARD the same effect costs a placement. That is the whole
point of the merge, and it is testable.

The thing to watch is a hole in the fix: Player 1's ninth placement is
their LAST one anyway, so spending it on a bomb costs P1 nothing. If the
turn-9 problem survives the merge, it should survive *only for P1*. So
every number here is split by seat.

Measured:
  A  power and depth against the other abilities, seats swapped
  B  WHEN it gets played, by seat -- the actual test of the fix
  C  the lure decomposition (never / can't-bias / chosen-together)
"""

import random
import sys
from collections import Counter

import v3
import v3_abilities as A
from v3 import ELEMENTS, NCELLS, ORDER, pct

import ability_power as P


def play(rng, abils, counts, smarts, track=None):
    hands = [P.build_hand(rng, P.HANDS[p], abils[p], counts[p])
             for p in (0, 1)]
    cards = [None] * NCELLS
    own = [0, 0]
    A.PLAYED[0].clear()
    A.PLAYED[1].clear()
    placed = [0, 0]
    used = [0, 0]
    for turn, p in enumerate(ORDER):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        if not empties or not hands[p]:
            continue
        cap = v3.cap_for_turn(turn)
        mv = P.pick(cards, own, hands, p, empties, cap, placed[p], rng,
                    smarts[p])
        if mv[3] is not None:
            used[p] += 1
            if track is not None:
                # record the turn, 1-indexed, and which seat spent it
                track.append((p, turn + 1, placed[p] + 1))
        P.apply_move(cards, own, hands, p, mv, cap, placed[p], rng)
        placed[p] += 1
    return [bin(own[0]).count('1'), bin(own[1]).count('1')], used


def holder(games, ability, seed=4242, track=None):
    rng = random.Random(seed)
    w = n = fired = 0
    for _ in range(games):
        for seat in (0, 1):
            ab = [None, None]
            cnt = [0, 0]
            ab[seat] = ability
            cnt[seat] = P.MAX_ABIL
            s, used = play(rng, ab, cnt, [False, False], track)
            n += 1
            if used[seat]:
                fired += 1
            if (s[0] > s[1]) == (seat == 0):
                w += 1
    return w / n, fired / n


def depth(games, ability, seed=22):
    rng = random.Random(seed)
    w = n = 0
    for _ in range(games):
        for smart in (0, 1):
            sm = [False, False]
            sm[smart] = True
            cnt = (P.MAX_ABIL, P.MAX_ABIL) if ability else (0, 0)
            s, _ = play(rng, (ability, ability), cnt, sm)
            n += 1
            if (s[0] > s[1]) == (smart == 0):
                w += 1
    return w / n


def main():
    G = int(sys.argv[1]) if len(sys.argv) > 1 else 500
    print("=" * 74)
    print("A. SURGE AS A CARD -- power and depth")
    print("=" * 74)
    print(f"  seats swapped, {G * 2} games; 50% is neutral")
    print(f"  {'ability':<12}{'holder win':>12}{'used':>8}{'depth':>8}")
    base, _ = holder(G, None)
    print(f"  {'(none)':<12}{pct(base):>12}{'--':>8}"
          f"{pct(depth(max(G // 2, 200), None)):>8}")
    for ab in ('surge', 'surge1', 'surgesafe', 'arc', 'gust'):
        hw, f = holder(G, ab)
        print(f"  {ab:<12}{pct(hw):>12}{pct(f):>8}"
              f"{pct(depth(max(G // 2, 200), ab)):>8}")

    print()
    print("=" * 74)
    print("B. WHEN IS IT PLAYED?  the actual test of the merge")
    print("=" * 74)
    print("  As a leader, PRINCE/TANTALUS fired on turn 9 in ~78% of games.")
    print("  A card costs a placement, so the question is whether it still")
    print("  wants to be last -- and P1's turn 9 is their last placement")
    print("  anyway, so the fix should leak for P1 if it leaks at all.")
    for ab in ('surgesafe', 'surge', 'surge1', 'arc'):
        track = []
        holder(G, ab, track=track)
        print()
        print(f"  {ab.upper()} -- share of uses on each of that seat's "
              f"own placements:")
        for seat, label, total in ((0, 'P1 (places 5, last is turn 9)', 5),
                                   (1, 'P2 (places 4, last is turn 8)', 4)):
            rows = [t for t in track if t[0] == seat]
            if not rows:
                continue
            c = Counter(r[2] for r in rows)
            n = sum(c.values())
            bars = "".join(
                f"{pct(c.get(k, 0) / n):>9}" for k in range(1, total + 1))
            print(f"    {label:<32}{bars}")
            lastshare = c.get(total, 0) / n
            flag = '  <-- still a last-turn bomb' if lastshare > 0.5 else ''
            print(f"    {'':<32}{'on its last placement: ' + pct(lastshare)}"
                  f"{flag}")

    print()
    print("=" * 74)
    print("C. IS IT A LURE?")
    print("=" * 74)
    import scorch_trap as S
    print(f"  {'ability':<12}{'never':>10}{'can-t bias':>13}{'together':>11}")
    for ab in ('surgesafe', 'surge', 'surge1'):
        row = ""
        for pol in ('never', 'tie-break', 'greedy'):
            w, f = S.holder(G, ab, pol)
            row += f"{pct(w)}".rjust(10 if pol == 'never'
                                     else 13 if pol == 'tie-break' else 11)
        print(f"  {ab:<12}{row}")
    print()
    print("  Rising with greed = fair. Falling = a lure.")


if __name__ == '__main__':
    main()
