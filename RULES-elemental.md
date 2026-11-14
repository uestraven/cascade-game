# Cascade — Rules (the elemental version)

> **This is the previous design, kept for reference.** The live game is
> Prototype A: four sigils, matching captures, four abilities. See
> `RULES.md`.
>
> Nothing here is wrong — it is a complete, measured rulebook for the
> eight-element wheel, and the measurements in it are the reason the
> redesign went the way it did. Kept because this project has no version
> control, and because several of its findings still apply: the
> resolution-order proofs, the ablation method, and the structural
> constraints that killed a long series of ability designs.

*A game of elemental positioning.*

Two players. A 3×3 grid. Nine cards get placed, and whoever owns more at the
end wins.

**There are no numbers in this game.** Captures are decided entirely by which
element faces which — and by which way round you turn the card.

---

## What a card looks like

Four elements, one on each edge. All four are different. That's the whole
card.

```
        Water          <- top edge
  Lightning   Ice      <- left edge, right edge
         Air           <- bottom edge
```

There are **1,680 cards**, and **no card is stronger than another**. They
differ only in which element sits on which edge. What makes a card good is
where you put it and which way you turn it.

---

## The eight elements

Every element **beats three** and **loses to three**. Each one also has a
**twin** — its natural opposite — and twins never resolve against each other.

| Element | Beats | Twin |
|---|---|---|
| **Fire** | Air, Earth, Ice | Water |
| **Water** | Air, Earth, Lightning | Fire |
| **Earth** | Ice, Light, Lightning | Air |
| **Air** | Ice, Lightning, Shadow | Earth |
| **Lightning** | Fire, Light, Shadow | Ice |
| **Ice** | Light, Shadow, Water | Lightning |
| **Light** | Air, Fire, Water | Shadow |
| **Shadow** | Earth, Fire, Water | Light |

Nothing is strongest. If you only remember one thing, remember the twins:
**Fire/Water, Earth/Air, Lightning/Ice, Light/Shadow.** Those four pairs
cancel; everything else resolves one way or the other.

---

## Setup

1. Build **one 12-card deck, shared by both players.** Every card carries
   an ability.
2. Shuffle it. **Player 1 draws 5 cards. Player 2 draws 6.**
3. **One card is left in the deck, unseen by anybody.**
4. Player 1 goes first.

**That's the whole deal — there is no drawing during the game.** You see
your entire hand from the first turn and plan the whole match with it.

Player 1 places five cards and holds five, so Player 1 plays every card
they were dealt. Player 2 places four from six, so Player 2 always keeps
something in reserve.

**That reserve is the only thing that makes the game fair**, and it took a
lot of measuring to establish. Player 1 moves both first *and* last and
places one more card, which is a structural head start. What pays for it
is not Player 2's card *count* but Player 2's **discretion**: Player 1
must play every card dealt, while Player 2 chooses four of six and
discards two. Every alternative tried — small refilling hands, drawing one
a turn, letting Player 2 filter the draw — collapsed to roughly 70% for
Player 1, because each of them hands Player 1 a choice too.

**Why twelve cards, and why one stays unseen.** Measured across deck
sizes, any size from twelve up balances *provided at least one card is
never dealt*; the configurations that deal every card do not. Ten cards
force a 5/5 deal and land five points off. Twelve is the smallest deck
that balances, which is also the size where each deckbuilding choice
counts for most.

| Deck | Deal | Unseen | Player 1 wins |
|---|---|---|---|
| 10 | 5 / 5 | 0 | 55.0% |
| 11 | 5 / 6 | 0 | 44.6% |
| **12** | **5 / 6** | **1** | **51.8%** |
| 13 | 5 / 6 | 2 | 48.2% |
| 16 | 5 / 6 | 5 | 48.4% |

---

## Turn order

Strict alternation, nine turns:

```
turn    1   2   3   4   5   6   7   8   9
player  P1  P2  P1  P2  P1  P2  P1  P2  P1
```

Player 1 places five cards, Player 2 places four. The board fills exactly.

---

## Your turn

**Place one card on any empty cell, turned any way you like** — as drawn, or
a quarter, half, or three-quarter turn. That's your whole turn; you don't
draw.

That rotation is the heart of the game. A card can be aimed four ways, and
picking the wrong one is how you lose. (You may rotate a card but never
*flip* it — there's no mirroring, same as any physical card.)

---

## Capturing

Your placed card attacks each **enemy** card beside it.

> **Compare only the two elements that face each other.**
> Your card's right edge against their card's left edge. Your top against
> their bottom. Nothing else on either card matters.

- Your element **beats** theirs → you **take the card.**
- Their element beats yours → **nothing happens.** You lose nothing for
  trying.
- **Twins, or the same element → nothing happens.**
- **Cards of the same owner never fight.**

---

## The cascade

> **A card you just captured immediately attacks its own neighbours**, by the
> same facing-element rule. Then it stops.

Two waves, total: your placement, then one ripple. Everything taken in the
chain becomes yours. (All of a wave's captures happen at once — see
**Resolution order** below, which also explains why you never have to
decide which card attacks first.)

**Why this matters:** cards of the same owner never fight, so inside a block
of your own cards every comparison sits dormant. The moment one of them
flips to your opponent, all those dormant comparisons go live at once.

**A solid wall of your own cards is not a fortress. It's a fuse.**

### The one exception

**The ninth and final card captures its neighbours but starts no chain.**

Player 1 moves both first and last. With free aiming *and* a live cascade,
that final placement converts most of the board and Player 1 wins over 80%
of games. Muting just the chain — not the capture, and not the rotation — is
what keeps it fair.

---

## Worked example

Cells are numbered 0–8. It's your turn; your opponent owns the four cards
on the board.

```
    0  THEM        1  THEM        2  empty
    Air                Shadow
 Earth ◈ Light     Ice ◈ Water
    Water              Earth

    3  THEM        4  EMPTY       5  THEM
    Fire                               Shadow
 Water ◈ Light                   Water ◈ Earth
    Ice                                 Air

    6  empty       7  empty       8  empty
```

You hold one card: **Water** top, **Ice** right, **Air** bottom,
**Lightning** left. You're going to play it on cell 4, the centre — but
*how you turn it decides everything.*

### As drawn

- **North**, your Water against cell 1's bottom edge, Earth.
  Water beats Earth → **captured.**
- **East**, your Ice against cell 5's left edge, Water.
  Ice beats Water → **captured.**
- **West**, your Lightning against cell 3's right edge, Light.
  Lightning beats Light → **captured.**
- **South** faces cell 7, which is empty. Nothing.

**Three captures.**

### One quarter turn clockwise

The left edge moves to the top, so now it reads Lightning / Water / Ice / Air:

- **North**, Lightning against Earth — Lightning doesn't beat Earth. Nothing.
- **East**, Water against Water — same element. Nothing.
- **West**, Air against Light — Air doesn't beat Light. Nothing.

**Zero captures.** Same card, same cell, one quarter turn, and the whole
turn evaporates. That's the game.

### The cascade, from the good orientation

The three cards you just took now attack their own neighbours:

- **Cell 1** (now yours) reads Shadow / Water / Earth / Ice. Its left edge,
  Ice, faces cell 0's right edge, Light. Ice beats Light → **captured.**
- **Cell 3** (now yours) reads Fire / Light / Ice / Water. Its top edge,
  Fire, faces cell 0's bottom edge, Water. **Fire and Water are twins** —
  nothing happens.
- **Cell 5** has only empty cells beside it. Nothing.

**Then it stops.** Cell 0 does not get to attack. One placement, **four
cards taken**, and the board flips from 0–4 against you to 5–0 for you.

---

## Winning

The board fills on turn 9. **Count the cards you own. Most wins.**

Nine cells can't split evenly, so **a draw is impossible.** There is no
tie-breaker, because there are no ties.

---

## Abilities

**Every card carries an ability.** Three rules cover all of them:

1. **You may use it from your second placement onward.** Nothing else
   gates it — no cost, no resource.
2. **It is always optional**, and you declare it *as you place the card*,
   naming any target at that moment. You may not place first and decide
   after.
3. **An ability never removes a card from the board and never adds one.**
   Nine placements still fill nine cells.

### The four families

Every ability is one of four things, and the family tells you when it
resolves.

| Family | What it changes | Abilities |
|---|---|---|
| **Modifier** | edges, before anything is compared | Gust, Tremor, Eclipse, Cyclone, Upheaval, Glaciate, Umbra |
| **Movement** | where your card ends up | Tide |
| **Redirection** | where the chain starts | Conduit, Arc, **Surge** |
| **Reach** | one extra attack, after the chain | Scorch, Beacon, Backlash |

### The eight worth knowing first

**Gust** — *modifier.* Name one **orthogonally adjacent occupied cell,
either player's, including your own.** That card turns **90° clockwise**
(its left edge moves to the top). Then your placement is compared as
normal. This is the ability that most rewards knowing the wheel: you can
spin an enemy's weak edge round to face you and take it in the same turn.

**Tremor** — *modifier.* No target. **Every** orthogonally adjacent
occupied card turns **180°** (top swaps with bottom, left with right) —
**your own cards too.** Then your placement is compared.

**Eclipse** — *modifier.* No target. All four edges of the card you are
placing become **their twins** (Fire↔Water, Earth↔Air, Lightning↔Ice,
Light↔Shadow). Because twins never resolve, this turns a dead matchup live
and a winning one dead. The change is **permanent** — the card stays
twinned for the rest of the game.

**Tide** — *movement.* Name one **orthogonally adjacent cell you
control.** Your card and that card **trade places**: your card ends up on
the cell you named, the ally ends up on the cell you played on. **Your
card then attacks from its new cell**, and the chain starts there.

**Conduit** — *redirection.* Name one **orthogonally adjacent cell you
control.** The chain starts from **that** card instead. **The card you
just placed does not attack at all** — you are trading its attack for a
better-aimed one.

**Arc** — *redirection.* The same trade, but the card you name may be
**any** card you control, anywhere on the board. Again, the placed card
does not attack.

**Scorch** — *reach.* Name one **diagonally adjacent enemy card.** After
the chain has finished, your card attacks it once, using **your top edge
for the two diagonals above, your bottom edge for the two below.** The
defender uses the edge facing back (its bottom, or its top).

**Beacon** — *reach.* Name one **orthogonally adjacent enemy card** *and*
**which of your four edges attacks it.** After the chain has finished,
that comparison happens. **The defender still uses the edge that
geometrically faces you** — you choose your edge, never theirs.

**Surge** came from the deleted leader subsystem — it was PRINCE. Leaders
were merged into ability cards once measurement showed three of the four
were redundant or dead: LETO is already Arc (the same effect, standing
rather than one-shot), TANTALUS is PRINCE (its "only while you are
behind" gate is open on **99.4%** of your own turns, because captures
accrue to whoever just placed), and LOVER's condition — three of your
cards sharing an element — is met on **2.0%** of turns. Only PRINCE was
worth porting.

> **Surge is the deliberately unbalanced one.** A single Surge in a
> twelve-card deck swings the seat **10.6 points** — toward Player 2,
> because Player 2 places into contact with Player 1's cards and so has
> more neighbours for a sweep to hit. It is kept anyway: in a shared deck
> a lopsided ability is a scenario both players signed up for, not an
> unfair edge for one of them. Leave it out if you want an even game;
> put it in if you want a violent one.
>
> It would be properly priced as a **delayed** effect — fired at the
> start of your next turn, and only if you still control the card, which
> measures 52.6% with depth at 70.0%. That timing is not implemented.

The other six are variants within the same families:
**Cyclone** turns *every* card on the board 90°; **Upheaval** turns your
card and your adjacent cards 90°; **Glaciate** makes all four of your
edges Ice; **Umbra** twins one adjacent *enemy* card's edges; **Backlash**
reaches in a straight line through one *empty* cell.

### Scorch is being redesigned

Scorch as printed is a **lure**: it is used in 73% of games and *loses*
4 points, because the promise of a diagonal capture pulls your placement
onto a worse cell. Measured three ways — never used, used but forbidden
from influencing where you place, and chosen together with the placement:

| Scorch variant | never | can't bias placement | chosen with placement |
|---|---|---|---|
| **as printed** | 50.4% | 52.0% | **45.1%** ↓ |
| from any card you control | 50.9% | 58.1% | 55.1% ↓ |
| **from an entrenched card** | 50.9% | 53.6% | **54.4%** ↑ |

A fair ability gets *better* the more say it has in the placement — Gust
and Eclipse both do. Only the last variant does, so that is the candidate:

> **Scorch (candidate).** After your chain finishes, choose one card you
> control that has **no exposed edges**, and attack one of its diagonal
> neighbours with the edge nearest it. That capture starts no chain.

Requiring an entrenched source decouples the payoff from where you place
*and* rewards the positional play the game is about. It fires in 40% of
games — still a real card, not balance-by-absence. **Not yet ported to
the engine, and not yet played by humans.**

**That said, the shared deck changes the verdict on Scorch.** A card that
punishes greedy placement is only a defect when one player holds it. Both
players drawing from the same twelve means "this scenario punishes
grabbing" is a legitimate thing to build, so Scorch ships as-is and the
redesign above is optional.

### Two things to get right about reach

**A card taken by reach starts no chain.** This is not bookkeeping — it is
the single most load-bearing sentence in the ability rules. If a scorched
card cascaded like any other capture, outcomes would change in **36.4%**
of positions where Scorch has a live target, and the worst case measured
goes from **1 capture to 7**. Reach is one extra attack, full stop.

**Reach resolves after the chain, so its target may already be gone.** If
the cascade took the card you named, the reach simply does nothing. You
lose nothing by naming it.

### Deckbuilding

**One 12-card deck, shared. Every card carries an ability. Any ability may
repeat.**

There is no cap, and there is no "my deck versus your deck" — you are not
building a weapon, you are building the **scenario both players will
face.** That single change is what finally made deckbuilding work here,
after six failed attempts. All 1,680 cards are equally strong; they differ
only in which element sits on which edge. Abilities are the one component
that measurably differs, so making every card an ability card makes the
difference the point. And because the deck is shared, a strong ability is
not an unfair edge — it is a property of the game you both agreed to play.

**Compositions are archetypes.** They barely differ in who wins, and
differ a lot in how the game feels. Measured on 12-card shared decks:

| Deck | Depth | Decided by play | Close finishes |
|---|---|---|---|
| **Deniers** — Umbra, Eclipse, Glaciate | **75.5%** | 36.0% | 70.0% |
| **Priced mix** — Arc, Umbra, Eclipse, Glaciate, Conduit | 70.8% | **44.0%** | 70.5% |
| **Chainers** — Arc, Conduit | 70.2% | **43.5%** | 66.0% |
| **Rotators** — Gust, Tremor, Cyclone, Upheaval | 70.0% | 33.0% | 76.8% |
| **Sweepers** — Cyclone, Quake, Tremor | 64.8% | 34.5% | **78.0%** |
| **Reach** — Beacon, Scorch, Backlash | **58.5%** | 32.5% | **63.7%** |

Chainers and the priced mix reward skill most. Reach rewards it least —
that family hands out captures without demanding you read the board, and
it is the same reason Scorch is a trap and Beacon resisted four separate
attempts to price it. Build a reach deck if you want a loose, swingy game;
build chainers if you want to out-think someone.

**What composition cannot change is how explosive the game is.** Captures
per game sit at 18.8–19.6 across every archetype and the biggest single
turn is four or five cards in all of them. The 3x3 board and the two-wave
cascade set that ceiling, and no ability mix moves it.

### There are no leaders

An earlier version gave each player a leader — a one-use free action
chosen before the game. They were merged into ability cards, because
measurement showed three of the four were redundant or dead:

- **LETO** is Arc. "Your cascades may start from any card you control"
  and Arc's "trigger this card's cascade from ANY card you control" are
  the same effect, standing rather than one-shot.
- **TANTALUS** is PRINCE. Its gate — *only while you are behind* — is
  open on **99.4%** of your own turns, because captures accrue to whoever
  just placed, so the player about to move is almost always behind.
- **LOVER** is dead. Its condition, three of your cards sharing an
  element, is met on **2.0%** of turns.
- **PRINCE** survives as **Surge**.

Leaders also had a problem no version fixed: a free action that only gets
stronger as the board fills always wants to be spent on the last legal
turn, and three of the four detonated on turn 9 in about 78% of games.
Barring the final turn balanced them, but the bots then mostly declined
to use them at all — balance by absence.

---

## Resolution order

This section exists so that no two players can resolve the same turn
differently. The short version: **almost none of it can go wrong, and the
rulebook can say so instead of making you track an order.**

### A wave is simultaneous

> **Every attack in a wave is judged against the board as it stood at the
> start of that wave, and all of its captures are turned over together.**

So when you place a card and it beats three neighbours, you do not resolve
them left-to-right — you take all three at once, then the next wave
begins. Same for the cascade: all the cards taken in wave one attack
together.

**Order within a wave cannot change the result.** Checked over 40,000
positions, resolving one capture at a time in randomised order against
resolving them together: **zero disagreements.** Pick up the cards in
whatever order you like.

### There are no competing branches

This is the question that looks hard and isn't:

> **Every capture in a chain belongs to the player who placed the card.**

Two of your freshly-taken cards both beating the same enemy card is not a
contest — it ends up yours either way, and the second comparison is simply
skipped. There is never a moment where two cascades race, because your
opponent captures nothing on your turn.

Three consequences, all verified over 40,000 chains:

- **The opponent never gains a card during your turn.** Not once.
- **No card is captured twice in one chain.** Once it is yours, it is no
  longer an enemy card, so nothing can take it again until your
  opponent's turn.
- **No card's orientation changes during a chain.** Every rotation an
  ability causes happens in the modifier step, before any comparison. A
  captured card turns over; it does not turn around.

That last one is why the whole thing is order-independent: the only thing
a chain ever changes is *who owns what*, and ownership only ever moves one
way.

### You do not need to pick a traversal order

A fair question: if a chain spreads to two cards, does each one finish its
own chain before the other starts, or do they go together? **It makes no
difference**, and that is a structural fact rather than luck.

Colour the nine cells like a chessboard. Every adjacency joins a light
cell to a dark one, so the board is *bipartite*: every route from your
placed card to a given cell has the same odd-or-even length. With the
cascade capped at two waves, a cell is either one step away or two, never
both — so there is no way to arrive "late" at a cell and lose its attack.

Measured across 30,000 positions and 28 different traversal orders:
**zero disagreements** at the shipped cap.

> **Caveat worth knowing if you ever house-rule the cascade deeper.** At
> **three** waves this stops being true: a cell one step away can also be
> reached in three, and a depth-first reading loses its attack while a
> wave-based reading keeps it. Outcomes then diverge in about 0.5% of
> positions, and the reading would have to be written down. At two waves
> it cannot happen.

### Where abilities sit

```
1. modifiers       Gust, Tremor, Eclipse, Cyclone, Upheaval,
                   Glaciate, Umbra -- edges change BEFORE
                   anything is compared
2. the card lands  Tide now trades places with your ally
3. the chain       Conduit and Arc redirect where it starts;
                   waves resolve as above
4. reach           Scorch, Beacon, Backlash -- one attack each,
                   AFTER the chain, and they start no chain
```

Steps 1 and 4 are the ones that matter. Step 1 is why modifiers are worth
a card: you rearrange the board and *then* compare. Step 4 is the rule
that keeps reach from becoming a second placement.

---

## The three rules people get wrong

1. **Only the two facing edges matter.** A card with Fire on top is
   irrelevant to the card on its left.
2. **You choose which way round to turn it** — any of four rotations, on
   every turn including the last.
3. **The last card captures, but starts no chain.**

Everything else follows from those.

---

## How it plays

From 14,000+ simulated games at the settings above:

- **18.7 captures per game** across nine cells — the average card changes
  hands roughly twice.
- **69–91% of games are decided by a single card.**
- **First player wins 50.6%** when both seats play the same competent bot
  — the five-placements-versus-six-cards asymmetry is priced almost
  exactly. But that balance *depends on competent play*: with rotation
  taken away, P1 drops to 33.7%, because card selection is then the only
  lever and Player 2 has more of it. Expect beginners to see Player 2
  favoured.
- **67% of placements set off a chain.**
- Better play wins **72%** of the time against merely greedy play.

### Where the skill actually is

Measured by ablation — take one faculty away from a competent bot and make
it play the intact version, seats swapped, 800 games each:

| Faculty removed | Cripple wins | Cost |
|---|---|---|
| choosing the rotation | 12.0% | **38.0** |
| choosing the cell | 15.2% | **34.8** |
| avoiding exposure | 28.4% | **21.6** |
| choosing which card to play | 36.9% | 13.1 |
| anticipating the cascade | 40.4% | **9.6** |

The top three are all facets of **positional control**, and they dominate.
Hand management is worth a third of rotation. **Anticipating chains is the
cheapest faculty to lose** — a bot that ignores the cascade entirely when
choosing its move still wins 40% against one that models it fully. Chains
are the *payoff* for good placement, not a separate thing to plan.

### Two structural facts worth knowing

**You can almost always capture whatever you want.** Every element has
exactly three beaters out of eight, and a card has four distinct elements
that any of four rotations can aim. The chance a hand of five contains
nothing that can take a given exposed edge is about 2 in a million —
0 times in 200,000 trials. *Whether* you can capture is never the
question; only *where you place* is.

**So the running score is nearly uninformative.** Captures accrue to
whoever just placed, and the lead changes hands **7.47 times per game out
of 8 possible chances**. It never once failed to change. The eventual
winner was behind going into the final placement **53.4%** of the time,
and the first three placements end +1, −2, +3 in *every* game regardless
of the deal. There is no inevitability problem here — if anything the
opposite, and the scoreboard is the wrong thing for a player to read.
- Abilities are **not** yet balanced, and the eight in the physical test
  deck are the ones measured. Holder win rate with seats swapped, against
  a 50% neutral, hands dealt once:

  | Ability | Holder win | Used | Depth |
  |---|---|---|---|
  | Gust | **59%** | 60% | 69% |
  | Beacon | **57%** | 88% | 71% |
  | Tide | 56% | 14% | 62% |
  | Tremor | 55% | 45% | 71% |
  | Arc | 53% | 23% | 71% |
  | Eclipse | 52% | 63% | **75%** |
  | Conduit | 52% | 10% | 69% |
  | Scorch | **46%** | 73% | **57%** |
  | *(no ability)* | 50% | — | 70% |

  Two things stand out. **Gust and Beacon are too strong** — a modifier
  that re-aims an enemy card, and a free choice of attacking edge, are
  both worth more than a card. And **Scorch is a trap**: the bot uses it
  in 73% of games and *loses* with it, because the lure of a diagonal
  capture pulls placements onto worse cells. It also drags depth from 70%
  to 57%, making the game shallower. Eclipse is the only one that makes
  the game deeper.

  These figures replace an earlier set (quoted as 49.8%–53.6%) that was
  measured through a superseded hand model in which players drew a card
  every turn; through that path the no-ability baseline was already 71%,
  so those numbers were never win rates against a neutral. The five
  abilities not in the test deck have **not** been re-measured.

`v3.py` is the reference implementation — run it to reproduce all of these.
`web/` is the playable version.
