'use strict';

function layerCountName() {
  return 'Camada ' + (App.layers.length + 1);
}

function createLayerObj(name) {
  const canvas = makeCanvas(App.doc.width, App.doc.height);
  canvas.className = 'layer-canvas';
  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return {
    id: 'L' + (++App.idSeq) + '-' + Date.now().toString(36),
    name: name || layerCountName(),
    canvas: canvas,
    ctx: ctx,
    visible: true,
    opacity: 1
  };
}

function syncLayerDOM() {
  els.layerStack.innerHTML = '';
  App.layers.forEach((l) => {
    l.canvas.style.display = l.visible ? '' : 'none';
    l.canvas.style.opacity = String(l.opacity);
    els.layerStack.appendChild(l.canvas);
  });
}

function selectLayer(id) {
  if (!App.layers.some((l) => l.id === id)) return;
  App.activeLayerId = id;
  renderLayers();
  updateStatus();
}

function addLayer(name, opts) {
  const l = createLayerObj(name);
  if (opts) {
    if (opts.visible === false) l.visible = false;
    if (typeof opts.opacity === 'number') l.opacity = opts.opacity;
  }
  const idx = App.layers.findIndex((x) => x.id === App.activeLayerId);
  if (idx === -1) App.layers.push(l);
  else App.layers.splice(idx + 1, 0, l);
  App.activeLayerId = l.id;
  syncLayerDOM();
  renderLayers();
  updateStatus();
  return l;
}

function deleteLayer(id) {
  const target = id || App.activeLayerId;
  if (App.layers.length <= 1) {
    toast('O documento precisa de pelo menos uma camada', 'err');
    return;
  }
  const idx = App.layers.findIndex((l) => l.id === target);
  if (idx === -1) return;
  App.layers.splice(idx, 1);
  const next = App.layers[Math.min(idx, App.layers.length - 1)];
  App.activeLayerId = next.id;
  syncLayerDOM();
  renderLayers();
  updateStatus();
  clearOverlays();
  pushHistory();
}

function duplicateLayer() {
  const src = activeLayer();
  if (!src) return;
  const copy = createLayerObj(src.name + ' cópia');
  copy.ctx.drawImage(src.canvas, 0, 0);
  copy.opacity = src.opacity;
  copy.visible = src.visible;
  const idx = App.layers.indexOf(src);
  App.layers.splice(idx + 1, 0, copy);
  App.activeLayerId = copy.id;
  syncLayerDOM();
  renderLayers();
  updateStatus();
  pushHistory();
}

function moveLayer(dir) {
  const l = activeLayer();
  if (!l) return;
  const i = App.layers.indexOf(l);
  const j = i + dir;
  if (j < 0 || j >= App.layers.length) return;
  App.layers.splice(i, 1);
  App.layers.splice(j, 0, l);
  syncLayerDOM();
  renderLayers();
  pushHistory();
}

function mergeDown() {
  const top = activeLayer();
  if (!top) return;
  const i = App.layers.indexOf(top);
  if (i <= 0) {
    toast('Não há camada abaixo para mesclar', 'err');
    return;
  }
  const below = App.layers[i - 1];
  below.ctx.globalAlpha = top.opacity;
  below.ctx.drawImage(top.canvas, 0, 0);
  below.ctx.globalAlpha = 1;
  App.layers.splice(i, 1);
  App.activeLayerId = below.id;
  syncLayerDOM();
  renderLayers();
  updateStatus();
  pushHistory();
}

function setLayerVisibility(id, vis) {
  const l = App.layers.find((x) => x.id === id);
  if (!l) return;
  l.visible = vis;
  l.canvas.style.display = vis ? '' : 'none';
  renderLayers();
  pushHistory();
}

function setLayerOpacity(v) {
  const l = activeLayer();
  if (!l) return;
  l.opacity = clamp(v, 0, 1);
  l.canvas.style.opacity = String(l.opacity);
  const lbl = $('layerOpacityVal');
  if (lbl) lbl.textContent = Math.round(l.opacity * 100) + '%';
}

function renameLayer(id) {
  const l = App.layers.find((x) => x.id === id);
  if (!l) return;
  const name = prompt('Nome da camada:', l.name);
  if (name === null) return;
  const trimmed = name.trim();
  l.name = trimmed || l.name;
  renderLayers();
  updateStatus();
}

function resetLayers(bg) {
  App.layers = [];
  els.layerStack.innerHTML = '';
  if (bg === 'white') {
    const fundo = createLayerObj('Fundo');
    fundo.ctx.fillStyle = '#ffffff';
    fundo.ctx.fillRect(0, 0, fundo.canvas.width, fundo.canvas.height);
    App.layers.push(fundo);
  }
  const main = createLayerObj(bg === 'white' ? 'Camada 1' : 'Camada 1');
  App.layers.push(main);
  App.activeLayerId = main.id;
  syncLayerDOM();
  renderLayers();
  updateStatus();
}
