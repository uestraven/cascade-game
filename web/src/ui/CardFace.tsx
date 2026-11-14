import { ELEMENT_NAMES, type Card, element, faces } from '../engine';

/** Icon slugs match web/public/art/elements/element_<slug>.svg */
export const ELEMENT_SLUGS = [
  'fire', 'water', 'earth', 'air', 'lightning', 'ice', 'shadow', 'light',
];

export const elementIcon = (el: number): string =>
  `/art/elements/element_${ELEMENT_SLUGS[el - 1]}.svg`;

export interface CardFaceProps {
  card: Card;
  owner: number;        // 0, 1, or -1 for none
  frozen?: boolean;
  flash?: boolean;      // just captured this wave
  dim?: boolean;
  small?: boolean;      // hand scale: smaller glyph
}

export function CardFace({
  card, owner, frozen, flash, dim, small,
}: CardFaceProps) {
  const [n, e, s, w] = faces(card);
  const el = element(card);
  const cls = [
    'card',
    owner === 0 ? 'p1' : owner === 1 ? 'p2' : 'neutral',
    flash ? 'flash' : '',
    frozen ? 'frozen' : '',
    dim ? 'dim' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <span className="f n">{n}</span>
      <span className="f e">{e}</span>
      <span className="f s">{s}</span>
      <span className="f w">{w}</span>
      {el > 0 && (
        // Tinted with a CSS mask rather than a filter, so the per-element
        // colours stay exact and the asset itself can remain white-only.
        <span
          className={`elem${small ? ' tiny-el' : ''}`}
          data-el={el}
          title={ELEMENT_NAMES[el - 1]}
          style={{ ['--icon' as string]: `url(${elementIcon(el)})` }}
        />
      )}
      {frozen && <span className="frostmark" title="frozen" />}
    </div>
  );
}
