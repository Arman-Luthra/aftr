// comp.jsx — composition-level commands (ES3).

COMMANDS.listComps = function () {
  var result = [];
  var p = app.project;
  for (var i = 1; i <= p.numItems; i++) {
    var item = p.item(i);
    if (item instanceof CompItem) {
      result.push({
        id: item.id,
        name: item.name,
        width: item.width,
        height: item.height,
        duration: item.duration,
        frameRate: item.frameRate
      });
    }
  }
  return result;
};

COMMANDS.createComp = function (p) {
  if (!p.name) throw new Error("name is required");
  var w = p.width || 1920;
  var h = p.height || 1080;
  var dur = p.duration || 10;
  var fps = p.frameRate || 30;

  return AEB.undo("aftr: createComp", function () {
    var comp = app.project.items.addComp(p.name, w, h, 1, dur, fps);
    return { compId: comp.id, name: comp.name };
  });
};

COMMANDS.setCompSettings = function (p) {
  var comp = AEB.requireComp(p);
  return AEB.undo("aftr: setCompSettings", function () {
    if (p.name !== undefined) comp.name = p.name;
    if (p.width !== undefined) comp.width = p.width;
    if (p.height !== undefined) comp.height = p.height;
    if (p.pixelAspect !== undefined) comp.pixelAspect = p.pixelAspect;
    if (p.duration !== undefined) comp.duration = p.duration;
    if (p.frameRate !== undefined) comp.frameRate = p.frameRate;
    if (p.bgColor !== undefined) comp.bgColor = AEB.normColor(p.bgColor);
    if (p.motionBlur !== undefined) comp.motionBlur = !!p.motionBlur;
    if (p.workAreaStart !== undefined) comp.workAreaStart = p.workAreaStart;
    if (p.workAreaDuration !== undefined) comp.workAreaDuration = p.workAreaDuration;
    if (p.resolutionFactor !== undefined) comp.resolutionFactor = p.resolutionFactor;
    return { ok: true, id: comp.id, name: comp.name };
  });
};

COMMANDS.addCompMarker = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(p.time !== undefined, "time is required");
  return AEB.undo("aftr: addCompMarker", function () {
    var mv = new MarkerValue(p.comment || "");
    if (p.duration !== undefined) mv.duration = p.duration;
    if (p.chapter) mv.chapter = p.chapter;
    if (p.label !== undefined) { try { mv.label = p.label; } catch (e) {} }
    comp.markerProperty.setValueAtTime(p.time, mv);
    return { ok: true };
  });
};
