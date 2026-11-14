#!/usr/bin/env python3
"""
v2 prototype: elements-only comparison, no numbers.

  - A card has FOUR DISTINCT elements, one per edge. 8*7*6*5 = 1680 cards.
  - Capture compares only the two facing elements. No arithmetic anywhere.
  - Every element beats 3, loses to 3, and is NEUTRAL with exactly one
    "twin" -- its natural opposite. An even-sized wheel cannot be both
    regular and neutral-free, so one neutral pairing per element is the
    tightest achievable.
  - No card is stronger than another. Cards differ only in which elements
    they show in which direction. So there is no card power level, no cube
    budget, and no weak-flank rule.
  - Shuffled deck, hand of 3, play one then draw one.

Construction of the wheel: the four twin pairs form four groups arranged in
a cycle. Every element beats both members of the next group, exactly one
member of the opposite group, and neither member of the previous group.
That forces out-degree 3 and in-degree 3 on every vertex.
"""

import itertools
import random
from collections import Counter

# ---------------------------------------------------------------------------
# Elements
# ---------------------------------------------------------------------------
FIRE, WATER, EARTH, AIR, LIGHTNING, ICE, LIGHT, SHADOW = range(1, 9)
NAMES = {FIRE: 'Fire', WATER: 'Water', EARTH: 'Earth', AIR: 'Air',
         LIGHTNING: 'Lightning', ICE: 'Ice', LIGHT: 'Light',
         SHADOW: 'Shadow'}
ELEMENTS = tuple(NAMES)

# Natural opposites. These never resolve against each other.
TWIN = {FIRE: WATER, WATER: FIRE,
        EARTH: AIR, AIR: EARTH,
        LIGHTNING: ICE, ICE: LIGHTNING,
        LIGHT: SHADOW, SHADOW: LIGHT}

# Groups in cycle order: each group beats the next.
GROUPS = [(FIRE, WATER), (EARTH, AIR), (LIGHTNING, ICE), (LIGHT, SHADOW)]

# One member of each group beats one member of the opposite group.
CROSS = [
    (FIRE, ICE), (WATER, LIGHTNING),        # G0 vs G2
    (EARTH, LIGHT), (AIR, SHADOW),          # G1 vs G3
    (LIGHTNING, FIRE), (ICE, WATER),        # G2 vs G0
    (LIGHT, AIR), (SHADOW, EARTH),          # G3 vs G1
]

BEATS = {e: set() for e in ELEMENTS}
for gi, group in enumerate(GROUPS):
    nxt = GROUPS[(gi + 1) % 4]
    for a in group:
        BEATS[a].update(nxt)
for a, b in CROSS:
    BEATS[a].add(b)


def audit():
    """The wheel must be regular with exactly one neutral per element."""
    lines = []
    ok = True
    for e in ELEMENTS:
        beaten_by = {a for a in ELEMENTS if e in BEATS[a]}
        neutral = set(ELEMENTS) - {e} - BEATS[e] - beaten_by
        if len(BEATS[e]) != 3 or len(beaten_by) != 3 or neutral != {TWIN[e]}:
            ok = False
        lines.append(
            f"  {NAMES[e]:<10} beats {', '.join(sorted(NAMES[v] for v in BEATS[e])):<28}"
            f" twin {NAMES[TWIN[e]]}")
    mutual = [(a, b) for a in ELEMENTS for b in BEATS[a] if a in BEATS[b]]
    return ok, lines, len(mutual)


def beats(att, dfn):
    return dfn in BEATS[att]


# ---------------------------------------------------------------------------
# Board
# ---------------------------------------------------------------------------
GRID, NCELLS = 3, 9
N_, E_, S_, W_ = 0, 1, 2, 3
OPPSIDE = (S_, W_, N_, E_)
_D = ((-1, 0), (0, 1), (1, 0), (0, -1))
NB = tuple(
    tuple(((r + dr) * GRID + (c + dc))
          if 0 <= r + dr < GRID and 0 <= c + dc < GRID else -1
          for dr, dc in _D)
    for r, c in ((i // GRID, i % GRID) for i in range(NCELLS))
)

TURN_ORDER = (0, 0, 1, 1, 0, 0, 1, 1, 0)
CASCADE_CAP = 1
HAND_SIZE = 3
DECK_SIZE = 10

ALL_CARDS = tuple(itertools.permutations(ELEMENTS, 4))   # 1680, all distinct


def random_card(rng):
    return rng.choice(ALL_CARDS)


def rotate_cw(card):
    n, e, s, w = card
    return (w, n, e, s)


def resolve(cards, own, cell, card, player, cap=CASCADE_CAP, protected=0):
    """Place and cascade. Returns (captured, waves)."""
    cards[cell] = card
    own[player] |= 1 << cell
    opp = 1 - player
    frontier = 1 << cell
    captured, waves, depth = 0, [], 0
    while frontier and depth <= cap:
        newly = 0
        for src in range(NCELLS):
            if not (frontier >> src) & 1:
                continue
            scard = cards[src]
            for d in range(4):
                t = NB[src][d]
                if t < 0 or (protected >> t) & 1:
                    continue
                if not (own[opp] >> t) & 1:
                    continue
                if beats(scard[d], cards[t][OPPSIDE[d]]):
                    newly |= 1 << t
        if newly:
            own[player] |= newly
            own[opp] &= ~newly
            captured += bin(newly).count('1')
            waves.append(newly)
        frontier = newly
        depth += 1
    return captured, waves


# ---------------------------------------------------------------------------
# Game
# ---------------------------------------------------------------------------
def new_deal(rng):
    decks = [[random_card(rng) for _ in range(DECK_SIZE)] for _ in range(2)]
    hands = [decks[0][:HAND_SIZE], decks[1][:HAND_SIZE]]
    rest = [decks[0][HAND_SIZE:], decks[1][HAND_SIZE:]]
    return hands, rest


def play_game(rng, policy, order=TURN_ORDER, deal=None):
    hands, decks = deal if deal else new_deal(rng)
    hands = [h[:] for h in hands]
    decks = [d[:] for d in decks]
    cards = [None] * NCELLS
    own = [0, 0]
    total_caps = [0, 0]
    wave_hist = Counter()

    for turn, p in enumerate(order):
        empties = [i for i in range(NCELLS) if cards[i] is None]
        i, cell = policy(cards, own, hands[p], p, empties, rng)
        card = hands[p].pop(i)
        caps, waves = resolve(cards, own, cell, card, p)
        total_caps[p] += caps
        wave_hist[len(waves)] += 1
        if decks[p]:
            hands[p].append(decks[p].pop(0))

    cnt = [bin(own[0]).count('1'), bin(own[1]).count('1')]
    return cnt, total_caps, wave_hist


def pol_random(cards, own, hand, p, empties, rng):
    return rng.randrange(len(hand)), rng.choice(empties)


def pol_greedy(cards, own, hand, p, empties, rng):
    best, ties = -1, []
    for i, card in enumerate(hand):
        for cell in empties:
            c2 = cards[:]
            o2 = own[:]
            got, _ = resolve(c2, o2, cell, card, p)
            if got > best:
                best, ties = got, [(i, cell)]
            elif got == best:
                ties.append((i, cell))
    return rng.choice(ties)


def pol_greedy2(cards, own, hand, p, empties, rng):
    """Captures now minus the opponent's best immediate reply."""
    opp = 1 - p
    best, ties = None, []
    for i, card in enumerate(hand):
        for cell in empties:
            c2, o2 = cards[:], own[:]
            gain, _ = resolve(c2, o2, cell, card, p)
            rem = [x for x in empties if x != cell]
            reply = 0
            # the opponent's hand is hidden, so sample plausible cards
            # rather than peeking at it
            if rem:
                for card2 in (random_card(rng) for _ in range(4)):
                    for cell2 in rem:
                        c3, o3 = c2[:], o2[:]
                        r, _ = resolve(c3, o3, cell2, card2, opp)
                        reply = max(reply, r)
            v = gain - reply
            if best is None or v > best:
                best, ties = v, [(i, cell)]
            elif v == best:
                ties.append((i, cell))
    return rng.choice(ties)


POLICIES = {'random': pol_random, 'greedy': pol_greedy, 'greedy2': pol_greedy2}


def pct(x):
    return f"{100*x:5.1f}%"


def main():
    print("=" * 78)
    print("A. THE WHEEL")
    print("=" * 78)
    ok, lines, mutual = audit()
    for l in lines:
        print(l)
    print(f"\n  regular (each beats 3, loses to 3, one twin): {ok}")
    print(f"  mutual-beat pairs: {mutual}")

    print()
    print("=" * 78)
    print("B. EDGE STATISTICS  (random card vs random card, one edge)")
    print("=" * 78)
    rng = random.Random(1)
    n = 400000
    w = t = l = s = 0
    for _ in range(n):
        a, b = random_card(rng), random_card(rng)
        d = rng.randrange(4)
        x, y = a[d], b[OPPSIDE[d]]
        if x == y:
            s += 1
        elif beats(x, y):
            w += 1
        elif beats(y, x):
            l += 1
        else:
            t += 1
    print(f"  attacker captures   {pct(w/n)}   (predicted 37.5%)")
    print(f"  defender holds      {pct(l/n)}")
    print(f"  same element        {pct(s/n)}   (predicted 12.5%)")
    print(f"  neutral twins       {pct(t/n)}   (predicted 12.5%)")
    print(f"  DEAD EDGES          {pct((s+t)/n)}   (numeric game was 10%)")

    print()
    print("=" * 78)
    print("C. GAME SHAPE  [AABBAABBA, hand of 3, draw after playing]")
    print("=" * 78)
    GAMES = 20000
    print(f"{'policy':<9}{'P1 win':>9}{'P2 win':>9}{'edge':>9}"
          f"{'caps/game':>11}{'5-4 games':>11}{'multiwave':>11}")
    for pol, g in (('random', GAMES), ('greedy', GAMES), ('greedy2', 3000)):
        rng = random.Random(99)
        wins = [0, 0]
        caps = 0
        close = 0
        waves = Counter()
        for _ in range(g):
            cnt, tc, wh = play_game(rng, POLICIES[pol])
            wins[0 if cnt[0] > cnt[1] else 1] += 1
            caps += tc[0] + tc[1]
            if abs(cnt[0] - cnt[1]) == 1:
                close += 1
            waves.update(wh)
        tot = sum(waves.values())
        mw = sum(v for k, v in waves.items() if k > 1) / tot
        print(f"{pol:<9}{pct(wins[0]/g):>9}{pct(wins[1]/g):>9}"
              f"{pct(wins[1]/g - wins[0]/g):>9}{caps/g:>11.2f}"
              f"{pct(close/g):>11}{pct(mw):>11}")

    print()
    print("=" * 78)
    print("D. HOW MUCH DOES THE DEAL DECIDE?  [greedy both sides]")
    print("=" * 78)
    print("  Each deal replayed 12 times with independent tie-break")
    print("  randomness. A 'locked' deal is one where the same player wins")
    print("  every single replay -- the cards decided it, not the choices.")
    print()
    rng = random.Random(4242)
    DEALS = 1500
    locked = 0
    locked_p1 = 0
    for _ in range(DEALS):
        deal = new_deal(rng)
        outcomes = []
        for k in range(12):
            r2 = random.Random(rng.randrange(1 << 30))
            cnt, _, _ = play_game(r2, pol_greedy, deal=deal)
            outcomes.append(0 if cnt[0] > cnt[1] else 1)
        if len(set(outcomes)) == 1:
            locked += 1
            if outcomes[0] == 0:
                locked_p1 += 1
    print(f"  locked deals      {pct(locked/DEALS)}  of {DEALS}")
    print(f"    ...locked for P1 {pct(locked_p1/DEALS)}")
    print(f"    ...locked for P2 {pct((locked-locked_p1)/DEALS)}")
    print(f"  swingable deals   {pct(1-locked/DEALS)}")


if __name__ == '__main__':
    main()
