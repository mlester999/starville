import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';

export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;

    if (host === null) {
      return;
    }

    let game: Phaser.Game | undefined;
    let disposed = false;

    void import('../game').then(({ startGame }) => {
      if (!disposed) {
        game = startGame(host);
      }
    });

    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="game-canvas"
      role="img"
      aria-label="Starville development scene with a plain background"
    />
  );
}
