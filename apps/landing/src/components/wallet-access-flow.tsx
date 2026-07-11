'use client';

import {
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider,
  useAppKitState,
  useDisconnect,
} from '@reown/appkit/react';
import type { Provider as SolanaMessageProvider } from '@reown/appkit-adapter-solana/react';
import { solana, solanaDevnet } from '@reown/appkit/networks';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WalletNetwork } from '@starville/wallet-access';

import {
  ACCESS_STATE_CONTENT,
  stateForAccessStatus,
  stateForSafeErrorCode,
  type AccessModalState,
} from '../lib/token-access/access-state';
import {
  createWalletChallenge,
  encodeSignatureBase64,
  fetchPublicTokenAccessConfig,
  fetchTokenAccessSession,
  formatTokenAmount,
  recheckTokenAccess,
  revokeTokenAccess,
  shortenWalletAddress,
  TokenAccessClientError,
  verifyWalletAccess,
  type PublicTokenAccessConfig,
  type TokenAccessView,
} from '../lib/token-access/client';
import { PowerIcon, RefreshIcon, WalletSwitchIcon } from './icons';
import { StarvilleMark } from './starville-mark';

interface WalletAccessFlowProps {
  readonly apiUrl: string;
  readonly gameUrl: string;
  readonly network: WalletNetwork;
  readonly onWalletModalChange: (open: boolean) => void;
}

function appKitNetwork(network: WalletNetwork) {
  return network === 'solana:mainnet-beta' ? solana : solanaDevnet;
}

function networkLabel(network: WalletNetwork): string {
  return network === 'solana:mainnet-beta' ? 'Solana Mainnet' : 'Solana Devnet';
}

function formatExpiry(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return undefined;
  }

  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function stateStep(state: AccessModalState): 1 | 2 | 3 {
  if (['disconnected', 'connection_opening'].includes(state)) {
    return 1;
  }

  if (
    [
      'connected',
      'unsupported_network',
      'unsupported_wallet',
      'challenge_creation',
      'awaiting_signature',
      'signature_rejected',
      'signature_verification',
      'account_changed',
      'network_changed',
      'challenge_expired',
    ].includes(state)
  ) {
    return 2;
  }

  return 3;
}

export function WalletAccessFlow({
  apiUrl,
  gameUrl,
  network,
  onWalletModalChange,
}: WalletAccessFlowProps) {
  const { open: openAppKit } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { caipNetwork } = useAppKitNetwork();
  const { open: walletModalOpen } = useAppKitState();
  const { walletProvider } = useAppKitProvider<SolanaMessageProvider>('solana');
  const { disconnect } = useDisconnect();
  const [state, setState] = useState<AccessModalState>('disconnected');
  const [publicConfig, setPublicConfig] = useState<PublicTokenAccessConfig>();
  const [accessView, setAccessView] = useState<TokenAccessView>();
  const [copyLabel, setCopyLabel] = useState('Copy address');
  const currentOperation = useRef<AbortController | undefined>(undefined);
  const previousAddress = useRef<string | undefined>(undefined);
  const previousNetworkId = useRef<string | number | undefined>(undefined);
  const latestAddress = useRef<string | undefined>(address);
  const latestNetworkId = useRef<string | number | undefined>(caipNetwork?.id);
  const wasConnected = useRef(false);
  const stateContent = ACCESS_STATE_CONTENT[state];
  const currentNetworkId = caipNetwork?.id;
  const configuredNetwork = appKitNetwork(network);
  const isConfiguredNetwork =
    currentNetworkId === undefined || currentNetworkId === configuredNetwork.id;
  latestAddress.current = address;
  latestNetworkId.current = currentNetworkId;

  useEffect(() => {
    onWalletModalChange(walletModalOpen);
    return () => onWalletModalChange(false);
  }, [onWalletModalChange, walletModalOpen]);

  const cancelCurrentOperation = useCallback(() => {
    currentOperation.current?.abort();
    currentOperation.current = undefined;
  }, []);

  const revokeSafely = useCallback(async () => {
    try {
      await revokeTokenAccess(apiUrl);
    } catch {
      // The browser remains fail-closed even if the server was unreachable during cleanup.
    }

    setAccessView(undefined);
  }, [apiUrl]);

  useEffect(() => {
    const controller = new AbortController();
    currentOperation.current = controller;

    void Promise.all([
      fetchPublicTokenAccessConfig(apiUrl, controller.signal),
      fetchTokenAccessSession(apiUrl, controller.signal),
    ])
      .then(([config, session]) => {
        setPublicConfig(config);
        setAccessView(session);

        if (config.availability !== 'available' || !config.enabled) {
          setState('configuration_unavailable');
          return;
        }

        const sessionState = stateForAccessStatus(session.access);
        setState(sessionState === 'disconnected' && isConnected ? 'connected' : sessionState);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState(
          error instanceof TokenAccessClientError
            ? stateForSafeErrorCode(error.code)
            : 'configuration_unavailable',
        );
      });

    return () => controller.abort();
  }, [apiUrl, isConnected]);

  useEffect(() => {
    if (!isConnected || address === undefined) {
      if (wasConnected.current) {
        cancelCurrentOperation();
        void revokeSafely();
        setState('disconnected');
      }

      wasConnected.current = false;
      previousAddress.current = undefined;
      return;
    }

    const priorAddress = previousAddress.current;
    const sessionAddress = accessView?.access === 'granted' ? accessView.walletAddress : undefined;

    if (
      (priorAddress !== undefined && priorAddress !== address) ||
      (sessionAddress !== undefined && sessionAddress !== address)
    ) {
      cancelCurrentOperation();
      void revokeSafely();
      setState('account_changed');
    } else if (state === 'disconnected') {
      setState('connected');
    }

    wasConnected.current = true;
    previousAddress.current = address;
  }, [accessView, address, cancelCurrentOperation, isConnected, revokeSafely, state]);

  useEffect(() => {
    if (!isConnected || currentNetworkId === undefined) {
      previousNetworkId.current = currentNetworkId;
      return;
    }

    const priorNetworkId = previousNetworkId.current;

    if (priorNetworkId !== undefined && priorNetworkId !== currentNetworkId) {
      cancelCurrentOperation();
      void revokeSafely();
      setState('network_changed');
    } else if (!isConfiguredNetwork) {
      setState('unsupported_network');
    }

    previousNetworkId.current = currentNetworkId;
  }, [cancelCurrentOperation, currentNetworkId, isConfiguredNetwork, isConnected, revokeSafely]);

  useEffect(() => {
    function refreshTrustedSession() {
      if (document.visibilityState !== 'visible') {
        return;
      }

      void fetchTokenAccessSession(apiUrl)
        .then((session) => {
          setAccessView(session);
          setState(stateForAccessStatus(session.access));
        })
        .catch((error: unknown) => {
          setAccessView(undefined);
          setState(
            error instanceof TokenAccessClientError ? stateForSafeErrorCode(error.code) : 'retry',
          );
        });
    }

    window.addEventListener('focus', refreshTrustedSession);
    document.addEventListener('visibilitychange', refreshTrustedSession);

    return () => {
      window.removeEventListener('focus', refreshTrustedSession);
      document.removeEventListener('visibilitychange', refreshTrustedSession);
    };
  }, [apiUrl]);

  useEffect(() => cancelCurrentOperation, [cancelCurrentOperation]);

  async function connectWallet() {
    setState('connection_opening');

    try {
      await openAppKit({ view: 'Connect' });
    } catch {
      setState('disconnected');
    }
  }

  async function verifyAccess() {
    if (!isConnected || address === undefined) {
      await connectWallet();
      return;
    }

    if (!isConfiguredNetwork) {
      setState('unsupported_network');
      return;
    }

    if (publicConfig?.availability !== 'available' || !publicConfig.enabled) {
      setState('configuration_unavailable');
      return;
    }

    if (walletProvider?.signMessage === undefined) {
      setState('unsupported_wallet');
      return;
    }

    cancelCurrentOperation();
    const controller = new AbortController();
    currentOperation.current = controller;
    const verifyingAddress = address;

    try {
      setState('challenge_creation');
      const challenge = await createWalletChallenge(
        apiUrl,
        { walletAddress: verifyingAddress, network },
        controller.signal,
      );

      if (new Date(challenge.expiresAt).valueOf() <= Date.now()) {
        setState('challenge_expired');
        return;
      }

      setState('awaiting_signature');
      let signature: Uint8Array;

      try {
        signature = await walletProvider.signMessage(new TextEncoder().encode(challenge.message));
      } catch {
        if (!controller.signal.aborted) {
          setState('signature_rejected');
        }
        return;
      }

      if (latestAddress.current !== verifyingAddress) {
        setState('account_changed');
        return;
      }

      if (
        latestNetworkId.current !== undefined &&
        latestNetworkId.current !== configuredNetwork.id
      ) {
        setState('network_changed');
        return;
      }

      setState('signature_verification');
      const session = await verifyWalletAccess(
        apiUrl,
        {
          challengeId: challenge.challengeId,
          walletAddress: verifyingAddress,
          network,
          message: challenge.message,
          signature: encodeSignatureBase64(signature),
        },
        controller.signal,
      );

      setAccessView(session);
      setState(stateForAccessStatus(session.access));
    } catch (error) {
      if (!controller.signal.aborted) {
        setState(
          error instanceof TokenAccessClientError ? stateForSafeErrorCode(error.code) : 'retry',
        );
      }
    } finally {
      if (currentOperation.current === controller) {
        currentOperation.current = undefined;
      }
    }
  }

  async function checkAgain() {
    cancelCurrentOperation();
    const controller = new AbortController();
    currentOperation.current = controller;
    setState('balance_verification');

    try {
      const session = await recheckTokenAccess(apiUrl, controller.signal);
      setAccessView(session);
      setState(stateForAccessStatus(session.access));
    } catch (error) {
      if (!controller.signal.aborted) {
        setState(
          error instanceof TokenAccessClientError ? stateForSafeErrorCode(error.code) : 'retry',
        );
      }
    } finally {
      if (currentOperation.current === controller) {
        currentOperation.current = undefined;
      }
    }
  }

  async function disconnectWallet() {
    cancelCurrentOperation();
    await revokeSafely();

    try {
      await disconnect();
    } finally {
      setState('disconnected');
    }
  }

  async function changeWallet() {
    await disconnectWallet();
    await connectWallet();
  }

  async function copyAddress() {
    if (address === undefined) {
      return;
    }

    try {
      await navigator.clipboard.writeText(address);
      setCopyLabel('Copied');
    } catch {
      setCopyLabel('Copy unavailable');
    }
  }

  const displayAddress = address ?? accessView?.walletAddress;
  const tokenSymbol = accessView?.symbol ?? publicConfig?.symbol ?? 'STAR';
  const requiredAmount = accessView?.requiredAmount ?? publicConfig?.requiredAmount;
  const activeStep = stateStep(state);
  const canVerify = isConnected && state !== 'configuration_unavailable';
  const showCheckAgain = ['insufficient_balance', 'rpc_unavailable', 'retry'].includes(state);

  return (
    <div className="access-flow">
      <aside className="access-flow__story" aria-label="Starville access journey">
        <StarvilleMark />
        <div>
          <p className="access-flow__story-kicker">The path to the village</p>
          <h2>One signature. No transaction.</h2>
          <p>
            Starville checks wallet ownership and the configured token balance without asking for
            spending authority.
          </p>
        </div>
        <ol className="access-steps" aria-label={`Access step ${activeStep} of 3`}>
          {['Connect', 'Sign', 'Enter'].map((label, index) => {
            const step = (index + 1) as 1 | 2 | 3;
            return (
              <li
                key={label}
                className={
                  step < activeStep ? 'is-complete' : step === activeStep ? 'is-active' : ''
                }
              >
                <span aria-hidden="true">{step < activeStep ? '✓' : step}</span>
                {label}
              </li>
            );
          })}
        </ol>
      </aside>

      <section className="access-flow__main" aria-live="polite" aria-busy={stateContent.busy}>
        <div className={`access-status access-status--${stateContent.tone}`}>
          <span className="access-status__symbol" aria-hidden="true">
            {stateContent.busy ? <span className="access-spinner" /> : '✦'}
          </span>
          <div>
            <p className="access-status__eyebrow">{stateContent.eyebrow}</p>
            <h2 id="access-dialog-title">{stateContent.title}</h2>
            <p>{stateContent.description}</p>
          </div>
        </div>

        <dl className="access-facts">
          <div>
            <dt>Wallet</dt>
            <dd>
              {displayAddress === undefined ? (
                'Not connected'
              ) : (
                <>
                  <span>{shortenWalletAddress(displayAddress)}</span>
                  {address !== undefined ? (
                    <button type="button" onClick={copyAddress}>
                      {copyLabel}
                    </button>
                  ) : null}
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{networkLabel(network)}</dd>
          </div>
          <div>
            <dt>Required</dt>
            <dd>
              {requiredAmount === undefined
                ? 'Unavailable'
                : `${formatTokenAmount(requiredAmount)} ${tokenSymbol}`}
            </dd>
          </div>
          <div>
            <dt>Verified balance</dt>
            <dd>
              {accessView?.observedAmount === undefined
                ? 'Not checked'
                : `${formatTokenAmount(accessView.observedAmount)} ${tokenSymbol}`}
            </dd>
          </div>
        </dl>

        {state === 'access_granted' ? (
          <p className="access-session-note">
            Access expires {formatExpiry(accessView?.expiresAt) ?? 'soon'} and will be checked again
            by the server when required.
          </p>
        ) : null}

        <div className="access-actions">
          {state === 'access_granted' ? (
            <a className="hero-button hero-button--primary" href={gameUrl}>
              Continue to Starville
              <span aria-hidden="true">→</span>
            </a>
          ) : !isConnected ? (
            <button
              className="hero-button hero-button--primary"
              type="button"
              disabled={stateContent.busy}
              onClick={connectWallet}
            >
              Connect wallet
              <span aria-hidden="true">→</span>
            </button>
          ) : showCheckAgain ? (
            <button
              className="hero-button hero-button--primary"
              type="button"
              disabled={stateContent.busy}
              onClick={verifyAccess}
            >
              Check again
              <span aria-hidden="true">↻</span>
            </button>
          ) : (
            <button
              className="hero-button hero-button--primary"
              type="button"
              disabled={stateContent.busy || !canVerify}
              onClick={verifyAccess}
            >
              {stateContent.busy ? 'Verifying…' : 'Sign to verify'}
              <span aria-hidden="true">→</span>
            </button>
          )}

          {isConnected || state === 'access_granted' ? (
            <section className="session-actions" aria-label="Session actions">
              <p className="session-actions__label">Session actions</p>
              <div className="session-actions__buttons">
                {state === 'access_granted' ? (
                  <button
                    className="session-action"
                    type="button"
                    disabled={stateContent.busy}
                    onClick={checkAgain}
                  >
                    {stateContent.busy ? <span className="access-spinner" /> : <RefreshIcon />}
                    {stateContent.busy ? 'Checking balance…' : 'Recheck balance'}
                  </button>
                ) : null}
                {isConnected ? (
                  <>
                    <button
                      className="session-action"
                      type="button"
                      disabled={stateContent.busy}
                      onClick={changeWallet}
                    >
                      <WalletSwitchIcon />
                      Change wallet
                    </button>
                    <button
                      className="session-action session-action--danger"
                      type="button"
                      disabled={stateContent.busy}
                      onClick={disconnectWallet}
                    >
                      <PowerIcon />
                      Disconnect
                    </button>
                  </>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <p className="wallet-safety">
          <span aria-hidden="true">◇</span>
          Starville will never ask for a seed phrase, private key, wallet password, or token
          transfer.
        </p>
      </section>
    </div>
  );
}
