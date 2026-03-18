import { useRef, useEffect } from 'react';
import type { MatchGateway } from './types';
import { LocalGateway } from './local-gateway';
import { RemoteGateway } from './remote-gateway';

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
      gatewayRef.current = new RemoteGateway(code);
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
