// protocol.test.js — tests for the shared wire protocol (envelope build/parse).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  newId,
  buildRequest,
  buildResultOk,
  buildResultError,
  buildEvent,
  parseEnvelope,
  serialize,
  ENVELOPE_TYPES,
} from '@aftr/shared/protocol';

describe('newId', () => {
  it('generates unique ids', () => {
    const a = newId();
    const b = newId();
    assert.notEqual(a, b);
  });

  it('includes the prefix', () => {
    const id = newId('test');
    assert.ok(id.startsWith('test_'), `Expected "${id}" to start with "test_"`);
  });
});

describe('buildRequest', () => {
  it('builds a command envelope', () => {
    const req = buildRequest('ping', {});
    assert.equal(req.type, ENVELOPE_TYPES.COMMAND);
    assert.equal(req.command, 'ping');
    assert.deepEqual(req.params, {});
    assert.ok(typeof req.id === 'string');
  });

  it('uses a custom id if provided', () => {
    const req = buildRequest('ping', {}, 'custom-123');
    assert.equal(req.id, 'custom-123');
  });

  it('defaults params to {}', () => {
    const req = buildRequest('test', undefined);
    assert.deepEqual(req.params, {});
  });
});

describe('buildResultOk', () => {
  it('builds a success result envelope', () => {
    const env = buildResultOk('id-1', { value: 42 });
    assert.equal(env.type, ENVELOPE_TYPES.RESULT);
    assert.equal(env.ok, true);
    assert.equal(env.id, 'id-1');
    assert.deepEqual(env.result, { value: 42 });
  });
});

describe('buildResultError', () => {
  it('builds an error result from a string', () => {
    const env = buildResultError('id-2', 'something failed');
    assert.equal(env.ok, false);
    assert.equal(env.error, 'something failed');
  });

  it('builds an error result from an Error object', () => {
    const env = buildResultError('id-3', new Error('boom'));
    assert.equal(env.error, 'boom');
  });
});

describe('buildEvent', () => {
  it('builds an event envelope', () => {
    const env = buildEvent('ready', { ae: '25.0' });
    assert.equal(env.type, ENVELOPE_TYPES.EVENT);
    assert.equal(env.event, 'ready');
    assert.deepEqual(env.data, { ae: '25.0' });
  });

  it('defaults data to {}', () => {
    const env = buildEvent('heartbeat');
    assert.deepEqual(env.data, {});
  });
});

describe('parseEnvelope', () => {
  it('parses a valid command envelope', () => {
    const raw = JSON.stringify({ id: 'x', type: 'command', command: 'ping', params: {} });
    const result = parseEnvelope(raw);
    assert.equal(result.ok, true);
    assert.equal(result.envelope.command, 'ping');
  });

  it('parses a valid result envelope', () => {
    const raw = JSON.stringify({ id: 'x', type: 'result', ok: true, result: {} });
    const result = parseEnvelope(raw);
    assert.equal(result.ok, true);
    assert.equal(result.envelope.ok, true);
  });

  it('parses a valid event envelope', () => {
    const raw = JSON.stringify({ type: 'event', event: 'ready', data: {} });
    const result = parseEnvelope(raw);
    assert.equal(result.ok, true);
    assert.equal(result.envelope.event, 'ready');
  });

  it('rejects invalid JSON', () => {
    const result = parseEnvelope('{bad json');
    assert.equal(result.ok, false);
    assert.match(result.error, /Invalid JSON/);
  });

  it('rejects non-object', () => {
    const result = parseEnvelope('"just a string"');
    assert.equal(result.ok, false);
  });

  it('rejects missing type', () => {
    const result = parseEnvelope(JSON.stringify({ id: 'x' }));
    assert.equal(result.ok, false);
    assert.match(result.error, /type/);
  });

  it('rejects command envelope without id', () => {
    const result = parseEnvelope(JSON.stringify({ type: 'command', command: 'ping' }));
    assert.equal(result.ok, false);
    assert.match(result.error, /id/);
  });

  it('rejects result envelope without ok', () => {
    const result = parseEnvelope(JSON.stringify({ id: 'x', type: 'result' }));
    assert.equal(result.ok, false);
    assert.match(result.error, /ok/);
  });

  it('rejects event envelope without event name', () => {
    const result = parseEnvelope(JSON.stringify({ type: 'event' }));
    assert.equal(result.ok, false);
    assert.match(result.error, /event/);
  });

  it('rejects unknown envelope type', () => {
    const result = parseEnvelope(JSON.stringify({ type: 'foo' }));
    assert.equal(result.ok, false);
    assert.match(result.error, /Unknown/);
  });
});

describe('serialize', () => {
  it('serializes an envelope to JSON', () => {
    const env = buildEvent('test', { x: 1 });
    const json = serialize(env);
    const parsed = JSON.parse(json);
    assert.equal(parsed.event, 'test');
  });
});
