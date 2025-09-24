import { describe, it, expect } from 'vitest';
import { ThreadManager } from '../thread-manager.js';
import { makeThread } from './test-utils.js';

const tm = new ThreadManager();

const mk = (id: string, title = 'New conversation') => makeThread(id, title);

describe('ThreadManager', () => {
  it('dedupes by id', () => {
    const a = mk('a');
    const b = mk('a');
    const out = tm.dedupeThreadsById([a, b]);
    expect(out.length).toBe(1);
  });

  it('merges preserving local order', () => {
    const local = [mk('a', 'T1'), mk('b', 'T2')];
    const server = [mk('a', 'Server T1'), mk('c', 'T3')];
    const out = tm.mergeThreadsPreserveOrder(local as any, server as any);
    expect(out.map((t: any) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('prefers non-generic local title when longer', () => {
    const tm = new ThreadManager();
    const local = [mk('a', 'Custom Analysis Title')];
    const server = [mk('a', 'New conversation')];
    const out = tm.mergeThreadsPreserveOrder(local as any, server as any);
    expect(out[0].title).toBe('Custom Analysis Title');
  });

  it('parseCachedThreads handles invalid shapes and revives dates', () => {
    const tm = new ThreadManager();
    const now = new Date().toISOString();
    const raw = [
      { id: 'a', title: 'X', messageCount: '3', lastMessageAt: now, createdAt: now, updatedAt: now },
      { id: 'a', title: 'Duplicate', messageCount: 1 }, // duplicate id
      { bogus: true },
    ];
    const out = tm.parseCachedThreads(raw as any);
    expect(out.length).toBe(1);
    expect(out[0].messageCount).toBe(3);
    expect(out[0].lastMessageAt instanceof Date).toBe(true);
  });
});


