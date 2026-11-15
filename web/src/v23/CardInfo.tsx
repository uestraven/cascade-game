import {
  type CardId, type V23State, CMD_INFO, TRAIT_INFO, alliesAdjacent,
  captureBlocked, isChampion, moveBlocked,
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
  const champ = isChampion(g, id);

  return (
    <>
      <div className={`cardinfo ${g.phase}`}>
        <span className="ci-name">{def.name}</span>
        {/* the trait line lights only when THIS trait is the reason --
            a Bound Champion must not make Sanctuary look like it is
            working */}
        <span className={`ci-slot ci-i`
          + `${blocked?.source === 'sanctuary' ? ' active' : ''}`}>
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
      {/* Champion status is PERSISTENT, and shown whether or not its
          protection currently matters. Inferring it from a log line that
          scrolls away was not a reasonable thing to ask of a player. */}
      {champ && (
        <span className={`champbadge${g.phase === 'convergence'
          ? '' : ' spent'}`}
              title={g.phase === 'convergence'
                ? 'Bound Champion — cannot be captured during Convergence'
                : 'Bound Champion — protection expired'}>
          ★ champion
        </span>
      )}
      {blocked && (
        <span className={`statechip warded ${blocked.source}`}
              title={blocked.text}>
          {blocked.source === 'champion'
            ? '✦ champion'
            : `✦ sanctuary · ${alliesAdjacent(g, id)} allies`}
        </span>
      )}
      {/* an unprotected Sanctuary card says so, rather than saying
          nothing -- "1 of 2" is the information that matters */}
      {!blocked && def.trait === 'sanctuary'
        && g.phase === 'convergence' && (
        <span className="statechip inert">
          {alliesAdjacent(g, id)} of 2 allies
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
