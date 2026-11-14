# Cascade — Rules

*Symbols decide what is possible. Abilities decide what you can do.
Positioning decides whether it works.*

Two players. One shared deck. Whoever owns more cards at the end wins.

---

## The whole comparison rule

> **Matching facing sigils capture. Different sigils do nothing.**

That's it. There is no hierarchy, no element beats another element, and
nothing to memorise. Two cards can interact only if the sigils they show
each other are the same.

**Only the card you place attacks.** Two cards already on the board
showing each other the same sigil never trade — a match is an opportunity
for whoever is acting, not an automatic event.

---

## The four sigils

| | Sigil | What it looks like |
|---|---|---|
| ⬤ | **Halo** | a ring |
| ◆ | **Ward** | a cut diamond |
| ✦ | **Crux** | a four-pointed star |
| ✸ | **Gyre** | a four-armed pinwheel |

No sigil is stronger than another. They exist to say *whether* two cards
can touch, not who wins.

**Each one is the same at every rotation.** That is deliberate, and it is
the hardest constraint in the art: a card turns four ways, so a sigil
that changed appearance when turned would be a constant misread, and one
that *became* another sigil when turned would be unplayable. All four are
four-fold rotationally symmetric, verified pixel-identical against
themselves rotated 90°, and separated by silhouette — round, angular,
pointed, curved — rather than by internal detail, which is the first
thing to disappear at small size.

Colour is a redundant second channel. The shapes work alone in
greyscale, which is how a printed deck looks.

---

## What a card looks like

Four sigils, one on each edge, and an ability. Sigils **may repeat**, and
that repetition is the whole of card selection:

| Shape | Sigils | What it's for |
|---|---|---|
| **Versatile** | four different | Can answer *any* single exposed edge — some rotation always matches |
| **Focused** | one repeated | Fewer answers, but can take **two** cards at once |
| **Specialized** | two pairs | Narrowest, and strongest against a wall of one sigil |

A versatile card can place any sigil on any edge — all sixteen
combinations. A specialized card manages eight of sixteen. **So a
versatile card never lacks an answer, and never catches two.** That trade
is why hand choice matters.

---

## Setup

1. Build **one 12-card deck, shared by both players.** Every card carries
   an ability.
2. Shuffle it. **Both players draw 5.**
3. **Two cards stay in the deck, unseen by anybody.**
4. Player 1 goes first.

No drawing during the game. You see your whole hand from the first turn.

**Player 2 needs one spare card, not two.** Player 1 moves first, moves
last, and places the ninth card — a structural head start. In the old
elemental game that cost two spare cards to price. Here it costs one,
because the matching rule already lets Player 2 answer anything Player 1
does. Measured: 5/5 gives Player 1 **47.2%**, while 5/6 over-corrects to
39.2% and 5/4 under-corrects to 61.0%.

---

## The board

Three boards measured balanced. **Pick on feel, not fairness** — this is
something the elemental version could not offer, because 3×4 and 4×4 were
unbalanceable there.

| Board | Deal | Placements | P1 wins | Captures | Close finishes |
|---|---|---|---|---|---|
| **3×3** | 5 / 5 | 9 | 45.4% | 18 | 70% |
| **3×4** | 6 / 7 | 11 *(one cell stays empty)* | 46.6% | 24 | 57% |
| **4×4** | 8 / 8 | 15 *(one cell stays empty)* | 45.1% | 36 | 51% |

**On an even board, one cell is deliberately left empty.** Twelve or
sixteen owned cells can split evenly, and a draw is possible — 21–26% of
games. Leaving one cell out forces an odd margin, so **a draw cannot
happen.** On 3×3 the nine cells are already odd and the board fills.

Bigger boards shift the game: **cell choice** grows from 28 to 43 points
of win rate while **rotation** stays near 30, so 3×3 is a game about
aiming and 4×4 is a game about placing.

---

## Your turn

**Place one card on any empty cell, turned any of four ways.** Then,
optionally, use its ability. Then captures resolve.

1. Place the card and choose its rotation.
2. Optionally activate its ability — **from your second placement
   onward.** Always optional, declared as you place.
3. **Direct attacks:** your card captures every adjacent enemy card
   showing it a matching sigil.
4. **The cascade:** each card you just captured attacks *its* neighbours
   once, by the same matching rule.
5. Stop. Everything taken in the chain is yours.

**The final placement captures but starts no chain.**

---

## The four abilities

Every card has one. Each changes exactly one thing you already
understand — none of them needs a table to explain.

| Ability | Changes | What it does |
|---|---|---|
| **Pivot** | orientation | Rotate one adjacent card 90° clockwise — **either player's** — before attacking. |
| **Exchange** | position | Swap this card with one adjacent card you control. **It attacks from its destination.** |
| **Relay** | attack origin | Instead of this card attacking, an adjacent card you control attacks from its own position. |
| **Prism** | matching | Choose one edge of this card. For this placement, **that edge matches any sigil.** |

**Abilities matter here.** Removing them costs about **20 points** of win
rate, against roughly 2 in the elemental version. They are a real second
pillar — but positioning still outranks them, which is the intent:

| Faculty | Worth |
|---|---|
| choosing the cell | **28** |
| choosing the rotation | **25** |
| using abilities | **23** |
| seeing the cascade | 14 |
| choosing the card | 13 |
| hiding your edges | **0** |

---

## Resolution order

**Captures in a wave happen together**, judged against the board as it
stood at the start of that wave. Pick the cards up in any order.

**Every capture belongs to the player who placed the card.** Your
opponent never gains a card on your turn, so there is no race and no
contest over who takes what.

That last point is worth stating because matching is **symmetric** where
the old elemental wheel was not — if my sigil matches yours, yours
matches mine. It would be reasonable to expect that to break the
resolution, and it doesn't: ownership still only ever moves one way, so
the chain still provably terminates. Verified over 40,000 chains.

---

## Winning

Count the cards you own. **Most wins.** The placement count is always
odd, so **a draw is impossible** and there is no tie-breaker.

---

## What this design gave up

Honesty about the trade, since it is a real one.

**Hiding your edges is no longer a skill.** In the elemental game,
avoiding exposure was worth 21.6 points of win rate — "what position am I
leaving behind" was a third of the game. Here it is worth **zero**,
because a versatile card answers any single exposed edge, so there is no
defensive shape to build. One sentence of rules bought in exchange for
one layer of play.

**What it bought:** a rule you can teach in a breath, abilities that
matter ten times more, three boards instead of one, and no matchup table
to consult mid-cascade.

---

## How it plays

From several thousand simulated games per configuration:

- **18 captures** on 3×3 — the average card changes hands about twice,
  the same as the elemental version.
- **70% of games end on a one-card margin** on 3×3; 51% on 4×4.
- **Biggest single turn: 5 cards.** The two-wave cascade caps this, and no
  ability or deck can exceed it.
- **First player 45–47%** on all three boards.

`proto.py` is the reference implementation. `web/src/proto` is the
playable version, verified against it by a 16,566-case differential
fixture. `RULES-elemental.md` is the previous eight-element design, kept
for reference.
