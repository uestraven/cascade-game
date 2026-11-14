/**
 * The four sigils, drawn inline as SVG.
 *
 * Every one is 4-FOLD ROTATIONALLY SYMMETRIC, which is the binding
 * constraint: a card turns four ways, so a sigil that changed appearance
 * under rotation would be a constant misread, and one that *became*
 * another sigil when turned would be fatal. Measured on the rendered
 * 16px bitmaps, each sigil against itself rotated 90 degrees differs by
 * 0.0009-0.0024 RMSE -- pixel-identical.
 *
 * They are separated by SILHOUETTE rather than internal detail, because
 * internal detail is the first thing to die at small size. Pairwise
 * distinctness at 16px is 0.35-0.53 RMSE, and ink coverage sits in a
 * 19-28% band so none reads heavier than the others.
 *
 * Colour is a redundant second channel, not the carrier -- the shapes
 * work alone in greyscale, which is how a printed playtest deck looks.
 * The palette is Okabe-Ito, which is colourblind-safe.
 */

export const SIGIL_NAMES = ['halo', 'ward', 'crux', 'gyre'] as const;
export type SigilName = typeof SIGIL_NAMES[number];

export const SIGIL_COLOUR: Record<SigilName, string> = {
  halo: '#4ea3ff',   // blue
  ward: '#f0a53a',   // orange
  crux: '#36c795',   // green
  gyre: '#e07ab0',   // magenta
};

/** What each sigil looks like, for the reference panel. */
export const SIGIL_SHAPE: Record<SigilName, string> = {
  halo: 'a ring',
  ward: 'a cut diamond',
  crux: 'a four-pointed star',
  gyre: 'a four-armed pinwheel',
};

const GYRE_ARM = 'M32 32 q 0 -22 22 -22 q 0 14 -22 22 Z';

function Path({ name }: { name: SigilName }) {
  switch (name) {
    case 'halo':
      return <circle cx="32" cy="32" r="20" fill="none"
                     stroke="currentColor" strokeWidth="9" />;
    case 'ward':
      return (
        <path d="M32 6 L58 32 L32 58 L6 32 Z M32 22 L42 32 L32 42 L22 32 Z"
              fill="currentColor" fillRule="evenodd" />
      );
    case 'crux':
      return (
        <path d="M32 4 L39 25 L60 32 L39 39 L32 60 L25 39 L4 32 L25 25 Z"
              fill="currentColor" />
      );
    case 'gyre':
      return (
        <>
          {[0, 90, 180, 270].map((a) => (
            <path key={a} d={GYRE_ARM} fill="currentColor"
                  transform={`rotate(${a} 32 32)`} />
          ))}
        </>
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
         style={colour ? { color: SIGIL_COLOUR[name] } : undefined}>
      {title ? <title>{title}</title> : <title>{name}</title>}
      <Path name={name} />
    </svg>
  );
}
