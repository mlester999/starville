import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerStateUpdate } from '@starville/game-core';
import type { ChatReportCategory, ChatScope, SocialOfferItemInput } from '@starville/realtime';

import {
  INITIAL_REALTIME_VIEW,
  RealtimeConnection,
  type RealtimeViewState,
} from './realtime-client';
import { runtimeDevelopmentMetrics } from './development-performance';
import { useRealtimeRuntimeConfig } from './realtime-runtime-context';
import { SupabaseRealtimeConnection, type CoreRealtimeTransport } from './supabase-realtime-client';

export function useRealtimePresence(options: {
  readonly apiUrl: string;
  readonly realtimeUrl?: string | undefined;
  readonly worldId: string;
  readonly worldVersionId: string;
  readonly onAccessInvalid: () => void;
  readonly enabled?: boolean;
}) {
  const runtime = useRealtimeRuntimeConfig();
  const [state, setState] = useState<RealtimeViewState>(() =>
    runtime.provider === 'custom' && options.realtimeUrl === undefined
      ? { ...INITIAL_REALTIME_VIEW, status: 'unavailable' }
      : INITIAL_REALTIME_VIEW,
  );
  const connection = useRef<CoreRealtimeTransport | undefined>(undefined);
  const customConnection = useRef<RealtimeConnection | undefined>(undefined);

  useEffect(() => {
    if (
      options.enabled === false ||
      (runtime.provider === 'custom' && options.realtimeUrl === undefined)
    ) {
      setState({ ...INITIAL_REALTIME_VIEW, status: 'unavailable' });
      return;
    }
    const realtime =
      runtime.provider === 'custom'
        ? new RealtimeConnection({
            apiUrl: options.apiUrl,
            realtimeUrl: options.realtimeUrl!,
            worldId: options.worldId,
            worldVersionId: options.worldVersionId,
            onState: setState,
            onAccessInvalid: options.onAccessInvalid,
          })
        : new SupabaseRealtimeConnection({
            apiUrl: options.apiUrl,
            supabase: runtime.supabase,
            worldId: options.worldId,
            worldVersionId: options.worldVersionId,
            onState: setState,
            onAccessInvalid: options.onAccessInvalid,
          });
    connection.current = realtime;
    customConnection.current = realtime instanceof RealtimeConnection ? realtime : undefined;
    realtime.start();
    const reconcile = () => realtime.reconcileVisibility();
    window.addEventListener('focus', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    runtimeDevelopmentMetrics.adjustGauge('activeListeners', 2);
    return () => {
      window.removeEventListener('focus', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
      runtimeDevelopmentMetrics.adjustGauge('activeListeners', -2);
      realtime.dispose();
      if (connection.current === realtime) connection.current = undefined;
      if (customConnection.current === realtime) customConnection.current = undefined;
    };
  }, [
    options.apiUrl,
    options.enabled,
    options.onAccessInvalid,
    options.realtimeUrl,
    options.worldId,
    options.worldVersionId,
    runtime.provider,
    runtime.supabase.anonKey,
    runtime.supabase.url,
  ]);

  const sendMovement = useCallback((playerState: PlayerStateUpdate) => {
    connection.current?.sendMovement(playerState);
  }, []);
  const stopMovement = useCallback((playerState: PlayerStateUpdate) => {
    connection.current?.stopMovement(playerState);
  }, []);
  const switchChannel = useCallback((channelId: string) => {
    connection.current?.switchChannel(channelId);
  }, []);
  const reconcile = useCallback(() => connection.current?.retryNow(), []);
  const refreshAppearance = useCallback(() => customConnection.current?.refreshAppearance(), []);
  const activateEmote = useCallback(
    (emoteKey: string) => customConnection.current?.activateEmote(emoteKey),
    [],
  );

  const sendChat = useCallback((scope: 'nearby' | 'channel' | 'party', text: string) => {
    return customConnection.current?.sendChat(scope, text);
  }, []);
  const requestChatHistory = useCallback((scope: ChatScope, afterSequence = 0) => {
    customConnection.current?.requestChatHistory(scope, afterSequence);
  }, []);
  const markChatRead = useCallback((scope: ChatScope, throughSequence: number) => {
    customConnection.current?.markChatRead(scope, throughSequence);
  }, []);
  const setChatPreference = useCallback(
    (
      targetPresenceId: string,
      action: 'mute_player' | 'unmute_player' | 'block_player' | 'unblock_player',
    ) => customConnection.current?.setChatPreference(targetPresenceId, action),
    [],
  );
  const reportChat = useCallback(
    (messageId: string, category: ChatReportCategory, reason: string) =>
      customConnection.current?.reportChat(messageId, category, reason),
    [],
  );
  const inspectPlayer = useCallback(
    (targetPresenceId: string) => customConnection.current?.inspectPlayer(targetPresenceId),
    [],
  );
  const createGift = useCallback(
    (targetPresenceId: string, itemSlug: string, quantity: number) =>
      customConnection.current?.createGift(targetPresenceId, itemSlug, quantity),
    [],
  );
  const respondGift = useCallback(
    (interactionId: string, action: 'accept' | 'decline' | 'cancel') =>
      customConnection.current?.respondGift(interactionId, action),
    [],
  );
  const requestTrade = useCallback(
    (targetPresenceId: string) => customConnection.current?.requestTrade(targetPresenceId),
    [],
  );
  const respondTrade = useCallback(
    (interactionId: string, action: 'accept' | 'decline') =>
      customConnection.current?.respondTrade(interactionId, action),
    [],
  );
  const updateTradeOffer = useCallback(
    (interactionId: string, expectedRevision: number, items: readonly SocialOfferItemInput[]) =>
      customConnection.current?.updateTradeOffer(interactionId, expectedRevision, items),
    [],
  );
  const confirmTrade = useCallback(
    (interactionId: string, expectedRevision: number) =>
      customConnection.current?.confirmTrade(interactionId, expectedRevision),
    [],
  );
  const cancelTrade = useCallback(
    (interactionId: string) => customConnection.current?.cancelTrade(interactionId),
    [],
  );
  const resumeTrade = useCallback(
    (interactionId: string) => customConnection.current?.resumeTrade(interactionId),
    [],
  );
  const sendFriendRequest = useCallback(
    (targetPresenceId: string) => customConnection.current?.sendFriendRequest(targetPresenceId),
    [],
  );
  const respondFriendRequest = useCallback(
    (friendRequestId: string, action: 'accept' | 'decline' | 'cancel') =>
      customConnection.current?.respondFriendRequest(friendRequestId, action),
    [],
  );
  const removeFriend = useCallback(
    (targetPresenceId: string) => customConnection.current?.removeFriend(targetPresenceId),
    [],
  );
  const createParty = useCallback(() => customConnection.current?.createParty(), []);
  const inviteToParty = useCallback(
    (targetPresenceId: string, expectedRevision: number) =>
      customConnection.current?.inviteToParty(targetPresenceId, expectedRevision),
    [],
  );
  const respondPartyInvitation = useCallback(
    (invitationId: string, expectedRevision: number, action: 'accept' | 'decline' | 'cancel') =>
      customConnection.current?.respondPartyInvitation(invitationId, expectedRevision, action),
    [],
  );
  const leaveParty = useCallback(
    (expectedRevision: number) => customConnection.current?.leaveParty(expectedRevision),
    [],
  );
  const kickPartyMember = useCallback(
    (targetPresenceId: string, expectedRevision: number) =>
      customConnection.current?.kickPartyMember(targetPresenceId, expectedRevision),
    [],
  );
  const promotePartyLeader = useCallback(
    (targetPresenceId: string, expectedRevision: number) =>
      customConnection.current?.promotePartyLeader(targetPresenceId, expectedRevision),
    [],
  );
  const disbandParty = useCallback(
    (expectedRevision: number) => customConnection.current?.disbandParty(expectedRevision),
    [],
  );
  const startPartyReadyCheck = useCallback(
    (expectedRevision: number) => customConnection.current?.startPartyReadyCheck(expectedRevision),
    [],
  );
  const respondPartyReadyCheck = useCallback(
    (readyCheckId: string, expectedRevision: number, response: 'ready' | 'not_ready') =>
      customConnection.current?.respondPartyReadyCheck(readyCheckId, expectedRevision, response),
    [],
  );
  const requestActivityCatalog = useCallback(
    () => customConnection.current?.requestActivityCatalog(),
    [],
  );
  const prepareActivityEntry = useCallback(
    (activityKey: string, expectedPartyRevision: number) =>
      customConnection.current?.prepareActivityEntry(activityKey, expectedPartyRevision),
    [],
  );
  const respondActivityReady = useCallback(
    (readyCheckId: string, expectedPartyRevision: number, response: 'ready' | 'not_ready') =>
      customConnection.current?.respondActivityReady(readyCheckId, expectedPartyRevision, response),
    [],
  );
  const enterActivity = useCallback(
    (preparationId: string) => customConnection.current?.enterActivity(preparationId),
    [],
  );
  const interactWithActivity = useCallback(
    (intent: {
      readonly instanceId: string;
      readonly expectedRevision: number;
      readonly objectiveKey: string;
      readonly objectKey: string;
    }) => customConnection.current?.interactWithActivity(intent),
    [],
  );
  const leaveActivity = useCallback(
    (instanceId: string) => customConnection.current?.leaveActivity(instanceId),
    [],
  );
  const requestActivitySnapshot = useCallback(
    () => customConnection.current?.requestActivitySnapshot(),
    [],
  );

  return {
    state,
    sendMovement,
    stopMovement,
    switchChannel,
    reconcile,
    refreshAppearance,
    activateEmote,
    sendChat,
    requestChatHistory,
    markChatRead,
    setChatPreference,
    reportChat,
    inspectPlayer,
    createGift,
    respondGift,
    requestTrade,
    respondTrade,
    updateTradeOffer,
    confirmTrade,
    cancelTrade,
    resumeTrade,
    sendFriendRequest,
    respondFriendRequest,
    removeFriend,
    createParty,
    inviteToParty,
    respondPartyInvitation,
    leaveParty,
    kickPartyMember,
    promotePartyLeader,
    disbandParty,
    startPartyReadyCheck,
    respondPartyReadyCheck,
    requestActivityCatalog,
    prepareActivityEntry,
    respondActivityReady,
    enterActivity,
    interactWithActivity,
    leaveActivity,
    requestActivitySnapshot,
  };
}
