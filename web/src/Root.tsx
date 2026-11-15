import { useEffect, useState } from 'react';

import { App } from './proto/ui/App';
import { V2App } from './v2/App2';

export type Ruleset = 'v1' | 'v2';

/**
 * Which game the site serves.
 *
 * Both rulesets ship because the open question is whether splitting
 * deployment from command makes the game more satisfying, and that can
 * only be answered by playing them against each other. Prototype A and
 * prototype C from the test plan, switchable, rather than a claim.
 *
 * The choice persists, so a playtest session is not reset by a reload,
 * and it is in the URL hash so a particular version can be linked.
 */
/**
 * v2 is the default on this branch.
 *
 * It was v1, which meant a fresh visit to the v2 branch served v1 and
 * the mount effect then pinned '#v1' into the URL so it stayed that way.
 * Two playtest sessions were spent on v1 believing they were v2. The
 * branch under test is the one that should load.
 */
const DEFAULT: Ruleset = 'v2';

const read = (): Ruleset => {
  if (typeof window === 'undefined') return DEFAULT;
  if (window.location.hash === '#v2') return 'v2';
  if (window.location.hash === '#v1') return 'v1';
  try {
    const saved = localStorage.getItem('cascade.ruleset');
    return saved === 'v1' || saved === 'v2' ? saved : DEFAULT;
  } catch { return DEFAULT; }
};

export function Root() {
  const [rules, setRules] = useState<Ruleset>(read);

  useEffect(() => {
    try { localStorage.setItem('cascade.ruleset', rules); } catch { /* ok */ }
    if (typeof window !== 'undefined') {
      window.location.hash = rules;
    }
  }, [rules]);

  return (
    <>
      <div className="rulesetbar">
        <span>ruleset</span>
        <button className={rules === 'v1' ? 'on' : ''}
                onClick={() => setRules('v1')}>
          v1 — one phase
        </button>
        <button className={rules === 'v2' ? 'on' : ''}
                onClick={() => setRules('v2')}>
          v2 — deploy &amp; command
        </button>
        <span className="muted small2">
          {rules === 'v1'
            ? 'place, capture, cascade, repeat — 20 abilities'
            : 'fill the board, then command it — 4 abilities'}
        </span>
      </div>
      {rules === 'v1' ? <App /> : <V2App />}
    </>
  );
}
