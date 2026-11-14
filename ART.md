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

The practical consequence is narrower than an earlier draft of this file
claimed. That draft told you the painting must not let a player infer the
card's rules. **That was wrong and is withdrawn.** A card in a real deck
is permanently one artwork and one ability; players learn cards by their
pictures, and that is a feature. The engine in fact pins artwork to
ability (§5.3), so the correlation exists whether or not you lean on it.
Lean on it.

What must stay decorative is **orientation specifically**. Nothing a
player needs may depend on which way the painting faces, because that is
the one cue a physical card destroys when it is turned. So do not compose
so that a figure's gaze direction, an arrow, or a tilt carries meaning.

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

One per card in the 20-card deck. **The engine pins artwork to ability**
— `buildDeck` derives both from the same deck index, and 20 is a
multiple of 4, so art *N* always carries ability *(N−1) mod 4* in every
game ever played:

| Ability | Artworks |
|---|---|
| **Pivot** | 01, 05, 09, 13, 17 |
| **Exchange** | 02, 06, 10, 14, 18 |
| **Relay** | 03, 07, 11, 15, 19 |
| **Prism** | 04, 08, 12, 16, 20 |

Treat that as the organising structure, not a coincidence. Each ability
is a **family of five paintings** that share a visual thread, so a player
learns the ability from the picture:

| Ability | Visual thread | Palette family |
|---|---|---|
| **Pivot** | turning, orreries, clockwork, a key in a lock | brass and amber on deep brown |
| **Exchange** | twins, reflections, a bargain struck, doorways | cool teal and silver |
| **Relay** | a current passed on, chains, lightning, conduits | violet and electric blue |
| **Prism** | refraction, lenses, becoming-anything | pale bone and iridescence |

Keeping each family to its own palette is deliberate: it makes a crowded
board readable at 88px, and it leaks nothing, because a card's ability is
public the moment it is on the table and printed on its own face in hand.

### The allocation — please follow it slot by slot

The first delivery was twenty variations on one painting. This table
exists so that cannot happen again. Within each ability family the five
cards take five different subject classes and five different brightness
bands, so cards that share a palette never share a silhouette.

| art | ability | subject class | target brightness |
|---|---|---|---|
| `card-01` | Pivot | a single figure | very dark (18-28) |
| `card-02` | Exchange | a single figure | dark (30-40) |
| `card-03` | Relay | a single figure | mid (45-55) |
| `card-04` | Prism | a single figure | light (58-68) |
| `card-05` | Pivot | a creature or beast | dark (30-40) |
| `card-06` | Exchange | a creature or beast | mid (45-55) |
| `card-07` | Relay | a creature or beast | light (58-68) |
| `card-08` | Prism | a creature or beast | high-key (70-80) |
| `card-09` | Pivot | an architecture or a place, no figure | mid (45-55) |
| `card-10` | Exchange | an architecture or a place, no figure | light (58-68) |
| `card-11` | Relay | an architecture or a place, no figure | high-key (70-80) |
| `card-12` | Prism | an architecture or a place, no figure | very dark (18-28) |
| `card-13` | Pivot | a close object, almost still life | light (58-68) |
| `card-14` | Exchange | a close object, almost still life | high-key (70-80) |
| `card-15` | Relay | a close object, almost still life | very dark (18-28) |
| `card-16` | Prism | a close object, almost still life | dark (30-40) |
| `card-17` | Pivot | a phenomenon, no subject at all | high-key (70-80) |
| `card-18` | Exchange | a phenomenon, no subject at all | very dark (18-28) |
| `card-19` | Relay | a phenomenon, no subject at all | dark (30-40) |
| `card-20` | Prism | a phenomenon, no subject at all | mid (45-55) |

Only four of twenty are a single human figure. Four are creatures, four
are places with nobody in them, four are objects seen close, and four
have no subject — weather, refraction, a tide of light.

Named characters already in the project — **The Veiled Equinox**, the
**Stormgrave Empress** — belong in the "single figure" slots. The Veiled
Equinox as delivered on `card-01` is the strongest painting in the set
and only needs its brightness pulled down to band.

### Five motifs are now retired

These appeared on most of the first twenty and are spent. Do not use any
of them again on any card:

1. The gothic pointed-arch arcade or ruined viaduct in the mid-distance
2. The snow-capped mountain vista seen from above
3. The gold floral rosette on windblown fabric — it was the same ornament
   on at least four garments, which read as one faction rather than
   twenty cards
4. A low sun and a visible moon in the same sky
5. The composition itself: a figure in the left two-thirds, cloak
   streaming, striding or reaching to the right, valley below, luminous
   sky above

### Keep the top-left clear

Faces and focal points in the first set landed in the upper left, which
is exactly where the north and west sigils sit. Composition must respect
§5.1's four edge-centre discs *and* avoid putting the single most
important part of the painting under one of them. The safe region for a
focal point is the middle band and the lower centre.

### Check your own set before delivering

The first delivery's uniformity was measurable, and so is the fix. From
the `cards/` directory:

```sh
for f in card-*.webp; do
  printf '%s %s\n' "$f" \
    "$(convert "$f" -colorspace Gray -format '%[fx:int(100*mean)]' info:)"
done
```

```sh
# the fuller check: mean, contrast, and whether the painting still has
# true blacks and true whites in it somewhere
for f in card-*.webp; do
  convert "$f" -colorspace Gray -format \
    "$f mean=%[fx:int(100*mean)] sd=%[fx:int(100*standard_deviation)] \
min=%[fx:int(100*minima)] max=%[fx:int(100*maxima)]\n" info:
done
```

Pass conditions:

- Every card within ±6 of its assigned band in the table above
- The twenty values spanning at least 50 points end to end. The first
  set spanned 31 to 51, a 20-point range, which was the whole problem
- Not more than 13 of 20 warmer than neutral. In the first set all 20
  had red above blue and 19 of 20 had red above green

**And these three, which exist because the brightness bands alone turned
out to be a bad target.** The second delivery hit every band dead on the
midpoint — all twenty landed on exactly 23, 35, 50, 63 or 75 — which
means the mean was being adjusted globally to hit the number rather than
painted to. On the light cards that lifted the blacks until the image
went milky: `card-11` came in at contrast 8 with its darkest pixel at 23
out of 100, and reads at 88px as a lavender blur. That is this
document's fault, not the painter's, so the target is now specified
properly:

- **Contrast at least 15.** Below that a card has no read at 88px
- **Darkest pixel at or below 8, brightest at or above 92.** Every
  painting must contain a true black and a true white *somewhere*, even
  a high-key one — a small deep accent and a specular highlight are
  enough. This is what stops a bright card from going pale all over
- **Hit the band by composition, not by exposure.** A high-key card
  should be bright because most of its *subject* is pale, not because
  the whole canvas was lifted. Landing on 71 or 79 instead of exactly 75
  is a sign you did it the right way

### Third delivery: thirteen cards, not twenty

The second delivery got the hard part right. Subject classes, palette
families and the retired motifs are all correct, and the concepts are
good — the clockwork-horned ram on `card-05`, the paired hand mirrors
for Exchange on `card-14`, the current arcing between standing stones on
`card-11`. **Keep every composition.** This is a grading pass, not a
redesign.

Seven cards already pass everything and must not be touched:
`01`, `02`, `05`, `12`, `16`, `18`, `19`.

The other thirteen need their values reworked, same painting, same
subject, same palette:

| cards | what is wrong | what to do |
|---|---|---|
| `08` `09` `10` `11` `14` | flat *and* no blacks (contrast 8–12, darkest pixel 17–23) | restore deep accents: a shadow side, a dark aperture, a silhouetted element. These are the five worst |
| `04` `06` `07` `15` | flat (contrast 13–14) | deepen the shadows or strengthen the light; `15` is dark *and* flat, which is the muddiest state of all |
| `03` `13` `17` `20` | blacks lifted only (darkest pixel 13–25) | one small genuinely black accent somewhere is enough |

The five in the first row are the urgent ones. `card-11` is contrast 8
with its darkest pixel at 23: a lavender blur at playing size, however
good it looks at full resolution.

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
- [ ] Does it match its assigned subject class, palette family and
      brightness band in the §5.3 table? *(§5.3)*
- [ ] Is it clear of all five retired motifs? *(§5.3)*
- [ ] Is the focal point out of the upper-left and out of the four
      edge-centre discs? *(§5.3, §5.1)*
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
