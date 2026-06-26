import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Database, TrendingUp, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { logger } from "@/lib/logger";

interface TestDataResult {
  message: string;
  created: number;
  duration: string;
  rate: string;
  totalTransactions: number;
  transactionsCreated?: number;
  executionTime?: string;
  transactionsPerSecond?: number;
}

interface PerformanceTest {
  time: string;
  records?: number;
  result?: number | null;
  error?: string | null;
}

interface AnalysisResult {
  totalTransactions: number;
  tests: {
    pagination: PerformanceTest;
    count: PerformanceTest;
    filter: PerformanceTest;
  };
}

export function DatabasePerformanceTest() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transactionCount, setTransactionCount] = useState(1000);
  const [result, setResult] = useState<TestDataResult | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

  const generateTestData = async () => {
    setIsGenerating(true);
    setResult(null);
    setAnalysisResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-test-data', {
        body: {
          transactionCount,
          clearExisting: false,
        },
      });

      if (error) {throw error;}

      setResult(data);
      toast({
        title: "✅ Dados gerados com sucesso!",
        description: `${data.created} transações criadas em ${data.duration}`,
      });

      // Executar ANALYZE automaticamente
      await runAnalyze();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error('Error generating test data:', error);
      toast({
        title: "❌ Erro ao gerar dados",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const runAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      toast({
        title: "✅ ANALYZE recomendado",
        description: "Execute 'ANALYZE transactions;' no SQL Editor para atualizar estatísticas",
      });
    } catch (error) {
      logger.error('Error running ANALYZE:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runPerformanceTests = async () => {
    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      // Contar transações totais
      const { count: totalCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true });

      // Teste de paginação - medir tempo
      const startPagination = performance.now();
      const { data: paginatedData, error: paginationError } = await supabase
        .from('transactions')
        .select('id, description, amount, date, type, status')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)
        .range(0, 49);
      const paginationTime = performance.now() - startPagination;

      // Teste de contagem - medir tempo
      const startCount = performance.now();
      const { count: countResult } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true });
      const countTime = performance.now() - startCount;

      // Teste de filtro por tipo - medir tempo
      const startFilter = performance.now();
      const { data: filteredData, error: filterError } = await supabase
        .from('transactions')
        .select('id, description, amount')
        .eq('type', 'expense')
        .order('date', { ascending: false })
        .limit(50);
      const filterTime = performance.now() - startFilter;

      const analysis = {
        totalTransactions: totalCount || 0,
        tests: {
          pagination: {
            time: paginationTime.toFixed(2),
            records: paginatedData?.length || 0,
            error: paginationError?.message,
          },
          count: {
            time: countTime.toFixed(2),
            result: countResult,
            error: null,
          },
          filter: {
            time: filterTime.toFixed(2),
            records: filteredData?.length || 0,
            error: filterError?.message,
          },
        },
      };

      setAnalysisResult(analysis);

      toast({
        title: "✅ Testes executados",
        description: "Análise de performance concluída",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error('Error running performance tests:', error);
      toast({
        title: "❌ Erro nos testes",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const clearTestData = async () => {
    if (!confirm('Tem certeza que deseja limpar todos os dados de teste? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .like('description', 'TEST:%');

      if (error) {throw error;}

      setResult(null);
      setAnalysisResult(null);

      toast({
        title: "✅ Dados de teste removidos",
        description: "Todas as transações de teste foram excluídas",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error('Error clearing test data:', error);
      toast({
        title: "❌ Erro ao limpar dados",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Gerador de Dados de Teste
          </CardTitle>
          <CardDescription>
            Gere transações de teste para validar performance dos índices do banco de dados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="transaction-count">Quantidade de Transações</Label>
            <Input
              id="transaction-count"
              type="number"
              min={100}
              max={50000}
              step={100}
              value={transactionCount}
              onChange={(e) => setTransactionCount(Number(e.target.value))}
              disabled={isGenerating}
            />
            <p className="text-sm text-muted-foreground">
              Recomendado: 1000 para testes rápidos, 10000+ para validar performance real
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={generateTestData}
              disabled={isGenerating || isAnalyzing}
              className="flex-1"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Gerar Dados
                </>
              )}
            </Button>

            <Button
              onClick={clearTestData}
              variant="outline"
              disabled={isGenerating || isAnalyzing}
            >
              Limpar Testes
            </Button>
          </div>

          {result && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-medium">✅ {result.message}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                    <div>
                      <span className="text-muted-foreground">Criadas:</span>{' '}
                      <Badge variant="secondary">{result.created}</Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Duração:</span>{' '}
                      <Badge variant="secondary">{result.duration}</Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Taxa:</span>{' '}
                      <Badge variant="secondary">{result.rate}</Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total:</span>{' '}
                      <Badge variant="secondary">{result.totalTransactions}</Badge>
                    </div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Testes de Performance
          </CardTitle>
          <CardDescription>
            Execute queries para medir performance dos índices em tempo real
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={runPerformanceTests}
            disabled={isGenerating || isAnalyzing}
            className="w-full"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Executando testes...
              </>
            ) : (
              <>
                <Clock className="mr-2 h-4 w-4" />
                Executar Testes de Performance
              </>
            )}
          </Button>

          {analysisResult && (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-2">
                    📊 Testando com {analysisResult.totalTransactions.toLocaleString()} transações
                  </p>
                </AlertDescription>
              </Alert>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Resultados dos Testes:</h4>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">Query de Paginação (50 registros)</p>
                      <p className="text-sm text-muted-foreground">
                        SELECT com ORDER BY e LIMIT
                      </p>
                    </div>
                    <Badge variant={Number(analysisResult.tests.pagination.time) < 100 ? "default" : "secondary"}>
                      {analysisResult.tests.pagination.time}ms
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">Query de Contagem</p>
                      <p className="text-sm text-muted-foreground">
                        COUNT(*) com filtro de usuário
                      </p>
                    </div>
                    <Badge variant={Number(analysisResult.tests.count.time) < 50 ? "default" : "secondary"}>
                      {analysisResult.tests.count.time}ms
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">Query com Filtro de Tipo</p>
                      <p className="text-sm text-muted-foreground">
                        WHERE type = 'expense' com ORDER BY
                      </p>
                    </div>
                    <Badge variant={Number(analysisResult.tests.filter.time) < 100 ? "default" : "secondary"}>
                      {analysisResult.tests.filter.time}ms
                    </Badge>
                  </div>
                </div>
              </div>

              <Alert>
                <AlertDescription className="text-sm">
                  <p className="font-medium mb-1">💡 Interpretação:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>✅ &lt; 50ms: Excelente performance</li>
                    <li>⚠️ 50-200ms: Performance aceitável</li>
                    <li>❌ &gt; 200ms: Considerar otimização adicional</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">📚 Próximos Passos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>1. Execute EXPLAIN ANALYZE no SQL Editor para ver planos de execução detalhados</p>
          <p>2. Compare os tempos antes e depois de gerar dados</p>
          <p>3. Verifique <code className="bg-muted px-1 py-0.5 rounded">pg_stat_user_indexes</code> para uso dos índices</p>
          <p>4. Documente os resultados em DATABASE_PERFORMANCE_ANALYSIS.md</p>
        </CardContent>
      </Card>
    </div>
  );
}
