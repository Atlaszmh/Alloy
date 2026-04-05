import { useRef, useEffect, useState } from 'react';
import type { MatchGateway } from './types';
import { LocalGateway } from './local-gateway';
import { RemoteGateway } from './remote-gateway';

/**
 * Creates a MatchGateway scoped to the given match code.
 *
 * Gateway construction is deferred to useEffect so that React 19 StrictMode
 * double-mount cycles cleanly: each mount creates its own gateway and the
 * cleanup function destroys only the instance it created, preventing the
 * "destroyed flag" bug where the second instance is nuked by the first
 * cleanup.
 */
export function useMatchGateway(code: string): MatchGateway | null {
  const gatewayRef = useRef<MatchGateway | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const isLocal = code.startsWith('ai-');
    const gw = isLocal ? new LocalGateway(code) : new RemoteGateway(code);
    gatewayRef.current = gw;
    forceUpdate((n) => n + 1);

    return () => {
      gw.destroy();
      // Only null out the ref if it still points to *our* instance
      if (gatewayRef.current === gw) {
        gatewayRef.current = null;
      }
    };
  }, [code]);

  return gatewayRef.current;
}
