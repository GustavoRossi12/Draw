'use strict';

const SESSION_KEY = 'drawstudio.session.v1';
let saveTimer = null;
let sessionSaveBroken = false;

const PALETTE = [
  '#000000', '#434343', '#7f7f7f', '#c0c0c0', '#ffffff', '#e6e8ee', '#b3123c', '#f44336',
  '#ff7a00', '#ff9800', '#ffeb3b', '#8bc34a', '#00c853', '#00bcd4', '#2196f3', '#3f51b5',
  '#7c5cff', '#9c27b0', '#e91e63', '#795548', '#607d8b', '#009688', '#00695c', '#263238'
];

const GROUP_RULES = {
  color: ['brush', 'line', 'rect', 'ellipse', 'text', 'fill'],
  size: ['brush', 'eraser', 'line', 'rect', 'ellipse'],
  alpha: ['brush', 'eraser', 'line', 'rect', 'ellipse', 'fill', 'text'],
  shape: ['line', 'rect', 'ellipse'],
  fill: ['fill'],
  text: ['text']
};

function syncPropsUI() {
  const p = App.props;
  $('colorPicker').value = p.color;
  $('size').value = p.size;
  $('sizeVal').textContent = p.size;
  $('opacity').value = Math.round(p.opacity * 100);
  $('opacityVal').textContent = Math.round(p.opacity * 100) + '%';
  $('tolerance').value = p.tolerance;
  $('tolVal').textContent = p.tolerance;
  $('fontFamily').value = p.fontFamily;
  $('fontWeight').value = p.fontWeight;
  $('fontSize').value = p.fontSize;
  $('fontSizeVal').textContent = p.fontSize;
  document.querySelectorAll('#fillModeSeg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.fm === p.fillMode);
  });
  $('gridBtn').classList.toggle('active', p.grid);
}

function renderPalette() {
  const box = $('palette');
  box.innerHTML = '';
  PALETTE.forEach((hex) => {
    const s = document.createElement('button');
    s.className = 'swatch';
    s.dataset.color = hex;
    s.style.background = hex;
    s.title = hex;
    s.onclick = () => setColor(hex, true);
    box.appendChild(s);
  });
}

function renderRecents() {
  const box = $('recentPalette');
  box.innerHTML = '';
  if (!App.recent.length) {
    const none = document.createElement('span');
    none.className = 'hint';
    none.style.margin = '0';
    none.textContent = '—';
    box.appendChild(none);
    return;
  }
  App.recent.forEach((hex) => {
    const s = document.createElement('button');
    s.className = 'swatch';
    s.dataset.color = hex;
    s.style.background = hex;
    s.title = hex;
    s.onclick = () => setColor(hex, true);
    box.appendChild(s);
  });
}

function setColor(hex, remember) {
  App.props.color = hex;
  $('colorPicker').value = hex;
  document.querySelectorAll('.swatch').forEach((s) => {
    s.classList.toggle('active', s.dataset.color && s.dataset.color.toLowerCase() === hex.toLowerCase());
  });
  if (remember) {
    App.recent = [hex].concat(App.recent.filter((c) => c !== hex)).slice(0, 8);
    renderRecents();
  }
  syncTextEditor();
}

function refreshToolUI() {
  document.querySelectorAll('.field[data-show]').forEach((f) => {
    const rule = GROUP_RULES[f.dataset.show] || [];
    f.hidden = rule.indexOf(App.tool) === -1;
  });
  document.querySelectorAll('.swatch').forEach((s) => {
    s.classList.toggle('active', !!s.dataset.color && s.dataset.color.toLowerCase() === App.props.color.toLowerCase());
  });
}

function setPropSize(v) {
  App.props.size = clamp(Math.round(v), 1, 100);
  $('size').value = App.props.size;
  $('sizeVal').textContent = App.props.size;
}

function toggleGrid() {
  App.props.grid = !App.props.grid;
  $('gridBtn').classList.toggle('active', App.props.grid);
  drawGrid();
}

function renderLayers() {
  const list = $('layerList');
  if (!list) return;
  list.innerHTML = '';
  for (let i = App.layers.length - 1; i >= 0; i--) {
    const l = App.layers[i];
    const row = document.createElement('div');
    row.className = 'layer-row' + (l.id === App.activeLayerId ? ' active' : '');
    row.dataset.id = l.id;

    const eye = document.createElement('button');
    eye.className = 'eye' + (l.visible ? '' : ' off');
    eye.title = l.visible ? 'Ocultar camada' : 'Mostrar camada';
    eye.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.4"/><path class="lash" d="M4.5 4.5l15 15"/></svg>';
    eye.onclick = (e) => {
      e.stopPropagation();
      setLayerVisibility(l.id, !l.visible);
    };

    const name = document.createElement('span');
    name.className = 'lname';
    name.textContent = l.name;
    name.title = 'Duplo clique para renomear';
    name.ondblclick = (e) => {
      e.stopPropagation();
      renameLayer(l.id);
    };

    const op = document.createElement('span');
    op.className = 'lop';
    op.textContent = Math.round(l.opacity * 100) + '%';

    row.append(eye, name, op);
    row.onclick = () => selectLayer(l.id);
    list.appendChild(row);
  }
  const active = activeLayer();
  if (active) {
    $('layerOpacity').value = Math.round(active.opacity * 100);
    $('layerOpacityVal').textContent = Math.round(active.opacity * 100) + '%';
  }
}

function renderHistory() {
  const list = $('historyList');
  if (!list) return;
  list.innerHTML = '';
  App.history.forEach((snap, i) => {
    const b = document.createElement('button');
    b.className = 'hist-item' + (i === App.historyIndex ? ' active' : '');
    const img = document.createElement('img');
    img.src = snap.thumb;
    img.alt = '';
    const span = document.createElement('span');
    span.textContent = i === 0 ? 'Início' : 'Estado ' + i;
    b.append(img, span);
    b.onclick = () => jumpToHistory(i);
    list.appendChild(b);
  });
  const act = list.querySelector('.hist-item.active');
  if (act) act.scrollIntoView({ block: 'nearest' });
}

function updateUndoRedo() {
  $('undoBtn').disabled = App.historyIndex <= 0;
  $('redoBtn').disabled = App.historyIndex >= App.history.length - 1;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSession(), 900);
}

function saveSession() {
  if (sessionSaveBroken) return false;
  try {
    const data = {
      w: App.doc.width,
      h: App.doc.height,
      activeIndex: App.layers.findIndex((l) => l.id === App.activeLayerId),
      props: {
        color: App.props.color,
        size: App.props.size,
        opacity: App.props.opacity,
        fillMode: App.props.fillMode,
        tolerance: App.props.tolerance,
        fontFamily: App.props.fontFamily,
        fontSize: App.props.fontSize,
        fontWeight: App.props.fontWeight,
        grid: App.props.grid
      },
      recent: App.recent,
      layers: App.layers.map((l) => ({
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        data: l.canvas.toDataURL('image/png')
      }))
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    sessionSaveBroken = true;
    toast('Não foi possível salvar a sessão (armazenamento cheio)', 'err');
    return false;
  }
}

function restoreSession() {
  return new Promise((resolve) => {
    let raw = null;
    try {
      raw = localStorage.getItem(SESSION_KEY);
    } catch (err) {
      resolve(false);
      return;
    }
    if (!raw) {
      resolve(false);
      return;
    }
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      resolve(false);
      return;
    }
    if (!data || !data.w || !Array.isArray(data.layers) || !data.layers.length) {
      resolve(false);
      return;
    }
    const token = ++App.restoreToken;
    const imgs = data.layers.map(
      (ld) =>
        new Promise((res) => {
          if (!ld || !ld.data) return res({ ld: ld, img: null });
          const img = new Image();
          img.onload = () => res({ ld: ld, img: img });
          img.onerror = () => res({ ld: ld, img: null });
          img.src = ld.data;
        })
    );
    Promise.all(imgs).then((parts) => {
      if (token !== App.restoreToken) {
        resolve(false);
        return;
      }
      commitText();
      abortStroke();
      setDocSize(data.w, data.h);
      App.layers = parts.map((p) => {
        const l = createLayerObj((p.ld && p.ld.name) || 'Camada');
        l.visible = !p.ld || p.ld.visible !== false;
        l.opacity = p.ld && typeof p.ld.opacity === 'number' ? p.ld.opacity : 1;
        if (p.img) l.ctx.drawImage(p.img, 0, 0);
        return l;
      });
      const idx = clamp(data.activeIndex | 0, 0, App.layers.length - 1);
      App.activeLayerId = App.layers[idx].id;
      if (data.props) {
        Object.keys(data.props).forEach((k) => {
          if (k in App.props) App.props[k] = data.props[k];
        });
      }
      if (Array.isArray(data.recent)) App.recent = data.recent.slice(0, 8);
      syncPropsUI();
      syncLayerDOM();
      renderLayers();
      renderRecents();
      updateStatus();
      drawGrid();
      fitView();
      resetHistory();
      pushHistory();
      resolve(true);
    });
  });
}

function newDocument(w, h, bg) {
  commitText();
  abortStroke();
  setDocSize(w, h);
  resetLayers(bg);
  resetHistory();
  fitView();
  pushHistory();
  saveSession();
}

function exportImage(kind) {
  commitText();
  const fill = kind === 'jpg' ? '#ffffff' : null;
  const c = composite(fill);
  const d = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  const stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  const a = document.createElement('a');
  a.download = 'desenho-' + stamp + (kind === 'jpg' ? '.jpg' : '.png');
  a.href = c.toDataURL(kind === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
  a.click();
  toast('Imagem exportada', 'ok');
}

function importImageFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    commitText();
    const name = file.name.replace(/\.[^.]+$/, '') || 'Imagem';
    const l = addLayer(name.slice(0, 40));
    const scale = Math.min(App.doc.width / img.width, App.doc.height / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    l.ctx.drawImage(img, (App.doc.width - w) / 2, (App.doc.height - h) / 2, w, h);
    pushHistory();
    toast('Imagem importada como camada', 'ok');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    toast('Não foi possível abrir a imagem', 'err');
  };
  img.src = url;
}

function openNewDialog() {
  const dlg = $('newDialog');
  $('ndW').value = App.doc.width;
  $('ndH').value = App.doc.height;
  document.querySelectorAll('#ndPresets button').forEach((b) => b.classList.remove('active'));
  if (dlg.showModal) dlg.showModal();
  else dlg.setAttribute('open', '');
}

function bindTopbar() {
  $('newBtn').onclick = openNewDialog;
  $('openBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    importImageFile(f);
  };
  $('savePngBtn').onclick = () => exportImage('png');
  $('saveJpgBtn').onclick = () => exportImage('jpg');
  $('undoBtn').onclick = undo;
  $('redoBtn').onclick = redo;
  $('gridBtn').onclick = toggleGrid;
}

function bindTools() {
  document.querySelectorAll('#toolrail .tool').forEach((b) => {
    b.onclick = () => setTool(b.dataset.tool);
  });
}

function bindProps() {
  $('colorPicker').oninput = (e) => setColor(e.target.value, true);
  $('screenColorBtn').onclick = async () => {
    if (!window.EyeDropper) {
      toast('Seu navegador não suporta "Cor da tela"', 'err');
      return;
    }
    try {
      const res = await new EyeDropper().open();
      setColor(res.sRGBHex, true);
    } catch (err) {}
  };
  $('size').oninput = (e) => setPropSize(+e.target.value);
  $('opacity').oninput = (e) => {
    App.props.opacity = +e.target.value / 100;
    $('opacityVal').textContent = e.target.value + '%';
    syncTextEditor();
  };
  $('tolerance').oninput = (e) => {
    App.props.tolerance = +e.target.value;
    $('tolVal').textContent = e.target.value;
  };
  document.querySelectorAll('#fillModeSeg button').forEach((b) => {
    b.onclick = () => {
      App.props.fillMode = b.dataset.fm;
      document.querySelectorAll('#fillModeSeg button').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  $('fontFamily').onchange = (e) => {
    App.props.fontFamily = e.target.value;
    syncTextEditor();
  };
  $('fontWeight').onchange = (e) => {
    App.props.fontWeight = e.target.value;
    syncTextEditor();
  };
  $('fontSize').oninput = (e) => {
    App.props.fontSize = +e.target.value;
    $('fontSizeVal').textContent = e.target.value;
    syncTextEditor();
  };
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      document.querySelectorAll('.tabpage').forEach((p) => p.classList.remove('active'));
      const page = $('tab-' + t.dataset.tab);
      if (page) page.classList.add('active');
    };
  });
  $('panelBtn').onclick = () => $('panel').classList.toggle('open');
  $('panelClose').onclick = () => $('panel').classList.remove('open');
}

function bindLayersUI() {
  $('layerAdd').onclick = () => {
    addLayer();
    pushHistory();
  };
  $('layerDup').onclick = duplicateLayer;
  $('layerDel').onclick = () => deleteLayer();
  $('layerUp').onclick = () => moveLayer(1);
  $('layerDown').onclick = () => moveLayer(-1);
  $('layerMerge').onclick = mergeDown;
  $('layerOpacity').oninput = (e) => setLayerOpacity(+e.target.value / 100);
  $('layerOpacity').onchange = () => pushHistory();
}

function bindZoomUI() {
  $('zoomIn').onclick = () => zoomCentered(App.view.zoom * 1.25);
  $('zoomOut').onclick = () => zoomCentered(App.view.zoom / 1.25);
  $('zoomFit').onclick = fitView;
}

function bindDialog() {
  document.querySelectorAll('#ndPresets button').forEach((b) => {
    b.onclick = () => {
      $('ndW').value = b.dataset.w;
      $('ndH').value = b.dataset.h;
      document.querySelectorAll('#ndPresets button').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  $('ndCancel').onclick = () => $('newDialog').close();
  $('ndOk').onclick = () => {
    const w = clamp(Math.round(+$('ndW').value || 1600), 32, 6000);
    const h = clamp(Math.round(+$('ndH').value || 1000), 32, 6000);
    const bg = $('ndBg').value;
    $('newDialog').close();
    newDocument(w, h, bg);
  };
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing) return;
    const dlg = $('newDialog');
    if (dlg && dlg.open) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (ctrl && k === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (ctrl && k === 's') {
      e.preventDefault();
      exportImage('png');
      return;
    }
    if (ctrl && k === 'n') {
      e.preventDefault();
      openNewDialog();
      return;
    }
    if (ctrl) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!App.spaceDown) {
        App.spaceDown = true;
        els.stage.classList.add('space-pan');
      }
      return;
    }
    const map = { b: 'brush', e: 'eraser', l: 'line', r: 'rect', o: 'ellipse', t: 'text', f: 'fill', i: 'eyedropper', h: 'pan' };
    if (map[k]) {
      setTool(map[k]);
      return;
    }
    if (k === 'g') toggleGrid();
    else if (k === '0') fitView();
    else if (e.key === '+' || e.key === '=') zoomCentered(App.view.zoom * 1.25);
    else if (e.key === '-' || e.key === '_') zoomCentered(App.view.zoom / 1.25);
    else if (e.key === '[') setPropSize(App.props.size - 1);
    else if (e.key === ']') setPropSize(App.props.size + 1);
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      App.spaceDown = false;
      els.stage.classList.remove('space-pan');
    }
  });
}

function boot() {
  bindTopbar();
  bindTools();
  bindProps();
  bindTabs();
  bindLayersUI();
  bindZoomUI();
  bindDialog();
  bindKeys();
  renderPalette();
  renderRecents();
  syncPropsUI();
  refreshToolUI();
  els.stage.dataset.cursor = toolMeta[App.tool].cursor;
  updateUndoRedo();
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => applyView());
    ro.observe(els.stage);
  } else {
    window.addEventListener('resize', applyView);
  }
  requestAnimationFrame(() => {
    restoreSession().then((ok) => {
      if (ok) {
        toast('Projeto restaurado', 'ok');
      } else {
        setDocSize(1600, 1000);
        resetLayers('white');
        fitView();
        pushHistory();
      }
      updateUndoRedo();
    });
  });
}

window.addEventListener('pagehide', () => saveSession());
window.addEventListener('beforeunload', () => saveSession());

boot();
