import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, TrendingUp, DollarSign, Activity } from "lucide-react";

const BybitPage = () => {
  return (
    <Layout currentPage="bybit" onNavigate={() => {}} loading={false}>
      <div className="space-y-6 max-w-screen-2xl mx-auto px-2 sm:px-0 pb-6 sm:pb-8">
        <div>
          <h1 className="text-title font-bold mb-2">Integração Bybit</h1>
          <p className="text-body text-muted-foreground">
            Conecte sua conta Bybit para sincronizar transações e acompanhar seus investimentos em cripto
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-headline">
                <TrendingUp className="h-5 w-5 text-primary" />
                Sincronização Automática
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body text-muted-foreground">
                Importar transações automaticamente da sua conta Bybit para o PlaniFlow
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-headline">
                <DollarSign className="h-5 w-5 text-primary" />
                Visão Consolidada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body text-muted-foreground">
                Visualize seus investimentos em cripto junto com suas finanças tradicionais
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-headline">
                <Activity className="h-5 w-5 text-primary" />
                Relatórios Detalhados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body text-muted-foreground">
                Acompanhe o desempenho dos seus investimentos com gráficos e análises
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-headline">Configuração da Integração</CardTitle>
            <CardDescription className="text-body">
              Configure sua conexão com a API da Bybit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/40 p-4 bg-muted/20">
              <p className="text-body text-muted-foreground mb-4">
                A integração com Bybit permite que você:
              </p>
              <ul className="list-disc list-inside space-y-2 text-body text-muted-foreground ml-2">
                <li>Importe automaticamente suas transações de cripto</li>
                <li>Acompanhe saldos e movimentações em tempo real</li>
                <li>Gere relatórios consolidados de investimentos</li>
                <li>Mantenha suas chaves de API seguras e criptografadas</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="default" className="gap-2" disabled>
                Conectar Conta Bybit
              </Button>
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => window.open('https://www.bybit.com/en/help-center/article/How-to-Create-a-New-API-Key', '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
                Como criar API Key
              </Button>
            </div>

            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4">
              <p className="text-caption font-semibold text-yellow-700 dark:text-yellow-400 mb-1">
                Em Desenvolvimento
              </p>
              <p className="text-body text-muted-foreground">
                Esta funcionalidade está em desenvolvimento. Em breve você poderá conectar sua conta Bybit.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default BybitPage;
