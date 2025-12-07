import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Shield, QrCode, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/lib/logger';

interface TwoFactorSetupProps {
  onComplete: () => void;
}

export function TwoFactorSetup({ onComplete }: TwoFactorSetupProps) {
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [factorId, setFactorId] = useState<string>('');
  const [verifyCode, setVerifyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'enroll' | 'verify'>('enroll');

  const handleEnroll = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Autenticador'
      });

      if (error) throw error;

      if (data) {
        setFactorId(data.id);
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
        setStep('verify');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao configurar 2FA';
      logger.error('Erro ao iniciar 2FA:', error);
      toast({
        title: 'Falha na Configuração',
        description: errorMessage || 'Não foi possível iniciar a configuração do 2FA',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verifyCode || verifyCode.length !== 6) {
      toast({
        title: 'Código Inválido',
        description: 'O código de verificação deve ter 6 dígitos',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      if (!factorId) {
        throw new Error('ID do fator não encontrado. Tente reiniciar o processo.');
      }

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factorId,
        code: verifyCode
      });

      if (error) throw error;

      toast({
        title: 'Autenticação Configurada',
        description: 'A autenticação de dois fatores foi ativada com sucesso'
      });

      onComplete();
    } catch (error) {
      logger.error('Erro ao verificar código:', error);
      toast({
        title: 'Código Inválido',
        description: 'Falha ao verificar o código. Verifique se digitou corretamente.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  if (step === 'enroll') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Configurar Autenticação de Dois Fatores
          </CardTitle>
          <CardDescription>
            Adicione uma camada extra de segurança à sua conta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Você precisará de um aplicativo autenticador (como Google Authenticator ou Authy)
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A autenticação de dois fatores adiciona segurança extra à sua conta,
              exigindo um código do seu aplicativo autenticador além da senha.
            </p>

            <Button 
              onClick={handleEnroll} 
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Configurando...' : 'Iniciar Configuração'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          Escaneie o Código QR
        </CardTitle>
        <CardDescription>
          Use seu aplicativo autenticador para escanear este QR Code
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex justify-center p-6 bg-white rounded-xl border shadow-sm">
            {qrCode ? (
              <img src={qrCode} alt="QR Code 2FA" className="w-48 h-48" />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center bg-white rounded">
                <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
              </div>
            )}
          </div>

          <Alert>
            <AlertDescription className="space-y-2">
              <p className="font-medium">Não consegue escanear?</p>
              <p className="text-xs break-all">Digite este código manualmente: <code className="bg-muted px-1 py-0.5 rounded">{secret}</code></p>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <label className="text-sm font-medium">Código de Verificação</label>
            <Input
              type="text"
              placeholder="000000"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
              className="text-center text-lg tracking-widest"
            />
            <p className="text-xs text-muted-foreground">
              Digite o código de 6 dígitos gerado pelo seu aplicativo
            </p>
          </div>

          <Button 
            onClick={handleVerify} 
            disabled={loading || verifyCode.length !== 6}
            className="w-full"
          >
            {loading ? 'Verificando...' : 'Verificar e Ativar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
