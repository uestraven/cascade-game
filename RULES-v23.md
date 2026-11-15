# Cascade v2.3 — The Convergence Abilities

Experimental build for human playtesting. Not a balanced ruleset.

Launch: `cd web && npm install && npm run dev`, then open the printed
address. v2.3 is the default; the top bar also offers v1, v2.1 and v2.2
as controls, and `#v23` links it directly.

---

## Glossary

| Term | Meaning |
|---|---|
| **Deploy** | Introduce a card from hand into an empty cell. |
| **Move** | Relocate a card. Its owner does not change. |
| **Swap** | Exchange two cards' positions. Owners do not change. |
| **Capture** | Transfer ownership. Position does not change. |
| **Attack** | A sigil comparison, or an explicitly authorised special attack. |
| **Trigger** | A pending effect created because an event happened. |
| **Resolve** | Apply an effect, after rechecking that it is still legal. |
| **Batch** | A set of captures applied together as one atomic event. |

Movement, capture, attack and deployment are separate events. None ever
silently implies another.

---

## Structure

**Board** 4 columns × 3 rows, twelve cells.
**Deal** six characters each, from a twelve-character roster.
**Phase I — The Convergence** twelve deployments, alternating, P1 first.
The board finishes full.
**Phase II — The Dominion** six commands, alternating, **P2 first**, so
P1 closes. No new cards.
**Victory** most characters controlled. Draws are permitted.

**Sigils are fixed.** A character deploys in one orientation and never
rotates. This removes a choice that earlier versions had — v1 measured
rotation at 78–82% ablation, second only to cell choice — and is the
single largest rule change in this build.

---

## The Convergence turn

```
  ┌─ 1  DEPLOY ───────────────────────────────────────────────┐
  │    card leaves the hand, enters an empty cell             │
  │    no captures yet                                        │
  └────────────────────────┬──────────────────────────────────┘
                           ▼
  ┌─ 2  ON DEPLOY ────────────────────────────────────────────┐
  │    the deployed card's trait resolves, targets chosen     │
  │    optional: may be skipped                               │
  │    if it causes captures, their reactions resolve here    │
  │    ─ nothing proceeds to step 3 until the stack is empty  │
  └────────────────────────┬──────────────────────────────────┘
                           ▼
  ┌─ 3  NORMAL ATTACK ────────────────────────────────────────┐
  │    the deployed card compares sigils with its orthogonal  │
  │    neighbours, FROM ITS CURRENT CELL, against ONE board   │
  │    snapshot. Sanctuary and Champions are checked here.    │
  └────────────────────────┬──────────────────────────────────┘
                           ▼
  ┌─ 4  CAPTURES ─────────────────────────────────────────────┐
  │    the whole batch applies at once. A capture inside the  │
  │    batch cannot affect another comparison or another      │
  │    protection check in the same batch.                    │
  └────────────────────────┬──────────────────────────────────┘
                           ▼
  ┌─ 5  REACTIONS ────────────────────────────────────────────┐
  │    On Capture triggers enter the stack and resolve LIFO   │
  └────────────────────────┬──────────────────────────────────┘
                           ▼
  ┌─ 6  END TURN ─────────────────────────────────────────────┐
  │    stack empty, no decisions outstanding                  │
  │    after the twelfth, Convergence ends and traits expire  │
  └───────────────────────────────────────────────────────────┘
```

A turn cannot be ended while anything is pending.

---

## Timing types

| Type | Behaviour |
|---|---|
| **Ongoing** | Continuously affects legality while its condition holds. Never enters the stack. |
| **On Deploy** | Fires when the card is placed, before its own normal attack. |
| **On Capture** | Fires after a completed capture batch. Uses the stack. |
| **On Command** | The Dominion action. Unchanged from v2.2. |

---

## The stack

Last in, first out. Entries are *pending effects*, not animation steps.

Each carries an effect id, the source character's **stable identity**
(not its cell, because cards move while effects are pending), the
ability, the triggering event, the controller at trigger time, the
timing type, chosen targets, whether it is optional, and its status.

**Atomic events.** A capture batch is one completed event. Pact's two
ownership changes are also one. The stack is processed between events
and never interrupts one halfway.

**Trigger order.** All triggers from one completed event are collected.
The active player's are pushed first and the opponent's second, so **the
non-active player's reactions resolve first**. Where one player holds
several, they are asked which resolves first, and the choice is logged.

**Target legality** is rechecked immediately before resolution. An
effect whose target has moved, changed hands or become protected fails
whole — never half — is marked failed with a visible reason, and the
rest of the stack continues.

**Ongoing effects** (Sanctuary, Anchor) are not stack entries. They are
evaluated against the current board whenever an action or capture is
checked.

---

## The six Convergence traits

Each appears on exactly two of the twelve characters.

### Sanctuary — *ongoing* — approved

> This character cannot be captured while it is orthogonally adjacent to
> at least two characters controlled by its own controller.

Blocks every kind of capture, including Pact. Does not prevent movement.
Evaluated against the board **before** a capture batch, so a batch
cannot remove its own obstacle. Expires in Dominion.
*On a table:* count the adjacent cards sharing its owner. No marker.

### Anchor — *ongoing* — approved

> This character cannot be moved or swapped by abilities.

Does not prevent capture. Does not stop it attacking. Does not stop
others moving around it. Does not block Pact, which changes ownership
without moving anything. Both participants in a swap must be movable.
Expires in Dominion.
*On a table:* printed on the card. No marker.

### Harbinger — *on deploy* — approved

> When deployed, you may swap the positions of two already deployed
> characters orthogonally adjacent to this one. Either may belong to
> either player.

Harbinger is never one of the swapped cards. Both targets must be
movable. The swap captures nothing. Harbinger's normal attack happens
afterwards, so breaking a formation can expose what it was protecting.
*On a table:* visible target selection at deployment.

### Rally — *on capture* — approved

> Once per opposing deployment, when an adjacent ally is captured, you
> may swap this character with that captured character after the capture
> resolves.

Only during Convergence. The capture must actually complete — a blocked
attempt does not trigger it. Adjacency is judged as it stood immediately
before the capture. Rally keeps its controller; the captured card keeps
its new one; the capture is not undone. Rally does not attack. If
several adjacent allies fell at once, the player chooses one. It cannot
trigger from its own controller's Pact, because it answers *opposing*
deployments only.
*On a table:* one temporary reaction marker, cleared at end of turn.

### Exile — *on deploy* — **experimental**

> When deployed, you may move one adjacent enemy character into any
> unoccupied cell. Its controller does not change.

Not a capture, and the movement is not an attack. The target must not be
Anchored. Skipped when no target-and-destination pair exists — including
the last deployment, when the board has no empty cell.
*On a table:* visible target and destination selection.

### Pact — *on deploy* — **experimental**

> When deployed, you may choose one adjacent friendly and one adjacent
> enemy character and exchange their ownership. Neither card moves.

Both ownership changes are atomic and both count as captures for
anything that reacts to captures. The newly deployed card cannot be the
friendly target. Anchor does not block it. **Sanctuary does** — and if
either side is illegal the whole exchange fails rather than transferring
one card. Resulting reactions resolve before Pact's own normal attack.
*On a table:* swap the two ownership markers. Nothing moves.

---

## The Dominion, unchanged

Six commands, three each, P2 first. No exhaustion: a character may be
commanded repeatedly while controlled. Commands are Strike, Usurp,
Usurp-Single, Transpose and Reclaim, as in v2.2, with the
multiple-direct-capture follow-up preserved. A player with nothing to
command passes automatically. All Convergence traits are expired.

---

## Bound Champions — separate optional variant

Off by default, selectable as 2 or 3 per player. Designated Champions
cannot be captured during Convergence and lose that protection when
Dominion begins.

It is deliberately **not** combined with the six-ability experiment:
universal immunity would hide what Sanctuary and Pact actually do. In
this prototype Champions are designated deterministically from the deal;
a full version would let players choose before deployment.

---

## Known ambiguities and experimental assumptions

1. **No rotation.** Removed by instruction. It was live in v2.2 and
   measured as the game's second most valuable decision, so Convergence
   is materially thinner than it was. The most important thing to judge
   in playtest.
2. **Sanctuary is evaluated pre-batch.** A simultaneous batch cannot
   remove its own obstacle. The alternative reading — sequential
   evaluation — would make capture order matter, which contradicts
   simultaneity.
3. **Sanctuary blocks Pact.** Stated as an experimental rule, not a
   permanent decision.
4. **Rally answers opposing deployments only**, so a player cannot
   trigger it off their own Pact. This is a prototype restriction.
5. **Trigger ordering within one player's reactions** is a player
   choice; the remainder after their first pick keeps stack order. Logged
   either way.
6. **Champion designation is automatic** in this build rather than
   chosen.
7. **Harbinger may swap the enemy's own protected card out of its
   formation**, which is how a Sanctuary stronghold is dismantled. This
   is intended, and is the clearest interaction the stack produces.
8. **A failed effect is reported, not retried.** It does not undo the
   event that triggered it.

---

## Verification

200 automated tests, of which 42 cover v2.3 rules specifically:
per-ability batteries for all six traits, twelve stack scenarios,
determinism, preview-matches-live-rules, and full-match playouts from
twenty-five seeds. Scenarios are hand-built from explicit boards so the
expected sequence is reviewed rather than inferred.

`npm test` runs everything; `npx vitest run test/v23.rules.test.ts` runs
the v2.3 rules alone.

---

## What to judge in playtest

Automated tests say the rules work. They say nothing about whether this
is any good. The open questions:

1. Does Convergence now feel deliberate, or just slower?
2. **Is losing rotation a real loss?** It was the second-biggest
   decision in the game.
3. Is moving an enemy character satisfying, or merely annoying?
4. Do the six traits feel genuinely different from one another?
5. Is it clear *when* an ability fires?
6. Are the LIFO interactions readable, or confusing?
7. Does a player who loses Convergence badly still have meaningful
   Dominion choices?
8. Do Sanctuary, Anchor or Bound Champions make the game too defensive?
9. Do Exile or Pact create moments worth keeping?
10. Do you want to play again?
