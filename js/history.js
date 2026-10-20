'use strict';

App.restoreToken = 0;

function makeThumb() {
  const src = composite(null);
  const tw = 112;
  const th = Math.max(1, Math.round((tw * src.height) / src.width));
  const t = makeCanvas(tw, th);
  t.getContext('2d').drawImage(src, 0, 0, tw, th);
  return t.toDataURL('image/png');
}

function takeSnapshot() {
  return {
    activeId: App.activeLayerId,
    layers: App.layers.map((l) => ({
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      data: l.canvas.toDataURL('image/png')
    })),
    thumb: makeThumb()
  };
}

function pushHistory() {
  if (App.historyIndex < App.history.length - 1) {
    App.history.splice(App.historyIndex + 1);
  }
  App.history.push(takeSnapshot());
  while (App.history.length > App.maxHistory) {
    App.history.shift();
  }
  App.historyIndex = App.history.length - 1;
  renderHistory();
  updateUndoRedo();
  scheduleSave();
}

function restoreSnapshot(i) {
  const snap = App.history[i];
  if (!snap) return;
  const token = ++App.restoreToken;
  const loaded = snap.layers.map(
    (ld) =>
      new Promise((res) => {
        if (!ld.data) return res({ ld: ld, img: null });
        const img = new Image();
        img.onload = () => res({ ld: ld, img: img });
        img.onerror = () => res({ ld: ld, img: null });
        img.src = ld.data;
      })
  );
  Promise.all(loaded).then((parts) => {
    if (token !== App.restoreToken) return;
    abortStroke();
    App.layers = parts.map((p) => {
      const l = createLayerObj(p.ld.name);
      l.visible = p.ld.visible;
      l.opacity = p.ld.opacity;
      if (p.img) l.ctx.drawImage(p.img, 0, 0);
      return l;
    });
    if (!App.layers.length) {
      App.layers = [createLayerObj('Camada 1')];
    }
    const stillThere = App.layers.some((l) => l.id === snap.activeId);
    App.activeLayerId = stillThere ? snap.activeId : App.layers[App.layers.length - 1].id;
    syncLayerDOM();
    renderLayers();
    clearOverlays();
    updateStatus();
    renderHistory();
    updateUndoRedo();
  });
}

function jumpToHistory(i) {
  if (i < 0 || i >= App.history.length || i === App.historyIndex) return;
  App.historyIndex = i;
  restoreSnapshot(i);
}

function undo() {
  if (App.historyIndex <= 0) return;
  App.historyIndex--;
  restoreSnapshot(App.historyIndex);
}

function redo() {
  if (App.historyIndex >= App.history.length - 1) return;
  App.historyIndex++;
  restoreSnapshot(App.historyIndex);
}

function resetHistory() {
  App.history = [];
  App.historyIndex = -1;
  App.restoreToken++;
}
