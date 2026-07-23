import {
  AutonomousCognitiveTick,
  type AutonomousCognitiveTurnRunner,
} from '../src/main/bridge/AutonomousCognitiveTick';
import type { WorldObservation } from '../src/main/bridge/worldCognitionContract';

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition) failures += 1;
}

const baseObservation: WorldObservation = {
  schemaVersion: 1,
  observedAt: '2026-07-23T05:00:00Z',
  context: { mode: 'outdoor', phase: 'night', light: 'dark' },
  self: { id: 'orion', area: 'open valley', status: 'active' },
};

async function gatingAndCadenceTest(): Promise<void> {
  console.log('\n[AutonomousCognitiveTick] gating and cadence');
  let now = 0;
  let observation: WorldObservation | null = null;
  const triggers: string[] = [];
  const runner: AutonomousCognitiveTurnRunner = {
    runAutonomousTurn: async (_world, trigger) => {
      triggers.push(trigger.fingerprint);
      return true;
    },
  };
  const tick = new AutonomousCognitiveTick({
    observation: () => observation,
    runner,
    minimumIntervalMs: 1_000,
    repeatIntervalMs: 5_000,
    now: () => now,
  });

  check('does not call a model without an observation', (await tick.consider()).state === 'no-observation');
  observation = baseObservation;
  check('does not call a model while the world is idle', (await tick.consider()).state === 'idle');

  observation = {
    ...baseObservation,
    threats: [{
      id: 'zombie-1',
      type: 'zombie',
      distance: 8,
      visible: true,
      targeting: 'human',
      state: 'pursuing',
    }],
  };
  check('runs for a visible threat', (await tick.consider()).state === 'ran');
  check('runs exactly one model turn', triggers.length === 1);

  now = 100;
  observation = {
    ...observation,
    threats: [{ ...observation.threats![0], distance: 5 }],
  };
  check(
    'ignores distance-only churn during the repeat window',
    (await tick.consider()).state === 'cadence-limited',
  );

  now = 1_100;
  check(
    'suppresses an unchanged threat after the minimum interval',
    (await tick.consider()).state === 'unchanged',
  );

  observation = {
    ...observation,
    threats: [{ ...observation.threats![0], state: 'attacking' }],
  };
  check('runs when the actionable threat state changes', (await tick.consider()).state === 'ran');

  now = 6_200;
  check('allows a bounded reminder for a persistent threat', (await tick.consider()).state === 'ran');
  check('made only the expected three model turns', triggers.length === 3);
}

async function addressedAndRetryTest(): Promise<void> {
  console.log('\n[AutonomousCognitiveTick] addressed events and retry');
  let now = 0;
  let attempts = 0;
  const observation: WorldObservation = {
    ...baseObservation,
    recentEvents: [{
      type: 'companion-addressed',
      summary: 'James called Orion by name',
      ageSeconds: 2,
      actorId: 'human',
      targetId: 'orion',
    }],
  };
  const tick = new AutonomousCognitiveTick({
    observation: () => observation,
    runner: {
      runAutonomousTurn: async () => {
        attempts += 1;
        return attempts > 1;
      },
    },
    minimumIntervalMs: 500,
    repeatIntervalMs: 5_000,
    now: () => now,
  });

  const first = await tick.consider();
  check('recognizes a fresh addressed event', first.state === 'not-ready');
  check('does not mark an unavailable turn as handled', attempts === 1);
  now = 600;
  check('retries an unhandled addressed event', (await tick.consider()).state === 'ran');
  check('retry reached the model runner', attempts === 2);
}

async function singleFlightAndStopTest(): Promise<void> {
  console.log('\n[AutonomousCognitiveTick] single-flight and stop');
  let resolveTurn: ((completed: boolean) => void) | null = null;
  let deferTurn = true;
  let now = 0;
  let interrupts = 0;
  const runner: AutonomousCognitiveTurnRunner = {
    runAutonomousTurn: () => deferTurn
      ? new Promise<boolean>((resolve) => {
          resolveTurn = resolve;
        })
      : Promise.resolve(false),
    interrupt: async () => {
      interrupts += 1;
      const finish = resolveTurn;
      if (finish) finish(false);
      deferTurn = false;
    },
  };
  const observation: WorldObservation = {
    ...baseObservation,
    threats: [{
      type: 'zombie',
      distance: 3,
      visible: true,
      state: 'attacking',
    }],
  };
  const tick = new AutonomousCognitiveTick({
    observation: () => observation,
    runner,
    minimumIntervalMs: 1_000,
    repeatIntervalMs: 5_000,
    now: () => now,
  });

  const pending = tick.consider();
  await Promise.resolve();
  check('reports a live model turn', tick.isRunningTurn());
  check('prevents overlapping model turns', (await tick.consider()).state === 'in-flight');
  await tick.stop();
  check('interrupts an in-flight turn when stopped', interrupts === 1);
  check('the interrupted turn is not marked successful', (await pending).state === 'not-ready');
  check('does not run while stopped', (await tick.consider()).state === 'stopped');
  now = 1_100;
  tick.resume();
  check('can be explicitly resumed', (await tick.consider()).state === 'not-ready');
}

async function main(): Promise<void> {
  await gatingAndCadenceTest();
  await addressedAndRetryTest();
  await singleFlightAndStopTest();
  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
