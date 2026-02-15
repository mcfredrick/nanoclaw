import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import http from 'http';

// --- Mocks ---

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { SignalChannel, SignalChannelOpts } from './signal.js';

// --- Test helpers ---

const originalFetch = globalThis.fetch;

function createTestOpts(overrides?: Partial<SignalChannelOpts>): SignalChannelOpts {
  return {
    onMessage: vi.fn(),
    onChatMetadata: vi.fn(),
    registeredGroups: vi.fn(() => ({
      '+14155551111': {
        name: 'Main',
        folder: 'main',
        trigger: '@Andy',
        added_at: '2024-01-01T00:00:00.000Z',
        requiresTrigger: false,
      },
      'signal-group:dGVzdC1ncm91cC1pZA==': {
        name: 'Test Group',
        folder: 'test-group',
        trigger: '@Andy',
        added_at: '2024-01-01T00:00:00.000Z',
      },
    })),
    phoneNumber: '+14155550000',
    ...overrides,
  };
}

function postWebhook(port: number, payload: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: '/webhook/signal',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode!, body }));
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function postRaw(port: number, path: string, body: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ status: res.statusCode! }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// --- Tests ---

describe('SignalChannel', () => {
  let channel: SignalChannel;
  let opts: SignalChannelOpts;
  // Each test gets a unique port to avoid conflicts
  let testPort: number;
  let portCounter = 14000 + Math.floor(Math.random() * 1000);

  beforeEach(() => {
    testPort = portCounter++;
    process.env.SIGNAL_WEBHOOK_PORT = String(testPort);
    process.env.SIGNAL_API_URL = 'http://localhost:19999';
    opts = createTestOpts();
  });

  afterEach(async () => {
    // Always restore real fetch
    globalThis.fetch = originalFetch;
    if (channel?.isConnected()) {
      await channel.disconnect();
    }
    vi.restoreAllMocks();
    delete process.env.SIGNAL_WEBHOOK_PORT;
    delete process.env.SIGNAL_API_URL;
  });

  function mockFetchForConnect(): void {
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: any) => {
      if (typeof url === 'string' && url.includes('/v1/about')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (typeof url === 'string' && url.includes('/v2/send')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') });
      }
      return originalFetch(url, init);
    }) as any;
  }

  async function connectChannel(ch: SignalChannel): Promise<void> {
    mockFetchForConnect();
    await ch.connect();
  }

  // --- Connection lifecycle ---

  describe('connection lifecycle', () => {
    it('connects successfully when API is reachable', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);
      expect(channel.isConnected()).toBe(true);
    });

    it('throws when API is unreachable', async () => {
      // Use real fetch — no mock
      globalThis.fetch = originalFetch;
      channel = new SignalChannel(opts);
      await expect(channel.connect()).rejects.toThrow('Failed to connect to signal-cli-rest-api');
    });

    it('disconnects cleanly', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);
      expect(channel.isConnected()).toBe(true);

      await channel.disconnect();
      expect(channel.isConnected()).toBe(false);
    });
  });

  // --- Webhook message parsing ---

  describe('webhook message handling', () => {
    it('delivers 1-on-1 message for registered chat', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      await postWebhook(testPort, {
        envelope: {
          source: '+14155551111',
          sourceNumber: '+14155551111',
          sourceName: 'Alice',
          timestamp: 1631458508784,
          dataMessage: {
            timestamp: 1631458508784,
            message: 'Hello there',
          },
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(opts.onChatMetadata).toHaveBeenCalledWith('+14155551111', expect.any(String));
      expect(opts.onMessage).toHaveBeenCalledWith(
        '+14155551111',
        expect.objectContaining({
          chat_jid: '+14155551111',
          sender: '+14155551111',
          sender_name: 'Alice',
          content: 'Hello there',
          is_from_me: false,
        }),
      );
    });

    it('delivers group message for registered group', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      await postWebhook(testPort, {
        envelope: {
          source: '+14155552222',
          sourceNumber: '+14155552222',
          sourceName: 'Bob',
          timestamp: 1631458508785,
          dataMessage: {
            timestamp: 1631458508785,
            message: '@Andy help me',
            groupInfo: {
              groupId: 'dGVzdC1ncm91cC1pZA==',
              type: 'DELIVER',
            },
          },
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(opts.onChatMetadata).toHaveBeenCalledWith('signal-group:dGVzdC1ncm91cC1pZA==', expect.any(String));
      expect(opts.onMessage).toHaveBeenCalledWith(
        'signal-group:dGVzdC1ncm91cC1pZA==',
        expect.objectContaining({
          chat_jid: 'signal-group:dGVzdC1ncm91cC1pZA==',
          sender: '+14155552222',
          sender_name: 'Bob',
          content: '@Andy help me',
        }),
      );
    });

    it('only emits metadata for unregistered chats', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      await postWebhook(testPort, {
        envelope: {
          source: '+14155559999',
          sourceNumber: '+14155559999',
          sourceName: 'Unknown',
          timestamp: 1631458508786,
          dataMessage: {
            timestamp: 1631458508786,
            message: 'Not registered',
          },
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(opts.onChatMetadata).toHaveBeenCalledWith('+14155559999', expect.any(String));
      expect(opts.onMessage).not.toHaveBeenCalled();
    });
  });

  // --- JSON-RPC format ---

  describe('json-rpc payload format', () => {
    it('handles json-rpc wrapped payloads', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      await postWebhook(testPort, {
        jsonrpc: '2.0',
        method: 'receive',
        params: {
          envelope: {
            source: '+14155551111',
            sourceNumber: '+14155551111',
            sourceName: 'Alice',
            timestamp: 1631458509000,
            dataMessage: {
              timestamp: 1631458509000,
              message: 'JSON-RPC message',
            },
          },
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(opts.onMessage).toHaveBeenCalledWith(
        '+14155551111',
        expect.objectContaining({
          content: 'JSON-RPC message',
          sender_name: 'Alice',
        }),
      );
    });

    it('handles syncMessage.sentMessage (own messages from phone)', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      await postWebhook(testPort, {
        jsonrpc: '2.0',
        method: 'receive',
        params: {
          envelope: {
            source: '+14155550000',
            sourceNumber: '+14155550000',
            sourceName: 'Me',
            timestamp: 1631458509001,
            syncMessage: {
              sentMessage: {
                timestamp: 1631458509001,
                message: '@Andy do stuff',
                groupInfo: {
                  groupId: 'dGVzdC1ncm91cC1pZA==',
                  type: 'DELIVER',
                },
              },
            },
          },
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(opts.onMessage).toHaveBeenCalledWith(
        'signal-group:dGVzdC1ncm91cC1pZA==',
        expect.objectContaining({
          content: '@Andy do stuff',
          is_from_me: true,
        }),
      );
    });

    it('skips syncMessage in 1-on-1 (echo of outbound)', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      await postWebhook(testPort, {
        jsonrpc: '2.0',
        method: 'receive',
        params: {
          envelope: {
            source: '+14155550000',
            sourceNumber: '+14155550000',
            sourceName: 'Me',
            timestamp: 1631458509002,
            syncMessage: {
              sentMessage: {
                timestamp: 1631458509002,
                message: 'My outbound message',
              },
            },
          },
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(opts.onMessage).not.toHaveBeenCalled();
    });
  });

  // --- Echo prevention ---

  describe('echo prevention', () => {
    it('skips own messages in 1-on-1 chats', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      await postWebhook(testPort, {
        envelope: {
          source: '+14155550000', // our number
          sourceNumber: '+14155550000',
          sourceName: 'Me',
          timestamp: 1631458508787,
          dataMessage: {
            timestamp: 1631458508787,
            message: 'My own message',
          },
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(opts.onChatMetadata).not.toHaveBeenCalled();
      expect(opts.onMessage).not.toHaveBeenCalled();
    });

    it('allows own messages in group chats', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      await postWebhook(testPort, {
        envelope: {
          source: '+14155550000', // our number
          sourceNumber: '+14155550000',
          sourceName: 'Me',
          timestamp: 1631458508791,
          dataMessage: {
            timestamp: 1631458508791,
            message: '@Andy do something',
            groupInfo: {
              groupId: 'dGVzdC1ncm91cC1pZA==',
              type: 'DELIVER',
            },
          },
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(opts.onChatMetadata).toHaveBeenCalledWith('signal-group:dGVzdC1ncm91cC1pZA==', expect.any(String));
      expect(opts.onMessage).toHaveBeenCalledWith(
        'signal-group:dGVzdC1ncm91cC1pZA==',
        expect.objectContaining({
          sender: '+14155550000',
          content: '@Andy do something',
        }),
      );
    });
  });

  // --- Deduplication ---

  describe('deduplication', () => {
    it('ignores duplicate messages with same timestamp+source', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      const payload = {
        envelope: {
          source: '+14155551111',
          sourceNumber: '+14155551111',
          sourceName: 'Alice',
          timestamp: 1631458508788,
          dataMessage: {
            timestamp: 1631458508788,
            message: 'Duplicate test',
          },
        },
      };

      await postWebhook(testPort, payload);
      await postWebhook(testPort, payload);

      await new Promise((r) => setTimeout(r, 50));

      expect(opts.onMessage).toHaveBeenCalledTimes(1);
    });
  });

  // --- Send messages ---

  describe('sendMessage', () => {
    it('sends to individual recipient', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      await channel.sendMessage('+14155551111', 'Hello');

      const mockFn = globalThis.fetch as ReturnType<typeof vi.fn>;
      expect(mockFn).toHaveBeenCalledWith(
        expect.stringContaining('/v2/send'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            message: 'Hello',
            number: '+14155550000',
            recipients: ['+14155551111'],
          }),
        }),
      );
    });

    it('sends to group', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      await channel.sendMessage('signal-group:abc123', 'Group message');

      const mockFn = globalThis.fetch as ReturnType<typeof vi.fn>;
      const expectedGroupApiId = 'group.' + Buffer.from('abc123').toString('base64');
      expect(mockFn).toHaveBeenCalledWith(
        expect.stringContaining('/v2/send'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            message: 'Group message',
            number: '+14155550000',
            recipients: [expectedGroupApiId],
          }),
        }),
      );
    });

    it('throws when not connected', async () => {
      channel = new SignalChannel(opts);
      await expect(channel.sendMessage('+14155551111', 'test')).rejects.toThrow('not connected');
    });

    it('throws on API error', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      // Override fetch to return error for send
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/v2/send')) {
          return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('Internal error') });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }) as any;

      await expect(channel.sendMessage('+14155551111', 'test')).rejects.toThrow('Signal API send failed');
    });
  });

  // --- ownsJid ---

  describe('ownsJid', () => {
    it('owns phone number JIDs', () => {
      channel = new SignalChannel(opts);
      expect(channel.ownsJid('+14155551234')).toBe(true);
    });

    it('owns signal-group: JIDs', () => {
      channel = new SignalChannel(opts);
      expect(channel.ownsJid('signal-group:abc123')).toBe(true);
    });

    it('does not own WhatsApp JIDs', () => {
      channel = new SignalChannel(opts);
      expect(channel.ownsJid('12345@g.us')).toBe(false);
      expect(channel.ownsJid('12345@s.signal.net')).toBe(false);
    });

    it('does not own random strings', () => {
      channel = new SignalChannel(opts);
      expect(channel.ownsJid('random-string')).toBe(false);
    });
  });

  // --- Typing indicator ---

  describe('setTyping', () => {
    it('is a no-op', async () => {
      channel = new SignalChannel(opts);
      // Should not throw
      await channel.setTyping('+14155551111', true);
      await channel.setTyping('+14155551111', false);
    });
  });

  // --- Channel properties ---

  describe('channel properties', () => {
    it('has name "signal"', () => {
      channel = new SignalChannel(opts);
      expect(channel.name).toBe('signal');
    });

    it('prefixes assistant name', () => {
      channel = new SignalChannel(opts);
      expect(channel.prefixAssistantName).toBe(true);
    });
  });

  // --- Malformed webhooks ---

  describe('error handling', () => {
    it('returns 400 for invalid JSON', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      const result = await postRaw(testPort, '/webhook/signal', 'not json');
      expect(result.status).toBe(400);
    });

    it('returns 404 for wrong path', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      const result = await postRaw(testPort, '/wrong-path', '{}');
      expect(result.status).toBe(404);
    });

    it('ignores envelope without dataMessage', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      await postWebhook(testPort, {
        envelope: {
          source: '+14155551111',
          timestamp: 1631458508789,
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(opts.onMessage).not.toHaveBeenCalled();
      expect(opts.onChatMetadata).not.toHaveBeenCalled();
    });

    it('ignores envelope without message text', async () => {
      channel = new SignalChannel(opts);
      await connectChannel(channel);

      await postWebhook(testPort, {
        envelope: {
          source: '+14155551111',
          timestamp: 1631458508790,
          dataMessage: {
            timestamp: 1631458508790,
          },
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(opts.onMessage).not.toHaveBeenCalled();
    });
  });
});
