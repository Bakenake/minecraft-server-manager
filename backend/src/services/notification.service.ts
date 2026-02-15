import { config } from '../config';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('notifications');

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
  footer?: { text: string };
}

/**
 * Discord webhook notification service.
 *
 * Set DISCORD_WEBHOOK_URL in .env to enable.
 * Events: server start/stop/crash, backup complete/fail, player join/leave
 */
export class NotificationService {
  private static instance: NotificationService;
  private webhookUrl: string;

  private constructor() {
    this.webhookUrl = config.discord.webhookUrl;
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  get enabled(): boolean {
    return !!this.webhookUrl;
  }

  /**
   * Update webhook URL at runtime (e.g. from settings page)
   */
  setWebhookUrl(url: string): void {
    this.webhookUrl = url;
  }

  // ─── High-level helpers ──────────────────────────────────

  async serverStarted(serverName: string): Promise<void> {
    await this.send({
      title: '🟢 Server Started',
      description: `**${serverName}** is now online.`,
      color: 0x22c55e, // green
    });
  }

  async serverStopped(serverName: string): Promise<void> {
    await this.send({
      title: '🔴 Server Stopped',
      description: `**${serverName}** has been shut down.`,
      color: 0xef4444, // red
    });
  }

  async serverCrashed(serverName: string, error?: string): Promise<void> {
    await this.send({
      title: '💥 Server Crashed',
      description: `**${serverName}** has crashed!`,
      color: 0xdc2626, // dark red
      fields: error ? [{ name: 'Error', value: error.slice(0, 1024) }] : undefined,
    });
  }

  async backupCompleted(serverName: string, backupName: string, sizeBytes: number): Promise<void> {
    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
    await this.send({
      title: '📦 Backup Completed',
      description: `Backup for **${serverName}** finished.`,
      color: 0x3b82f6, // blue
      fields: [
        { name: 'Name', value: backupName, inline: true },
        { name: 'Size', value: `${sizeMb} MB`, inline: true },
      ],
    });
  }

  async backupFailed(serverName: string, error: string): Promise<void> {
    await this.send({
      title: '⚠️ Backup Failed',
      description: `Backup for **${serverName}** failed.`,
      color: 0xf59e0b, // amber
      fields: [{ name: 'Error', value: error.slice(0, 1024) }],
    });
  }

  async playerJoined(serverName: string, playerName: string): Promise<void> {
    await this.send({
      title: '➡️ Player Joined',
      description: `**${playerName}** joined **${serverName}**.`,
      color: 0x06b6d4, // cyan
    });
  }

  async playerLeft(serverName: string, playerName: string): Promise<void> {
    await this.send({
      title: '⬅️ Player Left',
      description: `**${playerName}** left **${serverName}**.`,
      color: 0x64748b, // gray
    });
  }

  // ─── Core send ───────────────────────────────────────────

  private async send(embed: DiscordEmbed): Promise<void> {
    if (!this.webhookUrl) return;

    embed.timestamp = new Date().toISOString();
    embed.footer = { text: 'CraftOS Server Manager' };

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'CraftOS',
          embeds: [embed],
        }),
      });

      if (!response.ok) {
        log.warn({ status: response.status }, 'Discord webhook returned non-OK status');
      }
    } catch (err) {
      log.error({ err }, 'Failed to send Discord webhook notification');
    }
  }
}

/** Convenience accessor */
export function notify(): NotificationService {
  return NotificationService.getInstance();
}
