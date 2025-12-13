import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { setSentryUser, trackUserAction, setSentryContext } from '@/lib/sentry';
import { getErrorMessage } from '@/types/errors';
import { getTabSynchronizer } from '@/lib/tabSync';
import { globalResourceManager } from '@/lib/globalResourceManager';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name?: string;
  whatsapp?: string;
  avatar_url?: string;
  role: 'admin' | 'user' | 'subscriber' | 'trial';
  is_active: boolean;
  trial_expires_at?: string;
  subscription_expires_at?: string;
  created_at: string;
  updated_at: string;
}

import { AuthError as SupabaseAuthError } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: SupabaseAuthError | null }>;
  signUp: (email: string, password: string, fullName: string, whatsapp?: string) => Promise<{ error: SupabaseAuthError | null }>;
  signOut: () => Promise<{ error: SupabaseAuthError | null }>;
  resetPassword: (email: string) => Promise<{ error: SupabaseAuthError | null }>;
  isAdmin: () => boolean;
  hasRole: (role: 'admin' | 'user' | 'subscriber' | 'trial') => boolean;
  isSubscriptionActive: () => boolean;
  getSubscriptionTimeRemaining: () => string | null;
  initializeUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProfile = async (userId: string) => {
    try {
      logger.debug('Fetching profile for user:', userId);
      
      // Fetch profile data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, user_id, email, full_name, avatar_url, whatsapp, is_active, trial_expires_at, subscription_expires_at, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) {
        logger.error('Error fetching profile:', profileError);
        toast({
          title: "Erro",
          description: "Não foi possível carregar o perfil do usuário.",
          variant: "destructive",
        });
        return null; // CRITICAL: Return null to signal failure
      }

      if (!profileData) {
        return null; // CRITICAL: Return null if no profile
      }
      
      // Fetch user role from user_roles table (security best practice)
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .order('role', { ascending: true }) // admin < subscriber < user < trial (alphabetical)
        .limit(1)
        .maybeSingle();

      if (roleError) {
        logger.error('Error fetching user role:', roleError);
        // Continue without role rather than failing completely
      }

      logger.debug('Profile and role fetched:', { profileData, roleData });
      
      const enrichedProfile = {
        ...profileData,
        role: roleData?.role || 'user', // Default to 'user' if no role found
        full_name: profileData.full_name ?? undefined,
        avatar_url: profileData.avatar_url ?? undefined,
        whatsapp: profileData.whatsapp ?? undefined,
        trial_expires_at: profileData.trial_expires_at ?? undefined,
        subscription_expires_at: profileData.subscription_expires_at ?? undefined,
      };
      
      return enrichedProfile; // CRITICAL: Return profile data
    } catch (error: unknown) {
      logger.error('Error fetching profile:', error);
      toast({
        title: "Erro",
        description: getErrorMessage(error) || "Erro inesperado ao carregar perfil.",
        variant: "destructive",
      });
      return null; // CRITICAL: Return null on error
    }
  };

  const logActivity = async (action: string, resourceType: string, resourceId?: string) => {
    if (user) {
      try {
        const result = await supabase.rpc('log_user_activity', {
          p_user_id: user.id,
          p_action: action,
          p_resource_type: resourceType,
          p_resource_id: resourceId
        });
        
        if (result.error) {
          logger.error('Error logging activity:', result.error);
        }
      } catch (error: unknown) {
        logger.error('Error logging activity:', error);
      }
    }
  };

  const initializeUserData = async () => {
    if (!user) return;
    
    try {
      logger.debug('Initializing user data for:', user.id);
      
      // Initialize default categories if none exist
      const { data: categories, error: categoriesError } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      // Check if operation is still relevant (user might have logged out)
      if (!user) {
        logger.debug('User logged out during initialization, aborting');
        return;
      }

      if (categoriesError) {
        logger.error('Error checking categories:', categoriesError);
      } else if (!categories || categories.length === 0) {
        logger.debug('Initializing default categories');
        await supabase.rpc('initialize_default_categories', { p_user_id: user.id });
      }

      // Check again before continuing
      if (!user) return;

      // Initialize default settings if none exist (using upsert to avoid race conditions)
      await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          currency: 'BRL',
          theme: 'system',
          notifications: true,
          auto_backup: false,
          language: 'pt-BR'
        }, { onConflict: 'user_id', ignoreDuplicates: true });
      
      logger.debug('User data initialization completed');
    } catch (error: unknown) {
      logger.error('Error initializing user data:', error);
    }
  };

  const syncProfileEmail = async (userId: string, newEmail?: string | null) => {
    try {
      if (!newEmail) return;
      const { error } = await supabase
        .from('profiles')
        .update({ email: newEmail })
        .eq('user_id', userId)
        .neq('email', newEmail);
      if (error) {
        logger.error('Error syncing profile email:', error);
      } else {
        logger.success('Profile email synced to auth email');
      }
    } catch (error: unknown) {
      logger.error('Unexpected error syncing profile email:', error);
    }
  };

  useEffect(() => {
    logger.debug('Setting up auth state listener...');
    
    // CRITICAL: Flag to track if component is still mounted (prevents race conditions)
    let isMounted = true;
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.debug('Auth state changed:', event, session?.user?.id);
        
        // CRITICAL: Check if mounted before any state update
        if (!isMounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Execute profile operations sequentially to avoid race conditions
          (async () => {
            try {
              const profileData = await fetchProfile(session.user.id);
              
              // CRITICAL: Check if mounted before state update
              if (!isMounted) return;
              
              if (profileData) {
                setProfile(profileData);
                
                // Set Sentry user context
                setSentryUser({
                  id: profileData.user_id,
                  email: profileData.email,
                  username: profileData.full_name || profileData.email,
                  role: profileData.role,
                });
              }
              
              // CRITICAL: Check again before continuing
              if (!isMounted) return;
              
              await syncProfileEmail(session.user.id, session.user.email);
              
              if (!isMounted) return;
              
              if (event === 'SIGNED_IN') {
                await logActivity('signed_in', 'auth');
                
                if (!isMounted) return;
                
                await initializeUserData();
              }
            } catch (error: unknown) {
              // Only log if still mounted
              if (isMounted) {
                logger.error('Error in auth state change handler:', error);
              }
            }
          })();
        } else {
          setProfile(null);
          setSentryUser(null); // Clear Sentry user context on sign out
        }
        
        // CRITICAL: Check before state update
        if (isMounted) {
          setLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      logger.debug('Initial session check:', session?.user?.id);
      
      // CRITICAL: Check if mounted
      if (!isMounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        try {
          const profileData = await fetchProfile(session.user.id);
          
          // CRITICAL: Check if mounted before state update
          if (!isMounted) return;
          
          if (profileData) {
            setProfile(profileData);
            
            // Set Sentry user context
            setSentryUser({
              id: profileData.user_id,
              email: profileData.email,
              username: profileData.full_name || profileData.email,
              role: profileData.role,
            });
          }
          
          if (!isMounted) return;
          
          await syncProfileEmail(session.user.id, session.user.email);
        } catch (error: unknown) {
          if (isMounted) {
            logger.error('Error in initial session setup:', error);
          }
        }
      }
      
      // CRITICAL: Check before state update
      if (isMounted) {
        setLoading(false);
      }
    });

    // CRITICAL: Cleanup function to prevent race conditions
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Sincronizar logout entre abas
  useEffect(() => {
    try {
      const sync = getTabSynchronizer();
      
      const unsubscribe = sync.subscribe('logout', async () => {
        logger.info('Logout detected from another tab, signing out locally');
        setSession(null);
        setUser(null);
        setProfile(null);
        setSentryUser(null);
      });

      return unsubscribe;
    } catch (error) {
      logger.warn('Failed to subscribe to logout events:', error);
      return () => {};
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      logger.debug('Attempting to sign in user:', email);
      trackUserAction('Sign In Attempt', 'auth', { email });
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.error('Sign in error:', error);
        trackUserAction('Sign In Failed', 'auth', { email, error: error.message });
        toast({
          title: "Erro no login",
          description: error.message,
          variant: "destructive",
        });
      } else {
        logger.success('Sign in successful');
        trackUserAction('Sign In Success', 'auth', { email });
        toast({
          title: "Login realizado",
          description: "Bem-vindo de volta!",
        });
      }

      return { error };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error) || 'Erro desconhecido ao fazer login';
      logger.error('Sign in error:', error);
      trackUserAction('Sign In Error', 'auth', { error: errorMessage });
      toast({
        title: "Erro no login",
        description: errorMessage,
        variant: "destructive",
      });
      return { error: error as SupabaseAuthError };
    }
  };

  const signUp = async (email: string, password: string, fullName: string, whatsapp?: string) => {
    try {
      logger.info('Attempting to sign up user:', email);
      trackUserAction('Sign Up Attempt', 'auth', { email, fullName });
      
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
            whatsapp: whatsapp,
          }
        }
      });

      if (error) {
        logger.error('Sign up error:', error);
        trackUserAction('Sign Up Failed', 'auth', { email, error: error.message });
        toast({
          title: "Erro no cadastro",
          description: error.message,
          variant: "destructive",
        });
      } else {
        logger.success('Sign up successful');
        trackUserAction('Sign Up Success', 'auth', { email });
        toast({
          title: "Cadastro realizado",
          description: "Verifique seu email para confirmar a conta.",
        });
      }

      return { error };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error) || 'Erro desconhecido ao cadastrar';
      logger.error('Sign up error:', error);
      toast({
        title: "Erro no cadastro",
        description: errorMessage,
        variant: "destructive",
      });
      return { error: error as SupabaseAuthError };
    }
  };

  const signOut = async () => {
    try {
      logger.debug('Attempting to sign out');
      trackUserAction('Sign Out', 'auth', { userId: user?.id });
      
      await logActivity('signed_out', 'auth');
      
      // ✅ PRIORIDADE 1: Cleanup de recursos globais antes do logout
      logger.info('Cleaning up global resources before logout...');
      globalResourceManager.cleanupAll();
      
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        logger.error('Sign out error:', error);
        toast({
          title: "Erro ao sair",
          description: error.message,
          variant: "destructive",
        });
      } else {
        logger.success('Sign out successful');
        toast({
          title: "Logout realizado",
          description: "Até logo!",
        });

        // Sincronizar logout com outras abas
        try {
          const sync = getTabSynchronizer();
          sync.broadcast('logout', {});
        } catch (syncError) {
          logger.warn('Failed to broadcast logout to other tabs:', syncError);
        }
      }

      return { error };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error) || 'Erro desconhecido ao sair';
      logger.error('Sign out error:', error);
      toast({
        title: "Erro ao sair",
        description: errorMessage,
        variant: "destructive",
      });
      return { error: error as SupabaseAuthError };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      logger.debug('Attempting to reset password for:', email);
      
      const redirectUrl = `${window.location.origin}/auth?mode=reset`;
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        logger.error('Reset password error:', error);
        toast({
          title: "Erro na recuperação",
          description: error.message,
          variant: "destructive",
        });
      } else {
        logger.success('Reset password successful');
        toast({
          title: "Email enviado",
          description: "Verifique seu email para redefinir a senha.",
        });
      }

      return { error };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error) || 'Erro desconhecido na recuperação';
      logger.error('Reset password error:', error);
      toast({
        title: "Erro na recuperação",
        description: errorMessage,
        variant: "destructive",
      });
      return { error: error as SupabaseAuthError };
    }
  };

  const isAdmin = () => {
    // Role is now fetched from user_roles table (security best practice)
    const result = profile?.role === 'admin' && profile?.is_active;
    logger.debug('isAdmin check:', { role: profile?.role, active: profile?.is_active, result });
    return result;
  };

  const hasRole = (role: 'admin' | 'user' | 'subscriber' | 'trial') => {
    // Role is now fetched from user_roles table (security best practice)
    return profile?.role === role && profile?.is_active;
  };

  const isSubscriptionActive = () => {
    if (!profile) return false;
    // Role is now fetched from user_roles table (security best practice)
    if (profile.role === 'admin' || profile.role === 'user') return profile.is_active;
    if (profile.role === 'trial') {
      if (!profile.trial_expires_at) return false;
      const expiresAt = new Date(profile.trial_expires_at);
      const now = new Date();
      return expiresAt > now && profile.is_active;
    }
    if (profile.role === 'subscriber') {
      if (!profile.subscription_expires_at) return false;
      const expiresAt = new Date(profile.subscription_expires_at);
      const now = new Date();
      return expiresAt > now && profile.is_active;
    }
    return false;
  };

  const getSubscriptionTimeRemaining = () => {
    if (!profile) return null;
    
    let expiresAt: Date | null = null;
    
    // Role is now fetched from user_roles table (security best practice)
    if (profile.role === 'trial' && profile.trial_expires_at) {
      expiresAt = new Date(profile.trial_expires_at);
    } else if (profile.role === 'subscriber' && profile.subscription_expires_at) {
      expiresAt = new Date(profile.subscription_expires_at);
    }
    
    if (!expiresAt) return null;
    
    const now = new Date();
    const timeLeft = expiresAt.getTime() - now.getTime();
    
    if (timeLeft <= 0) return 'Expirado';
    
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) {
      return `${days} dia${days > 1 ? 's' : ''} restante${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours}h restantes`;
    } else {
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      return `${minutes}m restantes`;
    }
  };

  return (
    <AuthContext.Provider 
      value={{
        user,
        session,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        isAdmin,
        hasRole,
        isSubscriptionActive,
        getSubscriptionTimeRemaining,
        initializeUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}