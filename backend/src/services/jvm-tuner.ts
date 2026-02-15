/**
 * JVM Flag Presets — optimized startup flag configurations for Minecraft servers.
 */

export interface JvmPreset {
  id: string;
  name: string;
  description: string;
  category: 'general' | 'gc' | 'performance' | 'debug';
  recommended: boolean;
  minJava: number; // e.g. 17
  flags: string[];
}

export const JVM_PRESETS: JvmPreset[] = [
  {
    id: 'aikars',
    name: "Aikar's Flags",
    description: 'Industry-standard GC flags optimized for Minecraft. Recommended for most servers.',
    category: 'gc',
    recommended: true,
    minJava: 8,
    flags: [
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
      '-Dusing.aikars.flags=https://mcflags.emc.gs',
      '-Daikars.new.flags=true',
    ],
  },
  {
    id: 'aikars-12g',
    name: "Aikar's Flags (12GB+)",
    description: "Extended Aikar's flags for servers with 12GB+ RAM allocations.",
    category: 'gc',
    recommended: false,
    minJava: 8,
    flags: [
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+DisableExplicitGC',
      '-XX:+AlwaysPreTouch',
      '-XX:G1NewSizePercent=40',
      '-XX:G1MaxNewSizePercent=50',
      '-XX:G1HeapRegionSize=16M',
      '-XX:G1ReservePercent=15',
      '-XX:G1HeapWastePercent=5',
      '-XX:G1MixedGCCountTarget=4',
      '-XX:InitiatingHeapOccupancyPercent=20',
      '-XX:G1MixedGCLiveThresholdPercent=90',
      '-XX:G1RSetUpdatingPauseTimePercent=5',
      '-XX:SurvivorRatio=32',
      '-XX:+PerfDisableSharedMem',
      '-XX:MaxTenuringThreshold=1',
      '-Dusing.aikars.flags=https://mcflags.emc.gs',
      '-Daikars.new.flags=true',
    ],
  },
  {
    id: 'zgc',
    name: 'ZGC (Low Latency)',
    description: 'Z Garbage Collector — sub-millisecond GC pauses. Best for 16GB+ RAM. Java 17+ only.',
    category: 'gc',
    recommended: false,
    minJava: 17,
    flags: [
      '-XX:+UseZGC',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+AlwaysPreTouch',
      '-XX:+DisableExplicitGC',
      '-XX:+PerfDisableSharedMem',
      '-XX:+ZGenerational',
    ],
  },
  {
    id: 'shenandoah',
    name: 'Shenandoah GC',
    description: 'Ultra-low pause time GC. Good alternative to ZGC. Available in OpenJDK.',
    category: 'gc',
    recommended: false,
    minJava: 11,
    flags: [
      '-XX:+UseShenandoahGC',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+AlwaysPreTouch',
      '-XX:+DisableExplicitGC',
      '-XX:+PerfDisableSharedMem',
      '-XX:ShenandoahGCHeuristics=adaptive',
    ],
  },
  {
    id: 'graalvm',
    name: 'GraalVM Optimized',
    description: 'Flags for GraalVM JDK with C2 JIT compiler. Can provide 10-20% performance boost.',
    category: 'performance',
    recommended: false,
    minJava: 17,
    flags: [
      '-XX:+UseG1GC',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+UnlockDiagnosticVMOptions',
      '-XX:+AlwaysPreTouch',
      '-XX:+DisableExplicitGC',
      '-XX:+PerfDisableSharedMem',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200',
      '-XX:G1NewSizePercent=30',
      '-XX:G1MaxNewSizePercent=40',
      '-XX:G1HeapRegionSize=8M',
      '-XX:G1ReservePercent=20',
      '-XX:G1HeapWastePercent=5',
      '-XX:G1MixedGCCountTarget=4',
      '-XX:InitiatingHeapOccupancyPercent=15',
      '-XX:+EnableJVMCI',
      '-XX:+UseJVMCICompiler',
    ],
  },
  {
    id: 'minimal',
    name: 'Minimal (Light)',
    description: 'Lightweight flags for small servers or limited hardware. Under 4GB RAM.',
    category: 'general',
    recommended: false,
    minJava: 8,
    flags: [
      '-XX:+UseG1GC',
      '-XX:+DisableExplicitGC',
      '-XX:MaxGCPauseMillis=100',
      '-XX:+AlwaysPreTouch',
    ],
  },
  {
    id: 'debug',
    name: 'Debug Mode',
    description: 'Enables verbose GC logging and JMX remote monitoring. Do not use in production.',
    category: 'debug',
    recommended: false,
    minJava: 11,
    flags: [
      '-XX:+UseG1GC',
      '-Xlog:gc*:file=gc.log:time,uptime:filecount=5,filesize=10m',
      '-XX:+HeapDumpOnOutOfMemoryError',
      '-XX:HeapDumpPath=./heap-dump.hprof',
      '-Dcom.sun.management.jmxremote',
      '-Dcom.sun.management.jmxremote.port=9010',
      '-Dcom.sun.management.jmxremote.local.only=false',
      '-Dcom.sun.management.jmxremote.authenticate=false',
      '-Dcom.sun.management.jmxremote.ssl=false',
    ],
  },
];

export interface JvmFlagExplanation {
  flag: string;
  description: string;
  category: string;
}

export const JVM_FLAG_EXPLANATIONS: JvmFlagExplanation[] = [
  { flag: '-Xms', description: 'Initial heap size. Set equal to -Xmx for best performance.', category: 'Memory' },
  { flag: '-Xmx', description: 'Maximum heap size. This is the max RAM the server can use.', category: 'Memory' },
  { flag: '-XX:+UseG1GC', description: 'Use G1 garbage collector. Best general-purpose GC for Minecraft.', category: 'GC' },
  { flag: '-XX:+UseZGC', description: 'Use Z garbage collector. Sub-millisecond pauses. Java 17+ required.', category: 'GC' },
  { flag: '-XX:+UseShenandoahGC', description: 'Use Shenandoah GC. Ultra-low pause times. OpenJDK only.', category: 'GC' },
  { flag: '-XX:MaxGCPauseMillis', description: 'Target max GC pause time. Lower = smoother gameplay but more frequent GC.', category: 'GC' },
  { flag: '-XX:+AlwaysPreTouch', description: 'Pre-allocate all heap memory at startup. Prevents allocation lag spikes.', category: 'Performance' },
  { flag: '-XX:+DisableExplicitGC', description: 'Prevent plugins from calling System.gc(). Reduces unnecessary GC pauses.', category: 'Performance' },
  { flag: '-XX:+ParallelRefProcEnabled', description: 'Process reference objects in parallel during GC. Speeds up GC cycles.', category: 'GC' },
  { flag: '-XX:G1NewSizePercent', description: 'Minimum percent of heap for young generation. Higher = better for short-lived objects.', category: 'GC' },
  { flag: '-XX:G1MaxNewSizePercent', description: 'Maximum percent of heap for young generation.', category: 'GC' },
  { flag: '-XX:G1HeapRegionSize', description: 'Size of G1 heap regions. 8-16MB recommended for Minecraft.', category: 'GC' },
  { flag: '-XX:G1ReservePercent', description: 'Percentage of heap to reserve for GC overhead.', category: 'GC' },
  { flag: '-XX:+PerfDisableSharedMem', description: 'Disable shared memory in G1. Reduces false sharing in NUMA systems.', category: 'Performance' },
  { flag: '-XX:MaxTenuringThreshold', description: 'How many GC cycles before promoting to old gen. 1 = aggressive promotion.', category: 'GC' },
  { flag: '-XX:SurvivorRatio', description: 'Ratio of eden vs survivor space. Higher = more eden space.', category: 'GC' },
  { flag: '-XX:+HeapDumpOnOutOfMemoryError', description: 'Create heap dump file when OutOfMemoryError occurs. Useful for debugging.', category: 'Debug' },
];

/**
 * Build the full JVM argument string for a server.
 */
export function buildJvmArgs(
  minRam: number,
  maxRam: number,
  presetId?: string,
  customFlags?: string[]
): string[] {
  const args: string[] = [
    `-Xms${minRam}M`,
    `-Xmx${maxRam}M`,
  ];

  if (presetId) {
    const preset = JVM_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      args.push(...preset.flags);
    }
  }

  if (customFlags && customFlags.length > 0) {
    args.push(...customFlags);
  }

  return args;
}

/**
 * Estimate the real memory usage based on heap size.
 * JVM typically uses 20-30% more than the heap for metaspace, code cache, etc.
 */
export function estimateRealMemory(maxRamMB: number): {
  heap: number;
  estimated: number;
  overhead: number;
} {
  const overheadPercent = maxRamMB > 8192 ? 0.15 : maxRamMB > 4096 ? 0.20 : 0.25;
  const overhead = Math.ceil(maxRamMB * overheadPercent);
  return {
    heap: maxRamMB,
    estimated: maxRamMB + overhead,
    overhead,
  };
}
