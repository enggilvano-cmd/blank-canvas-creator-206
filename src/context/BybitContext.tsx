import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { logger } from '@/lib/logger';

interface BybitCredentials {
  apiKey: string;
  apiSecret: string;
}

interface BybitContextType {
  isConnected: boolean;
  credentials: BybitCredentials | null;
  connect: (apiKey: string, apiSecret: string) => Promise<void>;
  disconnect: () => void;
  error: string | null;
  isLoading: boolean;
}

const BybitContext = createContext<BybitContextType | undefined>(undefined);

export const BybitProvider = ({ children }: { children: ReactNode }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [credentials, setCredentials] = useState<BybitCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const connect = useCallback(async (apiKey: string, apiSecret: string) => {
    setIsLoading(true);
    setError(null);

    try {
      if (!apiKey || !apiSecret) {
        throw new Error('API Key e Secret são obrigatórios');
      }

      // Validação básica de credenciais
      if (apiKey.length < 10 || apiSecret.length < 10) {
        throw new Error('Credenciais inválidas: comprimento inadequado');
      }

      // Armazenar credenciais (em produção, seria criptografado)
      setCredentials({ apiKey, apiSecret });
      setIsConnected(true);
      logger.info('Bybit conexão estabelecida');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao conectar com Bybit';
      setError(message);
      logger.error('Erro na conexão Bybit:', message);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setCredentials(null);
    setError(null);
    logger.info('Bybit desconectado');
  }, []);

  return (
    <BybitContext.Provider value={{ isConnected, connect, disconnect, credentials, error, isLoading }}>
      {children}
    </BybitContext.Provider>
  );
};

export const useBybit = () => {
  const context = useContext(BybitContext);
  if (context === undefined) {
    throw new Error('useBybit deve ser usado dentro de um BybitProvider');
  }
  return context;
};
