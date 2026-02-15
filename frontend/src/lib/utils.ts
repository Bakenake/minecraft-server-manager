import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function formatPlayTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'text-success-400';
    case 'starting':
    case 'stopping':
      return 'text-warning-400';
    case 'crashed':
      return 'text-danger-400';
    default:
      return 'text-dark-400';
  }
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'running':
      return 'badge-success';
    case 'starting':
    case 'stopping':
      return 'badge-warning';
    case 'crashed':
      return 'badge-danger';
    default:
      return 'badge-neutral';
  }
}

export function getServerTypeIcon(type: string): string {
  switch (type) {
    case 'vanilla':
      return '🟫';
    case 'paper':
      return '📄';
    case 'spigot':
      return '🔶';
    case 'forge':
      return '🔨';
    case 'fabric':
      return '🧵';
    default:
      return '📦';
  }
}

/**
 * Human-readable description of a cron expression.
 * Handles common patterns; falls back to raw expression for complex ones.
 */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Every minute
  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every minute';
  }

  // Every N minutes
  const everyMinMatch = minute.match(/^\*\/(\d+)$/);
  if (everyMinMatch && hour === '*') {
    return `Every ${everyMinMatch[1]} minutes`;
  }

  // Every N hours
  const everyHourMatch = hour.match(/^\*\/(\d+)$/);
  if (everyHourMatch && minute !== '*') {
    return `Every ${everyHourMatch[1]} hours at :${minute.padStart(2, '0')}`;
  }
  if (everyHourMatch && minute === '0') {
    return `Every ${everyHourMatch[1]} hours`;
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const pad = (v: string) => v.padStart(2, '0');
  const timeStr = `${pad(hour)}:${pad(minute)}`;

  // Specific time, every day
  if (minute.match(/^\d+$/) && hour.match(/^\d+$/) && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Daily at ${timeStr}`;
  }

  // Specific time on specific days of week
  if (minute.match(/^\d+$/) && hour.match(/^\d+$/) && dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const days = dayOfWeek.split(',').map((d) => dayNames[parseInt(d)] || d).join(', ');
    return `${days} at ${timeStr}`;
  }

  // Specific time on specific days of month
  if (minute.match(/^\d+$/) && hour.match(/^\d+$/) && dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
    return `Day ${dayOfMonth} of each month at ${timeStr}`;
  }

  return cron;
}
