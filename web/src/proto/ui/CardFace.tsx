import { type Card } from '../engine';
import { type AbilityId } from '../game';
import { SIGIL_NAMES, Sigil } from './Sigil';

const ART_COUNT = 20;

/** Frame carries ownership; it is far more legible across a table than a
 *  background tint, so the tint was dropped rather than run alongside. */
const frameFor = (owner: number): string =>
  owner === 0 ? '/art/frame-p1.svg'
  : owner === 1 ? '/art/frame-p2.svg'
  : '/art/frame-neutral.svg';

/** Art is chosen by deck position. The fallback keeps a card looking the
 *  same every time it is drawn even when `art` was not set. */
function artFor(art: number | undefined, sigils: Card): string {
  const n = art && art >= 1 && art <= ART_COUNT
    ? art
    : ((sigils[0] * 64 + sigils[1] * 16 + sigils[2] * 4 + sigils[3])
       % ART_COUNT) + 1;
  return `/art/cards/card-${String(n).padStart(2, '0')}.svg`;
}

export interface Props {
  sigils: Card;
  owner: number;            // 0, 1, or -1
  ability?: AbilityId | null;
  flash?: boolean;
  dim?: boolean;
  small?: boolean;
  /** edges facing an empty cell, marked so the position is legible */
  open?: readonly number[];
  /** the edge Prism has made wild this turn */
  wildEdge?: number | null;
  /** mid-capture: the card turns edge-on and changes owner at 90 degrees */
  flipping?: boolean;
  /** just landed, so it drops in rather than appearing */
  landing?: boolean;
  /** which of the 20 artworks to wear */
  art?: number;
  /** face down -- undealt cards and the reserve */
  faceDown?: boolean;
}

/**
 * Four sigils, one per edge, and nothing else competing with them.
 *
 * The ability is named in the centre rather than drawn as a fifth icon:
 * the centre is where a sigil would be easiest to confuse with an edge,
 * and an ability is read once when you pick the card up, whereas the
 * edges are read every turn by both players.
 */
export function CardFace({ sigils, owner, ability, flash, dim, small,
                           open, wildEdge, flipping, landing, art,
                           faceDown }: Props) {
  const cls = ['pcard',
    owner === 0 ? 'p1' : owner === 1 ? 'p2' : 'neutral',
    flash ? 'flash' : '', dim ? 'dim' : '', small ? 'sm' : '',
    flipping ? 'flipping' : '', landing ? 'landing' : '',
    faceDown ? 'down' : '',
  ].filter(Boolean).join(' ');
  const pos = ['n', 'e', 's', 'w'] as const;

  if (faceDown) {
    return <div className={cls}
                style={{ backgroundImage: 'url(/art/back.svg)' }} />;
  }

  // two background layers in one element: art beneath, frame above. The
  // art is at 40% opacity in the asset itself, so the sigils drawn on top
  // of this stay the highest-contrast thing on the card.
  const layers = {
    backgroundImage: `url(${frameFor(owner)}), url(${artFor(art, sigils)})`,
  };
  return (
    <div className={cls} style={layers}>
      {pos.map((p, i) => {
        const isOpen = open?.includes(i);
        const isWild = wildEdge === i;
        const name = SIGIL_NAMES[sigils[i]];
        return (
          <span key={p}
                className={`pedge ${p}${isOpen ? ' open' : ''}`
                           + `${isWild ? ' wild' : ''}`}>
            <Sigil sigil={sigils[i]} size={small ? 17 : 24}
                   title={isWild ? `${name} — wild this turn`
                     : isOpen ? `${name} — exposed` : name} />
          </span>
        );
      })}
      {ability && !small && (
        <span className="pability">{ability}</span>
      )}
      {ability && small && <span className="pabilitydot" title={ability} />}
    </div>
  );
}
