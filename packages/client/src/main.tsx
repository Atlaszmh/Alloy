import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { initGemArt } from '@/shared/utils/gem-art-mapping';
import { soundManager } from '@/shared/utils/sound-manager';
import './index.css';

initGemArt();
soundManager.loadFiles();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
