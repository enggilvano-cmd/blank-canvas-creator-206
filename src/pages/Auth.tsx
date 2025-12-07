import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { logger } from '@/lib/logger';
import { Lock, User, Mail, Eye, EyeOff, BarChart3, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { TwoFactorVerify } from '@/components/TwoFactorVerify';

export default function Auth() {
  const { signIn, signUp, resetPassword, user, loading } = useAuth();
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [needsMfaVerification, setNeedsMfaVerification] = useState(false);
  const [isCheckingMfa, setIsCheckingMfa] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    whatsapp: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [trialDays, setTrialDays] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrialDays = async () => {
      try {
        // Tenta buscar via RPC primeiro (bypassing RLS)
        const { data, error } = await supabase.rpc('get_system_setting', { 
          p_setting_key: 'trial_days' 
        });
        
        if (!error && data) {
          setTrialDays(data);
          return;
        }

        // Fallback para busca direta (caso o usuário tenha permissão ou RPC falhe)
        const { data: tableData } = await supabase
          .from("system_settings")
          .select("setting_value")
          .eq("setting_key", "trial_days")
          .single();
        
        if (tableData) {
          setTrialDays(tableData.setting_value);
        }
      } catch (error) {
        logger.error("Error fetching trial days:", error);
      }
    };
    fetchTrialDays();
  }, []);

  useEffect(() => {
    if (user && !loading && !isCheckingMfa && !needsMfaVerification) {
      navigate('/');
    }
  }, [user, loading, navigate, isCheckingMfa, needsMfaVerification]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email) {
      newErrors.email = 'Email é obrigatório';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    if (!formData.password) {
      newErrors.password = 'Senha é obrigatória';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Senha deve ter pelo menos 6 caracteres';
    }

    if (activeTab === 'signup') {
      if (!formData.fullName) {
        newErrors.fullName = 'Nome completo é obrigatório';
      }
      if (!formData.whatsapp) {
        newErrors.whatsapp = 'WhatsApp é obrigatório';
      } else if (!/^\(\d{2}\)\s\d{5}-\d{4}$/.test(formData.whatsapp)) {
        newErrors.whatsapp = 'WhatsApp deve estar no formato (99) 99999-9999';
      }
      if (!formData.confirmPassword) {
        newErrors.confirmPassword = 'Confirmação de senha é obrigatória';
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Senhas não coincidem';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    if (!isOnline) {
      setErrors({ email: 'Login e cadastro requerem conexão com a internet' });
      return;
    }
    
    setIsLoading(true);

    try {
      if (activeTab === 'signin') {
        setIsCheckingMfa(true);
        const { error } = await signIn(formData.email, formData.password);
        
        if (error) {
          setIsCheckingMfa(false);
          return;
        }
        
        // Verificar se o usuário tem MFA habilitado
        const { data: factors } = await supabase.auth.mfa.listFactors();
        if (factors?.totp && factors.totp.length > 0) {
          setNeedsMfaVerification(true);
          setIsCheckingMfa(false);
          return;
        }
        
        setIsCheckingMfa(false);
      } else {
        await signUp(formData.email, formData.password, formData.fullName, formData.whatsapp);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!formData.email) {
      setErrors({ email: 'Digite seu email para recuperar a senha' });
      return;
    }

    if (!isOnline) {
      setErrors({ email: 'Recuperação de senha requer conexão com a internet' });
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(formData.email);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    let formattedValue = value;
    
    // Formatação automática para WhatsApp
    if (field === 'whatsapp') {
      const numbers = value.replace(/\D/g, '');
      if (numbers.length <= 11) {
        if (numbers.length <= 2) {
          formattedValue = numbers;
        } else if (numbers.length <= 6) {
          formattedValue = `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
        } else if (numbers.length <= 10) {
          formattedValue = `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
        } else {
          formattedValue = `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
        }
      } else {
        return; // Não permite mais de 11 dígitos
      }
    }
    
    setFormData(prev => ({ ...prev, [field]: formattedValue }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Mostrar verificação 2FA se necessário
  if (needsMfaVerification) {
    return (
      <TwoFactorVerify
        onVerified={() => {
          setNeedsMfaVerification(false);
          navigate('/');
        }}
        onCancel={async () => {
          await supabase.auth.signOut();
          setNeedsMfaVerification(false);
        }}
      />
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-[#1469B6] dark:bg-background flex items-start justify-center p-4 pt-8 pb-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img 
              src="/logo.svg" 
              alt="PlaniFlow Logo" 
              className="h-24 w-24 object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-300"
            />
          </div>
          <h1 className="text-3xl font-bold text-white">PlaniFlow</h1>
          <p className="text-blue-100">Sistema Seguro de Gestão Financeira</p>
        </div>

        <Card className="financial-card transition-all duration-300">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Lock className="h-5 w-5" />
              Autenticação Segura
            </CardTitle>
            <CardDescription>
              Acesse sua conta com segurança
            </CardDescription>
            {!isOnline && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>
                  Você está offline. Login e cadastro requerem conexão com a internet.
                </AlertDescription>
              </Alert>
            )}
          </CardHeader>
          <CardContent>
            {trialDays && activeTab === 'signup' && (
              <div className="mb-6 p-3 bg-primary/10 border border-primary/20 rounded-lg text-center animate-in fade-in slide-in-from-top-2">
                <p className="text-sm text-primary font-medium">
                  Você tem <span className="font-bold">{trialDays}</span> dias para conhecer o sistema gratuitamente!
                </p>
              </div>
            )}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className={errors.email ? 'border-destructive' : ''}
                    />
                    {errors.email && (
                      <Alert variant="destructive">
                        <AlertDescription>{errors.email}</AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signin-password" className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Senha
                    </Label>
                    <div className="relative">
                      <Input
                        id="signin-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Sua senha"
                        value={formData.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        className={errors.password ? 'border-destructive' : ''}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {errors.password && (
                      <Alert variant="destructive">
                        <AlertDescription>{errors.password}</AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full floating-action"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      'Entrar'
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleResetPassword}
                    disabled={isLoading}
                  >
                    Esqueci minha senha
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Nome Completo
                    </Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Seu nome completo"
                      value={formData.fullName}
                      onChange={(e) => handleInputChange('fullName', e.target.value)}
                      className={errors.fullName ? 'border-destructive' : ''}
                    />
                    {errors.fullName && (
                      <Alert variant="destructive">
                        <AlertDescription>{errors.fullName}</AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className={errors.email ? 'border-destructive' : ''}
                    />
                    {errors.email && (
                      <Alert variant="destructive">
                        <AlertDescription>{errors.email}</AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-whatsapp" className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      WhatsApp
                    </Label>
                    <Input
                      id="signup-whatsapp"
                      type="tel"
                      placeholder="(99) 99999-9999"
                      value={formData.whatsapp}
                      onChange={(e) => handleInputChange('whatsapp', e.target.value)}
                      className={errors.whatsapp ? 'border-destructive' : ''}
                    />
                    {errors.whatsapp && (
                      <Alert variant="destructive">
                        <AlertDescription>{errors.whatsapp}</AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Senha
                    </Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Mínimo 6 caracteres"
                        value={formData.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        className={errors.password ? 'border-destructive' : ''}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {errors.password && (
                      <Alert variant="destructive">
                        <AlertDescription>{errors.password}</AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password">
                      Confirmar Senha
                    </Label>
                    <Input
                      id="signup-confirm-password"
                      type="password"
                      placeholder="Confirme sua senha"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      className={errors.confirmPassword ? 'border-destructive' : ''}
                    />
                    {errors.confirmPassword && (
                      <Alert variant="destructive">
                        <AlertDescription>{errors.confirmPassword}</AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full floating-action"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      'Criar Conta'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium text-sm mb-2">🔐 Recursos de Segurança:</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Criptografia de ponta a ponta</li>
                <li>• Proteção contra ataques de força bruta</li>
                <li>• Auditoria completa de atividades</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}