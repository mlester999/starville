import { useEffect, useState } from 'react';

const NARROW_GAME_QUERY = '(max-width: 700px)';

export function useNarrowGameViewport(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_GAME_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(NARROW_GAME_QUERY);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return narrow;
}
