import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { createChildLogger } from '../utils/logger';
import { Server } from '../db/schema';
import { getBestJavaPath } from '../utils/java-installer';

const log = createChildLogger('server-instance');

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';

export interface ServerEvent {
  type: 'status' | 'log' | 'player_join' | 'player_leave' | 'tps' | 'error' | 'crash';
  serverId: string;
  data: unknown;
  timestamp: Date;
}

export interface PlayerInfo {
  username: string;
  uuid?: string;
  joinedAt: Date;
}

export class ServerInstance extends EventEmitter {
  public readonly id: string;
  public status: ServerStatus = 'stopped';
  public startedAt: Date | null = null;
  public pid: number | null = null;
  public players: Map<string, PlayerInfo> = new Map();
  public tps: number = 20.0;
  public cpuUsage: number = 0;
  public ramUsage: number = 0;

  private process: ChildProcess | null = null;
  private serverConfig: Server;
  private logBuffer: string[] = [];
  private maxLogBuffer = 2000;
  private crashCount = 0;
  private maxCrashRestarts = 5;
  private crashResetTimeout: NodeJS.Timeout | null = null;
  private isGracefulStop = false;

  // Log parsing patterns — match both vanilla and Paper/Spigot formats
  // Vanilla:  [12:35:32] [Server thread/INFO]: message
  // Paper:    [12:35:32 INFO]: message
  private static readonly PATTERNS = {
    READY: /Done \([\d.]+s\)!/,
    PLAYER_JOIN: /:\s*(\w+)\s+joined the game/,
    PLAYER_LEAVE: /:\s*(\w+)\s+left the game/,
    PLAYER_UUID: /UUID of player (\w+) is ([0-9a-f-]+)/,
    TPS: /TPS from last \d+\w?: ([\d.,]+)/,
    PAPER_TPS: /TPS from last 1m, 5m, 15m: .*?([\d.]+),/,
    STOPPING: /Stopping (the )?server/,
    CRASH: /---- Minecraft Crash Report ----/,
    ERROR: /\bERROR\b/,
    WARN: /\bWARN\b/,
    CHAT: /<(\w+)>\s*(.*)/,
    COMMAND: /(\w+) issued server command:\s*(.*)/,
    WORLD_SAVE: /Saved the (game|world)/,
  };

  constructor(serverConfig: Server) {
    super();
    this.id = serverConfig.id;
    this.serverConfig = serverConfig;
    this.setMaxListeners(50);
  }

  public updateConfig(config: Server): void {
    this.serverConfig = config;
  }

  public getConfig(): Server {
    return this.serverConfig;
  }

  public getLogs(count = 100): string[] {
    return this.logBuffer.slice(-count);
  }

  public getUptime(): number {
    if (!this.startedAt) return 0;
    return Date.now() - this.startedAt.getTime();
  }

  public getPlayerCount(): number {
    return this.players.size;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────

  public async start(): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') {
      throw new Error(`Server ${this.id} is already ${this.status}`);
    }

    const { directory, jarFile, minRam, maxRam, jvmFlags } = this.serverConfig;
    let javaPath = this.serverConfig.javaPath;
    const serverDir = directory;
    const jarPath = path.join(serverDir, jarFile);

    // Validate server directory and JAR
    if (!fs.existsSync(serverDir)) {
      throw new Error(`Server directory does not exist: ${serverDir}`);
    }
    if (!fs.existsSync(jarPath)) {
      throw new Error(`Server JAR not found: ${jarPath}. The server JAR may not have downloaded correctly — try re-downloading it from the server settings.`);
    }

    // Resolve Java path — fall back to best available if stored path is invalid
    if (javaPath !== 'java' && !fs.existsSync(javaPath)) {
      const fallback = getBestJavaPath();
      log.warn({ serverId: this.id, stored: javaPath, fallback }, 'Stored Java path not found, falling back');
      javaPath = fallback;
    } else if (javaPath === 'java') {
      // Bare 'java' — try to resolve to bundled/best path first
      const best = getBestJavaPath();
      if (best !== 'java') {
        log.info({ serverId: this.id, resolved: best }, 'Resolved bare java to bundled path');
        javaPath = best;
      }
    }

    // Accept EULA
    const eulaPath = path.join(serverDir, 'eula.txt');
    fs.writeFileSync(eulaPath, 'eula=true\n', 'utf-8');

    this.setStatus('starting');
    this.isGracefulStop = false;

    // Build JVM arguments
    const args: string[] = [];

    // RAM allocation
    args.push(`-Xms${minRam}M`, `-Xmx${maxRam}M`);

    // Custom JVM flags
    if (jvmFlags) {
      const customFlags = jvmFlags.split(/\s+/).filter(Boolean);
      args.push(...customFlags);
    }

    // Default optimization flags
    args.push(
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+DisableExplicitGC',
      '-XX:+AlwaysPreTouch',
      '-XX:G1NewSizePercent=30',
      '-XX:G1MaxNewSizePercent=40',
      '-XX:G1HeapRegionSize=8M',
      '-XX:G1ReservePercent=20',
      '-XX:G1HeapWastePercent=5',
      '-XX:G1MixedGCCountTarget=4',
      '-XX:InitiatingHeapOccupancyPercent=15',
      '-XX:G1MixedGCLiveThresholdPercent=90',
      '-XX:G1RSetUpdatingPauseTimePercent=5',
      '-XX:SurvivorRatio=32',
      '-XX:+PerfDisableSharedMem',
      '-XX:MaxTenuringThreshold=1',
    );

    // JAR and server args
    args.push('-jar', jarFile, 'nogui');

    log.info({ serverId: this.id, javaPath, args: args.join(' ') }, 'Starting server');

    try {
      this.process = spawn(javaPath, args, {
        cwd: serverDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      });

      this.pid = this.process.pid ?? null;

      // Handle stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          this.handleLogLine(line.trim());
        }
      });

      // Handle stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          this.handleLogLine(`[STDERR] ${line.trim()}`);
        }
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        log.info({ serverId: this.id, code, signal }, 'Server process exited');
        this.pid = null;
        this.process = null;
        this.players.clear();

        if (this.isGracefulStop) {
          this.setStatus('stopped');
        } else if (code !== 0 && code !== null) {
          this.setStatus('crashed');
          this.emitEvent('crash', { code, signal });
          this.handleCrash();
        } else {
          this.setStatus('stopped');
        }
      });

      this.process.on('error', (error) => {
        log.error({ serverId: this.id, error }, 'Server process error');
        this.emitEvent('error', { message: error.message });
        this.setStatus('crashed');
        this.process = null;
        this.pid = null;
      });
    } catch (error) {
      this.setStatus('stopped');
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.status !== 'running' && this.status !== 'starting') {
      throw new Error(`Server ${this.id} is not running (status: ${this.status})`);
    }

    this.isGracefulStop = true;
    this.setStatus('stopping');

    // Send stop command
    this.sendCommand('stop');

    // Wait for graceful shutdown, force kill after 30s
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        log.warn({ serverId: this.id }, 'Server did not stop gracefully, force killing');
        this.kill();
        resolve();
      }, 30000);

      const checkStopped = () => {
        if (this.status === 'stopped') {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkStopped, 500);
        }
      };
      checkStopped();
    });
  }

  public async restart(): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') {
      await this.stop();
    }
    // Brief delay before restart
    await new Promise((r) => setTimeout(r, 2000));
    await this.start();
  }

  public kill(): void {
    if (this.process) {
      this.isGracefulStop = true;
      try {
        // On Windows, use taskkill; on Unix, send SIGKILL
        if (process.platform === 'win32' && this.pid) {
          spawn('taskkill', ['/F', '/PID', this.pid.toString()]);
        } else {
          this.process.kill('SIGKILL');
        }
      } catch (error) {
        log.error({ serverId: this.id, error }, 'Failed to kill server process');
      }
    }
    this.process = null;
    this.pid = null;
    this.players.clear();
    this.setStatus('stopped');
  }

  public sendCommand(command: string): void {
    if (!this.process?.stdin?.writable) {
      throw new Error(`Cannot send command to server ${this.id}: stdin not writable`);
    }
    this.process.stdin.write(`${command}\n`);
    log.debug({ serverId: this.id, command }, 'Sent command to server');
  }

  // ─── Log Parsing ──────────────────────────────────────────────

  private handleLogLine(line: string): void {
    // Add to buffer
    this.logBuffer.push(line);
    if (this.logBuffer.length > this.maxLogBuffer) {
      this.logBuffer.shift();
    }

    // Emit raw log event
    this.emitEvent('log', { line });

    // Parse for events
    this.parseLogLine(line);
  }

  private parseLogLine(line: string): void {
    // Server ready
    if (ServerInstance.PATTERNS.READY.test(line)) {
      this.setStatus('running');
      this.startedAt = new Date();
      log.info({ serverId: this.id }, 'Server is now running');
      return;
    }

    // Player join
    const joinMatch = line.match(ServerInstance.PATTERNS.PLAYER_JOIN);
    if (joinMatch) {
      const username = joinMatch[1];
      this.players.set(username, { username, joinedAt: new Date() });
      this.emitEvent('player_join', { username, playerCount: this.players.size });
      log.info({ serverId: this.id, username }, 'Player joined');
      return;
    }

    // Player leave
    const leaveMatch = line.match(ServerInstance.PATTERNS.PLAYER_LEAVE);
    if (leaveMatch) {
      const username = leaveMatch[1];
      this.players.delete(username);
      this.emitEvent('player_leave', { username, playerCount: this.players.size });
      log.info({ serverId: this.id, username }, 'Player left');
      return;
    }

    // Player UUID
    const uuidMatch = line.match(ServerInstance.PATTERNS.PLAYER_UUID);
    if (uuidMatch) {
      const [, username, uuid] = uuidMatch;
      const player = this.players.get(username);
      if (player) {
        player.uuid = uuid;
      }
      return;
    }

    // TPS (Spigot/Paper timings)
    const tpsMatch = line.match(ServerInstance.PATTERNS.TPS) || line.match(ServerInstance.PATTERNS.PAPER_TPS);
    if (tpsMatch) {
      this.tps = parseFloat(tpsMatch[1].replace(',', '.'));
      this.emitEvent('tps', { tps: this.tps });
      return;
    }

    // Crash report
    if (ServerInstance.PATTERNS.CRASH.test(line)) {
      this.emitEvent('crash', { line });
      return;
    }
  }

  // ─── Crash Recovery ───────────────────────────────────────────

  private handleCrash(): void {
    if (!this.serverConfig.autoRestart) {
      log.info({ serverId: this.id }, 'Auto-restart disabled, server will remain stopped');
      return;
    }

    this.crashCount++;

    // Reset crash count after 10 minutes of stability
    if (this.crashResetTimeout) clearTimeout(this.crashResetTimeout);
    this.crashResetTimeout = setTimeout(() => {
      this.crashCount = 0;
    }, 10 * 60 * 1000);

    if (this.crashCount > this.maxCrashRestarts) {
      log.error(
        { serverId: this.id, crashCount: this.crashCount },
        'Max crash restarts exceeded, server will not auto-restart'
      );
      this.emitEvent('error', {
        message: `Server crashed ${this.crashCount} times. Auto-restart disabled until manual intervention.`,
      });
      return;
    }

    const delay = Math.min(5000 * this.crashCount, 30000); // Exponential backoff, max 30s
    log.warn(
      { serverId: this.id, crashCount: this.crashCount, restartDelay: delay },
      'Auto-restarting crashed server'
    );

    setTimeout(() => {
      this.start().catch((error) => {
        log.error({ serverId: this.id, error }, 'Failed to auto-restart server');
      });
    }, delay);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private setStatus(status: ServerStatus): void {
    const oldStatus = this.status;
    this.status = status;
    if (oldStatus !== status) {
      this.emitEvent('status', { oldStatus, newStatus: status });
    }
  }

  private emitEvent(type: ServerEvent['type'], data: unknown): void {
    const event: ServerEvent = {
      type,
      serverId: this.id,
      data,
      timestamp: new Date(),
    };
    this.emit('event', event);
    this.emit(type, event);
  }

  public destroy(): void {
    if (this.process) {
      this.kill();
    }
    if (this.crashResetTimeout) {
      clearTimeout(this.crashResetTimeout);
    }
    this.removeAllListeners();
  }
}
