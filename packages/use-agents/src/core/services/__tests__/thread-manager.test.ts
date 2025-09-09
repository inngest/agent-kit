import { describe, it, expect } from 'vitest';
import { ThreadManager } from '../thread-manager.js';

const tm = new ThreadManager();

const mk = (id: string, title = 'New conversation'): any => ({
  id,
  title,
  messageCount: 0,
  lastMessageAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});

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
});


