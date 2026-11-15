# Cascade v2 — deployment and command

v1 is tagged and frozen at `v1`. It is a complete, playable game with a
one-sentence capture rule, twenty verified abilities and painterly art.
It is also, on the evidence below, mechanically busy without being
strategically rewarding. This document records the diagnosis, the
proposed redesign, and what measurement already says about it — including
where it says something inconvenient.

---

## 1. The diagnosis, verified

Four claims were made against v1. All four check out against the
harness, so the redesign rests on measurements rather than impressions.

| Claim | Measured | Verdict |
|---|---|---|
| ~18 captures per 3×3 match, on a nine-card board | **18.43** over 3,000 games | confirmed |
| Defensive exposure has fallen to ~0 | ablation: **−0.4** vs **21.6** in the elemental design | confirmed |
| Abilities span the ineffective to the overpowering | **48%–87%**; six inside noise of 50% | confirmed |
| Bigger boards raise the cost of cell selection | cell-choice ablation **78.0% → 90.0% → 93.4%** (3×3 → 3×4 → 4×4) | confirmed |

The capture distribution is sharper than the mean, and it is the real
indictment:

| A placement takes… | share |
|---|---|
| nothing | **11.6%** |
| one card | 18.7% |
| two | 34.0% |
| three | 25.1% |
| four or more | 10.6% |

**88% of placements capture something, and 70% capture two or more.** A
nine-cell board changes hands 18 times, so every card is taken roughly
twice per game. That is the mechanical statement of "players have little
reason to believe the position they're building will survive."

---

## 2. The proposal

Split the single activity into two phases.

**Phase I — The Convergence.** Nine placements, alternating, P1 first.
Direct matching captures apply. Abilities and chains are withheld.

**Phase II — The Dominion.** No new cards. Six commands, alternating,
**P2 first**. A command is: choose a card you control, activate its
ability, attack adjacent enemies from the appropriate card; if more than
one falls, choose one newly captured card to make a single follow-up
attack. Then stop. Victory is decided after the sixth command.

A card captured from the opponent may be commanded by its new owner.

Abilities reduce to the original four (Pivot, Exchange, Relay, Prism),
each resolving immediately with no future state to simulate.

Cards get permanent authored sigil configurations instead of randomised
ones, with symmetry used to vary how many distinct orientations each
character has.

---

## 3. What measurement says about it

### The two-phase split redistributes churn rather than reducing it

Measured directly, with the current capture rule:

| | captures | per action |
|---|---|---|
| Phase I (9 placements, direct only, no abilities) | **8.05** | 0.89 |
| Phase II (6 commands, best available each time) | **~7.7** | 1.28 |
| **Two-phase total** | **~15.7** | |
| v1 for comparison | 18.43 | 2.05 |

**That is a 15% reduction in total churn, not a structural fix.** The
nine-cell board still turns over about 1.7 times. Per *action* the
proposal is much calmer — 1.28 against 2.05, and 16.6% of command
positions offer nothing against 11.6% of placements — so the moment-to-
moment calculation load genuinely drops. But the position you spend
Phase I building is still largely gone by the end of Phase II.

The two phases deliver the *narrative* of build-then-exploit. On this
evidence they do not by themselves deliver the *durability*.

### The mechanism is the capture condition, not the turn structure

Why is defence worth nothing? With four sigils a given facing pair
matches one time in four — but an attacker chooses among four rotations
and every empty cell, so it almost always finds a match somewhere.
Capture is close to unconditional, which is also why Prism (capture
unconditionally on one edge) measured strongest of the four and why
exposure-avoidance measured zero. **You cannot defend a card that any
card can answer.**

So the lever on durability is what it takes to capture. One candidate,
measured on random positions:

| Rule | Best placement takes | Placements that can take nothing |
|---|---|---|
| One matching edge (v1) | 1.05 cards | **9.3%** |
| Two converging cards | 0.28 cards | **72.7%** |

Convergence — a card falls only when *two* of your cards match it at
once — makes a single card impossible to answer alone. That is exactly
the property that would make a formation worth building, and it attacks
the mechanism rather than the symptom.

72.7% is probably too far; a game where three placements in four can
take nothing risks being inert rather than tense. But the dial exists,
and it is a different dial from turn structure. Candidates between the
extremes: convergence required only to *re*capture a card; or two
matching edges from the same card, which would make focused and
specialized sigil layouts mechanically distinct from versatile ones —
and would give the permanent authored configurations in §2 real teeth.

### Risks in the proposal that are worth pre-testing

- **Phase II seat order.** P1 places five cards and P2 four, then P2
  commands first and P1 commands last. v1's whole final-placement
  analysis (the last placement starts no chain, to stop the last mover
  simply taking the board) will need redoing for a last *command*. This
  is the first thing to measure, not the last.
- **One character dominating.** A commanded card with a strong ability
  and good edges can be commanded repeatedly. Nothing in the proposal
  limits how often the same card is commanded. An exhaustion rule — a
  commanded card cannot be commanded again until your next command, or
  at all — may be necessary.
- **The trailing player.** After a bad Phase I you may hold too few
  cards to have three worthwhile commands. Measurable: win rate by
  Phase-I margin.
- **Captured cards being commandable** is thematically the best idea in
  the proposal and the most likely to run away: taking a card both
  removes an enemy command and adds one of yours, a two-for-one swing.

---

## 4. Test plan

| Prototype | Rules | Question |
|---|---|---|
| **A — baseline** | v1 as tagged | Baseline satisfaction and comprehension |
| **B — controlled cascade** | v1, but only one chosen captured card propagates | Does cutting prediction load improve play? |
| **C — two-phase** | §2 above, four abilities | Does separating planning from execution create strategy? |
| **D — convergence** | v1 single-phase, but capture requires two converging cards | Does making positions defensible do what two phases were meant to? |

D is included because §3 suggests the durability problem is in the
capture rule, and C and D are independent: if D works, C becomes a
pacing choice rather than a fix, and the two compose.

### What the harness can answer

Seat balance, churn, whether one character or one ability dominates,
whether the trailing player can recover, how often a position survives
to the end of the game, and whether a rule is inert. These are cheap and
should gate what reaches a human.

### What it cannot

Whether a plan felt available. Whether the loser believes they could
have played better. Whether anyone wants a rematch. **Win rate is not a
proxy for any of these**, and v1's history is a warning: every number in
§1 was green for most of v1's life except the ones nobody thought to
measure.

The question to ask a human after each match:

> *What were you trying to accomplish, and did the game let you attempt
> it?*

A player who can describe a failed plan has agency. A player who can
only say they picked the move that flipped the most cards does not —
which, given that 88% of v1 placements capture, is the move v1 usually
rewards.

---

## 5. Order of work

1. **Phase II seat order and the exhaustion rule**, in the Python
   harness only. If six commands on a full board are decided by who
   commands last, that is cheaper to find now than after a UI exists.
2. **Prototype C** in the harness, measured for the four risks in §3.
3. **Prototype D** in the harness, to see whether convergence makes
   exposure worth anything — the ablation that read −0.4 in v1 is the
   single clearest test of whether positions have become defensible.
4. Only then a playable build, and only of whichever of C, D or C+D
   survives.
5. Permanent sigil configurations per character, once there is a ruleset
   worth authoring them against. `protodeck.json` already fixes sigils
   per card id and the v1 app ignores it; wiring that up is a
   prerequisite for characters having strategic identities, and it
   measurably shifts first-player balance, so it is a rules change and
   not a content change.

No new abilities until C or D is satisfying. v1 has twenty, six of which
measured worth nothing.
