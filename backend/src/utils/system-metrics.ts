import si from 'systeminformation';
import pidusage from 'pidusage';
import { createChildLogger } from './logger';

const log = createChildLogger('system-metrics');

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    model: string;
    speed: number;
    temperature?: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
  };
  os: {
    platform: string;
    distro: string;
    release: string;
    arch: string;
    uptime: number;
  };
}

export interface ProcessMetrics {
  pid: number;
  cpu: number;
  memory: number; // bytes
  memoryPercent: number;
}

let cachedCpuInfo: { model: string; cores: number; speed: number } | null = null;

/**
 * Get comprehensive system metrics
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  try {
    const [cpuLoad, mem, disk, netStats, osInfo] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.osInfo(),
    ]);

    // Cache CPU info (static data)
    if (!cachedCpuInfo) {
      const cpuInfo = await si.cpu();
      cachedCpuInfo = {
        model: `${cpuInfo.manufacturer} ${cpuInfo.brand}`,
        cores: cpuInfo.cores,
        speed: cpuInfo.speed,
      };
    }

    // Aggregate disk space
    const totalDisk = disk.reduce((sum, d) => sum + d.size, 0);
    const usedDisk = disk.reduce((sum, d) => sum + d.used, 0);

    // Aggregate network
    const totalNetIn = netStats.reduce((sum, n) => sum + n.rx_bytes, 0);
    const totalNetOut = netStats.reduce((sum, n) => sum + n.tx_bytes, 0);

    // Try to get CPU temp
    let temperature: number | undefined;
    try {
      const temp = await si.cpuTemperature();
      if (temp.main > 0) temperature = temp.main;
    } catch {
      // Not all platforms support temperature
    }

    return {
      cpu: {
        usage: Math.round(cpuLoad.currentLoad * 100) / 100,
        cores: cachedCpuInfo.cores,
        model: cachedCpuInfo.model,
        speed: cachedCpuInfo.speed,
        temperature,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        usagePercent: Math.round((mem.used / mem.total) * 10000) / 100,
      },
      disk: {
        total: totalDisk,
        used: usedDisk,
        free: totalDisk - usedDisk,
        usagePercent: totalDisk > 0 ? Math.round((usedDisk / totalDisk) * 10000) / 100 : 0,
      },
      network: {
        bytesIn: totalNetIn,
        bytesOut: totalNetOut,
      },
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        arch: osInfo.arch,
        uptime: si.time().uptime ?? 0,
      },
    };
  } catch (error) {
    log.error({ error }, 'Failed to collect system metrics');
    throw error;
  }
}

/**
 * Get resource usage for a specific process (uses pidusage for reliability on Windows)
 */
export async function getProcessMetrics(pid: number): Promise<ProcessMetrics | null> {
  try {
    // pidusage is fast and cross-platform — much more reliable than si.processes()
    const stats = await pidusage(pid);
    return {
      pid,
      cpu: Math.round(stats.cpu * 100) / 100,
      memory: stats.memory ?? 0, // bytes
      memoryPercent: 0, // pidusage doesn't provide % — we'll calculate if needed
    };
  } catch {
    // Fallback to systeminformation if pidusage fails (process might have exited)
    try {
      const processes = await si.processes();
      const proc = processes.list.find((p) => p.pid === pid);
      if (!proc) return null;
      return {
        pid: proc.pid,
        cpu: Math.round(proc.cpu * 100) / 100,
        memory: proc.memRss ?? 0,
        memoryPercent: Math.round((proc.mem ?? 0) * 100) / 100,
      };
    } catch (error) {
      log.error({ error, pid }, 'Failed to get process metrics');
      return null;
    }
  }
}
