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

**Corrected after implementation.** An earlier draft of this section
estimated Phase II at ~7.7 captures and concluded the two-phase game cut
churn by 15%. That estimate measured a bare attack with no abilities,
which is not the proposal. With the four abilities firing in Phase II —
Prism alone makes a capture unconditional, and Relay and Exchange let you
choose the attacker — the real figures are much worse:

| | captures | per action |
|---|---|---|
| Phase I (9 placements, direct only, no abilities) | **9.4** | 1.04 |
| Phase II (6 commands, as proposed) | **20.0** | **3.34** |
| **Two-phase total** | **29.4** | |
| v1 for comparison | 18.43 | 2.05 |

**The two-phase game as proposed is 60% churnier than v1, not calmer.**
A command captures 3.34 cards on average against an opponent holding
four or five; 47.8% of commands take four at once, and only 1.4% take
nothing. Phase II alone turns the board over more than twice.

Two consequences follow, and both are fatal as the rules stand.

**The closing command decides the game.** Holding the command count at
six so each player gets three, and flipping only who closes:

| Command size | Phase II | P1 closes | P2 closes | spread |
|---|---|---|---|---|
| all edges, follow-up always (as proposed) | 20.0 | 66.0% | 44.6% | **21.4** |
| all edges, follow-up only on a multiple | 15.9 | 63.6% | 43.5% | 20.1 |
| one edge, follow-up always | 15.0 | 91.2% | 21.6% | **69.6** |
| one edge, no follow-up | 6.0 | 90.9% | 90.8% | **0.1** |

**Deployment barely matters.** At the proposed settings the Phase I
leader is still ahead at the end only 62.7% of the time, and a player who
finishes deployment *one card behind* still wins **54.3%**. The position
you spent nine placements building has almost no bearing on the result —
which is the opposite of the proposal's purpose.

### The two failure modes are in tension

Shrinking a command fixes the closing-command problem completely — "one
edge, no follow-up" has a spread of 0.1, so who closes stops mattering
at all. But it replaces that failure with the one v1 already had: with
Phase II too weak to overturn anything, the extra placement decides
everything. On nine cells P1 places five and P2 four, so P1 wins 90.9%
and the deployment leader wins 99.9% of the time.

So Phase II has to be strong enough to overturn a one-card deployment
lead and weak enough that no single command can steal the board. Both
dials exist — command size and board parity — and the next section
records where they land.

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

### Results: lock is rejected, and one configuration works

**The lock rule flips the problem instead of fixing it.** Making a
Phase II capture permanent does give the phase weight — it overturns the
deployment result 73–92% of the time — but a locked capture is a
permanent land grab, so the advantage moves from the *last* mover to the
*first*. Spread goes to 37–58 points in most locked configurations. Full
matrix in `v2_lock_matrix.txt`.

**Odd command counts are catastrophic.** With an odd count one player
gets an extra command, and that one command is worth 75–86 points of win
rate. Commands must be split evenly; this is not a tuning preference.

**What works, measured over 900 games per cell:** 3×4 board, 11
placements (so one cell stays empty and a draw is impossible), an even
command count, a command that attacks all edges, a follow-up allowed
only when the attack captured more than one card, and no lock.

| | 6 commands | 8 commands |
|---|---|---|
| closing-command spread | **1.6** | 2.7 |
| Phase II overturns deployment | **32.7%** | 37.1% |
| deployment leader still wins | 67.3% | 62.9% |
| draws | 0.0% | 0.0% |
| Phase II captures | 18.8 | — |

This is the profile the proposal was aiming for. Deployment matters
without being destiny, and no single command can steal the board.

**The remaining fault is a seat bias, not a structural one.** P1 wins
~68%, because 11 placements hands P1 six cards against P2's five with
nothing given back. Phase II order cannot compensate — a spread of 1.6
is precisely the statement that turn order inside Phase II no longer
matters, which is what makes the configuration good and also removes it
as a dial. Compensation has to come from deployment: a smaller hand for
P1 (fewer choices rather than fewer cards), P2 deploying first, or an
even placement count with a different anti-draw rule. Untested.

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
