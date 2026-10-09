import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { soundManager } from '@/shared/utils/sound-manager';
import { installBrowserLockdown } from '@/shared/utils/browser-lockdown';
import './index.css';

soundManager.loadFiles();
installBrowserLockdown();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* No navigation in a transition: the arena's HUD refresh (an ordinary update each frame
        on a slow machine) outranks one, so leaving the Training Grounds or a dive could wait forever. */}
    <BrowserRouter basename={import.meta.env.BASE_URL} unstable_useTransitions={false}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
