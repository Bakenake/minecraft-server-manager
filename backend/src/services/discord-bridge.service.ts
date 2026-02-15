import { createChildLogger } from '../utils/logger';
import { ServerManager } from './server-manager';
import { config } from '../config';

const log = createChildLogger('discord-bridge');

interface DiscordMessage {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
  }>;
}

export class DiscordBridge {
  private static instance: DiscordBridge;
  private webhookUrl: string = '';
  private bridgedServers: Map<string, { chatEnabled: boolean; eventsEnabled: boolean }> = new Map();
  private chatPatterns = [
    // Vanilla/Paper/Spigot: <PlayerName> message
    /^\[[\d:]+\]\s*\[Server thread\/INFO\].*?:\s*<(\w+)>\s*(.+)$/,
    // Alternative format
    /<(\w+)>\s*(.+)$/,
  ];
  private joinLeavePatterns = [
    /(\w+) joined the game/,
    /(\w+) left the game/,
  ];
  private advancementPattern = /(\w+) has (?:made the advancement|completed the challenge) \[(.+)\]/;
  private deathPattern = /(\w+) (was |fell |drowned|burned|starved|suffocated|hit the ground|went up in flames|blew up|was shot|was slain|was killed|tried to swim|was impaled|was squashed|was pummeled|experienced kinetic energy|was blown up)/;

  static getInstance(): DiscordBridge {
    if (!DiscordBridge.instance) {
      DiscordBridge.instance = new DiscordBridge();
    }
    return DiscordBridge.instance;
  }

  setWebhookUrl(url: string): void {
    this.webhookUrl = url;
  }

  enableForServer(serverId: string, options?: { chat?: boolean; events?: boolean }): void {
    this.bridgedServers.set(serverId, {
      chatEnabled: options?.chat ?? true,
      eventsEnabled: options?.events ?? true,
    });
    log.info({ serverId, options }, 'Discord bridge enabled for server');
  }

  disableForServer(serverId: string): void {
    this.bridgedServers.delete(serverId);
    log.info({ serverId }, 'Discord bridge disabled for server');
  }

  isEnabled(serverId: string): boolean {
    return this.bridgedServers.has(serverId);
  }

  getSettings(serverId: string) {
    return this.bridgedServers.get(serverId) || { chatEnabled: false, eventsEnabled: false };
  }

  /**
   * Process a console line and relay relevant messages to Discord.
   */
  async processConsoleLine(serverId: string, line: string, serverName?: string): Promise<void> {
    const settings = this.bridgedServers.get(serverId);
    if (!settings || !this.webhookUrl) return;

    // Check for chat messages
    if (settings.chatEnabled) {
      for (const pattern of this.chatPatterns) {
        const match = line.match(pattern);
        if (match) {
          const [, playerName, message] = match;
          await this.sendToDiscord({
            content: message,
            username: `${playerName} (${serverName || 'MC'})`,
            avatar_url: `https://mc-heads.net/avatar/${playerName}/256`,
          });
          return;
        }
      }
    }

    // Check for events (join/leave, advancements, deaths)
    if (settings.eventsEnabled) {
      // Join/Leave
      for (const pattern of this.joinLeavePatterns) {
        const match = line.match(pattern);
        if (match) {
          const playerName = match[1];
          const isJoin = line.includes('joined');
          await this.sendToDiscord({
            embeds: [{
              description: `**${playerName}** ${isJoin ? '➡️ joined' : '⬅️ left'} the server`,
              color: isJoin ? 0x43b581 : 0xf04747,
              footer: { text: serverName || 'Minecraft' },
              timestamp: new Date().toISOString(),
            }],
          });
          return;
        }
      }

      // Advancement
      const advMatch = line.match(this.advancementPattern);
      if (advMatch) {
        const [, playerName, advancement] = advMatch;
        await this.sendToDiscord({
          embeds: [{
            description: `🏆 **${playerName}** earned **[${advancement}]**`,
            color: 0xfaa61a,
            footer: { text: serverName || 'Minecraft' },
            timestamp: new Date().toISOString(),
          }],
        });
        return;
      }

      // Death
      const deathMatch = line.match(this.deathPattern);
      if (deathMatch) {
        // Extract the full death message from the line
        const deathMsg = line.replace(/^\[[\d:]+\]\s*\[Server thread\/INFO\].*?:\s*/, '').trim();
        if (deathMsg) {
          await this.sendToDiscord({
            embeds: [{
              description: `💀 ${deathMsg}`,
              color: 0x99aab5,
              footer: { text: serverName || 'Minecraft' },
              timestamp: new Date().toISOString(),
            }],
          });
          return;
        }
      }
    }
  }

  /**
   * Send a server status change notification.
   */
  async sendServerStatus(serverName: string, status: string): Promise<void> {
    if (!this.webhookUrl) return;

    const statusEmojis: Record<string, string> = {
      running: '🟢',
      stopped: '🔴',
      starting: '🟡',
      stopping: '🟠',
      crashed: '💥',
    };

    await this.sendToDiscord({
      embeds: [{
        title: `${statusEmojis[status] || '❓'} Server ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        description: `**${serverName}** is now **${status}**`,
        color: status === 'running' ? 0x43b581 : status === 'crashed' ? 0xf04747 : 0xfaa61a,
        timestamp: new Date().toISOString(),
      }],
    });
  }

  /**
   * Send a backup notification.
   */
  async sendBackupNotification(serverName: string, success: boolean, details?: string): Promise<void> {
    if (!this.webhookUrl) return;

    await this.sendToDiscord({
      embeds: [{
        title: success ? '✅ Backup Complete' : '❌ Backup Failed',
        description: `Server: **${serverName}**${details ? `\n${details}` : ''}`,
        color: success ? 0x43b581 : 0xf04747,
        timestamp: new Date().toISOString(),
      }],
    });
  }

  private async sendToDiscord(message: DiscordMessage): Promise<void> {
    if (!this.webhookUrl) return;

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!response.ok && response.status === 429) {
        // Rate limited — wait and retry once
        const retryAfter = parseInt(response.headers.get('retry-after') || '1') * 1000;
        await new Promise((res) => setTimeout(res, retryAfter));
        await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
      }
    } catch (err) {
      log.debug({ error: err }, 'Failed to send Discord message');
    }
  }
}
