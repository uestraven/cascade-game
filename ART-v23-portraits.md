# Cascade v2.3 — Character Portrait Specification

For the artwork commission. Twelve portraits, one per character.

Every number here is measured from the shipped CSS, not estimated. The
portrait occupies a **bounded band at the top of the battle card**, not
the whole card — the lower half is the name bar and two ability rows,
drawn by the app over an opaque background. Art never sits behind text.

---

## 1. Deliverable at a glance

| | |
|---|---|
| **Count** | 12 (one per character, see §8) |
| **Aspect ratio** | **16:9 — exactly** |
| **Delivery size** | **1600 × 900 px** |
| **Format** | **WebP**, lossy, quality ~82 |
| **File size** | **≤ 110 KB each**, ≤ 1.2 MB for the set |
| **Transparency** | none — deliver fully opaque |
| **Colour** | sRGB |
| **Filenames** | `card-01.webp` … `card-12.webp` (§8 maps them) |
| **Lettering** | none anywhere in the image |

Delivery path: **`web/public/art/portraits/`**

> Not `art/cards/`. That directory holds the square 1024×1024 set that
> v1 and v2.2 still serve with a stretch-to-fit background, where a 16:9
> image renders distorted. The first delivery used `art/cards/` and was
> relocated on install.

---

## 2. The portrait viewport, measured

The band is flexible: it takes whatever height the card has left after
the text rows. Measured across every supported viewport:

| screen | card | **portrait band** | aspect | mode |
|---|---|---|---|---|
| 2560×1440 | 402px | **398 × 247** | 1.61 | full |
| 1920×1200 | 310px | 306 × 169 | 1.81 | full |
| 1920×1080 | 282px | **278 × 153** | 1.82 | full |
| 1600×1000 | 230px | 226 × 123 | 1.84 | full |
| 1512×982 | 208px | 204 × 109 | 1.88 | full |
| 1440×900 | 216px | 212 × 115 | 1.85 | full |
| 1366×768 | 178px | 174 × 98 | 1.78 | compact |
| 1280×800 | 189px | 185 × 107 | 1.73 | compact |
| 1280×720 | 162px | 158 × 84 | 1.88 | compact |

**Band width: 158–398 CSS px. Band height: 84–247 CSS px. Aspect ratio
1.61–1.88.**

1600 × 900 is therefore **4× the largest band at 2× device pixel ratio**,
with headroom. Do not deliver larger; it is already generous and the set
is the page weight.

---

## 3. Cropping behaviour — this is the important part

```css
background-size: cover;
background-position: center top;
```

**`cover` scales the image until it fills the band, then crops the
overflow. The crop is anchored to the TOP and horizontally centred.**

Because you are delivering 16:9 (1.778) into a band of 1.61–1.88:

| band aspect | what gets cropped | worst case |
|---|---|---|
| **narrower than 16:9** (1.61, tall cards) | the **left and right edges** | **4.7% off each side** |
| **wider than 16:9** (1.88, short cards) | the **bottom** | **5.4% off the bottom** |

The top edge is **never** cropped. The vertical centre is never cropped.

### Safe area

> **Keep everything that matters inside the central 90% of the width and
> the top 93% of the height.**

On a 1600 × 900 delivery that is a safe rectangle of **1440 × 837,
inset 80px left, 80px right, 0px top, 63px bottom.**

Anything outside that rectangle may be invisible on some screens. Put
atmosphere there, not faces.

---

## 4. The four sigil sockets — keep these clear

Four circular sockets are drawn **on top of the portrait**, one at the
centre of each edge. They carry the game's only mechanically meaningful
symbols, so they are opaque and they are not moving.

- **Diameter: 11.5% of the card width** — measured at 19–46px depending
  on screen, which is **11.6–11.8% of the band width** and **18.7–22.1%
  of the band height**
- **Inset 2.5% from each band edge**
- Backed with a 74%-opaque near-black disc, so whatever is beneath them
  is substantially hidden

> **Treat four discs — each ~12% of the width — at top-centre,
> right-centre, bottom-centre and left-centre as occupied.** No face, no
> focal detail, no signature element under them.

On a 1600 × 900 delivery each socket is roughly **184px across**, centred
at (800, 36), (1564, 450), (800, 864) and (36, 450) — the left and right
ones are partly outside the safe area anyway.

A fifth element, a small `★ bound` badge, appears at the **top-right
corner** of the band in one game variant. Keep the top-right corner
quiet.

---

## 5. Composition

The band is **short and wide — roughly 2:1 in practice**, and small:
153px tall on a 1080p screen. That is the single most important fact
about this commission.

**It is a letterbox, not a portrait frame.** A full-length figure will
be 150px tall and unreadable.

- **Crop in close.** Head and shoulders, or head and chest. The face
  should occupy a substantial share of the band height.
- **Place the face off the vertical centre line**, left or right of
  middle, so it does not sit under the top or bottom sigil socket. Either
  side is fine; vary it across the twelve.
- **Eyes in the upper third.** The top is never cropped; the bottom may
  be.
- **Strong silhouette and value separation from the background.** At
  84px tall, internal detail disappears and only the shape survives.
- **One readable focal point.** Not a scene.
- Rotation is no longer a mechanic, so the image has a fixed "up" and
  normal directional light is fine.

### Still required from the earlier brief

- **No lettering of any kind.** The sigils are the only symbols on a card
  that mean anything.
- **Readable with all colour removed** — the deck is printed in black and
  white for physical testing, and some players are colourblind.
- **No external references** — no web fonts, no linked images, no CDN
  URLs. The page's CSP is `default-src 'none'`.

---

## 6. Value and palette targets

These exist because the first painterly set came back as twenty
variations on one image. They are measurable; please check before
delivering.

```sh
# from the delivery directory
for f in card-*.webp; do
  convert "$f" -colorspace Gray -format \
    "$f mean=%[fx:int(100*mean)] sd=%[fx:int(100*standard_deviation)] \
min=%[fx:int(100*minima)] max=%[fx:int(100*maxima)]\n" info:
done
```

| requirement | why |
|---|---|
| At least **four cards above mean 40**, and the twelve spanning ≥ 45 points | *Revised.* "Span ≥ 45" alone was gameable and got gamed: the first delivery put ten cards at 17–26 and two at 55 and 63, which satisfies a 46-point span with a median of 21. A span is not a spread. |
| **Contrast (std dev) ≥ 15** on every card | below that a card has no read at 84px |
| **Darkest pixel ≤ 8, brightest ≥ 92** on every card | a small true black and a specular highlight; this is what stops a bright card going pale all over |
| No more than **8 of 12** warmer than neutral | the last set was 20 of 20 warm |

Hit the brightness by **composition, not by exposure**. A global levels
adjustment to reach a target number is what produced contrast-8 cards
last time.

---

## 7. Identity colour

Each character already has an authored accent colour in the app. It is
drawn as a **2–3px underline along the bottom of the portrait** and as a
tint behind the name. **Do not paint the accent into the image** — but
the portrait should not clash with it.

| character | accent |
|---|---|
| The Veiled Equinox | `#8f7bff` violet |
| Stormgrave Empress | `#3fb6d8` cyan |
| The Hollow Shepherd | `#d8a23f` amber |
| The Gilded Bastion | `#c9b26a` old gold |
| The Drowned Cantor | `#4fd1b0` jade |
| The Pale Cartwright | `#b06ad8` orchid |
| The Rimewood Magistrate | `#6fa8ff` steel blue |
| The Sunken Oathkeeper | `#5fd96f` green |
| The Ashen Ferryman | `#d86a6a` rust |
| The Brass Herald | `#e0954a` orange |
| The Stonefast Warden | `#8ba3c7` slate |
| The Severed Cartographer | `#d85fa8` magenta |

---

## 8. The twelve characters

Filenames are the current `art` index. Keep them, or tell me and I will
remap.

| file | character | epithet | Convergence | Dominion |
|---|---|---|---|---|
| `card-01` | **The Veiled Equinox** | Keeper of Two Truths | Sanctuary | Transpose |
| `card-08` | **Stormgrave Empress** | Sovereign of the Drowned Throne | Pact | Usurp, Single |
| `card-15` | **The Hollow Shepherd** | Warden of the Returning | Rally | Reclaim |
| `card-05` | **The Gilded Bastion** | Who Does Not Step Aside | Anchor | Strike |
| `card-19` | **The Drowned Cantor** | Singer of the Second Tide | Rally | Strike |
| `card-17` | **The Pale Cartwright** | Who Turns the Wheel of Others | Harbinger | Transpose |
| `card-11` | **The Rimewood Magistrate** | Arbiter of Borders | Exile | Strike |
| `card-03` | **The Sunken Oathkeeper** | Holder of the Unbroken Line | Sanctuary | Strike |
| `card-20` | **The Ashen Ferryman** | Who Names the Price After | Pact | Usurp |
| `card-06` | **The Brass Herald** | First of the Turning Court | Harbinger | Strike |
| `card-13` | **The Stonefast Warden** | Rooted Against the Hour | Anchor | Usurp, Single |
| `card-10` | **The Severed Cartographer** | Who Redraws the Living | Exile | Reclaim |

Three have approved artwork already (Equinox, Stormgrave, Shepherd) —
they still need **re-cropping to 16:9 head-and-shoulders**, because the
existing pieces are square full scenes and will be unreadable in a
letterbox band.

Ability meanings, if they help the characterisation: **Sanctuary** holds
a position while supported; **Anchor** cannot be moved; **Harbinger**
rearranges others on arrival; **Rally** takes a fallen ally's place;
**Exile** displaces an enemy; **Pact** trades one character for another.

---

## 9. Checklist before delivering

- [ ] Exactly 16:9, 1600 × 900, WebP, ≤ 110 KB
- [ ] Nothing load-bearing outside the central 90% width / top 93% height
- [ ] Four ~12%-of-width discs at the edge centres are clear of focal
      detail; top-right corner quiet
- [ ] Head-and-shoulders crop; face off the vertical centre line; eyes in
      the upper third
- [ ] Legible at **158 × 84 px** — shrink it and check
- [ ] Still reads with colour removed
- [ ] No lettering anywhere
- [ ] The set's mean values span ≥ 45 points; every card contrast ≥ 15,
      min ≤ 8, max ≥ 92
- [ ] ≤ 8 of 12 warmer than neutral
- [ ] No external references

---

## 10. Open question for the commissioner

The band's aspect ratio varies from 1.61 to 1.88 because it absorbs
whatever height the text rows leave. That is why a fixed 16:9 delivery
gets cropped by up to ~5% on one axis.

If you would rather have **zero cropping**, I can pin the band to exactly
16:9 in CSS and let the text rows take the remainder. The cost is that on
a 1280×720 screen the text rows lose about 5px, which is where they are
already tightest. Say the word and I will change it before the art is
drawn — it is a one-line change now and a re-crop of twelve pieces later.
