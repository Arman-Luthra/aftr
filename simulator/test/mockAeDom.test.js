// mockAeDom.test.js — tests for the mock AE DOM + JSX runner.
// Validates that the mock DOM correctly simulates AE's scripting API,
// and that all JSX commands produce correct results.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createJsxRunner } from '../src/jsxRunner.js';

let runner;

describe('JSX Runner + Mock AE DOM', () => {
  beforeEach(() => {
    runner = createJsxRunner();
  });

  describe('ping', () => {
    it('returns pong and ae version', () => {
      const r = runner.dispatch('ping');
      assert.equal(r.ok, true);
      assert.equal(r.result.pong, true);
      assert.ok(r.result.ae, 'Expected ae version string');
    });
  });

  describe('getProjectInfo', () => {
    it('returns Untitled for empty project', () => {
      const r = runner.dispatch('getProjectInfo');
      assert.equal(r.ok, true);
      assert.equal(r.result.name, 'Untitled');
      assert.equal(r.result.path, null);
      assert.equal(r.result.numItems, 0);
      assert.equal(r.result.activeComp, null);
    });

    it('reflects items after createComp', () => {
      runner.dispatch('createComp', { name: 'A' });
      runner.dispatch('createComp', { name: 'B' });
      const r = runner.dispatch('getProjectInfo');
      assert.equal(r.result.numItems, 2);
    });
  });

  describe('createComp', () => {
    it('creates a comp with given params', () => {
      const r = runner.dispatch('createComp', {
        name: 'Test', width: 1280, height: 720, duration: 5, frameRate: 24,
      });
      assert.equal(r.ok, true);
      assert.ok(r.result.compId, 'Expected compId');
      assert.equal(r.result.name, 'Test');
    });

    it('uses defaults for optional params', () => {
      const r = runner.dispatch('createComp', { name: 'Default' });
      assert.equal(r.ok, true);

      // Verify via listComps
      const list = runner.dispatch('listComps');
      const comp = list.result.find((c) => c.name === 'Default');
      assert.ok(comp, 'Comp not found in listComps');
      assert.equal(comp.width, 1920);
      assert.equal(comp.height, 1080);
      assert.equal(comp.duration, 10);
      assert.equal(comp.frameRate, 30);
    });

    it('fails without name', () => {
      const r = runner.dispatch('createComp', {});
      assert.equal(r.ok, false);
      assert.match(r.error, /name/i);
    });
  });

  describe('listComps', () => {
    it('returns empty for new project', () => {
      const r = runner.dispatch('listComps');
      assert.equal(r.ok, true);
      assert.deepEqual(r.result, []);
    });

    it('lists created comps', () => {
      runner.dispatch('createComp', { name: 'A', width: 1920, height: 1080, duration: 5, frameRate: 30 });
      runner.dispatch('createComp', { name: 'B', width: 1280, height: 720, duration: 10, frameRate: 24 });
      const r = runner.dispatch('listComps');
      assert.equal(r.result.length, 2);
      assert.equal(r.result[0].name, 'A');
      assert.equal(r.result[1].name, 'B');
    });
  });

  describe('addSolid', () => {
    it('adds a solid to a comp', () => {
      const comp = runner.dispatch('createComp', { name: 'X' });
      const r = runner.dispatch('addSolid', { compId: comp.result.compId, name: 'BG', color: [1, 0, 0] });
      assert.equal(r.ok, true);
      assert.equal(r.result.layerIndex, 1);
    });

    it('fails for non-existent comp', () => {
      const r = runner.dispatch('addSolid', { compId: 999 });
      assert.equal(r.ok, false);
      assert.match(r.error, /not found/);
    });
  });

  describe('addTextLayer', () => {
    it('adds a text layer', () => {
      const comp = runner.dispatch('createComp', { name: 'T' });
      const r = runner.dispatch('addTextLayer', { compId: comp.result.compId, text: 'Hello' });
      assert.equal(r.ok, true);
      assert.equal(r.result.layerIndex, 1);
    });

    it('fails without text', () => {
      const comp = runner.dispatch('createComp', { name: 'T2' });
      const r = runner.dispatch('addTextLayer', { compId: comp.result.compId });
      assert.equal(r.ok, false);
      assert.match(r.error, /text/i);
    });
  });

  describe('setLayerProperty', () => {
    it('sets opacity', () => {
      const comp = runner.dispatch('createComp', { name: 'P' });
      runner.dispatch('addSolid', { compId: comp.result.compId, name: 'S' });
      const r = runner.dispatch('setLayerProperty', {
        compId: comp.result.compId, layerIndex: 1, property: 'opacity', value: 50,
      });
      assert.equal(r.ok, true);
    });

    it('sets name', () => {
      const comp = runner.dispatch('createComp', { name: 'P2' });
      runner.dispatch('addSolid', { compId: comp.result.compId, name: 'S' });
      const r = runner.dispatch('setLayerProperty', {
        compId: comp.result.compId, layerIndex: 1, property: 'name', value: 'NewName',
      });
      assert.equal(r.ok, true);
    });

    it('sets enabled', () => {
      const comp = runner.dispatch('createComp', { name: 'P3' });
      runner.dispatch('addSolid', { compId: comp.result.compId });
      const r = runner.dispatch('setLayerProperty', {
        compId: comp.result.compId, layerIndex: 1, property: 'enabled', value: false,
      });
      assert.equal(r.ok, true);
    });

    it('rejects invalid property name', () => {
      const comp = runner.dispatch('createComp', { name: 'P4' });
      runner.dispatch('addSolid', { compId: comp.result.compId });
      const r = runner.dispatch('setLayerProperty', {
        compId: comp.result.compId, layerIndex: 1, property: 'color', value: [1, 0, 0],
      });
      assert.equal(r.ok, false);
      assert.match(r.error, /not found/i);
    });

    it('rejects out-of-range layer index', () => {
      const comp = runner.dispatch('createComp', { name: 'P5' });
      const r = runner.dispatch('setLayerProperty', {
        compId: comp.result.compId, layerIndex: 1, property: 'opacity', value: 50,
      });
      assert.equal(r.ok, false);
      assert.match(r.error, /out of range/);
    });
  });

  describe('addTextLayer position (Transform path)', () => {
    it('sets position via the Transform group without throwing', () => {
      const comp = runner.dispatch('createComp', { name: 'Pos' });
      const r = runner.dispatch('addTextLayer', {
        compId: comp.result.compId,
        text: 'Centered',
        position: [100, 200],
      });
      // The mock only resolves Position via Transform (as real AE does); if the
      // JSX took the wrong path this would throw and r.ok would be false.
      assert.equal(r.ok, true);
      assert.equal(r.result.layerIndex, 1);
    });
  });

  describe('__prepareRender (render data-gathering helper)', () => {
    it('returns comp + frame info', () => {
      const comp = runner.dispatch('createComp', { name: 'Render', duration: 5, frameRate: 24 });
      const r = runner.dispatch('__prepareRender', {
        compId: comp.result.compId,
        outputPath: 'C:/out/test.mov',
      });
      assert.equal(r.ok, true);
      assert.equal(r.result.compName, 'Render');
      assert.equal(r.result.totalFrames, 120);
      assert.equal(r.result.projectSaved, false); // mock project is Untitled
    });

    it('fails without outputPath', () => {
      const comp = runner.dispatch('createComp', { name: 'R2' });
      const r = runner.dispatch('__prepareRender', { compId: comp.result.compId });
      assert.equal(r.ok, false);
      assert.match(r.error, /outputPath/);
    });
  });

  describe('runJSX', () => {
    it('evals raw script', () => {
      const r = runner.dispatch('runJSX', { script: '2 + 2' });
      assert.equal(r.ok, true);
      assert.equal(r.result.value, 4);
    });

    it('fails without script', () => {
      const r = runner.dispatch('runJSX', {});
      assert.equal(r.ok, false);
      assert.match(r.error, /script/i);
    });
  });

  describe('undo groups', () => {
    it('batch opens one AE undo group and inner commands join it instead of nesting', () => {
      const compId = runner.dispatch('createComp', { name: 'U' }).result.compId;
      const r = runner.dispatch('batch', { commands: [
        { command: 'createComp', params: { name: 'U2' } },
        { command: 'addSolid', params: { compId, name: 'A' } },
        { command: 'setLayerProperty', params: { compId, layerIndex: 1, property: 'noSuchProp', value: 1 } }, // throws inside its AEB.undo
        { command: 'addSolid', params: { compId, name: 'B' } },
      ] });
      assert.equal(r.ok, true);
      assert.equal(r.result.ok, 3);
      assert.equal(runner.dom.app._undoMaxDepth, 1);
      assert.equal(runner.dom.app._undoDepth, 0);
      // the inner throw must not leave the wrapper thinking a group is still open
      runner.dom.app._undoMaxDepth = 0;
      runner.dispatch('addSolid', { compId, name: 'C' });
      assert.equal(runner.dom.app._undoMaxDepth, 1);
    });

    it('applySpec does not nest the groups of the commands it calls', () => {
      const comp = runner.dispatch('createComp', { name: 'SpecU' });
      runner.dispatch('applySpec', {
        compId: comp.result.compId, segmentId: 1,
        spec: { treatments: [{ type: 'title', text: 'X', deepGlow: { radius: 100 } }] },
      });
      assert.equal(runner.dom.app._undoMaxDepth, 1);
      assert.equal(runner.dom.app._undoDepth, 0);
    });
  });

  describe('unknown command', () => {
    it('returns an error for unknown commands', () => {
      const r = runner.dispatch('doesNotExist');
      assert.equal(r.ok, false);
      assert.match(r.error, /Unknown command/);
    });
  });

  describe('reset', () => {
    it('clears all project state', () => {
      runner.dispatch('createComp', { name: 'A' });
      runner.reset();
      const r = runner.dispatch('listComps');
      assert.deepEqual(r.result, []);
    });
  });

  describe('discovery', () => {
    it('listFonts returns postScriptNames', () => {
      const r = runner.dispatch('listFonts');
      assert.equal(r.ok, true);
      assert.ok(r.result.totalInstalled >= 1, 'expected some fonts');
      assert.ok(r.result.fonts.length >= 1);
      assert.ok(typeof r.result.fonts[0].postScriptName === 'string');
      assert.ok('family' in r.result.fonts[0] && 'style' in r.result.fonts[0]);
    });

    it('listFonts honors a filter', () => {
      const r = runner.dispatch('listFonts', { filter: 'arial' });
      assert.equal(r.ok, true);
      for (const f of r.result.fonts) assert.match(f.postScriptName.toLowerCase(), /arial/);
    });

    it('listInstalledEffects probes + returns matchNames, marked best-effort', () => {
      const r = runner.dispatch('listInstalledEffects');
      assert.equal(r.ok, true);
      assert.equal(r.result.bestEffort, true);
      assert.ok(r.result.effects.length >= 3, 'expected some probed effects');
      const tint = r.result.effects.find((e) => e.name === 'Tint');
      assert.ok(tint && tint.matchName === 'ADBE Tint');
    });

    it('findEffectMatchName resolves installed + reports missing', () => {
      const ok = runner.dispatch('findEffectMatchName', { name: 'Glow' });
      assert.equal(ok.result.installed, true);
      assert.equal(ok.result.matchName, 'ADBE Glo2');
      const no = runner.dispatch('findEffectMatchName', { name: 'Totally Not An Effect' });
      assert.equal(no.result.installed, false);
      assert.equal(no.result.matchName, null);
    });

    it('getEnvironment reports AE facts', () => {
      const r = runner.dispatch('getEnvironment');
      assert.equal(r.ok, true);
      assert.ok(r.result.aeVersion);
      assert.ok(r.result.fontCount >= 1);
    });

    it('listInstalledEffects caches per session; refresh rebuilds', () => {
      const r1 = runner.dispatch('listInstalledEffects');
      assert.equal(r1.result.cached, false);
      const r2 = runner.dispatch('listInstalledEffects');
      assert.equal(r2.result.cached, true);
      assert.equal(r2.result.count, r1.result.count);
      const r3 = runner.dispatch('listInstalledEffects', { refresh: true });
      assert.equal(r3.result.cached, false);
    });

    it('findEffectMatchName serves from the warmed cache', () => {
      runner.dispatch('listInstalledEffects'); // warm the map
      const r = runner.dispatch('findEffectMatchName', { name: 'Tint' });
      assert.equal(r.result.matchName, 'ADBE Tint');
      assert.equal(r.result.cached, true);
    });
  });

  describe('applySpec — effects by display name', () => {
    it('resolves a treatment effects:[{effect:"Glow"}] to its matchName', () => {
      const comp = runner.dispatch('createComp', { name: 'S' });
      const r = runner.dispatch('applySpec', {
        compId: comp.result.compId,
        segmentId: 1,
        spec: { treatments: [{ type: 'title', text: 'Hi', effects: [{ effect: 'Glow' }] }] },
      });
      assert.equal(r.ok, true);
      assert.equal(r.result.layers[0].effects[0].requested, 'Glow');
      assert.equal(r.result.layers[0].effects[0].matchName, 'ADBE Glo2');
    });

    it('color_grade accepts a display-name effect', () => {
      const comp = runner.dispatch('createComp', { name: 'S2' });
      const r = runner.dispatch('applySpec', {
        compId: comp.result.compId,
        segmentId: 2,
        spec: { treatments: [{ type: 'color_grade', effect: 'Lumetri Color' }] },
      });
      assert.equal(r.ok, true);
      assert.equal(r.result.built, 1);
    });

    it('fails clearly when an effect is not installed', () => {
      const comp = runner.dispatch('createComp', { name: 'S3' });
      const r = runner.dispatch('applySpec', {
        compId: comp.result.compId,
        segmentId: 3,
        spec: { treatments: [{ type: 'title', text: 'X', effects: [{ effect: 'No Such Effect' }] }] },
      });
      assert.equal(r.ok, false);
      assert.match(r.error, /not installed or not addable/);
    });
  });

  describe('third-party plugins (Plugin Everything)', () => {
    it('deepGlow applies PEDG2 and maps friendly params to matchNames', () => {
      const comp = runner.dispatch('createComp', { name: 'DG' });
      runner.dispatch('addTextLayer', { compId: comp.result.compId, text: 'glow' });
      const r = runner.dispatch('deepGlow', {
        compId: comp.result.compId, layerIndex: 1,
        radius: 200, exposure: 1.4, color: [1, 0.6, 0],
      });
      assert.equal(r.ok, true);
      assert.equal(r.result.matchName, 'PEDG2');
      assert.ok(r.result.applied.includes('PEDG2-0017')); // Radius
      assert.ok(r.result.applied.includes('PEDG2-0042')); // Color (from `color`)
      assert.ok(r.result.applied.includes('PEDG2-0041')); // Tint enable
    });

    it('deepGlow reuses the same effect instead of stacking', () => {
      const comp = runner.dispatch('createComp', { name: 'DG2' });
      runner.dispatch('addTextLayer', { compId: comp.result.compId, text: 'g' });
      runner.dispatch('deepGlow', { compId: comp.result.compId, layerIndex: 1, radius: 100 });
      runner.dispatch('deepGlow', { compId: comp.result.compId, layerIndex: 1, radius: 300 });
      const det = runner.dispatch('getLayerDetails', { compId: comp.result.compId, layerIndex: 1 });
      const dgs = det.result.effects.filter((e) => e.matchName === 'PEDG2');
      assert.equal(dgs.length, 1);
    });

    it('shadowStudio applies PESS3 with friendly params', () => {
      const comp = runner.dispatch('createComp', { name: 'SS' });
      runner.dispatch('addTextLayer', { compId: comp.result.compId, text: 'shadow' });
      const r = runner.dispatch('shadowStudio', {
        compId: comp.result.compId, layerIndex: 1,
        lightDirection: 90, shadowLength: 300, color: [0, 0, 0],
      });
      assert.equal(r.ok, true);
      assert.equal(r.result.matchName, 'PESS3');
      assert.ok(r.result.applied.includes('PESS3-0002')); // Light Direction
      assert.ok(r.result.applied.includes('PESS3-0004')); // Shadow Length
      assert.ok(r.result.applied.includes('PESS3-0006')); // Color
    });

    it('applySpec wires deepGlow + shadowStudio as treatment modifiers', () => {
      const comp = runner.dispatch('createComp', { name: 'SpecFX' });
      const r = runner.dispatch('applySpec', {
        compId: comp.result.compId, segmentId: 7,
        spec: { treatments: [{
          type: 'title', text: 'NEON',
          deepGlow: { radius: 180, color: [1, 0.3, 0.6] },
          shadowStudio: { lightDirection: 120, shadowLength: 250 },
        }] },
      });
      assert.equal(r.ok, true);
      const det = runner.dispatch('getLayerDetails', { compId: comp.result.compId, layerIndex: 1 });
      const mns = det.result.effects.map((e) => e.matchName);
      assert.ok(mns.includes('PEDG2'));
      assert.ok(mns.includes('PESS3'));
    });

    it('introspectEffect + listInstalledEffects surface the plugins', () => {
      const r = runner.dispatch('introspectEffect', { name: 'Deep Glow 2' });
      assert.equal(r.result.effects[0].installed, true);
      assert.equal(r.result.effects[0].matchName, 'PEDG2');
      const list = runner.dispatch('listInstalledEffects');
      assert.ok(list.result.effects.some((e) => e.matchName === 'PESS3'));
    });
  });
});
