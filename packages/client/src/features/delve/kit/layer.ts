const LAYER_ID = 'delve-ui-layer';

/** The portal root for dialogs and portalled tooltips: #delve-ui-layer (.delve-ui.delve-zoom), made on first call. */
export function uiLayer(): HTMLElement {
  const found = document.getElementById(LAYER_ID);
  if (found) return found;
  const layer = document.createElement('div');
  layer.id = LAYER_ID;
  layer.className = 'delve-ui delve-zoom';
  document.body.appendChild(layer);
  return layer;
}
