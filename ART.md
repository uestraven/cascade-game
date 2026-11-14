# Cascade — Artwork Requirements

For the art agent. Everything here is a requirement derived from how the
game is played, not a style preference. Style is yours; the constraints
are not.

Read §1 before drawing anything. **It reverses an instruction given in
earlier versions of this file**, and if you work from the old rule you
will produce the wrong thing very competently.

---

## 1. Card art stays upright. Paint it like a real card.

**This section reverses a decision. Read it even if you read the old
version.**

Cards are placed in one of four rotations, and rotating one is the game's
second most important decision — worth about 25 points of win rate by
measurement, behind only choosing the cell. Earlier versions of this
document therefore demanded art with no "up", and explicitly forbade
fixing it in code.

That has been overruled, deliberately, by the designer. **The card
artwork now renders upright at all four rotations.** Rotation is carried
entirely by the four edge sigils, which move; the painting behind them
does not.

> **Paint full, upright, directional, painterly fantasy art.**
> Figures. Faces. Depth. A light source. A horizon if you want one.

What this buys: art that stops a stranger mid-scroll. That is the brief.
These cards should look like something out of a collection someone would
want to own, not like clip-art seals.

### What is now allowed, that was not before

- **Portraits and figures** — three-quarter, head-on, seated, standing
- **A real light direction**, rim light, cast shadows, volumetrics
- **Ground, horizon, architecture, sky**
- **Deep space and atmosphere** — fog, dust, god rays
- Strong vertical composition

### What is still forbidden

- **Lettering of any kind on the card face.** Not a name, not a title,
  not a signature, not a rune that reads as a word in any real script.
  The sigils are the only symbols on a card that mean anything, and a
  painted glyph competing with them is a misread waiting to happen.
- **Anything in the four sigil zones.** See §5.1. Those four discs are
  structural. Focal detail must not sit under them.
- **Anything in the dead centre** that cannot survive a line of small
  uppercase text over it — the ability name is drawn there.

### The cost you are now carrying

Be aware of what was traded away, because it constrains you in one
specific way.

The **physical deck still rotates for real.** A printed card turned 90°
shows its painting on its side; there is no code on a tabletop. So the
digital and physical versions no longer look identical, which was
previously a hard requirement.

The practical consequence for you: **do not let the painting encode
anything a player needs.** A playtester must never learn "the dragon card
is the one with Pivot" from the picture's orientation, or rely on which
way a figure faces, because on the table that cue breaks. Orientation
must be decorative only.

A good test: cover the four edges of your painting and ask whether
anything load-bearing was in them. Then ask whether a player could tell
this card's *rules* from the art. If they could, make the art less
informative, not more.

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

### 5.3 Card art — 20 pieces  ← THE PRIORITY

`card-01.webp` … `card-20.webp`, **1024×1024**, upright per §1.

**Format: raster, not SVG.** This is the one asset group that changed
format. Painted realism is not expressible as vector, and a traced
approximation of a painting looks worse than either. Deliver WebP at
quality ~82; supply PNG only if WebP is impossible. The frames, sigils
and back stay vector.

- 1024×1024 so the art holds up if cards are ever shown larger than the
  current 88px; it is downscaled in the browser
- Keep each file under ~180KB. Twenty of them is the entire page weight:
  the app is 420KB today, so this group will be roughly 90% of the
  bundle. A 400KB card is not acceptable, however good it looks
- Full opacity. Do **not** deliver art pre-faded — earlier sets were
  supplied at 40% opacity to keep the sigils readable, and it made the
  art muddy. The renderer now sinks a dark socket behind each sigil and
  haloes the centre text, so legibility is handled. Paint at full
  strength
- No transparency needed; these sit behind an opaque frame

One per card in the 20-card deck (`protodeck.json` has the roster). Each
card has a sigil layout and an ability. The art does not need to depict
its ability and **must not be readable as its ability** (§1), but the
four abilities are a fine well to draw mood from:

| Ability | Mood to draw on |
|---|---|
| **Pivot** | turning, orreries, clockwork, a key in a lock |
| **Exchange** | twins, reflections, a bargain struck, doorways |
| **Relay** | a current passed hand to hand, chains, lightning |
| **Prism** | refraction, becoming-anything, a lens, a prism |

Named characters already in the project — **The Veiled Equinox**, the
**Stormgrave Empress** — should now be painted as actual characters
rather than recomposed as emblems. They were the two strongest ideas in
the previous set and the emblem constraint was wasting them.

**Twenty cards want twenty distinct silhouettes at a glance.** Vary the
subject class deliberately rather than painting twenty robed figures:
some cards a creature, some a single figure, some an architecture or a
place, some a close object, some a phenomenon with no subject at all.
Vary the palette and the value structure too — if four cards are all
dark blue with a central glow they will be confused with each other on a
crowded board.

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
  cards/card-01.webp … card-20.webp     <- raster, see §5.3
  abilities/ability-pivot.svg … ability-prism.svg
  board/board-bg.svg  cell-empty.svg
```

- No external references — no web fonts, no linked images, no CDN URLs.
  Everything self-contained, because the app is served as static files
  with no network calls at render time. The page's Content-Security-Policy
  is `default-src 'none'` with `connect-src 'none'`, so an asset that
  tries to fetch anything will simply fail to load.
- Flatten text to paths in the vector assets. A font that is not on the
  player's machine silently reflows.
- Vector assets: under ~40KB each.
- Card art: under ~180KB each (§5.3). The app is 420KB today, so twenty
  cards is the page weight. Please check the total before delivering.

---

## 7. The checklist

**For the 20 card artworks (§5.3):**

- [ ] Is it upright, painted at full opacity, and free of lettering? *(§1)*
- [ ] Could a player infer this card's *rules* from the picture? If yes,
      make it less informative *(§1)*
- [ ] Are the four edge-centre discs and the dead centre free of focal
      detail? *(§5.1, §1)*
- [ ] Does it read as a distinct card next to the other nineteen —
      different silhouette, different value structure? *(§5.3)*
- [ ] Is it 1024×1024, WebP, under ~180KB? *(§5.3, §6)*

**For the frames, back, sigil treatments and board (§5.1, 5.2, 5.5) —
these are still symmetric vector assets and the old rules hold:**

- [ ] Rotate it 90°, 180°, 270°. Does any rotation look wrong?
- [ ] Scale it to 16px. Is it still identifiable? *(§3)*
- [ ] Remove all colour. Does it still read? *(§4)*
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

The *rules* carry **"arcane seals resonating"** rather than elemental
combat. Two matching sigils are the same seal recognising itself, not
fire beating ice. That is why the sigils are abstract devices and not
flames and snowflakes, and it has not changed.

The *art* is now allowed to be far more than that. Earlier versions of
this file asked for engraved plates and astrolabes rather than painterly
fantasy, and gave two reasons: mood, and the fact that engraved emblems
are naturally rotation-tolerant. The second reason no longer applies —
art renders upright (§1) — and the first was never worth the cost.

Tone: ornate, occult, and genuinely beautiful. Gold-on-dark is
established in the UI chrome and the frames, so paintings should sit
comfortably against a dark gold-trimmed surround. Within that: oil
painting, deep chiaroscuro, the feel of a plate from an illuminated
grimoire that happens to have been painted by someone very good. Think
closer to a collectible card game's best illustrations than to a
woodcut.

The target: a person who has never heard of this game should look at one
card and want to know what it is.
