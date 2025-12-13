import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency as formatCurrencyBase } from '@/lib/formatters';
import { safeStorage } from '@/lib/safeStorage';

export interface AppSettings {
  currency: string;
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
  autoBackup: boolean;
  language: string;
  userId: string;
}

async function getSettings(): Promise<AppSettings> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('user_settings')
    .select('currency, theme, notifications, auto_backup, language, created_at, updated_at')
    .eq('user_id', user.id)
    .single();

  if (error) {
    logger.error('Error loading settings:', error);
    throw error;
  }

  return {
    currency: data.currency,
    theme: data.theme as 'light' | 'dark' | 'system',
    notifications: data.notifications,
    autoBackup: data.auto_backup,
    language: data.language,
    userId: user.id
  };
}

async function saveSettingsToDb(settings: AppSettings): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Use upsert to handle both insert and update cases
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: user.id,
      currency: settings.currency,
      theme: settings.theme,
      notifications: settings.notifications,
      auto_backup: settings.autoBackup,
      language: settings.language,
      updated_at: new Date().toISOString()
    }, { 
      onConflict: 'user_id',
      ignoreDuplicates: false // Always update if exists
    });

  if (error) {
    logger.error('Error saving settings to database:', error);
    throw error;
  }
  
  logger.debug('Settings saved to database successfully:', settings);
}

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: AppSettings) => void;
  formatCurrency: (amount: number) => string;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    // Durante o desenvolvimento, pode haver hot reload que causa esse erro temporariamente
    logger.warn('useSettings called outside SettingsProvider, returning defaults');
    return {
      settings: {
        currency: 'BRL',
        theme: 'system' as const,
        notifications: true,
        autoBackup: false,
        language: 'pt-BR',
        userId: ''
      },
      updateSettings: () => Promise.resolve(),
      formatCurrency: (amount: number) => `R$ ${amount.toFixed(2).replace('.', ',')}`
    };
  }
  return context;
}

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const auth = useAuth();
  
  // Se o auth ainda não está pronto, use valores seguros
  const user = auth?.user;
  const loading = auth?.loading ?? true;
  
  const [settings, setSettings] = useState<AppSettings>(() => {
    // Try to load from safeStorage first for immediate theme application
    const savedSettings = safeStorage.getJSON<AppSettings>('userSettings');
    if (savedSettings) {
      logger.debug('Loaded settings from storage:', savedSettings);
      return savedSettings;
    }
    
    return {
      currency: 'BRL',
      theme: 'system',
      notifications: true,
      autoBackup: false,
      language: 'pt-BR',
      userId: ''
    };
  });

  // Apply theme immediately on mount and settings change
  const applyTheme = (theme: AppSettings['theme']) => {
    const root = window.document.documentElement;
    
    // Remove all theme classes first
    root.classList.remove('light', 'dark');
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
    
    logger.debug('Applied theme:', theme);
  };

  // Apply theme from initial state (localStorage or default)
  useEffect(() => {
    applyTheme(settings.theme);
  }, []);

  // Load full settings when user is authenticated
  useEffect(() => {
    // ✅ CRITICAL FIX: Flag para prevenir race condition
    let isMounted = true;
    
    const loadSettings = async () => {
      if (!user || loading) {
        logger.debug('Skipping settings load - user or auth loading', { user: !!user, loading });
        return;
      }
      
      try {
        logger.debug('Loading settings from database for user:', user.id);
        // Always load settings from Supabase (source of truth)
        const loadedSettings = await getSettings();
        
        // ✅ Verificar se componente ainda está montado antes de atualizar estado
        if (!isMounted) {
          logger.debug('Settings loaded but component unmounted, skipping state update');
          return;
        }
        
        logger.debug('Settings loaded successfully:', loadedSettings);
        setSettings(loadedSettings);
        
        // Save to safeStorage for next page load
        safeStorage.setJSON('userSettings', loadedSettings);
        
        applyTheme(loadedSettings.theme);
      } catch (error) {
        // ✅ Verificar se ainda montado antes de aplicar tema
        if (!isMounted) return;
        
        logger.error('Error loading settings:', error);
        // Use default settings on error
        applyTheme('system');
      }
    };
    
    loadSettings();
    
    // ✅ Cleanup: marcar como desmontado
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  // Apply theme when settings change and listen for system changes
  useEffect(() => {
    applyTheme(settings.theme);

    // Listen for system theme changes when theme is set to 'system'
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (settings.theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [settings.theme]);

  const updateSettings = async (newSettings: AppSettings) => {
    logger.debug('Updating settings:', newSettings);
    setSettings(newSettings);
    
    // Save to safeStorage immediately
    const saved = safeStorage.setJSON('userSettings', newSettings);
    if (!saved) {
      logger.warn('Failed to save settings to storage, continuing anyway');
    }
    
    applyTheme(newSettings.theme);
    
    // Save to Supabase if user is authenticated
    if (user) {
      try {
        await saveSettingsToDb(newSettings);
        logger.success('Settings saved successfully');
      } catch (error) {
        logger.error('Failed to save settings to database:', error);
        // Settings are still in safeStorage, so they won't be lost
      }
    } else {
      logger.warn('Cannot save to database - user not authenticated, using safeStorage only');
    }
  };

  const formatCurrency = (amount: number): string => {
    return formatCurrencyBase(amount, settings.currency);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, formatCurrency }}>
      {children}
    </SettingsContext.Provider>
  );
}