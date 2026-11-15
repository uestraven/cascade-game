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

## 3b. v2.1: the variant experiment, and what shipped

Four variants, 2,500 games each, six commands and multiple-capture
follow-ups and no lock throughout. P1, P2 and draws reported separately,
because a 50% P1 rate can hide a quarter of games ending level.

| variant | deal | places | opens | P1 | P2 | draws | reversed |
|---|---|---|---|---|---|---|---|
| A baseline | 7/6 | 6/5 | P2 | 66.6% | 33.4% | 0.0% | 32.1% |
| B equal+full | 6/6 | 6/6 | P1 | 31.0% | 45.4% | 23.6% | 35.0% |
| **C phase order** | **6/6** | **6/6** | **P2** | **46.6%** | **43.9%** | **9.5%** | 44.6% |
| D hand choice | 7/7 | 6/6 | P1 | 29.6% | 44.9% | 25.6% | 35.5% |

**On a full board, closing Dominion is worth about 15 points.** B and C
differ only in who opens; P1 goes from 31.0% to 46.6% by closing instead
of opening. At eleven placements the same swing measured 1.6 points, so
the small spread found earlier was a property of the odd board and does
not generalise — exactly the caution raised when the full board was
proposed.

**C is balanced by cancellation, not by design.** P1 deploys first and so
can never capture with its opening placement, while P2 always places in
response and usually can. P1 closing Dominion pays that back. Changing
the order of either phase breaks the cancellation, which is why the
shipped configuration is pinned by a test that fails on variant B.

**Draws need no tiebreaker.** The full board makes a level score
reachable, but C measures 9.5% — against 23.6% and 25.6% for B and D, and
v1's 21–26% on even boards. The draw rate turned out to be a function of
phase order rather than of board fullness.

**D buys nothing.** A spare hand card moves P1 by 1.4 points and costs a
larger deck and more decision load. The deal is now exactly what gets
deployed.

### What shipped, and what is still wrong with it

Variant C is live in the app: 3×4, twelve placements, six cards each,
Dominion opens with P2, six commands, follow-up only after a multiple
direct capture, no lock, draws permitted.

Two faults remain, both measured and neither fixed.

**Dominion may matter too much.** It reverses the deployment leader
44.6% of the time, against 32–35% in the other variants. Near a coin
flip devalues the twelve placements that precede it.

**The churn is untouched.** A command still takes four cards 43–53% of
the time, and a whole game runs to about 30 captures on twelve cells —
2.6 per cell against v1's 2.0. The phase split has not made the game
calmer per card, which was the complaint that started v2.

## 3c. The finding that should come before a roster

Three questions were raised about compounding advantage, character
identity and Convergence passives. The measurements answer the first and
reframe the other two.

### There is no compounding ability advantage

6,000 games, variant C. "Portfolio" is how many *distinct* abilities a
player can choose between across the cards they hold.

| held level at 6 cards each | P1 wins | | held level at portfolio diff 0 | P1 wins |
|---|---|---|---|---|
| portfolio −1 | 52.1% | | 4 cards | 32.8% |
| portfolio 0 | 52.1% | | 5 cards | 49.6% |
| portfolio +1 | 54.1% | | 6 cards | 52.1% |
| | | | 7 cards | 62.3% |

Control for ownership and the portfolio is worth **2 points**. Control
for the portfolio and ownership is worth **30**. The apparent portfolio
effect when ownership is ignored (31.9% at −2 against 56.9% at +1) is
confounding: more cards simply means more distinct abilities.

**So the advantage is position, not portfolio, and no catch-up bonus or
ability-count compensation is warranted.** More cards give more options,
and the options are worth almost nothing beyond the cards themselves.

Nor does one character dominate: across three commands a player spends
all three on the same card 10.1% of the time and two on the same card
19.3%. An exhaustion rule is not needed on this evidence, which also
matches the terminology point — a commanded card is never spent, so
there is no ready/spent state to display.

### Abilities barely affect Dominion at all

The control test is the one that matters. Run Dominion, then run it with
every ability switched off:

| command | abilities | P1 | P2 | draw | Phase II captures | reversed |
|---|---|---|---|---|---|---|
| all edges (shipped) | on | 47.1% | 43.2% | 9.6% | 16.96 | 44.1% |
| all edges | **off** | 44.7% | 46.2% | 9.1% | 15.44 | 45.9% |
| one edge | on | 9.2% | 61.1% | 29.7% | 6.00 | 0.0% |
| one edge | **off** | 9.4% | 60.3% | 30.3% | 6.00 | 0.0% |

Removing every ability costs **1.5 captures out of 17** and moves the
reversal rate by **1.7 points**. The phase built around abilities is not
meaningfully about them; it is about the matching geometry of a full
board.

And there is no edge count that fixes it. With one edge a command takes
*exactly* one card — 6 commands give 6.00 captures, 12 give 11.97 — so
an ability can never add anything, reversal is 0.0% at every count, and
the deployment result simply stands. With all edges the base attack
takes three or four and an ability is noise on top.

**The cause is that all four abilities only modify how you attack.**
Prism adds one capture, Relay and Exchange choose the attacker, Pivot
turns a card first. Each is "attack, but differently", so its value is
bounded by the attack's. Swamped when the attack is big, capped when it
is small.

v1 already measured what escapes this. The two strongest abilities in
the whole v1 set were **Mend (86.3%)** and **Anchor (70.5%)**, and
neither changes a capture count at all — both only move cards. Pure
repositioning beat every attack modifier.

**That is the thing to fix before authoring twelve characters.** A named
roster and Convergence passives are good ideas, and the Ward-versus-
conditional-Veil comparison is the right experiment, but abilities that
protect, move or deny are a different *shape* from the four in play, and
giving characters richer identities will not rescue a phase whose
outcome is 98% independent of its abilities. Fix the shape first, then
author characters onto something that works.

## 3d. v2.2: abilities designed from intended experience

The four old abilities are discarded rather than rebalanced. They were
placeholders for testing the command system, and all four only modified
*how you attack*, which is why switching every one off cost 1.5 captures
and 1.7 points.

Five candidates implemented in `v22.py`, each built for a named
experience, each measured against PLAIN -- the identical game with the
ability replaced by an ordinary attack. 1,500 games apiece, two-phase
baseline held fixed.

| ability | used | P1 | P2 | draw | conv | dom | reversed | swing |
|---|---|---|---|---|---|---|---|---|
| PLAIN (control) | — | 46.7% | 45.6% | 7.7% | 13.1 | 15.6 | 44.5% | — |
| **Sanctuary** | passive | 40.3% | 45.5% | 14.2% | **10.7** | **11.8** | 43.7% | **12.9** |
| **Usurp** | 72.4% | 42.9% | 54.5% | 2.7% | 13.1 | **21.0** | **26.6%** | **17.7** |
| Transpose | 13.2% | 47.3% | 44.9% | 7.8% | 13.1 | 14.8 | 44.5% | 1.3 |
| **Reclaim** | 28.2% | 49.7% | 41.2% | 9.1% | 13.0 | 16.3 | 46.8% | 8.8 |
| Retribution | passive | **55.3%** | 37.2% | 7.5% | 13.1 | 19.7 | 54.0% | 17.3 |

`swing` is the total absolute movement in P1, P2 and draw rate away from
PLAIN. For scale, switching off all four of v2.1's abilities moved it
about 5 points.

**Four of five are live, against nought of four before.** Designing from
an intended experience rather than from "another way to attack" worked.

- **Sanctuary is the first thing to make Convergence matter.** It cuts
  deployment captures 13.1 → 10.7 and carries forward into Dominion
  (15.6 → 11.8). Cost: draws rise to 14.2%.
- **Usurp is the strongest and the most distinctive.** Chosen in 72% of
  commands, and it *lowers* the reversal rate to 26.6% — the deployment
  leader holds their lead more often, which is the opposite of the
  complaint about v2.1. Problem: P2 +12 and draws collapse to 2.7%.
- **Reclaim is live and nearly balanced** at 28% usage and swing 8.8.
- **Retribution does a great deal and breaks balance**: P1 +18. Worth
  diagnosing rather than discarding, since P2 commands first and so
  takes the first retaliation.

### Two instrument limits, both found the hard way

**The `used` column is meaningless for a passive.** Sanctuary and
Retribution are never *chosen* as a command, so an automated verdict of
"never taken, not worth it" was wrong for both. Passives have to be
judged on swing and phase captures alone.

**Deferred-payoff abilities cannot be measured by this harness at all.**
Transpose takes nothing now and pays off next command, so its entire
measured value sits in one bot heuristic:

| lookahead weight | chosen | P1 | P2 | draw |
|---|---|---|---|---|
| 0.0 | 2.2% | 45.0% | 46.4% | 8.6% |
| 0.5 | 13.6% | 48.0% | 44.6% | 7.4% |
| 1.0 | 40.4% | 46.7% | 40.0% | 13.3% |
| 2.0 | 98.0% | 10.4% | 65.1% | 24.4% |

The swing of 1.3 is a statement about a greedy one-ply bot, not about
the Weaver. This is v1's Anchor again, which read 47.7% greedy and
≥70.5% when forced.

So the division of labour is now explicit, and it matches the reversed
process: **simulation catches abilities whose immediate effect is
nothing, and cannot judge abilities whose payoff is deferred.** Usurp,
Reclaim, Sanctuary and Retribution are the measurable kind and all four
are live. Transpose needs a human.

## 3e. Usurp diagnosed, Reclaim made physical

### Usurp: the skew is in the ability, not the turn order

Each row compared against its own seat-matched baseline, since command
order alone is worth ~15 points on a full board.

| deck | opens | P1 | P2 | draw | dom | reversed |
|---|---|---|---|---|---|---|
| plain (control) | P2 | 47.7% | 44.9% | 7.4% | 15.7 | 45.3% |
| plain (control) | P1 | 40.5% | 39.3% | 20.2% | 17.0 | 43.8% |
| usurp | P2 | 43.4% | 54.0% | 2.6% | 20.9 | 26.2% |
| usurp | P1 | **8.8%** | **89.5%** | 1.8% | 33.2 | 15.4% |

Adding Usurp moves P2 **+9.1** when P2 opens and **+50.2** when P1
opens. Same sign both ways, so this is not a turn-order artifact — the
caution was right. With P1 opening, Usurp alone takes P2 to 89.5%.

The likely mechanism: Usurp's value scales with how clustered the
*opponent's* cards are, because it turns their formation against itself.
P1 deploys first and so lays the initial cluster that P2 then builds
around, leaving P1's shape more usurpable. Unconfirmed.

**Usurp is a snowball, which reinterprets its best-looking number.**
P1 win rate by the lead P1 held entering Dominion:

| P1 lead | plain | usurp | delta |
|---|---|---|---|
| −4 | 40.6% | 21.6% | **−19.0** |
| −2 | 44.7% | 29.5% | −15.2 |
| 0 | 53.5% | 64.0% | +10.5 |
| +2 | 53.4% | 75.0% | **+21.6** |

Usurp helps whoever is already ahead and hurts whoever is behind. So the
fall in reversals from 44.5% to 26.2% is **not** deployment mattering
more in a good way — it is the leader compounding. That reading of the
earlier number was wrong.

**And it does crowd out alternatives.** Over 2,895 commands, Usurp was
*strictly* best 69.3% of the time and merely tied 9.7%. The concern that
players would stop considering anything else is justified, and a line in
`exp_usurp.py` that reads "chosen often while rarely strictly best means
the 72% is a tie" is printed unconditionally and is contradicted by its
own output — the interpretation was written before the data existed and
is wrong here.

Usurp is a redesign, on three independent counts: an intrinsic seat
skew, a snowball gradient, and option crowding. It remains the most
distinctive ability produced so far and is worth fixing rather than
dropping.

### Reclaim: the physical rule is the better rule

Full ownership history needs a log of changing allegiances on a table —
the memory burden the elemental wheel was abandoned for. The restricted
rule needs one temporary marker: only a card the opponent took from you
on their *last* command.

| rule | used | P1 | P2 | draw | reversed |
|---|---|---|---|---|---|
| plain (control) | — | 46.7% | 45.6% | 7.7% | 44.5% |
| full history | 28.2% | 49.7% | 41.2% | 9.1% | 46.8% |
| **recent only** | 24.9% | 44.5% | 48.3% | 7.1% | 42.6% |

Nearly identical engagement, a *smaller* seat gap (3.8 against 8.5), and
a draw rate closer to the control. The physically representable version
costs nothing and is adopted. No ability should need invisible state a
human has to memorise.

### Two slots, not one ability list

`v22.py` now models a Convergence **trait** and a Dominion **command**
as separate fields, with decks built from a roster of (trait, command)
pairs. Either slot may be empty. Treating Sanctuary as interchangeable
with three Dominion actions was a category error.

### A concession on Transpose

The claim that "more simulation will never settle it" was overstated.
Dominion is six commands deep, so forward search or rollouts are
tractable and would evaluate deferred payoff properly. The sensitivity
sweep shows the *greedy* bot cannot, not that the question is
unanswerable. Making it playable now and improving the bot later are
both open.

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
