import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { safeStorage } from '@/lib/safeStorage';

interface MigrationWarningProps {
  onMigrationComplete?: () => void;
}

export function MigrationWarning({ onMigrationComplete }: MigrationWarningProps) {
  const [hasLocalData, setHasLocalData] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Check if there's any data in localStorage that needs migration
    const checkLocalData = () => {
      const keys = ['planiflow_accounts', 'planiflow_transactions', 'planiflow_categories', 'planiflow_settings'];
      const hasData = keys.some(key => {
        const data = safeStorage.getItem(key);
        return data && data !== 'null' && data !== '[]' && data !== '{}';
      });
      
      if (hasData) {
        setHasLocalData(true);
        setIsVisible(true);
      }
    };

    checkLocalData();
  }, []);

  const handleMigrate = () => {
    // Clear storage data after confirming migration
    const keys = ['planiflow_accounts', 'planiflow_transactions', 'planiflow_categories', 'planiflow_settings'];
    keys.forEach(key => safeStorage.removeItem(key));
    
    setIsVisible(false);
    onMigrationComplete?.();
    
    toast({
      title: "Migração concluída",
      description: "Seus dados locais foram limpos. Agora use apenas o Supabase.",
    });
  };

  const handleDismiss = () => {
    setIsVisible(false);
    safeStorage.setItem('migration_dismissed', 'true');
    
    toast({
      title: "Aviso dispensado",
      description: "Você pode limpar os dados locais nas configurações.",
    });
  };

  if (!isVisible || !hasLocalData) {
    return null;
  }

  return (
    <Alert className="mb-4 border-warning bg-warning/5">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <div className="flex-1 mr-4">
          <strong>Migração para Supabase:</strong> Detectamos dados antigos armazenados localmente. 
          Agora todos os dados são salvos no Supabase. Você pode limpar os dados locais obsoletos.
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleMigrate}>
            <Check className="h-3 w-3 mr-1" />
            Limpar
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss}>
            <X className="h-3 w-3 mr-1" />
            Dispensar
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}