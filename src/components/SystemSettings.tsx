import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatabasePerformanceTest } from "./DatabasePerformanceTest";
import { Settings, Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";

export default function SystemSettings() {
  const [trialDays, setTrialDays] = useState<string>("30");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "trial_days")
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        setTrialDays(data.setting_value);
      }
    } catch (error) {
      logger.error("Error loading system settings:", error);
      toast({
        title: "Erro ao carregar configurações",
        description: "Não foi possível carregar as configurações do sistema.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTrialDays = async () => {
    try {
      setSaving(true);
      const daysValue = parseInt(trialDays);

      if (isNaN(daysValue) || daysValue < 0) {
        toast({
          title: "Valor inválido",
          description: "Por favor, insira um número válido de dias.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from("system_settings")
        .upsert({
          setting_key: "trial_days",
          setting_value: daysValue.toString(),
          description: "Número de dias do período de trial",
        }, { onConflict: 'setting_key' });

      if (error) throw error;

      toast({
        title: "Configuração salva",
        description: "O período de trial foi atualizado com sucesso.",
      });
    } catch (error) {
      logger.error("Error saving trial days:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a configuração.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Tabs defaultValue="settings" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-headline">Período de Trial</CardTitle>
              <CardDescription className="text-body">
                Configure o número de dias do período de teste para novos usuários
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="trial-days" className="text-caption">
                  Dias de Trial
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="trial-days"
                    type="number"
                    min="0"
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)}
                    disabled={loading}
                    className="max-w-[200px]"
                  />
                  <Button 
                    onClick={handleSaveTrialDays} 
                    disabled={loading || saving}
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
                <p className="text-caption text-muted-foreground">
                  Novos usuários terão acesso completo por este período após o cadastro
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <DatabasePerformanceTest />
        </TabsContent>
      </Tabs>
    </div>
  );
}
