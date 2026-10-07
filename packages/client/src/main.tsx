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
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
