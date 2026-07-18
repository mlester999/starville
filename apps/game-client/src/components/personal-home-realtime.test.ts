import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const gameWorld = readFileSync(resolve(process.cwd(), 'src/components/GameWorld.tsx'), 'utf8');
const realtimeHook = readFileSync(
  resolve(process.cwd(), 'src/app/use-realtime-presence.ts'),
  'utf8',
);
const cozyGameplay = readFileSync(
  resolve(process.cwd(), 'src/components/CozyGameplay.tsx'),
  'utf8',
);
const privateRealtimeHook = readFileSync(
  resolve(process.cwd(), 'src/app/use-private-home-realtime.ts'),
  'utf8',
);
const privateRealtimeClient = readFileSync(
  resolve(process.cwd(), 'src/app/private-home-realtime-client.ts'),
  'utf8',
);

describe('personal-home realtime and persistence isolation', () => {
  it('disconnects the public-world channel before rendering an owner-only home instance', () => {
    expect(gameWorld).toContain('enabled: !insidePersonalHome');
    expect(realtimeHook).toContain('options.enabled === false');
    expect(realtimeHook).toContain("status: 'unavailable'");
    expect(gameWorld).toContain('personalHomeRuntimeWorld(runtimeWorld(world), view)');
    expect(gameWorld).toContain('setSelectedRemotePresenceId(null)');
  });

  it('does not send private-home coordinates through public player persistence', () => {
    expect(gameWorld).toContain('if (insidePersonalHome) return;');
    expect(gameWorld).toContain('persistence.noteState(state)');
    expect(gameWorld).toContain("if (phase === 'stopped') realtime.stopMovement(state)");
  });

  it('updates farming visuals only from trusted mutation responses and refreshed state', () => {
    expect(cozyGameplay).toContain('result.view');
    expect(cozyGameplay).toContain('await refreshMutableState()');
    expect(cozyGameplay).toContain('growthProgress');
    expect(cozyGameplay).toContain('growthStage');
    expect(cozyGameplay).not.toContain('setInterval(() => grant');
  });

  it('switches to an owner-only private channel and rehydrates from server-authored events', () => {
    expect(cozyGameplay).toContain('usePrivateHomeRealtime');
    expect(cozyGameplay).toContain("plot.location === 'personal_home'");
    expect(privateRealtimeHook).toContain('PrivateHomeRealtimeConnection');
    expect(privateRealtimeClient).toContain('/private-home-realtime-ticket');
    expect(privateRealtimeClient).toContain('/private-home');
    expect(privateRealtimeClient).toContain('privateHomeRealtimeServerMessageSchema');
    expect(privateRealtimeClient).toContain('message.events');
    expect(privateRealtimeClient).not.toContain('event.payload.yield');
    expect(privateRealtimeClient).not.toContain('broadcast');
  });

  it('announces a ready workstation job once and refreshes only its canonical open station', () => {
    expect(cozyGameplay).toContain("event.eventKey === 'crafting_job_ready'");
    expect(cozyGameplay).toContain('announcedReadyEventRef.current');
    expect(cozyGameplay).toContain('is ready to collect at your home workstation.');
    expect(cozyGameplay).toContain('aria-live="polite"');
    expect(cozyGameplay).toContain('workstationInstanceId === activeWorkstationIdRef.current');
    expect(cozyGameplay).toContain('loadWorkstationWorkspace(apiUrl, workstationInstanceId)');
    expect(cozyGameplay).toContain('8_000');
  });
});
