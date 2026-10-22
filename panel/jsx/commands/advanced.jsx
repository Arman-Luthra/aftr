// advanced.jsx — orchestration-grade tooling (ES3).

// batch — run many commands in ONE socket round-trip + ONE undo group.
// Massively cuts loop latency for the agent (N edits, 1 trip, 1 undo).
// { commands:[{command,params}], undoName?, stopOnError? }
COMMANDS.batch = function (p) {
  AEB.assert(p.commands && p.commands.length, "commands[] is required");
  var results = [];
  AEB.undo(p.undoName || "aftr: batch", function () {
    for (var i = 0; i < p.commands.length; i++) {
      var c = p.commands[i];
      try {
        var fn = COMMANDS[c.command];
        if (!fn) { results.push({ ok: false, command: c.command, error: "Unknown command: " + c.command }); if (p.stopOnError) break; continue; }
        var r = fn(c.params || {});
        results.push({ ok: true, command: c.command, result: r });
      } catch (e) {
        results.push({ ok: false, command: c.command, error: (e && e.toString) ? e.toString() : "error" });
        if (p.stopOnError) break;
      }
    }
  });
  var okCount = 0;
  for (var j = 0; j < results.length; j++) if (results[j].ok) okCount++;
  return { count: results.length, ok: okCount, failed: results.length - okCount, results: results };
};

// Set the comp work area to a time range (used to scope previews/renders).
COMMANDS.setWorkArea = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(p.start !== undefined && p.duration !== undefined, "start and duration are required");
  return AEB.undo("aftr: setWorkArea", function () {
    comp.workAreaStart = p.start;
    comp.workAreaDuration = p.duration;
    return { ok: true, start: comp.workAreaStart, duration: comp.workAreaDuration };
  });
};

// Remove every layer in a comp (optionally keep a name prefix).
COMMANDS.clearComp = function (p) {
  var comp = AEB.requireComp(p);
  return AEB.undo("aftr: clearComp", function () {
    var removed = 0;
    for (var i = comp.numLayers; i >= 1; i--) {
      if (p.keepPrefix && comp.layer(i).name.indexOf(p.keepPrefix) === 0) continue;
      comp.layer(i).remove(); removed++;
    }
    return { ok: true, removed: removed };
  });
};

COMMANDS.getCompTime = function (p) {
  var comp = AEB.requireComp(p);
  return {
    time: comp.time,
    frame: Math.round(comp.time * comp.frameRate),
    duration: comp.duration,
    frameRate: comp.frameRate,
    displayStartTime: comp.displayStartTime,
    workAreaStart: comp.workAreaStart,
    workAreaDuration: comp.workAreaDuration
  };
};

// Duplicate a comp (deep copy of the comp item).
COMMANDS.duplicateComp = function (p) {
  var comp = AEB.requireComp(p);
  return AEB.undo("aftr: duplicateComp", function () {
    var dup = comp.duplicate();
    if (p.name) dup.name = p.name;
    return { compId: dup.id, name: dup.name };
  });
};

// Align/position a layer within the comp (center, left, right, top, bottom).
COMMANDS.alignLayer = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: alignLayer", function () {
    var pos = layer.property("Transform").property("Position");
    var v = pos.value;
    var x = v[0], y = v[1];
    var a = String(p.align || "center").toLowerCase();
    if (a === "center") { x = comp.width / 2; y = comp.height / 2; }
    else if (a === "hcenter") x = comp.width / 2;
    else if (a === "vcenter") y = comp.height / 2;
    else if (a === "left") x = comp.width * 0.0 + (p.margin || 0);
    else if (a === "right") x = comp.width - (p.margin || 0);
    else if (a === "top") y = 0 + (p.margin || 0);
    else if (a === "bottom") y = comp.height - (p.margin || 0);
    pos.setValue([x, y]);
    return { ok: true, position: pos.value };
  });
};

// Sequence selected/named layers in time (offset each by `step` seconds).
COMMANDS.sequenceLayers = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(p.layers && p.layers.length, "layers[] is required");
  var step = (p.step !== undefined) ? p.step : 1;
  var start = (p.start !== undefined) ? p.start : 0;
  return AEB.undo("aftr: sequenceLayers", function () {
    for (var i = 0; i < p.layers.length; i++) {
      var L = AEB.resolveLayer(comp, p.layers[i]);
      L.startTime = start + i * step;
    }
    return { ok: true, count: p.layers.length };
  });
};
