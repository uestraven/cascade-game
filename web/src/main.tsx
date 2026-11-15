import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Two rulesets ship side by side. v1 is the single-phase game with
// twenty abilities; v2 splits deployment from command. The switch exists
// because which one is more satisfying is the open question, and no
// measurement answers it.
import { Root } from './Root';
import './proto/ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>,
);
