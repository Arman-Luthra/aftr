// host.jsx — ExtendScript entry point + shared helpers for the aftr.
// ES3 only — no let/const/arrow/template-literals/JSON-native (json2 polyfills JSON).
//
// Bundle order (see panel/build/bundle-jsx.js): json2.js, host.jsx, commands/*.jsx.
// host.jsx declares COMMANDS, dispatch(), and the AEB.* helper namespace that
// every command group uses. Helpers are plain functions (hoisted), so command
// files may call them regardless of concatenation order.

var COMMANDS = {};

/**
 * dispatch(command, paramsJson) — single entry point called by the panel.
 * Always returns a JSON string: { ok:true, result } | { ok:false, error }.
 */
function dispatch(command, paramsJson) {
  try {
    var params = {};
    if (paramsJson && paramsJson.length > 0) {
      params = JSON.parse(paramsJson);
    }
    var fn = COMMANDS[command];
    if (!fn) {
      return JSON.stringify({ ok: false, error: "Unknown command: " + command });
    }
    var result = fn(params);
    return JSON.stringify({ ok: true, result: result });
  } catch (e) {
    var msg = "JSX error";
    if (e && typeof e.toString === "function") msg = e.toString();
    else if (e && e.message) msg = e.message;
    if (e && e.line) msg += " (line " + e.line + ")";
    return JSON.stringify({ ok: false, error: msg });
  }
}

// ===========================================================================
// AEB — shared helper namespace. Pure, throw-on-bad-input, return serializable.
// ===========================================================================
var AEB = {};

AEB.assert = function (cond, msg) {
  if (!cond) throw new Error(msg);
};

// --- comps -----------------------------------------------------------------
AEB.findCompById = function (id) {
  var p = app.project;
  for (var i = 1; i <= p.numItems; i++) {
    var item = p.item(i);
    if (item instanceof CompItem && item.id === id) return item;
  }
  return null;
};

AEB.findCompByName = function (name) {
  var p = app.project;
  for (var i = 1; i <= p.numItems; i++) {
    var item = p.item(i);
    if (item instanceof CompItem && item.name === name) return item;
  }
  return null;
};

// Resolve a comp from params: accepts { compId } or { compName } or { comp }.
AEB.requireComp = function (p) {
  var c = null;
  if (p.compId !== undefined && p.compId !== null) c = AEB.findCompById(p.compId);
  else if (p.compName) c = AEB.findCompByName(p.compName);
  else if (p.comp !== undefined) {
    c = (typeof p.comp === "number") ? AEB.findCompById(p.comp) : AEB.findCompByName(p.comp);
  } else {
    AEB.assert(false, "compId or compName is required");
  }
  AEB.assert(c, "Comp not found (" + (p.compId !== undefined ? "id " + p.compId : p.compName) + ")");
  return c;
};

// --- layers (address by name OR index; HLD prefers name) -------------------
AEB.resolveLayer = function (comp, ref) {
  AEB.assert(ref !== undefined && ref !== null, "layer reference (layer/layerIndex/layerName) is required");
  if (typeof ref === "number") {
    AEB.assert(ref >= 1 && ref <= comp.numLayers,
      "layerIndex " + ref + " out of range (comp has " + comp.numLayers + " layers)");
    return comp.layer(ref);
  }
  // by name
  for (var i = 1; i <= comp.numLayers; i++) {
    if (comp.layer(i).name === ref) return comp.layer(i);
  }
  throw new Error('Layer named "' + ref + '" not found');
};

// Pick the layer reference out of a params object.
// NOTE: ExtendScript (ES3) mis-parses chained ternaries (a?b:c?d:e), so use
// explicit if/else here and everywhere a 3-way choice is needed.
AEB.requireLayer = function (comp, p) {
  var ref;
  if (p.layer !== undefined && p.layer !== null) ref = p.layer;
  else if (p.layerName !== undefined && p.layerName !== null) ref = p.layerName;
  else ref = p.layerIndex;
  return AEB.resolveLayer(comp, ref);
};

AEB.layerInfo = function (layer) {
  return {
    index: layer.index,
    layerIndex: layer.index, // back-compat alias (v1 contract)
    name: layer.name,
    enabled: layer.enabled,
    startTime: layer.startTime,
    inPoint: layer.inPoint,
    outPoint: layer.outPoint,
    type: AEB.layerType(layer)
  };
};

AEB.layerType = function (layer) {
  try { if (layer instanceof TextLayer) return "text"; } catch (e) {}
  try { if (layer instanceof CameraLayer) return "camera"; } catch (e) {}
  try { if (layer instanceof LightLayer) return "light"; } catch (e) {}
  try { if (layer instanceof ShapeLayer) return "shape"; } catch (e) {}
  try { if (layer.nullLayer) return "null"; } catch (e) {}
  try { if (layer.adjustmentLayer) return "adjustment"; } catch (e) {}
  return "av";
};

// --- properties ------------------------------------------------------------
// Map friendly transform names to the real Transform sub-property names.
AEB.TRANSFORM = {
  position: "Position", anchorPoint: "Anchor Point", anchor: "Anchor Point",
  scale: "Scale", rotation: "Rotation", opacity: "Opacity",
  orientation: "Orientation", xrotation: "X Rotation",
  yrotation: "Y Rotation", zrotation: "Z Rotation"
};

// Resolve a property from a layer. `prop` may be:
//   - a friendly transform name: "position","scale","rotation","opacity",...
//   - an array path: ["Transform","Position"] or ["Effects","Tint","Amount to Tint"]
//   - an effect+param via {effect, param} handled by caller
AEB.resolveProperty = function (layer, prop) {
  if (prop && prop.length !== undefined && typeof prop !== "string") {
    // array path
    var cur = layer;
    for (var i = 0; i < prop.length; i++) cur = cur.property(prop[i]);
    AEB.assert(cur, "Property path not found: " + prop.join(" > "));
    return cur;
  }
  var key = String(prop).toLowerCase();
  if (AEB.TRANSFORM[key]) {
    return layer.property("Transform").property(AEB.TRANSFORM[key]);
  }
  // try a direct child by the given name
  var direct = layer.property(prop);
  AEB.assert(direct, 'Property "' + prop + '" not found on layer');
  return direct;
};

AEB.effectsGroup = function (layer) {
  return layer.property("ADBE Effect Parade");
};

// Temporal ease element count: SPATIAL properties (Position, Anchor Point) take
// exactly ONE KeyframeEase; other multidimensional props take one per dimension.
AEB.easeDims = function (prop) {
  var spatial = false;
  try { spatial = prop.isSpatial; } catch (e) {}
  if (spatial) return 1;
  var v = prop.value;
  return (v && v.length !== undefined && typeof v !== "string") ? v.length : 1;
};

AEB.makeEases = function (prop, inInf, outInf, inSpeed, outSpeed) {
  var n = AEB.easeDims(prop);
  var inA = [], outA = [];
  for (var d = 0; d < n; d++) {
    inA.push(new KeyframeEase(inSpeed || 0, inInf));
    outA.push(new KeyframeEase(outSpeed || 0, outInf));
  }
  return { inA: inA, outA: outA };
};

// --- color/time ------------------------------------------------------------
AEB.normColor = function (c) {
  if (!c) return [0.5, 0.5, 0.5];
  return [c[0], c[1], c[2]];
};

// undo wrapper. AE undo groups must not nest (AE 26 shows "Undo group mismatch"
// on the next Cmd+Z), so a call made while a group is open joins that group.
AEB._undoDepth = 0;
AEB.undo = function (name, fn) {
  var outer = AEB._undoDepth === 0;
  if (outer) app.beginUndoGroup(name);
  AEB._undoDepth++;
  try { return fn(); }
  finally { AEB._undoDepth--; if (outer) app.endUndoGroup(); }
};

// Back-compat alias used by earlier command files.
function _findComp(compId) {
  var c = AEB.findCompById(compId);
  if (!c) throw new Error("Comp with id " + compId + " not found");
  return c;
}
function _findLayer(comp, layerIndex) {
  return AEB.resolveLayer(comp, layerIndex);
}
