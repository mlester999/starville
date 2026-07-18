import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppearancePreset } from '@starville/game-core';
import type { PublicPresence } from '@starville/realtime';

import {
  PublicAvatarProfileCache,
  compactAppearanceReference,
  fallbackResolvedAvatar,
  loadOwnAvatar,
  loadPublicAvatar,
  type CompactAppearanceReference,
  type ResolvedAvatarProfile,
} from './avatar-client';

interface ActiveRemoteReference extends CompactAppearanceReference {
  readonly presenceId: string;
}

function referenceKey(reference: CompactAppearanceReference): string {
  return `${reference.appearanceId}:${String(reference.appearanceRevision)}`;
}

export function useAvatarProfiles(
  apiUrl: string,
  legacyFallbackPreset: AppearancePreset,
  remotes: readonly PublicPresence[],
) {
  const fallback = useMemo(
    () => fallbackResolvedAvatar(legacyFallbackPreset),
    [legacyFallbackPreset],
  );
  const [localProfile, setLocalProfile] = useState<ResolvedAvatarProfile>(fallback);
  const [localAuthoritative, setLocalAuthoritative] = useState(false);
  const [remoteProfiles, setRemoteProfiles] = useState<
    Readonly<Record<string, ResolvedAvatarProfile>>
  >({});
  const cache = useMemo(
    () => new PublicAvatarProfileCache((id, revision) => loadPublicAvatar(apiUrl, id, revision)),
    [apiUrl],
  );
  const activeReferences = useRef(new Map<string, ActiveRemoteReference>());

  useEffect(() => {
    let active = true;
    setLocalAuthoritative(false);
    setLocalProfile(fallback);
    void loadOwnAvatar(apiUrl)
      .then((profile) => {
        if (!active || profile === null) return;
        setLocalProfile(profile);
        setLocalAuthoritative(true);
      })
      .catch(() => {
        // The legacy profile remains a polished development-safe fallback.
      });
    return () => {
      active = false;
    };
  }, [apiUrl, fallback]);

  const remoteReferenceSignature = remotes
    .map((presence) => {
      const reference = compactAppearanceReference(presence);
      return reference === null
        ? `${presence.presenceId}:legacy:${presence.appearancePreset}`
        : `${presence.presenceId}:${referenceKey(reference)}`;
    })
    .sort()
    .join('|');

  useEffect(() => {
    const next = new Map<string, ActiveRemoteReference>();
    for (const presence of remotes) {
      const reference = compactAppearanceReference(presence);
      if (reference !== null)
        next.set(presence.presenceId, { ...reference, presenceId: presence.presenceId });
    }

    for (const [presenceId, previous] of activeReferences.current) {
      const current = next.get(presenceId);
      if (current === undefined || referenceKey(current) !== referenceKey(previous)) {
        cache.release(previous);
        setRemoteProfiles((profiles) => {
          const copy = { ...profiles };
          delete copy[presenceId];
          return copy;
        });
      }
    }

    for (const [presenceId, reference] of next) {
      const previous = activeReferences.current.get(presenceId);
      if (previous !== undefined && referenceKey(previous) === referenceKey(reference)) continue;
      void cache
        .acquire(reference)
        .then((profile) => {
          const current = activeReferences.current.get(presenceId);
          if (current === undefined || referenceKey(current) !== referenceKey(reference)) return;
          setRemoteProfiles((profiles) => ({ ...profiles, [presenceId]: profile }));
        })
        .catch(() => {
          // Remote renderer keeps the presence's legacy preset fallback.
        });
    }

    activeReferences.current = next;
  }, [cache, remoteReferenceSignature]);

  useEffect(
    () => () => {
      for (const reference of activeReferences.current.values()) cache.release(reference);
      activeReferences.current.clear();
      cache.clear();
    },
    [cache],
  );

  return {
    localProfile,
    localAuthoritative,
    remoteProfiles,
    setLocalProfile: (profile: ResolvedAvatarProfile) => {
      setLocalProfile(profile);
      setLocalAuthoritative(true);
    },
  };
}
