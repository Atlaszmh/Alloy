import { useRef, useEffect } from 'react';
import type { MatchGateway } from './types';
import { LocalGateway } from './local-gateway';

export function useMatchGateway(code: string): MatchGateway {
  const gatewayRef = useRef<MatchGateway | null>(null);
  const codeRef = useRef<string>(code);

  if (gatewayRef.current === null || codeRef.current !== code) {
    // Destroy old gateway if code changed
    if (gatewayRef.current !== null) {
      gatewayRef.current.destroy();
    }

    codeRef.current = code;

    if (code.startsWith('ai-')) {
      gatewayRef.current = new LocalGateway(code);
    } else {
      throw new Error('RemoteGateway not yet implemented');
    }
  }

  useEffect(() => {
    return () => {
      gatewayRef.current?.destroy();
      gatewayRef.current = null;
    };
  }, []);

  return gatewayRef.current;
}
