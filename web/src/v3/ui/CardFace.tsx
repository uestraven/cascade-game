import { NAMES, SLUGS, type Card } from '../engine';

export const icon = (el: number) => `/art/elements/element_${SLUGS[el]}.svg`;

export interface Props {
  edges: Card;
  owner: number;            // 0, 1, or -1
  flash?: boolean;
  dim?: boolean;
  small?: boolean;
  /** sides facing an empty cell, and so attackable next turn */
  open?: readonly number[];
}

/** Four edges and nothing else. The centre used to carry a sigil that paid
 *  for abilities; it was deleted because it made an ability usable only 21%
 *  of the time you held one and punished the deck shape it was meant to
 *  reward. Abilities are now gated on your second placement instead. */
export function CardFace({ edges, owner, flash, dim, small, open }: Props) {
  const cls = ['card3',
    owner === 0 ? 'p1' : owner === 1 ? 'p2' : 'neutral',
    flash ? 'flash' : '', dim ? 'dim' : '', small ? 'sm' : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      {(['n', 'e', 's', 'w'] as const).map((pos, i) => (
        <span key={pos}
              className={`edge ${pos}${open?.includes(i) ? ' open' : ''}`}
              data-el={edges[i]}
              title={open?.includes(i)
                ? `${NAMES[edges[i]]} — exposed, can be attacked here`
                : NAMES[edges[i]]}
              style={{ ['--icon' as string]: `url(${icon(edges[i])})` }} />
      ))}
    </div>
  );
}
