'use strict';

const $ = (id) => document.getElementById(id);

const App = {
  doc: { width: 1600, height: 1000 },
  view: { zoom: 1, panX: 0, panY: 0, left: 0, top: 0 },
  tool: 'brush',
  spaceDown: false,
  props: {
    color: '#000000',
    size: 6,
    opacity: 1,
    fillMode: 'stroke',
    tolerance: 32,
    fontFamily: 'Arial',
    fontSize: 40,
    fontWeight: 'bold',
    grid: false
  },
  recent: [],
  layers: [],
  activeLayerId: null,
  history: [],
  historyIndex: -1,
  maxHistory: 50,
  idSeq: 0,
  toolMeta: null
};

const els = {
  stage: $('stage'),
  docWrap: $('docWrap'),
  layerStack: $('layerStack'),
  gridCanvas: $('gridCanvas'),
  previewCanvas: $('previewCanvas'),
  textEditor: $('textEditor'),
  zoomLabel: $('zoomLabel'),
  statusTool: $('stTool'),
  statusPos: $('stPos'),
  statusZoom: $('stZoom'),
  statusDoc: $('stDoc'),
  statusLayer: $('stLayer'),
  statusHint: $('stHint'),
  toasts: $('toasts')
};

const gridCtx = els.gridCanvas.getContext('2d');
const previewCtx = els.previewCanvas.getContext('2d');

const strokeBuf = document.createElement('canvas');
const strokeCtx = strokeBuf.getContext('2d');
strokeCtx.lineCap = 'round';
strokeCtx.lineJoin = 'round';

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const f = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function setDocSize(w, h) {
  App.doc.width = w;
  App.doc.height = h;
  els.docWrap.style.width = w + 'px';
  els.docWrap.style.height = h + 'px';
  els.gridCanvas.width = w;
  els.gridCanvas.height = h;
  els.previewCanvas.width = w;
  els.previewCanvas.height = h;
  strokeBuf.width = w;
  strokeBuf.height = h;
  strokeCtx.lineCap = 'round';
  strokeCtx.lineJoin = 'round';
  drawGrid();
}

function activeLayer() {
  return App.layers.find((l) => l.id === App.activeLayerId) || null;
}

function applyView() {
  const r = els.stage.getBoundingClientRect();
  const z = App.view.zoom;
  App.view.left = r.width / 2 - (App.doc.width * z) / 2 + App.view.panX;
  App.view.top = r.height / 2 - (App.doc.height * z) / 2 + App.view.panY;
  els.docWrap.style.left = App.view.left + 'px';
  els.docWrap.style.top = App.view.top + 'px';
  els.docWrap.style.transform = 'scale(' + z + ')';
  updateStatus();
}

function screenToDoc(cx, cy) {
  const r = els.stage.getBoundingClientRect();
  return {
    x: (cx - r.left - App.view.left) / App.view.zoom,
    y: (cy - r.top - App.view.top) / App.view.zoom
  };
}

function zoomAt(cx, cy, nz) {
  const r = els.stage.getBoundingClientRect();
  const sx = cx - r.left;
  const sy = cy - r.top;
  const dx = (sx - App.view.left) / App.view.zoom;
  const dy = (sy - App.view.top) / App.view.zoom;
  App.view.zoom = clamp(nz, 0.05, 16);
  App.view.left = sx - dx * App.view.zoom;
  App.view.top = sy - dy * App.view.zoom;
  App.view.panX = App.view.left - r.width / 2 + (App.doc.width * App.view.zoom) / 2;
  App.view.panY = App.view.top - r.height / 2 + (App.doc.height * App.view.zoom) / 2;
  applyView();
}

function zoomCentered(nz) {
  const r = els.stage.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, nz);
}

function fitView() {
  const r = els.stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  App.view.zoom = clamp(Math.min(r.width / App.doc.width, r.height / App.doc.height) * 0.9, 0.05, 16);
  App.view.panX = 0;
  App.view.panY = 0;
  applyView();
}

function composite(fill) {
  const c = makeCanvas(App.doc.width, App.doc.height);
  const x = c.getContext('2d');
  if (fill) {
    x.fillStyle = fill;
    x.fillRect(0, 0, c.width, c.height);
  }
  App.layers.forEach((l) => {
    if (!l.visible) return;
    x.globalAlpha = l.opacity;
    x.drawImage(l.canvas, 0, 0);
  });
  x.globalAlpha = 1;
  return c;
}

function clearOverlays() {
  previewCtx.clearRect(0, 0, previewCtx.canvas.width, previewCtx.canvas.height);
  strokeCtx.clearRect(0, 0, strokeBuf.width, strokeBuf.height);
}

function drawGrid() {
  const w = els.gridCanvas.width;
  const h = els.gridCanvas.height;
  gridCtx.clearRect(0, 0, w, h);
  if (!App.props.grid) return;
  const step = 50;
  gridCtx.save();
  gridCtx.lineWidth = 1;
  gridCtx.beginPath();
  for (let x = step; x < w; x += step) {
    gridCtx.moveTo(x + 0.5, 0);
    gridCtx.lineTo(x + 0.5, h);
  }
  for (let y = step; y < h; y += step) {
    gridCtx.moveTo(0, y + 0.5);
    gridCtx.lineTo(w, y + 0.5);
  }
  gridCtx.strokeStyle = 'rgba(70, 100, 170, .35)';
  gridCtx.stroke();
  gridCtx.beginPath();
  for (let x = step * 5; x < w; x += step * 5) {
    gridCtx.moveTo(x + 0.5, 0);
    gridCtx.lineTo(x + 0.5, h);
  }
  for (let y = step * 5; y < h; y += step * 5) {
    gridCtx.moveTo(0, y + 0.5);
    gridCtx.lineTo(w, y + 0.5);
  }
  gridCtx.strokeStyle = 'rgba(70, 100, 170, .6)';
  gridCtx.stroke();
  gridCtx.restore();
}

function updateStatus() {
  const z = Math.round(App.view.zoom * 100) + '%';
  if (els.zoomLabel) els.zoomLabel.textContent = z;
  if (els.statusZoom) els.statusZoom.textContent = z;
  if (els.statusDoc) els.statusDoc.textContent = App.doc.width + ' × ' + App.doc.height + ' px';
  const meta = App.toolMeta ? App.toolMeta[App.tool] : null;
  if (els.statusTool && meta) els.statusTool.textContent = meta.name;
  if (els.statusHint && meta) els.statusHint.textContent = meta.hint;
  const l = activeLayer();
  if (els.statusLayer) els.statusLayer.textContent = l ? l.name : '—';
}

function toast(msg, type) {
  const box = els.toasts;
  if (!box) return;
  const d = document.createElement('div');
  d.className = 'toast' + (type ? ' ' + type : '');
  d.textContent = msg;
  box.appendChild(d);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  requestAnimationFrame(() => d.classList.add('show'));
  setTimeout(() => {
    d.classList.remove('show');
    setTimeout(() => d.remove(), 320);
  }, 2600);
}
