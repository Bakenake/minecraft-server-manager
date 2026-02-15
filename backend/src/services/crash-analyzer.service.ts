import { createChildLogger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

const log = createChildLogger('crash-analyzer');

export interface CrashReport {
  timestamp: string;
  description: string;
  javaVersion: string;
  minecraftVersion: string;
  serverType: string;
  stackTrace: string[];
  suspectedMods: string[];
  suspectedPlugins: string[];
  suggestions: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  rawContent: string;
}

// Known crash patterns → human-readable suggestions
const CRASH_PATTERNS: Array<{
  pattern: RegExp;
  suggestion: string;
  severity: CrashReport['severity'];
  category: string;
}> = [
  {
    pattern: /java\.lang\.OutOfMemoryError/i,
    suggestion: 'Server ran out of memory. Increase the max RAM allocation (-Xmx) in server settings.',
    severity: 'critical',
    category: 'memory',
  },
  {
    pattern: /java\.lang\.StackOverflowError/i,
    suggestion: 'Infinite recursion detected. A plugin or mod has a bug causing stack overflow. Check recently added plugins.',
    severity: 'high',
    category: 'plugin',
  },
  {
    pattern: /Could not reserve enough space for.*object heap/i,
    suggestion: 'System does not have enough free memory. Reduce the max RAM or close other applications.',
    severity: 'critical',
    category: 'memory',
  },
  {
    pattern: /TickNextTick.*out of bounds/i,
    suggestion: 'World corruption detected. Try restoring from a backup or deleting the problematic chunks.',
    severity: 'high',
    category: 'world',
  },
  {
    pattern: /Failed to start the minecraft server/i,
    suggestion: 'Server JAR failed to initialize. Check if the correct Java version is installed for your Minecraft version.',
    severity: 'high',
    category: 'startup',
  },
  {
    pattern: /Unable to access jarfile/i,
    suggestion: 'Server JAR file not found or inaccessible. Verify the JAR file path and permissions.',
    severity: 'high',
    category: 'startup',
  },
  {
    pattern: /Address already in use/i,
    suggestion: 'The server port is already in use. Change the port in server.properties or stop the conflicting process.',
    severity: 'medium',
    category: 'network',
  },
  {
    pattern: /FAILED TO BIND TO PORT/i,
    suggestion: 'Cannot bind to the configured port. Another server or process is using it. Change the port or stop the other process.',
    severity: 'medium',
    category: 'network',
  },
  {
    pattern: /ClassNotFoundException/i,
    suggestion: 'A required class is missing. This usually means a plugin dependency is not installed or is incompatible.',
    severity: 'medium',
    category: 'plugin',
  },
  {
    pattern: /NoClassDefFoundError/i,
    suggestion: 'Class definition not found at runtime. A plugin was compiled against a different server API version.',
    severity: 'medium',
    category: 'plugin',
  },
  {
    pattern: /UnsupportedClassVersionError/i,
    suggestion: 'Java version mismatch. The plugin/mod requires a newer Java version than what is currently installed.',
    severity: 'high',
    category: 'java',
  },
  {
    pattern: /ConcurrentModificationException/i,
    suggestion: 'Thread-safety bug in a plugin. The plugin is modifying a collection while iterating over it.',
    severity: 'medium',
    category: 'plugin',
  },
  {
    pattern: /Chunk file at.*is missing level data/i,
    suggestion: 'Chunk corruption detected. Delete the corrupted region file or restore from backup.',
    severity: 'high',
    category: 'world',
  },
  {
    pattern: /Mixin apply.*failed/i,
    suggestion: 'A Fabric/Forge mixin failed to apply. Two mods are likely conflicting. Check for mod incompatibilities.',
    severity: 'high',
    category: 'mod',
  },
  {
    pattern: /DuplicateModsFoundException/i,
    suggestion: 'Duplicate mods detected. Remove the duplicate JAR files from the mods folder.',
    severity: 'medium',
    category: 'mod',
  },
  {
    pattern: /Missing or unsupported mandatory dependencies/i,
    suggestion: 'A mod is missing required dependencies. Install the required dependency mods listed in the error.',
    severity: 'medium',
    category: 'mod',
  },
  {
    pattern: /You need to agree to the EULA/i,
    suggestion: 'EULA not accepted. Set eula=true in eula.txt to accept the Minecraft EULA.',
    severity: 'low',
    category: 'startup',
  },
  {
    pattern: /Ticking entity/i,
    suggestion: 'An entity is causing a crash during tick processing. This may be a corrupted entity or a mod bug.',
    severity: 'high',
    category: 'world',
  },
  {
    pattern: /Ticking block entity/i,
    suggestion: 'A block entity (tile entity) is crashing the server. May require removing the chunk or block.',
    severity: 'high',
    category: 'world',
  },
  {
    pattern: /watchdog/i,
    suggestion: 'Server watchdog detected the main thread has stalled. A plugin or world operation is taking too long.',
    severity: 'critical',
    category: 'performance',
  },
];

export class CrashAnalyzer {
  private static instance: CrashAnalyzer;

  static getInstance(): CrashAnalyzer {
    if (!CrashAnalyzer.instance) {
      CrashAnalyzer.instance = new CrashAnalyzer();
    }
    return CrashAnalyzer.instance;
  }

  /**
   * Analyze a crash report file or string content.
   */
  analyze(content: string): CrashReport {
    const lines = content.split('\n');

    // Extract metadata
    const description = this.extractField(content, /Description:\s*(.+)/i) || 'Unknown crash';
    const javaVersion = this.extractField(content, /Java Version:\s*(.+)/i)
      || this.extractField(content, /java\.version[=:]\s*(.+)/i)
      || 'Unknown';
    const minecraftVersion = this.extractField(content, /Minecraft Version:\s*(.+)/i)
      || this.extractField(content, /minecraft_version[=:]\s*(.+)/i)
      || 'Unknown';
    const serverType = this.extractField(content, /Server Brand:\s*(.+)/i)
      || this.extractField(content, /Implementation Name:\s*(.+)/i)
      || 'Unknown';
    const timestamp = this.extractField(content, /Time:\s*(.+)/i)
      || new Date().toISOString();

    // Extract stack trace
    const stackTrace: string[] = [];
    let inStack = false;
    for (const line of lines) {
      if (line.trim().startsWith('at ') || line.trim().startsWith('Caused by:')) {
        inStack = true;
        stackTrace.push(line.trim());
      } else if (inStack && line.trim() === '') {
        inStack = false;
      }
    }

    // Detect suspected plugins and mods from stack trace
    const suspectedPlugins = this.extractPluginsFromStack(stackTrace, content);
    const suspectedMods = this.extractModsFromStack(stackTrace, content);

    // Match crash patterns
    const matchedPatterns = CRASH_PATTERNS.filter((p) => p.pattern.test(content));
    const suggestions = matchedPatterns.map((p) => p.suggestion);
    const severity = this.calculateSeverity(matchedPatterns);

    // Add generic suggestions if none matched
    if (suggestions.length === 0) {
      suggestions.push(
        'This crash could not be automatically identified. Try the following:',
        '1. Check if all plugins/mods are compatible with your server version.',
        '2. Try removing recently added plugins/mods one at a time.',
        '3. Ensure you are using the correct Java version for your Minecraft version.',
        '4. Try restoring from a recent backup.',
      );
    }

    return {
      timestamp,
      description,
      javaVersion,
      minecraftVersion,
      serverType,
      stackTrace: stackTrace.slice(0, 50), // Limit to 50 lines
      suspectedMods,
      suspectedPlugins,
      suggestions,
      severity,
      rawContent: content,
    };
  }

  /**
   * Find crash report files in a server directory.
   */
  findCrashReports(serverDir: string): string[] {
    const crashDir = path.join(serverDir, 'crash-reports');
    if (!fs.existsSync(crashDir)) return [];

    try {
      return fs.readdirSync(crashDir)
        .filter((f) => f.endsWith('.txt'))
        .sort()
        .reverse()
        .slice(0, 50); // Latest 50
    } catch {
      return [];
    }
  }

  /**
   * Read and analyze a specific crash report.
   */
  analyzeFile(serverDir: string, filename: string): CrashReport | null {
    const filePath = path.join(serverDir, 'crash-reports', filename);
    const resolved = path.resolve(filePath);
    const serverRoot = path.resolve(serverDir);

    // Path traversal protection
    if (!resolved.startsWith(serverRoot)) return null;

    try {
      const content = fs.readFileSync(resolved, 'utf-8');
      const report = this.analyze(content);
      return report;
    } catch {
      return null;
    }
  }

  /**
   * Analyze the latest server log for errors.
   */
  analyzeLatestLog(serverDir: string): {
    errors: string[];
    warnings: string[];
    crashIndicators: string[];
  } {
    const logPath = path.join(serverDir, 'logs', 'latest.log');
    if (!fs.existsSync(logPath)) {
      return { errors: [], warnings: [], crashIndicators: [] };
    }

    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n');

      const errors: string[] = [];
      const warnings: string[] = [];
      const crashIndicators: string[] = [];

      for (const line of lines) {
        if (/\[.*ERROR\]/i.test(line) || /\bERROR\b/.test(line)) {
          errors.push(line.trim());
        } else if (/\[.*WARN\]/i.test(line) || /\bWARN\b/.test(line)) {
          warnings.push(line.trim());
        }

        // Check for crash indicators
        for (const pattern of CRASH_PATTERNS) {
          if (pattern.pattern.test(line)) {
            crashIndicators.push(line.trim());
          }
        }
      }

      return {
        errors: errors.slice(-100),
        warnings: warnings.slice(-100),
        crashIndicators: crashIndicators.slice(-20),
      };
    } catch {
      return { errors: [], warnings: [], crashIndicators: [] };
    }
  }

  private extractField(content: string, pattern: RegExp): string | null {
    const match = content.match(pattern);
    return match ? match[1].trim() : null;
  }

  private extractPluginsFromStack(stack: string[], fullContent: string): string[] {
    const plugins = new Set<string>();

    // Common plugin package patterns
    const pluginPatterns = [
      /at\s+(?:com|net|org|io|me|de)\.[\w.]+\.(\w+)\.(?:\w+\.)*\w+/g,
      /Plugin\s+(\w+)\s+v[\d.]+/g,
      /Enabling\s+(\w+)\s+v[\d.]+/g,
    ];

    const combined = stack.join('\n') + '\n' + fullContent;
    for (const pattern of pluginPatterns) {
      let match;
      while ((match = pattern.exec(combined)) !== null) {
        const name = match[1];
        // Filter out standard packages
        if (!['java', 'sun', 'com', 'net', 'org', 'minecraft', 'mojang', 'bukkit', 'spigot', 'paper', 'nms', 'craftbukkit'].includes(name.toLowerCase())) {
          plugins.add(name);
        }
      }
    }

    return Array.from(plugins).slice(0, 10);
  }

  private extractModsFromStack(stack: string[], fullContent: string): string[] {
    const mods = new Set<string>();

    // Fabric/Forge mod patterns
    const modPatterns = [
      /\[([A-Za-z][\w-]+)\]/g,
      /mod[_\s]id[=:]\s*"?(\w+)"?/gi,
      /Mod\s+ID:\s*(\w+)/gi,
    ];

    const combined = stack.join('\n') + '\n' + fullContent;
    for (const pattern of modPatterns) {
      let match;
      while ((match = pattern.exec(combined)) !== null) {
        const name = match[1];
        if (name.length > 2 && !['INFO', 'WARN', 'ERROR', 'DEBUG', 'FATAL', 'Server', 'Thread', 'main'].includes(name)) {
          mods.add(name);
        }
      }
    }

    return Array.from(mods).slice(0, 10);
  }

  private calculateSeverity(
    patterns: typeof CRASH_PATTERNS
  ): CrashReport['severity'] {
    if (patterns.some((p) => p.severity === 'critical')) return 'critical';
    if (patterns.some((p) => p.severity === 'high')) return 'high';
    if (patterns.some((p) => p.severity === 'medium')) return 'medium';
    return 'low';
  }
}
