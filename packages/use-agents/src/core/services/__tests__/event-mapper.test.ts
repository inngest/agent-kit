import { describe, it, expect } from 'vitest';
import { mapToNetworkEvent, shouldProcessEvent } from '../event-mapper.js';
import { makeEvent } from './test-utils.js';

describe('event-mapper', () => {
  it('maps valid chunks', () => {
    const evt = mapToNetworkEvent({ event: 'x', data: { a: 1 }, timestamp: 1, sequenceNumber: 1, id: 'a' });
    expect(evt?.event).toBe('x');
  });

  it('filters by threadId', () => {
    const evt = mapToNetworkEvent({ event: 'x', data: { threadId: 't1' }, timestamp: 1, sequenceNumber: 1, id: 'a' })!;
    expect(shouldProcessEvent(evt, { threadId: 't2' })).toBe(false);
    expect(shouldProcessEvent(evt, { threadId: 't1' })).toBe(true);
  });
});

describe('mapToNetworkEvent extra', () => {
  it('maps a valid payload', () => {
    const evt = mapToNetworkEvent(
      makeEvent('text.delta', { messageId: 'm1', partId: 'p1', delta: 'Hi' }, { sequenceNumber: 5, id: 'publish-5:text.delta' })
    );
    expect(evt?.event).toBe('text.delta');
    expect(evt?.sequenceNumber).toBe(5);
  });

  it('returns null on invalid payload', () => {
    expect(mapToNetworkEvent(null)).toBeNull();
    expect(mapToNetworkEvent({} as any)).toBeNull();
    expect(mapToNetworkEvent({ event: 'x' } as any)).toBeNull();
  });

  it('returns generic fallback for incomplete known event shapes', () => {
    const evt = mapToNetworkEvent({
      event: 'part.created',
      data: { threadId: 't1' }, // missing messageId/partId/type
      timestamp: Date.now(),
      sequenceNumber: 1,
      id: 'publish-1:part.created',
    });
    expect(evt).not.toBeNull();
    expect(evt?.event).toBe('part.created');
    expect(typeof evt?.id).toBe('string');
  });
});


