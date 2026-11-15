import {
  type CardId, type V23State, CMD_INFO, TRAIT_INFO, alliesAdjacent,
  captureBlocked, moveBlocked,
} from './rules';

/**
 * Everything a card says about itself, on the card.
 *
 * Split out of the board so it can be rendered against a real populated
 * state in a test — the app builds its own empty game on mount, so
 * asserting on its initial markup proves nothing about a card face.
 *
 * Identity is persistent: the name, both ability names, both one-line
 * effects. State is separate: protection and immovability are chips,
 * ownership is the crest and the cell outline. A highlight never
 * replaces a label.
 */
export function CardInfo({ g, id }: { g: V23State; id: CardId }) {
  const def = g.defs[id];
  const blocked = captureBlocked(g, id);
  const immovable = moveBlocked(g, id);
  const owner = g.owner[id];

  return (
    <>
      <div className={`cardinfo ${g.phase}`}>
        <span className="ci-name">{def.name}</span>
        <span className={`ci-slot ci-i${blocked ? ' active' : ''}`}>
          <b>I · {def.trait
            ? TRAIT_INFO[def.trait].name.toUpperCase() : 'NONE'}</b>
          {def.trait && <em>{TRAIT_INFO[def.trait].short}</em>}
        </span>
        <span className="ci-slot ci-ii">
          <b>II · {CMD_INFO[def.command].name.toUpperCase()}</b>
          <em>{CMD_INFO[def.command].short}</em>
        </span>
      </div>
      <span className="crest">P{owner + 1}</span>
      {blocked && (
        <span className="statechip warded" title={blocked}>
          ✦ protected
          {def.trait === 'sanctuary' && ` · ${alliesAdjacent(g, id)} allies`}
        </span>
      )}
      {immovable && !blocked && (
        <span className="statechip anchored" title={immovable}>
          ⚓ immovable
        </span>
      )}
    </>
  );
}
