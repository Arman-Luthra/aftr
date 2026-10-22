// mockAeDom.js — a mock After Effects scripting DOM for headless testing.
//
// This provides a minimal but functionally correct simulation of the AE
// scripting objects that the JSX command layer uses: app, project, CompItem,
// layers (AVLayer, TextLayer), transform properties, and the render queue.
//
// The simulator's jsxRunner loads the real bundled JSX and executes dispatch()
// against this mock DOM, so the same code paths that run in AE run here.

// ---------------------------------------------------------------------------
// Property value holder — simulates AE property objects (Position, Opacity, etc.)
// ---------------------------------------------------------------------------
class MockProperty {
  constructor(name, initialValue) {
    this.name = name;
    this._value = initialValue;
  }
  get value() { return this._value; }
  setValue(v) { this._value = v; }
  setValueAtTime(_t, v) { this._value = v; this._keys = (this._keys || 0) + 1; }
  get numKeys() { return this._keys || 0; }
  set expression(e) { this._expr = e; }
  get expression() { return this._expr || ''; }
  get expressionEnabled() { return !!this._expr; }
}

// Minimal effects support so addEffect / listInstalledEffects / findEffectMatchName
// work headlessly. A small known display-name -> matchName map.
const _MOCK_EFFECTS = {
  'Tint': 'ADBE Tint', 'Glow': 'ADBE Glo2', 'Gaussian Blur': 'ADBE Gaussian Blur 2',
  'Fractal Noise': 'ADBE Fractal Noise', 'CC Toner': 'CC Toner', 'Wave Warp': 'ADBE Wave Warp',
  'Turbulent Displace': 'ADBE Turbulent Displace', 'Lumetri Color': 'ADBE Lumetri',
  'Curves': 'ADBE CurvesCustom', 'Fill': 'ADBE Fill',
  // third-party (Plugin Everything), captured live via introspectEffect
  'Deep Glow 2': 'PEDG2', 'Shadow Studio 3': 'PESS3',
};
function _lookupEffect(x) {
  if (_MOCK_EFFECTS[x]) return _MOCK_EFFECTS[x];
  for (const k in _MOCK_EFFECTS) if (_MOCK_EFFECTS[k] === x) return x;
  return null;
}
class MockEffect {
  constructor(name, matchName, group) { this.name = name; this.matchName = matchName; this._group = group; this.propertyIndex = group._items.length + 1; this._params = {}; }
  remove() { const i = this._group._items.indexOf(this); if (i >= 0) this._group._items.splice(i, 1); }
  property(ref) { const k = String(ref); if (!this._params[k]) this._params[k] = new MockProperty(k, 0); return this._params[k]; }
  get numProperties() { return 0; }
}
class MockEffectsGroup {
  constructor() { this._items = []; }
  get numProperties() { return this._items.length; }
  canAddProperty(x) { return !!_lookupEffect(x); }
  addProperty(x) { const mn = _lookupEffect(x); if (!mn) throw new Error('cannot add property ' + x); const e = new MockEffect(x, mn, this); this._items.push(e); return e; }
  property(ref) { if (typeof ref === 'number') return this._items[ref - 1] || null; for (const e of this._items) if (e.name === ref || e.matchName === ref) return e; return null; }
}

// ---------------------------------------------------------------------------
// Mock Layer
// ---------------------------------------------------------------------------
class MockLayer {
  constructor(comp, index, opts = {}) {
    this.index = index;
    this.name = opts.name || `Layer ${index}`;
    this.enabled = true;
    this.startTime = 0;
    this.inPoint = 0;
    this.outPoint = comp ? comp.duration : 0;
    this._comp = comp;
    this._type = opts.type || 'av'; // 'av' | 'text' | 'solid'

    // Transform properties
    this._transform = {
      Position: new MockProperty('Position', opts.position || [comp.width / 2, comp.height / 2]),
      Scale: new MockProperty('Scale', [100, 100, 100]),
      Rotation: new MockProperty('Rotation', 0),
      Opacity: new MockProperty('Opacity', 100),
    };

    // Source Text (for text layers)
    this._sourceText = null;
    if (this._type === 'text') {
      this._sourceText = new MockProperty('Source Text', {
        text: opts.text || '',
        fontSize: opts.fontSize || 36,
      });
    }
  }

  // Simulate AE's layer.property(name) accessor. Mirrors real AE: property()
  // only resolves DIRECT children. Transform leaves (Position/Scale/Rotation/
  // Opacity) are NOT direct children — they must be reached via the Transform
  // group, e.g. layer.property("Transform").property("Position"). Returning
  // null for the leaf names here is deliberate, so JSX that takes the wrong
  // path fails in the simulator exactly as it would in After Effects.
  property(name) {
    if (name === 'Transform') {
      return { property: (n) => this._transform[n] || null };
    }
    if (name === 'Source Text' && this._sourceText) {
      return this._sourceText;
    }
    if (name === 'ADBE Effect Parade') {
      if (!this._effects) this._effects = new MockEffectsGroup();
      return this._effects;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mock Layers collection
// ---------------------------------------------------------------------------
class MockLayers {
  constructor(comp) {
    this._comp = comp;
    this._items = [];
  }

  get length() { return this._items.length; }

  addSolid(color, name, width, height, pixelAspect) {
    const idx = this._items.length + 1;
    const layer = new MockLayer(this._comp, idx, {
      name: name || 'Solid',
      type: 'solid',
    });
    this._items.unshift(layer); // AE adds layers at top (index 1)
    this._reindex();
    return layer;
  }

  addText(text) {
    const idx = this._items.length + 1;
    const layer = new MockLayer(this._comp, idx, {
      name: text || 'Text',
      type: 'text',
      text: text,
    });
    this._items.unshift(layer);
    this._reindex();
    return layer;
  }

  _reindex() {
    for (let i = 0; i < this._items.length; i++) {
      this._items[i].index = i + 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Mock CompItem
// ---------------------------------------------------------------------------
let _nextId = 1;

class MockCompItem {
  constructor(name, width, height, pixelAspect, duration, frameRate) {
    this.id = _nextId++;
    this.name = name;
    this.width = width;
    this.height = height;
    this.pixelAspect = pixelAspect || 1;
    this.duration = duration;
    this.frameRate = frameRate;
    this.layers = new MockLayers(this);
    this.numLayers = 0; // updated dynamically
    this.typeName = 'Composition';
  }

  get numLayers() { return this.layers._items.length; }
  set numLayers(_v) { /* ignore — computed */ }

  layer(indexOrName) {
    if (typeof indexOrName === 'number') {
      return this.layers._items[indexOrName - 1] || null;
    }
    return this.layers._items.find((l) => l.name === indexOrName) || null;
  }

  remove() {
    if (this._project) {
      const i = this._project._items.indexOf(this);
      if (i >= 0) this._project._items.splice(i, 1);
    }
  }
}

// Make instanceof checks work in the JSX sandbox.
// The JSX code uses `item instanceof CompItem`.
globalThis.CompItem = MockCompItem;

// ---------------------------------------------------------------------------
// Mock Render Queue
// ---------------------------------------------------------------------------
class MockRenderQueueItem {
  constructor(comp) {
    this._comp = comp;
    this._outputModules = [new MockOutputModule()];
    this._template = null;
  }
  outputModule(idx) { return this._outputModules[idx - 1]; }
  applyTemplate(name) { this._template = name; }
}

class MockOutputModule {
  constructor() {
    this.file = null;
    this._template = null;
  }
  applyTemplate(name) { this._template = name; }
}

class MockRenderQueue {
  constructor() {
    this.items = new MockRenderQueueItems();
    this._rendering = false;
  }
  render() {
    this._rendering = true;
    // Simulate instant render (synchronous for testing).
    this._rendering = false;
  }
}

class MockRenderQueueItems {
  constructor() { this._items = []; }
  add(comp) {
    const rqi = new MockRenderQueueItem(comp);
    this._items.push(rqi);
    return rqi;
  }
  get length() { return this._items.length; }
}

// ---------------------------------------------------------------------------
// Mock Project
// ---------------------------------------------------------------------------
class MockProject {
  constructor() {
    this._items = [];
    this.activeItem = null;
    this.file = null; // null = "Untitled"
    this.renderQueue = new MockRenderQueue();
  }

  get numItems() { return this._items.length; }

  item(index) {
    return this._items[index - 1] || null;
  }

  get items() {
    const self = this;
    return {
      addComp(name, width, height, pixelAspect, duration, frameRate) {
        const comp = new MockCompItem(name, width, height, pixelAspect, duration, frameRate);
        comp._project = self;
        self._items.push(comp);
        return comp;
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Mock File (for render outputPath and project.file)
// ---------------------------------------------------------------------------
class MockFile {
  constructor(path) {
    this.fsName = path;
    this.name = path.split(/[\\/]/).pop();
  }
}

// ---------------------------------------------------------------------------
// Mock app
// ---------------------------------------------------------------------------
function _mockFonts() {
  const names = ['ArialMT', 'Arial-BoldMT', 'TimesNewRomanPSMT', 'Helvetica', 'Verdana-Bold', 'Georgia', 'CourierNewPSMT', 'Impact'];
  return names.map((n) => ({ toString: () => n }));
}

class MockApp {
  constructor() {
    this.version = '25.0.0'; // simulated AE version
    this.buildName = '25.0.0 (sim)';
    this.memoryInUse = 512 * 1048576;
    this.fonts = { allFonts: _mockFonts() };
    this.project = new MockProject();
    this._undoDepth = 0;
    this._undoMaxDepth = 0; // real AE mis-handles nested groups; tests assert this stays <= 1
  }

  beginUndoGroup(name) {
    this._undoDepth++;
    if (this._undoDepth > this._undoMaxDepth) this._undoMaxDepth = this._undoDepth;
  }

  endUndoGroup() {
    if (this._undoDepth > 0) this._undoDepth--;
  }

  // Reset state between test runs.
  reset() {
    this.project = new MockProject();
    this._undoDepth = 0;
    this._undoMaxDepth = 0;
    _nextId = 1;
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function createMockAeDom() {
  const mockApp = new MockApp();
  return {
    app: mockApp,
    File: MockFile,
    CompItem: MockCompItem,
    reset() { mockApp.reset(); },
  };
}
