import type {
  WorldEventObservation,
  WorldObservation,
  WorldObservationProvider,
} from './worldCognitionContract';

export type AutonomousCognitiveReason = 'threat' | 'addressed';

export interface AutonomousCognitiveTrigger {
  reason: AutonomousCognitiveReason;
  /** Stable across insignificant frame-to-frame changes such as distance. */
  fingerprint: string;
}

export interface AutonomousCognitiveTurnRunner {
  /**
   * Returns true only when a model turn completed successfully. A false result
   * remains eligible for retry after the minimum interval.
   */
  runAutonomousTurn(
    observation: WorldObservation,
    trigger: AutonomousCognitiveTrigger,
  ): Promise<boolean>;
  interrupt?(): Promise<void>;
}

export interface AutonomousCognitiveTickOptions {
  observation: WorldObservationProvider;
  runner: AutonomousCognitiveTurnRunner;
  /**
   * Hard lower bound between provider attempts. The live integration must
   * choose this value deliberately; the core never schedules itself per frame.
   */
  minimumIntervalMs: number;
  /**
   * How long an unchanged actionable situation remains quiet after a
   * successful turn. Must be at least minimumIntervalMs.
   */
  repeatIntervalMs: number;
  now?: () => number;
  addressedEventTypes?: readonly string[];
  maxAddressAgeSeconds?: number;
}

export type AutonomousTickResult =
  | { state: 'ran'; trigger: AutonomousCognitiveTrigger }
  | { state: 'idle' | 'no-observation' | 'in-flight' | 'cadence-limited' | 'unchanged' | 'stopped' }
  | { state: 'not-ready'; trigger: AutonomousCognitiveTrigger }
  | { state: 'error'; trigger: AutonomousCognitiveTrigger; error: unknown };

const DEFAULT_ADDRESSED_EVENT_TYPES = [
  'agent-addressed',
  'companion-addressed',
  'distress-call',
] as const;

/**
 * Provider-neutral orchestration core for unprompted companion attention.
 *
 * `consider()` is intentionally caller-driven. A later James-present
 * integration chooses the polling cadence and live wiring; this class only
 * enforces minimum/repeat intervals, event gating, and single-flight behavior.
 */
export class AutonomousCognitiveTick {
  private readonly observation: WorldObservationProvider;
  private readonly runner: AutonomousCognitiveTurnRunner;
  private readonly minimumIntervalMs: number;
  private readonly repeatIntervalMs: number;
  private readonly now: () => number;
  private readonly addressedEventTypes: ReadonlySet<string>;
  private readonly maxAddressAgeSeconds: number;

  private stopped = false;
  private inFlight = false;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;
  private lastHandledAt = Number.NEGATIVE_INFINITY;
  private lastHandledFingerprint: string | null = null;

  constructor(options: AutonomousCognitiveTickOptions) {
    if (!Number.isFinite(options.minimumIntervalMs) || options.minimumIntervalMs <= 0) {
      throw new Error('minimumIntervalMs must be a positive finite number');
    }
    if (
      !Number.isFinite(options.repeatIntervalMs)
      || options.repeatIntervalMs < options.minimumIntervalMs
    ) {
      throw new Error('repeatIntervalMs must be finite and at least minimumIntervalMs');
    }
    const maxAddressAgeSeconds = options.maxAddressAgeSeconds ?? 10;
    if (!Number.isFinite(maxAddressAgeSeconds) || maxAddressAgeSeconds < 0) {
      throw new Error('maxAddressAgeSeconds must be a non-negative finite number');
    }

    this.observation = options.observation;
    this.runner = options.runner;
    this.minimumIntervalMs = options.minimumIntervalMs;
    this.repeatIntervalMs = options.repeatIntervalMs;
    this.now = options.now ?? Date.now;
    this.addressedEventTypes = new Set(
      options.addressedEventTypes ?? DEFAULT_ADDRESSED_EVENT_TYPES,
    );
    this.maxAddressAgeSeconds = maxAddressAgeSeconds;
  }

  async consider(): Promise<AutonomousTickResult> {
    if (this.stopped) return { state: 'stopped' };
    if (this.inFlight) return { state: 'in-flight' };

    const observation = this.observation();
    if (!observation) return { state: 'no-observation' };

    const trigger = this.selectTrigger(observation);
    if (!trigger) return { state: 'idle' };

    const now = this.now();
    if (now - this.lastAttemptAt < this.minimumIntervalMs) {
      return { state: 'cadence-limited' };
    }
    if (
      trigger.fingerprint === this.lastHandledFingerprint
      && now - this.lastHandledAt < this.repeatIntervalMs
    ) {
      return { state: 'unchanged' };
    }

    this.lastAttemptAt = now;
    this.inFlight = true;
    try {
      const completed = await this.runner.runAutonomousTurn(observation, trigger);
      if (!completed) return { state: 'not-ready', trigger };
      this.lastHandledFingerprint = trigger.fingerprint;
      this.lastHandledAt = this.now();
      return { state: 'ran', trigger };
    } catch (error) {
      return { state: 'error', trigger, error };
    } finally {
      this.inFlight = false;
    }
  }

  resume(): void {
    this.stopped = false;
  }

  async stop(interruptInFlight = true): Promise<void> {
    this.stopped = true;
    if (interruptInFlight && this.inFlight) await this.runner.interrupt?.();
  }

  isRunningTurn(): boolean {
    return this.inFlight;
  }

  private selectTrigger(observation: WorldObservation): AutonomousCognitiveTrigger | null {
    const threats = observation.threats
      ?.filter((threat) => threat.visible)
      .map((threat) => [
        threat.id ?? threat.type,
        threat.type,
        threat.state ?? 'unknown',
        threat.targeting ?? 'unknown-target',
      ].join(':'))
      .sort();
    if (threats?.length) {
      return {
        reason: 'threat',
        fingerprint: `threat:${threats.join('|')}`,
      };
    }

    const addressed = observation.recentEvents
      ?.filter((event) => this.isFreshAddress(event))
      .map((event) => [
        event.type,
        event.actorId ?? 'unknown-actor',
        event.targetId ?? 'unknown-target',
        event.summary,
      ].join(':'))
      .sort();
    if (addressed?.length) {
      return {
        reason: 'addressed',
        fingerprint: `addressed:${addressed.join('|')}`,
      };
    }
    return null;
  }

  private isFreshAddress(event: WorldEventObservation): boolean {
    return this.addressedEventTypes.has(event.type)
      && (event.ageSeconds === undefined || event.ageSeconds <= this.maxAddressAgeSeconds);
  }
}
