// introspect.jsx — read-back (ES3). Lets an agent SEE AE state, not just write it.

function _propSnapshot(prop) {
  var snap = { name: prop.name, matchName: prop.matchName };
  try { snap.value = AEB.jsonSafe(prop.value); } catch (e) {}
  try { snap.numKeys = prop.numKeys; } catch (e) {}
  // Report the expression whether or not it is enabled -- a disabled
  // expression is still the thing a caller wants to read and edit.
  try {
    if (prop.canSetExpression) {
      snap.expressionEnabled = prop.expressionEnabled;
      if (prop.expression) snap.expression = prop.expression;
    }
  } catch (e) {}
  if (snap.numKeys && snap.numKeys > 0) {
    snap.keys = [];
    for (var k = 1; k <= snap.numKeys; k++) {
      try {
        snap.keys.push({ index: k, time: prop.keyTime(k), value: AEB.jsonSafe(prop.keyValue(k)) });
      } catch (e) {}
    }
  }
  return snap;
}

COMMANDS.getProperty = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var prop = AEB.resolveProperty(layer, p.property);
  return _propSnapshot(prop);
};

// Recursively summarize a property group (bounded depth).
function _groupSummary(group, depth) {
  var out = [];
  if (depth < 0) return out;
  for (var i = 1; i <= group.numProperties; i++) {
    var pr = group.property(i);
    var node = { name: pr.name, matchName: pr.matchName };
    if (pr.numProperties !== undefined && pr.numProperties > 0 && depth > 0) {
      node.children = _groupSummary(pr, depth - 1);
    } else {
      try { node.value = AEB.jsonSafe(pr.value, 2); } catch (e) {}
      try { if (pr.numKeys) node.numKeys = pr.numKeys; } catch (e) {}
      try {
        if (pr.canSetExpression && pr.expression) {
          node.expression = pr.expression;
          node.expressionEnabled = pr.expressionEnabled;
        }
      } catch (e) {}
    }
    out.push(node);
  }
  return out;
}

COMMANDS.getLayerDetails = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var info = AEB.layerInfo(layer);
  info.blendingMode = String(layer.blendingMode);
  try { info.parent = layer.parent ? layer.parent.name : null; } catch (e) {}
  // flags
  info.flags = {};
  try { info.flags.motionBlur = layer.motionBlur; } catch (e) {}
  try { info.flags.threeDLayer = layer.threeDLayer; } catch (e) {}
  try { info.flags.adjustmentLayer = layer.adjustmentLayer; } catch (e) {}
  try { info.flags.guideLayer = layer.guideLayer; } catch (e) {}
  try { info.flags.collapseTransformation = layer.collapseTransformation; } catch (e) {}
  try { info.flags.solo = layer.solo; } catch (e) {}
  try { info.flags.shy = layer.shy; } catch (e) {}
  try { info.flags.locked = layer.locked; } catch (e) {}
  info.threeDLayer = info.flags.threeDLayer;
  // transform snapshot
  var tr = layer.property("Transform");
  info.transform = {};
  var names = ["Anchor Point", "Position", "Scale", "Rotation", "Opacity"];
  for (var n = 0; n < names.length; n++) {
    try { info.transform[names[n]] = AEB.jsonSafe(tr.property(names[n]).value); } catch (e) {}
  }
  // effects
  info.effects = [];
  var fx = AEB.effectsGroup(layer);
  if (fx) for (var i = 1; i <= fx.numProperties; i++) {
    info.effects.push({ index: i, name: fx.property(i).name, matchName: fx.property(i).matchName });
  }
  if (p.deep) info.tree = _groupSummary(layer, (p.depth !== undefined) ? p.depth : 2);
  return info;
};

COMMANDS.getCompDetails = function (p) {
  var comp = AEB.requireComp(p);
  var layers = [];
  for (var i = 1; i <= comp.numLayers; i++) layers.push(AEB.layerInfo(comp.layer(i)));
  return {
    id: comp.id, name: comp.name, width: comp.width, height: comp.height,
    duration: comp.duration, frameRate: comp.frameRate,
    pixelAspect: comp.pixelAspect, bgColor: comp.bgColor,
    workAreaStart: comp.workAreaStart, workAreaDuration: comp.workAreaDuration,
    numLayers: comp.numLayers, layers: layers
  };
};

COMMANDS.getProjectItems = function () {
  var out = [], proj = app.project;
  for (var i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    var node = { id: it.id, name: it.name, typeName: it.typeName };
    try { node.width = it.width; node.height = it.height; } catch (e) {}
    try { node.duration = it.duration; } catch (e) {}
    out.push(node);
  }
  return out;
};
