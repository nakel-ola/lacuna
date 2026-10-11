import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// The production build ships prerendered HTML (scripts/prerender.mjs); the dev server doesn't.
if (root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);
