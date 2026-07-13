'use client';

import { useState } from 'react';

export function WorldAssetThumbnail(props: {
  readonly source: string | null;
  readonly alt: string;
  readonly fallback: string;
  readonly size?: 'small' | 'large';
}) {
  const [failed, setFailed] = useState(false);
  const showImage = props.source !== null && !failed;
  return (
    <span className={`world-asset-thumbnail world-asset-thumbnail--${props.size ?? 'small'}`}>
      {showImage ? (
        // The same-origin byte proxy rechecks assets.read; no private storage URL reaches the DOM.
        <img
          alt={props.alt}
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
          src={props.source}
        />
      ) : (
        <span aria-label={`${props.alt} preview unavailable`} role="img">
          {props.fallback.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}
