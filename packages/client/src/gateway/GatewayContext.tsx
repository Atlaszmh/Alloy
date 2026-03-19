import { createContext, useContext } from 'react';
import type { MatchGateway } from './types';

const GatewayContext = createContext<MatchGateway | null>(null);

export const GatewayProvider = GatewayContext.Provider;

export function useGateway(): MatchGateway {
  const gateway = useContext(GatewayContext);
  if (!gateway) {
    throw new Error('useGateway must be used within a GatewayProvider (rendered by PhaseRouter)');
  }
  return gateway;
}
