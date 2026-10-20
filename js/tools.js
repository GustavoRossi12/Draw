'use strict';

const toolMeta = {
  brush: { name: 'Pincel', hint: 'Desenhe livremente — [ e ] mudam o tamanho', cursor: 'crosshair' },
  eraser: { name: 'Borracha', hint: 'Apague o conteúdo da camada ativa', cursor: 'crosshair' },
  line: { name: 'Linha', hint: 'Arraste para traçar — Shift trava o ângulo', cursor: 'crosshair' },
  rect: { name: 'Retângulo', hint: 'Shift faz quadrado perfeito', cursor: 'crosshair' },
  ellipse: { name: 'Círculo', hint: 'Shift faz círculo perfeito', cursor: 'crosshair' },
  text: { name: 'Texto', hint: 'Clique no canvas para digitar — Enter confirma', cursor: 'text' },
  fill: { name: 'Baldete', hint: 'Clique para preencher a área da camada ativa', cursor: 'cell' },
  eyedropper: { name: 'Conta-gotas', hint: 'Clique para capturar a cor do desenho', cursor: 'crosshair' },
  pan: { name: 'Mover', hint: 'Arraste para mover a tela — segure Espaço em qualquer ferramenta', cursor: 'grab' }
};
App.toolMeta = toolMeta;

let drawing = false;
let strokeType = null;
let startPt = null;
let lastPt = null;
let lastMid = null;
let curPt = null;
let shapeShift = false;
let shapeMoved = false;
let dirty = null;
let editingPoint = null;
let panState = null;
let pinch = null;
const pointers = new Map();

function setTool(t) {
  if (!toolMeta[t]) return;
  commitText();
  abortStroke();
  App.tool = t;
  els.stage.dataset.cursor = toolMeta[t].cursor;
  const btns = document.querySelectorAll('#toolrail .tool');
  btns.forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  updateStatus();
  if (typeof refreshToolUI === 'function') refreshToolUI();
}

function abortStroke() {
  if (drawing) {
    drawing = false;
    strokeType = null;
  }
  clearOverlays();
  dirty = null;
  panState = null;
  els.stage.classList.remove('grabbing');
}

function markDirty(p, margin) {
  if (!dirty) {
    dirty = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  } else {
    dirty.x0 = Math.min(dirty.x0, p.x);
    dirty.y0 = Math.min(dirty.y0, p.y);
    dirty.x1 = Math.max(dirty.x1, p.x);
    dirty.y1 = Math.max(dirty.y1, p.y);
  }
  dirty.x0 -= margin;
  dirty.y0 -= margin;
  dirty.x1 += margin;
  dirty.y1 += margin;
}

function clampDirty() {
  const w = App.doc.width;
  const h = App.doc.height;
  return {
    x: Math.max(0, Math.floor(dirty.x0)),
    y: Math.max(0, Math.floor(dirty.y0)),
    w: Math.min(w - Math.max(0, Math.floor(dirty.x0)), Math.ceil(dirty.x1 - dirty.x0) + 1),
    h: Math.min(h - Math.max(0, Math.floor(dirty.y0)), Math.ceil(dirty.y1 - dirty.y0) + 1)
  };
}

function renderBrushPreview() {
  if (!dirty) return;
  const d = clampDirty();
  if (d.w <= 0 || d.h <= 0) return;
  previewCtx.clearRect(d.x, d.y, d.w, d.h);
  previewCtx.globalAlpha = App.props.opacity;
  previewCtx.drawImage(strokeBuf, d.x, d.y, d.w, d.h, d.x, d.y, d.w, d.h);
  previewCtx.globalAlpha = 1;
}

function paintDot(ctx, p, size, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(size / 2, 0.5), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function beginBrush(p) {
  strokeCtx.clearRect(0, 0, strokeBuf.width, strokeBuf.height);
  strokeCtx.strokeStyle = App.props.color;
  strokeCtx.fillStyle = App.props.color;
  strokeCtx.lineWidth = App.props.size;
  strokeCtx.globalAlpha = 1;
  dirty = null;
  markDirty(p, App.props.size + 4);
  paintDot(strokeCtx, p, App.props.size, App.props.color, 1);
  lastPt = p;
  lastMid = p;
  curPt = p;
  drawing = true;
  strokeType = 'brush';
  renderBrushPreview();
}

function strokeBrush(p) {
  const mid = { x: (lastPt.x + p.x) / 2, y: (lastPt.y + p.y) / 2 };
  strokeCtx.beginPath();
  strokeCtx.moveTo(lastMid.x, lastMid.y);
  strokeCtx.quadraticCurveTo(lastPt.x, lastPt.y, mid.x, mid.y);
  strokeCtx.stroke();
  markDirty(mid, App.props.size + 4);
  markDirty(p, App.props.size + 4);
  lastMid = mid;
  lastPt = p;
  curPt = p;
  renderBrushPreview();
}

function beginEraser(p) {
  drawing = true;
  strokeType = 'eraser';
  lastPt = p;
  curPt = p;
  const l = activeLayer();
  if (l) {
    l.ctx.save();
    l.ctx.globalCompositeOperation = 'destination-out';
    l.ctx.globalAlpha = App.props.opacity;
    l.ctx.strokeStyle = 'rgba(0,0,0,1)';
    l.ctx.fillStyle = 'rgba(0,0,0,1)';
    l.ctx.lineWidth = App.props.size;
    paintDot(l.ctx, p, App.props.size, 'rgba(0,0,0,1)', App.props.opacity);
    l.ctx.restore();
  }
}

function strokeEraser(p) {
  const l = activeLayer();
  if (!l) return;
  l.ctx.save();
  l.ctx.globalCompositeOperation = 'destination-out';
  l.ctx.globalAlpha = App.props.opacity;
  l.ctx.strokeStyle = 'rgba(0,0,0,1)';
  l.ctx.lineWidth = App.props.size;
  l.ctx.lineCap = 'round';
  l.ctx.lineJoin = 'round';
  l.ctx.beginPath();
  l.ctx.moveTo(lastPt.x, lastPt.y);
  l.ctx.lineTo(p.x, p.y);
  l.ctx.stroke();
  l.ctx.restore();
  lastPt = p;
  curPt = p;
}

function constrainPoint(a, b, shift, type) {
  if (!shift) return b;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (type === 'line') {
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
    return { x: a.x + Math.cos(snapped) * len, y: a.y + Math.sin(snapped) * len };
  }
  const s = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + Math.sign(dx || 1) * s, y: a.y + Math.sign(dy || 1) * s };
}

function paintShape(ctx, a, b, type, opts) {
  ctx.save();
  ctx.globalAlpha = opts.opacity;
  ctx.lineWidth = opts.size;
  ctx.strokeStyle = opts.color;
  ctx.fillStyle = opts.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (type === 'line') {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  } else if (type === 'rect') {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (opts.fillMode === 'fill' || opts.fillMode === 'both') {
      ctx.fillRect(x, y, w, h);
    }
    if (opts.fillMode === 'stroke' || opts.fillMode === 'both') {
      ctx.strokeRect(x, y, w, h);
    }
  } else {
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2;
    const ry = Math.abs(b.y - a.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (opts.fillMode === 'fill' || opts.fillMode === 'both') ctx.fill();
    if (opts.fillMode === 'stroke' || opts.fillMode === 'both') ctx.stroke();
  }
  ctx.restore();
}

function shapeOpts() {
  return {
    color: App.props.color,
    size: App.props.size,
    opacity: App.props.opacity,
    fillMode: App.props.fillMode
  };
}

function beginShape(p, type) {
  drawing = true;
  strokeType = type;
  startPt = p;
  curPt = p;
  shapeMoved = false;
  shapeShift = false;
}

function drawShapePreview(p, shift) {
  curPt = p;
  shapeShift = shift;
  previewCtx.clearRect(0, 0, previewCtx.canvas.width, previewCtx.canvas.height);
  const b = constrainPoint(startPt, p, shift, strokeType);
  curPt = b;
  paintShape(previewCtx, startPt, b, strokeType, shapeOpts());
}

function endShape(type) {
  previewCtx.clearRect(0, 0, previewCtx.canvas.width, previewCtx.canvas.height);
  const a = startPt;
  const b = curPt;
  const moved = shapeMoved;
  if (!moved && (type === 'rect' || type === 'ellipse')) return;
  const l = activeLayer();
  if (!l) return;
  if (!moved && type === 'line') {
    paintDot(l.ctx, a, App.props.size, App.props.color, App.props.opacity);
  } else {
    paintShape(l.ctx, a, b, type, shapeOpts());
  }
  pushHistory();
}

function hexOfChannel(v) {
  return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
}

function floodFill(ctx, sx, sy, hex, tolerance, alpha) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return false;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const si = (sy * w + sx) * 4;
  const sr = d[si];
  const sg = d[si + 1];
  const sb = d[si + 2];
  const sa = d[si + 3];
  const rgb = hexToRgb(hex);
  const rr = rgb.r;
  const rg = rgb.g;
  const rb = rgb.b;
  const ra = Math.round(alpha * 255);
  if (Math.abs(sr - rr) <= tolerance && Math.abs(sg - rg) <= tolerance && Math.abs(sb - rb) <= tolerance && Math.abs(sa - ra) <= tolerance) {
    return false;
  }
  const t = tolerance;
  const match = (i) =>
    Math.abs(d[i] - sr) <= t &&
    Math.abs(d[i + 1] - sg) <= t &&
    Math.abs(d[i + 2] - sb) <= t &&
    Math.abs(d[i + 3] - sa) <= t;
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop();
    let x = stack.pop();
    let i = (y * w + x) * 4;
    while (x >= 0 && match(i)) {
      x--;
      i -= 4;
    }
    x++;
    i += 4;
    let spanUp = false;
    let spanDown = false;
    while (x < w && match(i)) {
      d[i] = rr;
      d[i + 1] = rg;
      d[i + 2] = rb;
      d[i + 3] = ra;
      if (y > 0) {
        const ui = i - w * 4;
        const um = match(ui);
        if (!spanUp && um) {
          stack.push(x, y - 1);
          spanUp = true;
        } else if (spanUp && !um) {
          spanUp = false;
        }
      }
      if (y < h - 1) {
        const di = i + w * 4;
        const dm = match(di);
        if (!spanDown && dm) {
          stack.push(x, y + 1);
          spanDown = true;
        } else if (spanDown && !dm) {
          spanDown = false;
        }
      }
      x++;
      i += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

function pickColor(p) {
  const x = clamp(Math.floor(p.x), 0, App.doc.width - 1);
  const y = clamp(Math.floor(p.y), 0, App.doc.height - 1);
  const c = composite(null);
  const d = c.getContext('2d').getImageData(x, y, 1, 1).data;
  if (d[3] < 8) {
    toast('Pixel transparente', 'err');
    return;
  }
  const hex = rgbToHex(d[0], d[1], d[2]);
  if (typeof setColor === 'function') setColor(hex, true);
}

function syncTextEditor() {
  const ta = els.textEditor;
  if (ta.hidden) return;
  ta.style.fontSize = App.props.fontSize + 'px';
  ta.style.fontWeight = App.props.fontWeight;
  ta.style.fontFamily = App.props.fontFamily;
  ta.style.color = App.props.color;
  ta.style.opacity = String(App.props.opacity);
  ta.style.lineHeight = '1.2';
}

function openTextEditor(p) {
  commitText();
  editingPoint = p;
  const ta = els.textEditor;
  ta.hidden = false;
  ta.value = '';
  ta.style.left = clamp(p.x, 0, App.doc.width - 80) + 'px';
  ta.style.top = clamp(p.y, 0, App.doc.height - 20) + 'px';
  ta.style.width = Math.max(140, Math.min(480, App.doc.width - p.x)) + 'px';
  ta.style.height = App.props.fontSize * 1.4 + 'px';
  syncTextEditor();
  ta.focus();
}

function commitText() {
  const ta = els.textEditor;
  if (!ta || ta.hidden) return;
  const val = ta.value;
  ta.hidden = true;
  ta.value = '';
  const pt = editingPoint;
  editingPoint = null;
  if (!val.trim() || !pt) return;
  const l = activeLayer();
  if (!l) return;
  l.ctx.save();
  l.ctx.globalAlpha = App.props.opacity;
  l.ctx.fillStyle = App.props.color;
  l.ctx.font = App.props.fontWeight + ' ' + App.props.fontSize + 'px ' + App.props.fontFamily;
  l.ctx.textBaseline = 'top';
  val.split('\n').forEach((line, i) => {
    l.ctx.fillText(line, pt.x, pt.y + i * App.props.fontSize * 1.2);
  });
  l.ctx.restore();
  pushHistory();
}

function updatePosStatus(cx, cy) {
  const p = screenToDoc(cx, cy);
  if (els.statusPos) els.statusPos.textContent = Math.round(p.x) + ', ' + Math.round(p.y);
  return p;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function startPinch() {
  const pts = Array.from(pointers.values());
  if (pts.length < 2) return;
  pinch = {
    d: Math.max(1, dist(pts[0], pts[1])),
    z: App.view.zoom,
    mid: mid(pts[0], pts[1])
  };
}

function updatePinch() {
  const pts = Array.from(pointers.values());
  if (!pinch || pts.length < 2) return;
  const d = Math.max(1, dist(pts[0], pts[1]));
  const m = mid(pts[0], pts[1]);
  const nz = clamp(pinch.z * (d / pinch.d), 0.05, 16);
  zoomAt(m.x, m.y, nz);
  App.view.panX += m.x - pinch.mid.x;
  App.view.panY += m.y - pinch.mid.y;
  applyView();
  pinch.mid = m;
}

function onPointerDown(e) {
  if (e.target === els.textEditor) return;
  if (e.target.closest && e.target.closest('#zoomBar')) return;
  if (e.button !== 0 && e.button !== 1) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try {
    els.stage.setPointerCapture(e.pointerId);
  } catch (err) {}
  if (pointers.size >= 2) {
    if (drawing) endStroke();
    startPinch();
    return;
  }
  if (e.button === 1 || App.spaceDown || App.tool === 'pan') {
    panState = { x: e.clientX, y: e.clientY };
    els.stage.classList.add('grabbing');
    e.preventDefault();
    return;
  }
  const p = updatePosStatus(e.clientX, e.clientY);
  switch (App.tool) {
    case 'brush':
      beginBrush(p);
      e.preventDefault();
      break;
    case 'eraser':
      beginEraser(p);
      e.preventDefault();
      break;
    case 'line':
    case 'rect':
    case 'ellipse':
      beginShape(p, App.tool);
      e.preventDefault();
      break;
    case 'text':
      openTextEditor(p);
      break;
    case 'fill': {
      const l = activeLayer();
      if (l) {
        if (floodFill(l.ctx, p.x, p.y, App.props.color, App.props.tolerance, App.props.opacity)) {
          pushHistory();
        } else {
          toast('Nada para preencher aqui');
        }
      }
      break;
    }
    case 'eyedropper':
      pickColor(p);
      break;
    default:
      break;
  }
}

function onPointerMove(e) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  updatePosStatus(e.clientX, e.clientY);
  if (pinch && pointers.size >= 2) {
    updatePinch();
    return;
  }
  if (panState) {
    App.view.panX += e.clientX - panState.x;
    App.view.panY += e.clientY - panState.y;
    panState = { x: e.clientX, y: e.clientY };
    applyView();
    return;
  }
  if (!drawing) return;
  const p = screenToDoc(e.clientX, e.clientY);
  if (strokeType === 'brush') {
    strokeBrush(p);
  } else if (strokeType === 'eraser') {
    strokeEraser(p);
  } else if (strokeType === 'line' || strokeType === 'rect' || strokeType === 'ellipse') {
    shapeMoved = true;
    drawShapePreview(p, e.shiftKey);
  }
}

function endStroke() {
  if (!drawing) return;
  const type = strokeType;
  drawing = false;
  strokeType = null;
  if (type === 'brush') {
    const l = activeLayer();
    if (l) {
      l.ctx.globalAlpha = App.props.opacity;
      l.ctx.drawImage(strokeBuf, 0, 0);
      l.ctx.globalAlpha = 1;
    }
    clearOverlays();
    dirty = null;
    pushHistory();
  } else if (type === 'eraser') {
    pushHistory();
  } else if (type === 'line' || type === 'rect' || type === 'ellipse') {
    endShape(type);
  }
}

function onPointerUp(e) {
  pointers.delete(e.pointerId);
  if (panState && pointers.size === 0) {
    panState = null;
    els.stage.classList.remove('grabbing');
  }
  if (pinch && pointers.size < 2) {
    pinch = null;
    if (pointers.size === 0) drawing = false;
  }
  if (drawing && pointers.size === 0) endStroke();
}

els.stage.addEventListener('pointerdown', onPointerDown);
els.stage.addEventListener('pointermove', onPointerMove);
els.stage.addEventListener('pointerup', onPointerUp);
els.stage.addEventListener('pointercancel', onPointerUp);
els.stage.addEventListener('contextmenu', (e) => e.preventDefault());
els.stage.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.033 : 0.0015));
    zoomAt(e.clientX, e.clientY, App.view.zoom * factor);
  },
  { passive: false }
);
els.textEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    commitText();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    els.textEditor.hidden = true;
    els.textEditor.value = '';
    editingPoint = null;
  }
});
els.textEditor.addEventListener('blur', () => {
  setTimeout(commitText, 0);
});
