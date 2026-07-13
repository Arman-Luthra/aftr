// commands.test.js — tests for the shared command registry + validation.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMANDS,
  validateCommand,
  commandList,
} from '@aftr/shared/commands';

describe('COMMANDS registry', () => {
  it('has all expected commands', () => {
    const expected = [
      'ping', 'getProjectInfo', 'listComps', 'createComp',
      'addSolid', 'addTextLayer', 'setLayerProperty', 'render', 'runJSX',
    ];
    for (const name of expected) {
      assert.ok(COMMANDS[name], `Missing command: ${name}`);
      assert.ok(typeof COMMANDS[name].validate === 'function', `${name}.validate is not a function`);
      assert.ok(typeof COMMANDS[name].description === 'string', `${name}.description is not a string`);
    }
  });

  it('marks runJSX as dev', () => {
    assert.equal(COMMANDS.runJSX.dev, true);
  });
});

describe('validateCommand', () => {
  it('rejects unknown commands', () => {
    const r = validateCommand('nonexistent', {});
    assert.equal(r.ok, false);
    assert.match(r.error, /Unknown/);
  });

  it('validates ping with no params', () => {
    const r = validateCommand('ping', {});
    assert.equal(r.ok, true);
  });

  it('validates createComp with all params', () => {
    const r = validateCommand('createComp', {
      name: 'Test', width: 1920, height: 1080, duration: 10, frameRate: 30,
    });
    assert.equal(r.ok, true);
    assert.equal(r.params.name, 'Test');
    assert.equal(r.params.width, 1920);
  });

  it('applies defaults to createComp', () => {
    const r = validateCommand('createComp', { name: 'Test' });
    assert.equal(r.ok, true);
    assert.equal(r.params.width, 1920);
    assert.equal(r.params.height, 1080);
    assert.equal(r.params.duration, 10);
    assert.equal(r.params.frameRate, 30);
  });

  it('rejects createComp without name', () => {
    const r = validateCommand('createComp', {});
    assert.equal(r.ok, false);
    assert.match(r.error, /name/);
  });

  it('rejects addSolid without compId', () => {
    const r = validateCommand('addSolid', {});
    assert.equal(r.ok, false);
    assert.match(r.error, /compId/);
  });

  it('validates addSolid with valid color', () => {
    const r = validateCommand('addSolid', { compId: 1, color: [1, 0, 0] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.params.color, [1, 0, 0]);
  });

  it('rejects addSolid with out-of-range color', () => {
    const r = validateCommand('addSolid', { compId: 1, color: [2, 0, 0] });
    assert.equal(r.ok, false);
    assert.match(r.error, /0\.\.1/);
  });

  it('validates setLayerProperty with allowed property', () => {
    const r = validateCommand('setLayerProperty', {
      compId: 1, layerIndex: 1, property: 'opacity', value: 50,
    });
    assert.equal(r.ok, true);
  });

  it('rejects setLayerProperty with invalid property name', () => {
    const r = validateCommand('setLayerProperty', {
      compId: 1, layerIndex: 1, property: 'color', value: [1, 0, 0],
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /must be one of/);
  });

  it('rejects render without outputPath', () => {
    const r = validateCommand('render', { compId: 1 });
    assert.equal(r.ok, false);
    assert.match(r.error, /outputPath/);
  });

  it('blocks dev commands when allowDev is false', () => {
    const r = validateCommand('runJSX', { script: 'app.version' }, { allowDev: false });
    assert.equal(r.ok, false);
    assert.match(r.error, /dev-only/);
  });

  it('allows dev commands when allowDev is true', () => {
    const r = validateCommand('runJSX', { script: 'app.version' }, { allowDev: true });
    assert.equal(r.ok, true);
  });

  it('rejects non-object params', () => {
    const r = validateCommand('ping', 'not an object');
    assert.equal(r.ok, false);
    assert.match(r.error, /params must be an object/);
  });

  it('validates addTextLayer position', () => {
    const r = validateCommand('addTextLayer', {
      compId: 1, text: 'Hello', position: [960, 540],
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.params.position, [960, 540]);
  });

  it('rejects addTextLayer with bad position', () => {
    const r = validateCommand('addTextLayer', {
      compId: 1, text: 'Hello', position: [960],
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /position/);
  });
});

describe('commandList', () => {
  it('excludes dev commands by default', () => {
    const list = commandList();
    const names = list.map((c) => c.name);
    assert.ok(!names.includes('runJSX'));
    assert.ok(names.includes('ping'));
  });

  it('includes dev commands when requested', () => {
    const list = commandList({ includeDev: true });
    const names = list.map((c) => c.name);
    assert.ok(names.includes('runJSX'));
  });

  it('returns objects with name, description, dev', () => {
    const list = commandList({ includeDev: true });
    for (const cmd of list) {
      assert.ok(typeof cmd.name === 'string');
      assert.ok(typeof cmd.description === 'string');
      assert.ok(typeof cmd.dev === 'boolean');
    }
  });
});
