import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Prototype A is the live game: four sigils, matching captures, four
// abilities. The eight-element version is still in src/v3 and still
// tested; it is just no longer what the site serves.
import { App } from './proto/ui/App';
import './proto/ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
