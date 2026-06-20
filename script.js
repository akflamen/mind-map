/* ============================================================
   MIND MAP — vanilla JS, no build step, no external framework.
   Everything below is organised into clearly labelled sections
   so you can find your way around in VS Code.
   ============================================================ */

/* ---------- Constants ---------- */
const STORAGE_KEY   = 'mindmap_data_v1';
const CANVAS_SIZE    = 6000;          // virtual canvas is 6000x6000px
const DEFAULT_COLOR  = '#fff3b0';
const DEFAULT_HINT   = 'Scroll to zoom · Drag empty space or two-finger swipe to pan · Double-tap/click a note to branch · Tap a note then 🔗 to link';

/* ---------- App state ---------- */
let nodes = [];              // [{ id, x, y, text, color }]
let edges = [];              // [{ id, from, to }]
let nodeElements = {};       // id -> DOM element

let selectedNodeId = null;
let isEditingNodeId = null;
let linkSourceId = null;

let panX = 0, panY = 0, zoom = 1;

// Pointer-based gesture state (covers mouse, touch, and pen uniformly)
let activePointers = new Map();   // pointerId -> { x, y }
let gestureMode = null;           // null | 'pan' | 'node' | 'pinch'
let dragNodeId = null;
let dragStartX = 0, dragStartY = 0, dragOrigX = 0, dragOrigY = 0;
let panStartX = 0, panStartY = 0, panOrigX = 0, panOrigY = 0;
let pinchStartDist = 0, pinchStartZoom = 1;
let pinchAnchorContentX = 0, pinchAnchorContentY = 0;
let lastTapTime = 0, lastTapTargetId = null; // manual double-tap/double-click detection

let saveTimer = null;

/* ---------- DOM refs (filled in cacheDom) ---------- */
let appEl, viewportEl, canvasEl, edgesLayerEl, nodesLayerEl;
let hintEl, zoomIndicatorEl, zoomSliderEl, nodeToolbarEl, fileInputEl;

function cacheDom() {
  appEl           = document.getElementById('app');
  viewportEl      = document.getElementById('viewport');
  canvasEl        = document.getElementById('canvas');
  edgesLayerEl    = document.getElementById('edges-layer');
  nodesLayerEl    = document.getElementById('nodes-layer');
  hintEl          = document.getElementById('hint');
  zoomIndicatorEl = document.getElementById('zoom-indicator');
  zoomSliderEl    = document.getElementById('zoom-slider');
  nodeToolbarEl   = document.getElementById('node-toolbar');
  fileInputEl     = document.getElementById('file-input');
}

function genId() {
  return 'n' + Math.random().toString(36).slice(2, 9);
}

/* ============================================================
   PERSISTENCE — autosave to the browser, plus save/open files
   ============================================================ */

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToLocalStorage, 400);
}

function saveToLocalStorage() {
  const data = { nodes, edges, pan: { x: panX, y: panY }, zoom };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Could not autosave mind map:', err);
  }
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.nodes)) return false;
    nodes = data.nodes;
    edges = Array.isArray(data.edges) ? data.edges : [];
    panX = (data.pan && typeof data.pan.x === 'number') ? data.pan.x : 0;
    panY = (data.pan && typeof data.pan.y === 'number') ? data.pan.y : 0;
    zoom = typeof data.zoom === 'number' ? data.zoom : 1;
    return true;
  } catch (err) {
    console.warn('Could not load saved mind map:', err);
    return false;
  }
}

function saveToFile() {
  const data = { nodes, edges, pan: { x: panX, y: panY }, zoom };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `mindmap-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleFileOpen(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.nodes)) throw new Error('Missing "nodes" array');
      nodes = data.nodes;
      edges = Array.isArray(data.edges) ? data.edges : [];
      panX = (data.pan && typeof data.pan.x === 'number') ? data.pan.x : panX;
      panY = (data.pan && typeof data.pan.y === 'number') ? data.pan.y : panY;
      zoom = typeof data.zoom === 'number' ? data.zoom : zoom;
      selectNode(null);
      renderAll();
      scheduleSave();
    } catch (err) {
      alert("That file doesn't look like a valid mind map file.");
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // allow opening the same file again later
}

async function exportImage() {
  try {
    const shot = await html2canvas(viewportEl, { backgroundColor: '#181b24' });
    shot.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mindmap.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  } catch (err) {
    alert('Could not export an image: ' + err.message);
  }
}

function clearAll() {
  if (!confirm('Erase the whole map and start over? This cannot be undone.')) return;
  const root = { id: genId(), x: 2900, y: 2950, text: 'Central idea', color: DEFAULT_COLOR };
  nodes = [root];
  edges = [];
  selectNode(null);
  renderAll();
  resetView();
  scheduleSave();
}

/* ============================================================
   RENDERING
   ============================================================ */

function applyTransform() {
  canvasEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

function updateZoomIndicator() {
  zoomIndicatorEl.textContent = Math.round(zoom * 100) + '%';
  if (zoomSliderEl) zoomSliderEl.value = Math.round(zoom * 100);
}

function renderAll() {
  nodesLayerEl.innerHTML = '';
  nodeElements = {};
  nodes.forEach(renderNode);
  renderEdges();
  applyTransform();
  updateZoomIndicator();
}

function renderNode(node) {
  const el = document.createElement('div');
  el.className = 'node';
  el.dataset.id = node.id;
  el.style.left = node.x + 'px';
  el.style.top = node.y + 'px';
  el.style.background = node.color || DEFAULT_COLOR;

  const text = document.createElement('div');
  text.className = 'node-text';
  text.textContent = node.text || '';
  text.spellcheck = false;

  const fold = document.createElement('div');
  fold.className = 'node-fold';

  el.appendChild(text);
  el.appendChild(fold);
  nodesLayerEl.appendChild(el);
  nodeElements[node.id] = el;

  if (node.id === selectedNodeId) el.classList.add('selected');

  attachNodeEvents(el, node, text);
}

function renderEdges() {
  edgesLayerEl.innerHTML = '';
  edges.forEach((edge) => {
    const elA = nodeElements[edge.from];
    const elB = nodeElements[edge.to];
    const nodeA = nodes.find((n) => n.id === edge.from);
    const nodeB = nodes.find((n) => n.id === edge.to);
    if (!elA || !elB || !nodeA || !nodeB) return;

    const x1 = nodeA.x + elA.offsetWidth / 2;
    const y1 = nodeA.y + elA.offsetHeight / 2;
    const x2 = nodeB.x + elB.offsetWidth / 2;
    const y2 = nodeB.y + elB.offsetHeight / 2;
    const dx = (x2 - x1) * 0.5;
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const visible = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visible.setAttribute('d', d);
    visible.setAttribute('class', 'edge-line');

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', d);
    hit.setAttribute('class', 'edge-hit');
    hit.addEventListener('mousedown', (e) => e.stopPropagation());
    hit.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteEdge(edge.id);
    });

    g.appendChild(visible);
    g.appendChild(hit);
    edgesLayerEl.appendChild(g);
  });
}

/* ============================================================
   NODE + EDGE OPERATIONS
   ============================================================ */

function createNode(x, y, text) {
  const node = { id: genId(), x, y, text: text || '', color: DEFAULT_COLOR };
  nodes.push(node);
  renderNode(node);
  renderEdges();
  scheduleSave();
  return node;
}

function deleteNode(id) {
  if (!confirm('Delete this note and its connections?')) return;
  nodes = nodes.filter((n) => n.id !== id);
  edges = edges.filter((e) => e.from !== id && e.to !== id);
  const el = nodeElements[id];
  if (el) el.remove();
  delete nodeElements[id];
  if (selectedNodeId === id) selectNode(null);
  renderEdges();
  scheduleSave();
}

function addEdge(fromId, toId) {
  if (fromId === toId) return;
  const exists = edges.some(
    (e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
  );
  if (exists) return;
  edges.push({ id: genId(), from: fromId, to: toId });
  renderEdges();
  scheduleSave();
}

function deleteEdge(id) {
  edges = edges.filter((e) => e.id !== id);
  renderEdges();
  scheduleSave();
}

/* ============================================================
   SELECTION + EDITING
   ============================================================ */

function selectNode(id) {
  if (selectedNodeId && nodeElements[selectedNodeId]) {
    nodeElements[selectedNodeId].classList.remove('selected');
  }
  selectedNodeId = id;
  if (id) {
    nodeElements[id].classList.add('selected');
    showNodeToolbar(id);
  } else {
    hideNodeToolbar();
  }
}

function showNodeToolbar(id) {
  const el = nodeElements[id];
  if (!el) return;
  const rect = el.getBoundingClientRect();
  nodeToolbarEl.classList.remove('hidden');
  nodeToolbarEl.style.left = rect.left + rect.width / 2 + 'px';
  nodeToolbarEl.style.top = rect.top - 12 + 'px';
}

function hideNodeToolbar() {
  nodeToolbarEl.classList.add('hidden');
}

function enterEditMode(id) {
  const el = nodeElements[id];
  if (!el) return;
  const textEl = el.querySelector('.node-text');
  textEl.contentEditable = 'true';
  el.classList.add('editing');
  isEditingNodeId = id;
  textEl.focus();
  const range = document.createRange();
  range.selectNodeContents(textEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function finishEditing(id, textEl) {
  const el = nodeElements[id];
  if (el) el.classList.remove('editing');
  textEl.contentEditable = 'false';
  const node = nodes.find((n) => n.id === id);
  if (node) {
    const newText = textEl.textContent.trim() || 'Untitled idea';
    node.text = newText;
    textEl.textContent = newText;
  }
  isEditingNodeId = null;
  renderEdges();
  scheduleSave();
}

/* ============================================================
   LINK MODE (connect any two notes)
   ============================================================ */

function enterLinkMode(id) {
  linkSourceId = id;
  appEl.classList.add('linking');
  hintEl.textContent = 'Tap or click another note to connect it — press Esc to cancel.';
  const el = nodeElements[id];
  if (el) el.classList.add('link-source');
}

function exitLinkMode() {
  if (linkSourceId) {
    const el = nodeElements[linkSourceId];
    if (el) el.classList.remove('link-source');
  }
  linkSourceId = null;
  appEl.classList.remove('linking');
  hintEl.textContent = DEFAULT_HINT;
}

/* ============================================================
   PER-NODE EVENT HANDLING (drag, select, edit, branch)
   ============================================================ */

function attachNodeEvents(el, node, textEl) {
  el.addEventListener('pointerdown', (e) => {
    if (textEl.isContentEditable) return; // let normal text editing/cursor placement happen
    e.stopPropagation();
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size >= 2) {
      startPinch();
      return;
    }

    if (linkSourceId) {
      e.preventDefault();
      if (node.id !== linkSourceId) addEdge(linkSourceId, node.id);
      exitLinkMode();
      activePointers.delete(e.pointerId);
      return;
    }

    selectNode(node.id);
    gestureMode = 'node';
    dragNodeId = node.id;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOrigX = node.x;
    dragOrigY = node.y;
    e.preventDefault();
  });

  textEl.addEventListener('blur', () => finishEditing(node.id, textEl));
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      textEl.blur();
    }
  });
}

// A tap (mouse click or touch tap) that barely moved finishes here. A second
// one landing on the same note within 250ms counts as a "double" and branches
// off a new connected note — this is the touch equivalent of double-click.
function handleNodeTap(nodeId) {
  const now = Date.now();
  if (lastTapTargetId === nodeId && now - lastTapTime < 250) {
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      const childCount = edges.filter((ed) => ed.from === node.id).length;
      const child = createNode(node.x + 260, node.y + childCount * 90 - 40, '');
      addEdge(node.id, child.id);
      selectNode(child.id);
      enterEditMode(child.id);
    }
    lastTapTime = 0;
    lastTapTargetId = null;
  } else {
    lastTapTime = now;
    lastTapTargetId = nodeId;
  }
}

/* ============================================================
   CANVAS-LEVEL INTERACTION (pan, zoom, background clicks)
   ============================================================ */

function contentPointFromEvent(e) {
  const rect = viewportEl.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  return {
    x: (mouseX - panX) / zoom,
    y: (mouseY - panY) / zoom,
  };
}

function onBackgroundPointerDown(e) {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size >= 2) {
    startPinch();
    return;
  }

  if (linkSourceId) {
    exitLinkMode();
    activePointers.delete(e.pointerId);
    return;
  }

  selectNode(null);
  gestureMode = 'pan';
  panStartX = e.clientX;
  panStartY = e.clientY;
  panOrigX = panX;
  panOrigY = panY;
  viewportEl.classList.add('panning');
}

// A tap on empty space that barely moved finishes here. A second one inside
// 250ms drops a brand-new note right where you tapped.
function handleBackgroundTap(e) {
  const now = Date.now();
  if (lastTapTargetId === 'background' && now - lastTapTime < 250) {
    const p = contentPointFromEvent(e);
    const node = createNode(p.x - 70, p.y - 24, '');
    selectNode(node.id);
    enterEditMode(node.id);
    lastTapTime = 0;
    lastTapTargetId = null;
  } else {
    lastTapTime = now;
    lastTapTargetId = 'background';
  }
}

// Two pointers down (real multi-touch — a mouse never reports this) means a
// pinch. We record the starting distance, zoom, and the content point under
// the midpoint of the two fingers so that point stays fixed as you pinch.
function startPinch() {
  gestureMode = 'pinch';
  viewportEl.classList.remove('panning');
  const [p1, p2] = Array.from(activePointers.values());
  pinchStartDist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
  pinchStartZoom = zoom;
  const rect = viewportEl.getBoundingClientRect();
  const midX = (p1.x + p2.x) / 2 - rect.left;
  const midY = (p1.y + p2.y) / 2 - rect.top;
  pinchAnchorContentX = (midX - panX) / zoom;
  pinchAnchorContentY = (midY - panY) / zoom;
}

function onWheel(e) {
  e.preventDefault();
  
  // Trackpad two-finger swipe has BOTH deltaX and deltaY.
  // Regular scroll wheel has only deltaY. This is the clearest way to distinguish.
  if (Math.abs(e.deltaX) > 0) {
    // Trackpad swipe (horizontal + vertical) — pan the map
    panX -= e.deltaX;
    panY -= e.deltaY;
  } else {
    // Regular scroll wheel (only vertical) — zoom
    const rect = viewportEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const contentX = (mouseX - panX) / zoom;
    const contentY = (mouseY - panY) / zoom;
    const rawFactor = Math.exp(-e.deltaY * 0.0008);
    const factor = Math.max(0.92, Math.min(1.08, rawFactor));
    const newZoom = Math.min(2.5, Math.max(0.25, zoom * factor));
    panX = mouseX - contentX * newZoom;
    panY = mouseY - contentY * newZoom;
    zoom = newZoom;
  }
  
  applyTransform();
  updateZoomIndicator();
  if (selectedNodeId) showNodeToolbar(selectedNodeId);
}

function setZoomFromSlider(percent) {
  const newZoom = Math.min(2.5, Math.max(0.25, percent / 100));
  const rect = viewportEl.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const contentX = (centerX - panX) / zoom;
  const contentY = (centerY - panY) / zoom;
  zoom = newZoom;
  panX = centerX - contentX * zoom;
  panY = centerY - contentY * zoom;
  applyTransform();
  updateZoomIndicator();
  if (selectedNodeId) showNodeToolbar(selectedNodeId);
  scheduleSave();
}

function resetView() {
  if (nodes.length === 0) {
    panX = 0; panY = 0; zoom = 1;
    applyTransform();
    updateZoomIndicator();
    return;
  }
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2 + 100;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2 + 30;
  const rect = viewportEl.getBoundingClientRect();
  zoom = 1;
  panX = rect.width / 2 - centerX * zoom;
  panY = rect.height / 2 - centerY * zoom;
  applyTransform();
  updateZoomIndicator();
  scheduleSave();
}

/* ============================================================
   GLOBAL EVENT BINDING
   ============================================================ */

function bindGlobalEvents() {
  // Top toolbar buttons
  document.getElementById('btn-add').addEventListener('click', () => {
    const rect = viewportEl.getBoundingClientRect();
    const contentX = (rect.width / 2 - panX) / zoom;
    const contentY = (rect.height / 2 - panY) / zoom;
    const node = createNode(contentX - 70, contentY - 24, '');
    selectNode(node.id);
    enterEditMode(node.id);
  });
  document.getElementById('btn-save').addEventListener('click', saveToFile);
  document.getElementById('btn-open').addEventListener('click', () => fileInputEl.click());
  fileInputEl.addEventListener('change', handleFileOpen);
  document.getElementById('btn-export').addEventListener('click', exportImage);
  document.getElementById('btn-reset-view').addEventListener('click', resetView);
  document.getElementById('btn-clear').addEventListener('click', clearAll);
  zoomSliderEl.addEventListener('input', () => setZoomFromSlider(Number(zoomSliderEl.value)));

  // Floating per-node toolbar
  nodeToolbarEl.querySelectorAll('.color-dot').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!selectedNodeId) return;
      const color = btn.dataset.color;
      const node = nodes.find((n) => n.id === selectedNodeId);
      if (node) node.color = color;
      nodeElements[selectedNodeId].style.background = color;
      scheduleSave();
    });
  });
  document.getElementById('ntb-edit').addEventListener('click', () => {
    if (selectedNodeId) enterEditMode(selectedNodeId);
  });
  document.getElementById('ntb-link').addEventListener('click', () => {
    if (selectedNodeId) enterLinkMode(selectedNodeId);
  });
  document.getElementById('ntb-delete').addEventListener('click', () => {
    if (selectedNodeId) deleteNode(selectedNodeId);
  });

  // Canvas interaction
  viewportEl.addEventListener('pointerdown', (e) => {
    if (e.target === viewportEl || e.target === canvasEl) onBackgroundPointerDown(e);
  });
  viewportEl.addEventListener('wheel', onWheel, { passive: false });

  document.addEventListener('pointermove', (e) => {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (gestureMode === 'pinch' && activePointers.size >= 2) {
      const [p1, p2] = Array.from(activePointers.values());
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const rect = viewportEl.getBoundingClientRect();
      const midX = (p1.x + p2.x) / 2 - rect.left;
      const midY = (p1.y + p2.y) / 2 - rect.top;
      zoom = Math.min(2.5, Math.max(0.25, pinchStartZoom * (dist / pinchStartDist)));
      panX = midX - pinchAnchorContentX * zoom;
      panY = midY - pinchAnchorContentY * zoom;
      applyTransform();
      updateZoomIndicator();
      if (selectedNodeId) showNodeToolbar(selectedNodeId);
      return;
    }

    if (gestureMode === 'node' && dragNodeId) {
      const dx = (e.clientX - dragStartX) / zoom;
      const dy = (e.clientY - dragStartY) / zoom;
      const node = nodes.find((n) => n.id === dragNodeId);
      if (!node) return;
      node.x = dragOrigX + dx;
      node.y = dragOrigY + dy;
      const el = nodeElements[dragNodeId];
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';
      renderEdges();
      if (selectedNodeId === dragNodeId) showNodeToolbar(dragNodeId);
      return;
    }

    if (gestureMode === 'pan') {
      panX = panOrigX + (e.clientX - panStartX);
      panY = panOrigY + (e.clientY - panStartY);
      applyTransform();
      if (selectedNodeId) showNodeToolbar(selectedNodeId);
    }
  });

  function endPointer(e) {
    activePointers.delete(e.pointerId);

    if (gestureMode === 'pinch') {
      if (activePointers.size === 1) {
        // Lifted one finger but one is still down — keep panning smoothly
        // from here instead of snapping back to single-pointer mode cold.
        const remaining = Array.from(activePointers.values())[0];
        gestureMode = 'pan';
        panStartX = remaining.x;
        panStartY = remaining.y;
        panOrigX = panX;
        panOrigY = panY;
      } else if (activePointers.size === 0) {
        gestureMode = null;
      }
      return;
    }

    if (gestureMode === 'node' && activePointers.size === 0) {
      const totalDist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
      if (totalDist < 8) handleNodeTap(dragNodeId);  // 250ms tap window, 8px distance tolerance
      scheduleSave();
      gestureMode = null;
      dragNodeId = null;
      return;
    }

    if (gestureMode === 'pan' && activePointers.size === 0) {
      const totalDist = Math.hypot(e.clientX - panStartX, e.clientY - panStartY);
      viewportEl.classList.remove('panning');
      if (totalDist < 8) handleBackgroundTap(e);  // 250ms tap window, 8px distance tolerance
      gestureMode = null;
    }
  }

  document.addEventListener('pointerup', endPointer);
  document.addEventListener('pointercancel', endPointer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isEditingNodeId) {
        document.activeElement.blur();
      } else if (linkSourceId) {
        exitLinkMode();
      } else if (selectedNodeId) {
        selectNode(null);
      }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && !isEditingNodeId) {
      e.preventDefault();
      deleteNode(selectedNodeId);
    }
  });

  window.addEventListener('resize', () => {
    if (selectedNodeId) showNodeToolbar(selectedNodeId);
  });
}

/* ============================================================
   INIT
   ============================================================ */

function init() {
  cacheDom();
  const loaded = loadFromLocalStorage();
  if (!loaded) {
    const root = { id: genId(), x: 2900, y: 2950, text: 'Central idea', color: DEFAULT_COLOR };
    nodes = [root];
    edges = [];
  }
  renderAll();
  if (!loaded) resetView();
  bindGlobalEvents();
}

init();
