import { describe, expect, it } from 'vitest';

import {
  ACCESS_MODAL_STATES,
  ACCESS_STATE_CONTENT,
  stateForAccessStatus,
  stateForSafeErrorCode,
} from './access-state';

describe('landing token-access presentation states', () => {
  it('defines safe player-facing content for every required modal state', () => {
    expect(Object.keys(ACCESS_STATE_CONTENT).sort()).toEqual([...ACCESS_MODAL_STATES].sort());

    for (const state of ACCESS_MODAL_STATES) {
      const content = ACCESS_STATE_CONTENT[state];
      expect(content.title.length).toBeGreaterThan(0);
      expect(content.description).not.toMatch(/signature bytes|session token|rpc url|stack/i);
    }
  });

  it('maps every trusted session status without granting unknown access', () => {
    expect(stateForAccessStatus('granted')).toBe('access_granted');
    expect(stateForAccessStatus('insufficient_balance')).toBe('insufficient_balance');
    expect(stateForAccessStatus('configuration_changed')).toBe('access_revoked');
  });

  it('fails closed for unrecognized API error codes', () => {
    expect(stateForSafeErrorCode('UNRECOGNIZED')).toBe('retry');
    expect(stateForSafeErrorCode(undefined)).toBe('retry');
  });

  it('keeps temporary RPC failures distinct from insufficient balances', () => {
    expect(stateForSafeErrorCode('RPC_UNAVAILABLE')).toBe('rpc_unavailable');
    expect(stateForSafeErrorCode('INSUFFICIENT_TOKEN_BALANCE')).toBe('insufficient_balance');
  });
});
