import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerStateUpdate } from '@starville/game-core';
import type { ChatReportCategory, ChatScope, SocialOfferItemInput } from '@starville/realtime';

import {
  INITIAL_REALTIME_VIEW,
  RealtimeConnection,
  type RealtimeViewState,
} from './realtime-client';
import { runtimeDevelopmentMetrics } from './development-performance';

export function useRealtimePresence(options: {
  readonly apiUrl: string;
  readonly realtimeUrl?: string | undefined;
  readonly worldId: string;
  readonly worldVersionId: string;
  readonly onAccessInvalid: () => void;
  readonly enabled?: boolean;
}) {
  const [state, setState] = useState<RealtimeViewState>(() =>
    options.realtimeUrl === undefined
      ? { ...INITIAL_REALTIME_VIEW, status: 'unavailable' }
      : INITIAL_REALTIME_VIEW,
  );
  const connection = useRef<RealtimeConnection | undefined>(undefined);

  useEffect(() => {
    if (options.realtimeUrl === undefined || options.enabled === false) {
      setState({ ...INITIAL_REALTIME_VIEW, status: 'unavailable' });
      return;
    }
    const realtime = new RealtimeConnection({
      apiUrl: options.apiUrl,
      realtimeUrl: options.realtimeUrl,
      worldId: options.worldId,
      worldVersionId: options.worldVersionId,
      onState: setState,
      onAccessInvalid: options.onAccessInvalid,
    });
    connection.current = realtime;
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
    };
  }, [
    options.apiUrl,
    options.enabled,
    options.onAccessInvalid,
    options.realtimeUrl,
    options.worldId,
    options.worldVersionId,
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
  const refreshAppearance = useCallback(() => connection.current?.refreshAppearance(), []);
  const activateEmote = useCallback(
    (emoteKey: string) => connection.current?.activateEmote(emoteKey),
    [],
  );

  const sendChat = useCallback((scope: 'nearby' | 'channel' | 'party', text: string) => {
    return connection.current?.sendChat(scope, text);
  }, []);
  const requestChatHistory = useCallback((scope: ChatScope, afterSequence = 0) => {
    connection.current?.requestChatHistory(scope, afterSequence);
  }, []);
  const markChatRead = useCallback((scope: ChatScope, throughSequence: number) => {
    connection.current?.markChatRead(scope, throughSequence);
  }, []);
  const setChatPreference = useCallback(
    (
      targetPresenceId: string,
      action: 'mute_player' | 'unmute_player' | 'block_player' | 'unblock_player',
    ) => connection.current?.setChatPreference(targetPresenceId, action),
    [],
  );
  const reportChat = useCallback(
    (messageId: string, category: ChatReportCategory, reason: string) =>
      connection.current?.reportChat(messageId, category, reason),
    [],
  );
  const inspectPlayer = useCallback(
    (targetPresenceId: string) => connection.current?.inspectPlayer(targetPresenceId),
    [],
  );
  const createGift = useCallback(
    (targetPresenceId: string, itemSlug: string, quantity: number) =>
      connection.current?.createGift(targetPresenceId, itemSlug, quantity),
    [],
  );
  const respondGift = useCallback(
    (interactionId: string, action: 'accept' | 'decline' | 'cancel') =>
      connection.current?.respondGift(interactionId, action),
    [],
  );
  const requestTrade = useCallback(
    (targetPresenceId: string) => connection.current?.requestTrade(targetPresenceId),
    [],
  );
  const respondTrade = useCallback(
    (interactionId: string, action: 'accept' | 'decline') =>
      connection.current?.respondTrade(interactionId, action),
    [],
  );
  const updateTradeOffer = useCallback(
    (interactionId: string, expectedRevision: number, items: readonly SocialOfferItemInput[]) =>
      connection.current?.updateTradeOffer(interactionId, expectedRevision, items),
    [],
  );
  const confirmTrade = useCallback(
    (interactionId: string, expectedRevision: number) =>
      connection.current?.confirmTrade(interactionId, expectedRevision),
    [],
  );
  const cancelTrade = useCallback(
    (interactionId: string) => connection.current?.cancelTrade(interactionId),
    [],
  );
  const resumeTrade = useCallback(
    (interactionId: string) => connection.current?.resumeTrade(interactionId),
    [],
  );
  const sendFriendRequest = useCallback(
    (targetPresenceId: string) => connection.current?.sendFriendRequest(targetPresenceId),
    [],
  );
  const respondFriendRequest = useCallback(
    (friendRequestId: string, action: 'accept' | 'decline' | 'cancel') =>
      connection.current?.respondFriendRequest(friendRequestId, action),
    [],
  );
  const removeFriend = useCallback(
    (targetPresenceId: string) => connection.current?.removeFriend(targetPresenceId),
    [],
  );
  const createParty = useCallback(() => connection.current?.createParty(), []);
  const inviteToParty = useCallback(
    (targetPresenceId: string, expectedRevision: number) =>
      connection.current?.inviteToParty(targetPresenceId, expectedRevision),
    [],
  );
  const respondPartyInvitation = useCallback(
    (invitationId: string, expectedRevision: number, action: 'accept' | 'decline' | 'cancel') =>
      connection.current?.respondPartyInvitation(invitationId, expectedRevision, action),
    [],
  );
  const leaveParty = useCallback(
    (expectedRevision: number) => connection.current?.leaveParty(expectedRevision),
    [],
  );
  const kickPartyMember = useCallback(
    (targetPresenceId: string, expectedRevision: number) =>
      connection.current?.kickPartyMember(targetPresenceId, expectedRevision),
    [],
  );
  const promotePartyLeader = useCallback(
    (targetPresenceId: string, expectedRevision: number) =>
      connection.current?.promotePartyLeader(targetPresenceId, expectedRevision),
    [],
  );
  const disbandParty = useCallback(
    (expectedRevision: number) => connection.current?.disbandParty(expectedRevision),
    [],
  );
  const startPartyReadyCheck = useCallback(
    (expectedRevision: number) => connection.current?.startPartyReadyCheck(expectedRevision),
    [],
  );
  const respondPartyReadyCheck = useCallback(
    (readyCheckId: string, expectedRevision: number, response: 'ready' | 'not_ready') =>
      connection.current?.respondPartyReadyCheck(readyCheckId, expectedRevision, response),
    [],
  );
  const requestActivityCatalog = useCallback(
    () => connection.current?.requestActivityCatalog(),
    [],
  );
  const prepareActivityEntry = useCallback(
    (activityKey: string, expectedPartyRevision: number) =>
      connection.current?.prepareActivityEntry(activityKey, expectedPartyRevision),
    [],
  );
  const respondActivityReady = useCallback(
    (readyCheckId: string, expectedPartyRevision: number, response: 'ready' | 'not_ready') =>
      connection.current?.respondActivityReady(readyCheckId, expectedPartyRevision, response),
    [],
  );
  const enterActivity = useCallback(
    (preparationId: string) => connection.current?.enterActivity(preparationId),
    [],
  );
  const interactWithActivity = useCallback(
    (intent: {
      readonly instanceId: string;
      readonly expectedRevision: number;
      readonly objectiveKey: string;
      readonly objectKey: string;
    }) => connection.current?.interactWithActivity(intent),
    [],
  );
  const leaveActivity = useCallback(
    (instanceId: string) => connection.current?.leaveActivity(instanceId),
    [],
  );
  const requestActivitySnapshot = useCallback(
    () => connection.current?.requestActivitySnapshot(),
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
