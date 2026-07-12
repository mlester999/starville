'use client';

import { useState } from 'react';

export function CopyWalletButton({ walletAddress }: { readonly walletAddress: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="copy-button"
      onClick={() => {
        void navigator.clipboard.writeText(walletAddress).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1_500);
        });
      }}
      type="button"
    >
      {copied ? 'Copied' : 'Copy'}
      <span className="sr-only"> wallet address</span>
    </button>
  );
}
