# Cascade

*A game of sigils and position.*

Two players, one shared deck, a small grid. A card has four sigils, one
per edge, and an ability.

> **The whole capture rule:** matching facing sigils capture. Different
> sigils do nothing. Only the card you just placed attacks.

Every card you take then attacks its own neighbours once — the cascade
the game is named for. Chains reverse positions that looked settled, and
a placement that takes nothing can still be the right move.

There is no hierarchy to memorise. No element beats another. Two matching
sigils are the same seal recognising itself.

| | |
|---|---|
| **Sigils** | Halo ⬤, Ward ◆, Crux ✦, Gyre ✸ |
| **Abilities** | **20**, all live — 4 original (Pivot, Exchange, Relay, Prism) plus 16 in playtest |
| **Board** | 3×3 default, 3×4 and 4×4 selectable |
| **Deck** | one shared deck, dealt to both players |
| **Cascade** | two waves; the final placement starts no chain |

Rotating a card is the second most valuable decision in the game, worth
about 25 points of win rate — behind only choosing the cell. Cards are
placed in one of four rotations and never flipped.

Full rules: **[RULES.md](RULES.md)**.

---

## Play it

```sh
cd web
npm install
npm run dev          # http://127.0.0.1:5173
```

Hotseat (two players, one screen) and versus-computer are both on the
front page. The app is static files with no backend, no accounts, and no
network calls at runtime.

```sh
npm test             # 97 tests
npm run build        # -> dist/
```

---

## Why this repo is mostly Python

Cascade was designed by **simulation**, not intuition. Most of the files
here are the measurement apparatus, and most of the design decisions in
`RULES.md` cite a number produced by one of them.

The method that did the most work:

- **Ablation.** Cripple one faculty of the bot — rotation, cell choice,
  chain sight, defence — and play it against the intact bot with seats
  swapped. The deficit measures what that faculty is worth. This is where
  "rotation is worth 25 points" comes from.
- **The lure test.** Run an ability three ways: never usable, usable but
  forbidden from influencing placement, and fully free. A fair ability's
  win rate *rises* as you are allowed to play toward it. If it falls, the
  card reads as powerful and loses games. Two abilities in an earlier
  version failed this, including one previously ranked best in the set.
- **Forced use.** A one-ply bot scoring captures-minus-exposure will
  refuse any ability whose payoff arrives next turn, which looks
  identical to the ability being worthless. Forcing the use separates the
  two cases. This rescued one ability that had measured at 47.7% and was
  really worth 70.5%.

Findings that reversed earlier conclusions are recorded next to the
originals rather than replacing them. Several claims in this repo's
history are marked retracted, including a centre-square advantage that
turned out to be an artefact of two bots disagreeing in direction.

### Layout

| path | what it is |
|---|---|
| `proto.py` | reference implementation of the current design, and the oracle the web app is verified against |
| `proto16.py` | sixteen proposed abilities, deliberately outside the shipped engine |
| `measure16.py`, `live16.py`, `verify16.py` | power/lure/forced measurement, inertness detection, and 43 scenarios pinning each ability's stated mechanic |
| `gen_proto16_fixture.py` | emits the 19,820-outcome fixture the TypeScript port of the sixteen is replayed against |
| `identity.py`, `scorch_trap.py`, `timing.py`, … | ablation, lure tests, timing, board size, deck composition |
| `v3.py`, `v3_abilities.py` | the superseded elemental engine; kept because the app still replays its fixtures |
| `web/` | the playable app (Vite + React + TypeScript) |
| `web/test/fixtures/*.json` | recorded Python outcomes the TypeScript is replayed against |
| `*.txt` | raw measurement output — the record the decisions rest on |
| `attic/` | removed designs, kept rather than deleted |
| `RULES.md` | current rulebook |
| `RULES-elemental.md` | the previous, superseded rulebook |
| `ART.md` | artwork requirements and brief |

### Differential testing

The Python implementation is the oracle. It emits a fixture of recorded
outcomes — **6,000 positions and 16,566 asserted outcomes** for the
current design, covering every ability on every board size — and the
TypeScript replays them and must agree exactly. This caught one ability
implemented two different ways in the two languages, where both versions
passed their own tests.

The harness itself is mutation-tested: deliberately broken engines must
make the suite fail. A vision module once passed every test with its
direct and cascade captures swapped, which is how that practice started.

---

## State of the design

Settled: the capture rule, resolution order (traversal order provably
cannot matter at a two-wave cap on a bipartite grid), first-player
compensation, the parity trap on even boards, and that decision load
scales with hand size rather than board size.

Open:

- **All twenty abilities are playable, and their balance is not
  settled.** Six measured inside noise of doing nothing (Lance,
  Crossing, Amplify, Handoff, Reorient, Withdraw) and three measured
  above the strongest original ability (Corner 87%, Mend 86%, Converge
  82%). They are in so they can be played and audited, not because they
  are finished. See `measure16.py` and the table in `RULES.md`.
- Set the board to **4×4** to get a 20-card deck holding one of every
  ability; 3×3 uses a 12-card deck and so the first twelve only.
- The centre square's value needs a search-based bot or human play; the
  greedy bot cannot answer it.
- Cards have no stable identity in the app yet: `buildDeck` randomises
  sigils each game, so the digital deck is not the physical deck in
  `protodeck.json`.

---

## Credits and licence

Design and simulation by the repository owner. Card artwork is generated;
requirements in `ART.md`. No licence has been chosen yet, so default
copyright applies.
