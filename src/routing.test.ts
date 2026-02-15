import { describe, it, expect, beforeEach } from 'vitest';

import { _initTestDatabase, getAllChats, storeChatMetadata } from './db.js';
import { getAvailableGroups, _setRegisteredGroups } from './index.js';

beforeEach(() => {
  _initTestDatabase();
  _setRegisteredGroups({});
});

// --- JID ownership patterns ---

describe('JID ownership patterns', () => {
  // These test the patterns that will become ownsJid() on the Channel interface

  it('Signal group JID: starts with signal-group:', () => {
    const jid = 'signal-group:12345678';
    expect(jid.startsWith('signal-group:')).toBe(true);
  });

  it('Signal DM JID: E.164 phone number format', () => {
    const jid = '+14155551234';
    expect(/^\+\d+$/.test(jid)).toBe(true);
  });

  it('unknown JID format: does not match Signal patterns', () => {
    const jid = 'unknown:12345';
    expect(jid.startsWith('signal-group:')).toBe(false);
    expect(/^\+\d+$/.test(jid)).toBe(false);
  });
});

// --- getAvailableGroups ---

describe('getAvailableGroups', () => {
  it('returns only Signal group JIDs', () => {
    storeChatMetadata('signal-group:12345', '2024-01-01T00:00:01.000Z', 'Group 1');
    storeChatMetadata('+14155551234', '2024-01-01T00:00:02.000Z', 'User DM');
    storeChatMetadata('signal-group:67890', '2024-01-01T00:00:03.000Z', 'Group 2');

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.jid.startsWith('signal-group:'))).toBe(true);
  });

  it('excludes __group_sync__ sentinel', () => {
    storeChatMetadata('__group_sync__', '2024-01-01T00:00:00.000Z');
    storeChatMetadata('signal-group:12345', '2024-01-01T00:00:01.000Z', 'Group');

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].jid).toBe('signal-group:12345');
  });

  it('marks registered groups correctly', () => {
    storeChatMetadata('signal-group:12345', '2024-01-01T00:00:01.000Z', 'Registered');
    storeChatMetadata('signal-group:67890', '2024-01-01T00:00:02.000Z', 'Unregistered');

    _setRegisteredGroups({
      'signal-group:12345': {
        name: 'Registered',
        folder: 'registered',
        trigger: '@Andy',
        added_at: '2024-01-01T00:00:00.000Z',
      },
    });

    const groups = getAvailableGroups();
    const reg = groups.find((g) => g.jid === 'signal-group:12345');
    const unreg = groups.find((g) => g.jid === 'signal-group:67890');

    expect(reg?.isRegistered).toBe(true);
    expect(unreg?.isRegistered).toBe(false);
  });

  it('returns groups ordered by most recent activity', () => {
    storeChatMetadata('signal-group:12345', '2024-01-01T00:00:01.000Z', 'Old');
    storeChatMetadata('signal-group:67890', '2024-01-01T00:00:05.000Z', 'New');
    storeChatMetadata('signal-group:34567', '2024-01-01T00:00:03.000Z', 'Mid');

    const groups = getAvailableGroups();
    expect(groups[0].jid).toBe('signal-group:67890');
    expect(groups[1].jid).toBe('signal-group:34567');
    expect(groups[2].jid).toBe('signal-group:12345');
  });

  it('returns empty array when no chats exist', () => {
    const groups = getAvailableGroups();
    expect(groups).toHaveLength(0);
  });
});
