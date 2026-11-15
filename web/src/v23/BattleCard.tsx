import { Sigil } from '../proto/ui/Sigil';
import {
  type CardId, type V23State, CMD_INFO, TRAIT_INFO, alliesAdjacent,
  captureBlocked, isChampion, moveBlocked,
} from './rules';

/**
 * The battle card: a layout built for live play rather than for display.
 *
 * Information priority, top to bottom, as specified:
 *
 *   1  identity      portrait, name, an accent colour unique to the
 *                    character, so twelve cards are told apart without
 *                    reading
 *   2  ownership     the frame colour, the accent-backed crest, and the
 *                    cell outline around it
 *   3  Convergence   trait name and one line, green, lit while live
 *   4  Dominion      command name and one line, gold
 *   5  sigils        at their four edges, because the EDGE is the rule,
 *                    but small: supporting information, not the focus
 *
 * The previous face inherited the collectible layout — a full-bleed
 * illustration with four 27% sigils over it and the text crammed
 * underneath. Here the illustration is a bounded band, the sigils are
 * roughly 17%, and the text has its own rows.
 */
export function BattleCard({ g, id, owner }: {
  g: V23State; id: CardId; owner: number;
}) {
  const def = g.defs[id];
  const blocked = captureBlocked(g, id);
  const immovable = moveBlocked(g, id);
  const bound = isChampion(g, id);
  const accent = def.accent ?? '#8b93a6';
  const live = blocked?.source === 'sanctuary';
  const art = `/art/cards/card-${String(def.art).padStart(2, '0')}.webp`;
  const side = ['n', 'e', 's', 'w'] as const;

  return (
    <div className={`bcard ${owner === 0 ? 'p1' : 'p2'} ${g.phase}`}
         style={{ ['--accent' as string]: accent }}>
      {/* 1 · identity — a bounded portrait, not a full-bleed background */}
      <div className="bc-portrait" style={{ backgroundImage: `url(${art})` }}>
        {/* 5 · sigils stay on their edges, which is where the rule lives,
            but at supporting size */}
        {side.map((p, i) => (
          <span key={p} className={`bc-sigil ${p}`}>
            <Sigil sigil={def.sigils[i]} size={13} />
          </span>
        ))}
        {bound && (
          <span className={`bc-bound${g.phase === 'convergence'
            ? '' : ' spent'}`}
                title={g.phase === 'convergence'
                  ? 'Bound Champion — cannot be captured during Convergence'
                  : 'Bound Champion — protection expired'}>★ bound</span>
        )}
      </div>

      {/* 1 + 2 · name, and who holds it */}
      <div className="bc-name">
        <span className="bc-who">P{owner + 1}</span>
        <span className="bc-title">{def.name.replace(/^The /, '')}</span>
      </div>

      {/* 3 · Convergence */}
      <div className={`bc-row i${live ? ' live' : ''}`
        + `${g.phase === 'convergence' ? '' : ' expired'}`}>
        <span className="bc-tag">I</span>
        <span className="bc-body">
          <b>{def.trait ? TRAIT_INFO[def.trait].name : 'No trait'}</b>
          {def.trait && <em>{TRAIT_INFO[def.trait].short}</em>}
        </span>
      </div>

      {/* 4 · Dominion */}
      <div className={`bc-row ii`
        + `${g.phase === 'dominion' ? ' emphasis' : ''}`}>
        <span className="bc-tag">II</span>
        <span className="bc-body">
          <b>{CMD_INFO[def.command].name}</b>
          <em>{CMD_INFO[def.command].short}</em>
        </span>
      </div>

      {/* state, which is never allowed to replace a label */}
      <div className="bc-state">
        {blocked && (
          <span className={`bc-chip ${blocked.source}`} title={blocked.text}>
            {blocked.source === 'champion'
              ? '★ cannot be captured'
              : `✦ protected · ${alliesAdjacent(g, id)}`}
          </span>
        )}
        {!blocked && def.trait === 'sanctuary'
          && g.phase === 'convergence' && (
          <span className="bc-chip inert">
            {alliesAdjacent(g, id)} of 2 allies
          </span>
        )}
        {immovable && (
          <span className="bc-chip anchored" title={immovable}>⚓</span>
        )}
      </div>
    </div>
  );
}
