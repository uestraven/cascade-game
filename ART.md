# Cascade — Artwork Requirements

For the art agent. Everything here is a requirement derived from how the
game is played, not a style preference. Style is yours; the constraints
are not.

Read §1 before drawing anything. It invalidates the most natural way to
draw a trading card, and if it is missed, every card has to be redrawn.

---

## 1. THE HARD CONSTRAINT: cards rotate

**A card is placed in one of four rotations, and rotating it is the
game's single most important decision** — worth about 25 points of win
rate by measurement, second only to choosing the cell.

So a card is seen at 0°, 90°, 180° and 270°, all four equally often.

> **Card art must have no "up".**

A portrait, a standing figure, a landscape, a horizon, text, a signature
— anything with a top — will appear sideways and upside down in half of
all games.

**What works:**

- Heraldic and emblematic composition — a device centred in the frame,
  read from any side
- Radial, mandala, rosette, seal, compass-rose, knotwork
- A creature or face viewed **head-on and vertically centred**, framed so
  it reads as an emblem rather than a portrait
- Abstract energy, orbits, concentric structure

**What does not work:**

- Three-quarter portraits, figures standing on ground
- Any horizon, floor, sky gradient, or cast shadow implying a light
  direction
- Lettering of any kind on the card face
- Asymmetric framing or a decorative corner flourish on one corner only

**Do not solve this by counter-rotating the art in code.** It was
considered and rejected: the physical deck rotates for real, and a
digital version that silently kept art upright would teach players a
different game from the one on the table.

A good test: print a mock card, turn it four times, and ask whether any
rotation looks like a mistake. If one does, the composition is wrong.

---

## 2. The four sigils — already done, do not redesign

The sigils exist, are verified, and are drawn as inline SVG in code. They
are the one asset you should **not** touch.

| | Sigil | Silhouette |
|---|---|---|
| ⬤ | **Halo** | a ring |
| ◆ | **Ward** | a cut diamond |
| ✦ | **Crux** | a four-pointed star |
| ✸ | **Gyre** | a four-armed pinwheel |

Source: `web/public/art/sigils/*.svg`, and `web/src/proto/ui/Sigil.tsx`.

Why they are fixed: each is four-fold rotationally symmetric, verified
pixel-identical against itself rotated 90° (0.0009–0.0024 RMSE). Pairwise
distinctness at 16px is 0.35–0.53 RMSE, and ink coverage sits in a 19–28%
band so none reads heavier than the others. Those properties took work to
get and are load-bearing — a sigil that changed appearance when the card
turned would be a constant misread.

**Your job is to make them sit well**, not to replace them. If you need a
decorative treatment, add a *backing* behind the sigil (a recess, a
socket, a glow) and leave the sigil shape itself alone.

---

## 3. The 16px legibility gate

Sigils render at **24px** on the board and **17px** in hand. Anything you
draw behind or around them competes at that size.

> **Every asset must survive being viewed at 16px.**

This gate has already failed once on this project: two earlier element
icons were unreadable at small size because they relied on internal
detail. **Differentiate by silhouette, not by interior.**

Practical consequences:

- No hairlines thinner than ~2px at the delivered resolution
- No detail that disappears below 25% scale
- No low-contrast texture behind a sigil
- Test every asset at 16px, 24px and full size before delivering

---

## 4. Greyscale first, colour second

The deck gets **printed in black and white** for physical playtesting, and
some players are colourblind.

> **Every asset must be fully readable with all colour removed.**

Colour is a redundant channel. Sigil colours (Okabe–Ito, colourblind-safe)
are already set in code:

| Sigil | Colour |
|---|---|
| Halo | `#4ea3ff` blue |
| Ward | `#f0a53a` orange |
| Crux | `#36c795` green |
| Gyre | `#e07ab0` magenta |

Use these if you reference a sigil's colour. Do not introduce a fifth
accent that could be mistaken for a sigil colour.

---

## 5. Asset list

Deliver as **SVG where possible**, otherwise **PNG at 3× with
transparency**. Square assets must be exactly square.

### 5.1 Card frame — highest priority

`frame.svg` (or `frame@3x.png`, 512×512)

The border and surface a card's art and sigils sit in.

- **Exactly square**, four-fold rotationally symmetric
- Must leave the four edge-centre zones clear for sigils: a **28px
  diameter circle at the centre of each edge**, inset 2px from the card
  boundary, scaled from a 88px card. No frame detail inside those four
  circles.
- Must leave a clear central area for the ability name (see §5.4)
- Two owner variants, since ownership is the score: `frame-p1.svg` (cool
  blue, `#4a9eff`) and `frame-p2.svg` (warm orange, `#ff7043`). A player
  must be able to count who owns what from across a table.
- A third `frame-neutral.svg` for unowned/hand display

### 5.2 Card backs

`back.svg`, 512×512 square, four-fold symmetric. Shown for undealt cards
and the reserve.

### 5.3 Card art — 20 pieces

`card-01.svg` … `card-20.svg`, 512×512, **rotation-tolerant per §1**.

One per card in the 20-card deck (`protodeck.json` has the roster). Each
card has a sigil layout and an ability; the art does not need to depict
them, but may echo the ability's *idea*:

| Ability | Idea |
|---|---|
| **Pivot** | turning, gears, a wheel, a key |
| **Exchange** | trading places, mirrored halves, a loop |
| **Relay** | a chain, a conduit, a current passed on |
| **Prism** | refraction, becoming-anything, a lens |

Existing named characters (The Veiled Equinox, Stormgrave Empress) are
welcome **if recomposed as emblems** per §1.

### 5.4 Ability marks — 4 pieces

`ability-pivot.svg`, `-exchange.svg`, `-relay.svg`, `-prism.svg`

Small marks for the card centre and the UI, ~64×64.

**These must be visually distinct from the four sigils**, because the
centre of a card is the easiest place to mistake a mark for an edge
sigil. Use a different visual language — line art versus the sigils'
solid fills, for instance. Unlike sigils, these do **not** need
rotational symmetry (an upright ability mark on a rotated card reads as
"this card is turned", which is useful), but they must stay legible at
every angle.

### 5.5 Board and chrome — lowest priority

- `board-bg.svg` — a surface for the grid. Must work at 3×3, 3×4 and 4×4;
  the board size is still an open decision, so do not bake in a 3×3
  aspect ratio.
- `cell-empty.svg` — an empty-cell marker, very quiet; it must not
  compete with cards
- Optional: a title treatment for "CASCADE"

---

## 6. Delivery

```
web/public/art/
  frame-p1.svg  frame-p2.svg  frame-neutral.svg
  back.svg
  cards/card-01.svg … card-20.svg
  abilities/ability-pivot.svg … ability-prism.svg
  board/board-bg.svg  cell-empty.svg
```

- No external references — no web fonts, no linked images, no CDN URLs.
  Everything self-contained, because the app is served as static files
  with no network calls at render time.
- Flatten text to paths. A font that is not on the player's machine
  silently reflows.
- Keep each SVG under ~40KB where you can; the whole app is currently
  236KB.

---

## 7. The checklist

Before delivering any card asset:

- [ ] Rotate it 90°, 180°, 270°. Does any rotation look wrong? *(§1)*
- [ ] Scale it to 16px. Is it still identifiable? *(§3)*
- [ ] Remove all colour. Does it still read? *(§4)*
- [ ] Are the four edge-centre sigil zones clear of frame detail? *(§5.1)*
- [ ] Is it exactly square, with no external references? *(§6)*

---

## 8. Context you may want

Cascade is a two-player card game on a small grid. Both players draw from
**one shared deck**. A card has four sigils, one per edge, and an
ability.

**The whole capture rule:** *matching facing sigils capture; different
sigils do nothing.* No hierarchy, no element beats another. A captured
card then attacks its own neighbours once — the cascade the game is named
for.

The visual language should carry **"arcane seals resonating"** rather than
elemental combat. Two matching sigils are the same seal recognising
itself, not fire beating ice. That is why the sigils are abstract devices
and not flames and snowflakes.

Tone: ornate, precise, a little occult. Gold-on-dark is established in the
UI. Think engraved plates, astrolabes and reliquaries rather than
painterly fantasy splash art — partly for mood, and partly because
engraved emblems are naturally rotation-tolerant, which is the one thing
this project cannot compromise on.
