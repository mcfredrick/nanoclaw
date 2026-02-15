import http from 'http';

import { logger } from '../logger.js';
import { Channel, OnInboundMessage, OnChatMetadata, RegisteredGroup } from '../types.js';

export interface SignalChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  phoneNumber: string; // E.164 format, e.g. "+14155551234"
}

interface SignalMessageData {
  timestamp?: number;
  message?: string;
  groupInfo?: {
    groupId?: string;
    type?: string;
  };
}

interface SignalWebhookPayload {
  // json-rpc mode wraps in { jsonrpc, method, params: { envelope } }
  jsonrpc?: string;
  method?: string;
  params?: {
    envelope?: SignalRawEnvelope;
  };
  // Direct mode sends { envelope } at top level
  envelope?: SignalRawEnvelope;
}

interface SignalRawEnvelope {
  source?: string;
  sourceNumber?: string;
  sourceName?: string;
  timestamp?: number;
  dataMessage?: SignalMessageData;
  syncMessage?: {
    sentMessage?: SignalMessageData & {
      destination?: string;
      destinationNumber?: string;
    };
  };
}

export class SignalChannel implements Channel {
  name = 'signal';
  prefixAssistantName = true;

  private opts: SignalChannelOpts;
  private connected = false;
  private webhookServer?: http.Server;
  private processedIds = new Set<string>();
  private readonly apiUrl: string;
  private readonly webhookPort: number;

  constructor(opts: SignalChannelOpts) {
    this.opts = opts;
    this.apiUrl = process.env.SIGNAL_API_URL || 'http://localhost:8080';
    this.webhookPort = parseInt(process.env.SIGNAL_WEBHOOK_PORT || '3002', 10);
  }

  async connect(): Promise<void> {
    logger.info({ apiUrl: this.apiUrl, webhookPort: this.webhookPort }, 'Starting Signal channel');

    // Test connection to signal-cli-rest-api
    try {
      const response = await fetch(`${this.apiUrl}/v1/about`);
      if (!response.ok) {
        throw new Error(`Signal API returned ${response.status}`);
      }
      logger.info('Connected to signal-cli-rest-api');
    } catch (err: any) {
      throw new Error(`Failed to connect to signal-cli-rest-api at ${this.apiUrl}: ${err.message}`);
    }

    await this.startWebhookServer();
    this.connected = true;
    logger.info('Signal channel connected');
  }

  private async startWebhookServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.webhookServer = http.createServer((req, res) => {
        if (req.method === 'GET' && req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
          return;
        }

        if (req.method === 'POST' && req.url === '/webhook/signal') {
          let body = '';

          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', () => {
            try {
              const payload: SignalWebhookPayload = JSON.parse(body);
              this.handleWebhook(payload);

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ok' }));
            } catch (err) {
              logger.error({ err, body }, 'Failed to parse Signal webhook payload');
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
            }
          });
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'not found' }));
        }
      });

      this.webhookServer.on('error', (err) => {
        logger.error({ err }, 'Signal webhook server error');
        reject(err);
      });

      this.webhookServer.listen(this.webhookPort, () => {
        logger.info({ port: this.webhookPort }, 'Signal webhook server listening');
        resolve();
      });
    });
  }

  private handleWebhook(payload: SignalWebhookPayload): void {
    try {
      // Support both json-rpc mode (params.envelope) and direct mode (envelope)
      const envelope = payload.params?.envelope || payload.envelope;
      if (!envelope) return;

      // Extract message data from either dataMessage (others' messages)
      // or syncMessage.sentMessage (our own messages synced from phone)
      const dataMsg = envelope.dataMessage;
      const syncMsg = envelope.syncMessage?.sentMessage;
      const msgData = dataMsg || syncMsg;
      if (!msgData?.message) return;

      const source = envelope.sourceNumber || envelope.source;
      if (!source) return;

      const groupId = msgData.groupInfo?.groupId;
      const isSyncMessage = !!syncMsg;

      // Echo prevention: skip our own messages in 1-on-1 chats.
      // In groups, allow self-messages so the user can trigger the bot.
      // Sync messages from ourselves in 1-on-1 are always echoes of outbound.
      if (source === this.opts.phoneNumber && !groupId) return;

      const timestamp = msgData.timestamp || envelope.timestamp || Date.now();
      const dedupeKey = `${timestamp}:${source}`;

      if (this.processedIds.has(dedupeKey)) return;
      this.processedIds.add(dedupeKey);

      // Prune dedup set at 1000
      if (this.processedIds.size > 1000) {
        const entries = Array.from(this.processedIds);
        this.processedIds = new Set(entries.slice(-1000));
      }

      const chatJid = groupId ? `signal-group:${groupId}` : source;
      const senderName = envelope.sourceName || source;
      const isoTimestamp = new Date(timestamp).toISOString();

      logger.info({ chatJid, source, isSyncMessage, text: msgData.message.substring(0, 50) }, 'Received Signal message');

      // Always notify about chat metadata for discovery
      this.opts.onChatMetadata(chatJid, isoTimestamp);

      // Only deliver full message for registered groups
      const groups = this.opts.registeredGroups();
      if (groups[chatJid]) {
        this.opts.onMessage(chatJid, {
          id: dedupeKey,
          chat_jid: chatJid,
          sender: source,
          sender_name: senderName,
          content: msgData.message,
          timestamp: isoTimestamp,
          is_from_me: isSyncMessage,
        });
      }
    } catch (err) {
      logger.error({ err }, 'Error handling Signal webhook');
    }
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Signal channel not connected');
    }

    const isGroup = jid.startsWith('signal-group:');
    const body: Record<string, unknown> = {
      message: text,
      number: this.opts.phoneNumber,
    };

    if (isGroup) {
      // The webhook gives us the internal_id (raw base64).
      // The send API needs the full group ID: "group." + base64(internal_id_string).
      const internalId = jid.replace('signal-group:', '');
      const groupApiId = 'group.' + Buffer.from(internalId).toString('base64');
      body.recipients = [groupApiId];
    } else {
      body.recipients = [jid];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${this.apiUrl}/v2/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Signal API send failed: ${response.status} ${errorText}`);
      }

      logger.info({ jid, length: text.length }, 'Signal message sent');
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Signal API timeout sending to ${jid}`);
      }
      throw err;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('signal-group:') || /^\+\d+$/.test(jid);
  }

  async disconnect(): Promise<void> {
    if (this.webhookServer) {
      await new Promise<void>((resolve) => {
        this.webhookServer!.close(() => {
          logger.info('Signal webhook server closed');
          resolve();
        });
      });
      this.webhookServer = undefined;
    }
    this.connected = false;
    logger.info('Signal channel disconnected');
  }

  async setTyping(_jid: string, _isTyping: boolean): Promise<void> {
    // signal-cli-rest-api doesn't expose typing indicators
  }
}
