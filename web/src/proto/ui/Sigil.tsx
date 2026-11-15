/**
 * The four sigils, drawn inline as SVG.
 *
 * FOUR-FOLD SYMMETRY NO LONGER BINDS. It used to: a card was placed in
 * four orientations, so a sigil that changed appearance under rotation
 * would be a constant misread. Two things retired that constraint.
 * Rotation was removed from the game, and -- the stronger reason -- the
 * app never rotated a glyph in the first place: rotation was always
 * modelled by permuting WHICH VALUE sits on which edge, so these shapes
 * have only ever rendered upright. The symmetry requirement applied to
 * the physical deck alone.
 *
 * So the shapes are now authored for identity rather than symmetry:
 *
 *   halo -> OUROBOROS     a broken ring, head biting toward the tail
 *   ward -> CRYSTAL       a faceted gem, one girdle facet only
 *   crux -> CROSS POTENT  a cross whose four arms end in crossbars
 *   gyre -> FLEUR-DE-LIS  three lobes over a band
 *
 * The keys stay halo/ward/crux/gyre because they are stable identifiers
 * throughout the engine, the Python oracle, protodeck.json and every
 * fixture. Only the drawing and the presented name changed.
 *
 * They are separated by SILHOUETTE rather than internal detail, because
 * internal detail is the first thing to die at small size -- each was
 * drawn and checked at 15px, the glyph size inside the smallest socket.
 * Colour is a redundant second channel: the shapes work in greyscale,
 * which is how a printed playtest deck looks.
 *
 * A printed card turned 90 degrees now shows a sideways Fleur-de-lis.
 * That is accepted: a rotated sigil is still unmistakably itself, and
 * none of the four can be confused with another when turned, which was
 * the fatal case the old constraint existed to prevent.
 */

export const SIGIL_NAMES = ['halo', 'ward', 'crux', 'gyre'] as const;
export type SigilName = typeof SIGIL_NAMES[number];

/**
 * The arcane palette, one permanent colour per symbol.
 *
 * A sigil's colour means ONE thing: which symbol it is. It never
 * changes with ownership, with the controlling character, or with the
 * phase, and it is never dimmed when a Convergence trait expires —
 * sigil matching still decides captures in Dominion.
 *
 * Light and slightly desaturated on purpose: fully saturated colours
 * would stand out more but compete with the portraits behind them.
 *
 * The arcane names are the designer's; the shapes are the existing
 * approved artwork, mapped by silhouette.
 */
export const SIGIL_PALETTE = {
  halo: { color: '#7BD8B5', arcane: 'Ouroboros',
          tone: 'Eldritch Verdigris',
          shape: 'a broken ring, head biting toward the tail' },
  ward: { color: '#99CEFF', arcane: 'Crystal',
          tone: 'Astral Moonstone',
          shape: 'a faceted gem, one girdle facet' },
  crux: { color: '#F1D79E', arcane: 'Cross Potent',
          tone: 'Consecrated Electrum',
          shape: 'a cross with crossbar ends' },
  gyre: { color: '#C9AAFF', arcane: 'Fleur-de-lis',
          tone: 'Arcane Amethyst', shape: 'three lobes over a band' },
} as const;

export const sigilColor = (i: number): string =>
  SIGIL_PALETTE[SIGIL_NAMES[i] ?? 'halo'].color;

/** What each sigil looks like, for the reference panel. */
export const SIGIL_SHAPE: Record<SigilName, string> = {
  halo: 'an ouroboros — a broken ring, head toward the tail',
  ward: 'a crystal — a faceted gem',
  crux: 'a cross potent — crossbar ends',
  gyre: 'a fleur-de-lis — three lobes over a band',
};

/**
 * Drawn on a 64x64 grid. The dark colour inside Crystal and Ouroboros is
 * the medallion's own fill, so a facet or an eye reads as a cut rather
 * than as a hole over a bright portrait.
 */
const SOCKET = '#0D1424';

function Path({ name }: { name: SigilName }) {
  switch (name) {
    case 'halo':                               // OUROBOROS
      return (
        <>
          <path d="M22 15.5 A20 20 0 1 0 40 12.5" fill="none"
                stroke="currentColor" strokeWidth="10"
                strokeLinecap="round" />
          {/* the head: a wedge turned back on the tail */}
          <path d="M46 3 L58 13 L44 22 L40 12 Z" fill="currentColor" />
          <circle cx="48" cy="11" r="2.2" fill={SOCKET} />
        </>
      );
    case 'ward':                               // CRYSTAL
      return (
        <>
          <path d="M32 4 L54 22 L32 60 L10 22 Z" fill="currentColor" />
          {/* exactly one girdle facet; more detail dies at 15px */}
          <path d="M10 22 L54 22" fill="none" stroke={SOCKET}
                strokeWidth="4" />
        </>
      );
    case 'crux':                               // CROSS POTENT
      return (
        <g fill="currentColor">
          <rect x="26" y="9" width="12" height="46" />
          <rect x="9" y="26" width="46" height="12" />
          {/* the crossbar ends that make it potent rather than plain */}
          <rect x="18" y="5" width="28" height="8" />
          <rect x="18" y="51" width="28" height="8" />
          <rect x="5" y="18" width="8" height="28" />
          <rect x="51" y="18" width="8" height="28" />
        </g>
      );
    case 'gyre':                               // FLEUR-DE-LIS
      return (
        <g fill="currentColor">
          {/* central lobe: a tapering spearhead */}
          <path d="M32 2 C27 13 26 26 32 37 C38 26 37 13 32 2 Z" />
          {/* side lobes sweep outward then curl back up at the tip.
              An earlier version ran them up and outward and the glyph
              read as a leaf; the inner curls of a true heraldic lily
              are simplified away because they die below ~20px. */}
          <path d="M31 37 C20 36 10 31 7 22 C6 15 11 12 14 16
                   C13 22 20 31 31 37 Z" />
          <path d="M33 37 C44 36 54 31 57 22 C58 15 53 12 50 16
                   C51 22 44 31 33 37 Z" />
          <rect x="14" y="37" width="36" height="8" rx="2" />
          {/* flared foot below the band */}
          <path d="M32 45 C25 51 24 57 32 62 C40 57 39 51 32 45 Z" />
        </g>
      );
  }
}

export interface Props {
  sigil: number;
  size?: number;
  /** false renders in the inherited colour, for greyscale checks */
  colour?: boolean;
  title?: string;
}

export function Sigil({ sigil, size = 22, colour = true, title }: Props) {
  const name = SIGIL_NAMES[sigil] ?? 'halo';
  return (
    <svg viewBox="0 0 64 64" width={size} height={size}
         className={`sigil s-${name}`} aria-label={name}
         style={colour ? { color: SIGIL_PALETTE[name].color } : undefined}>
      {title ? <title>{title}</title> : <title>{name}</title>}
      <Path name={name} />
    </svg>
  );
}
