import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTransactions } from '@/hooks/queries/useTransactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Transaction } from '@/types';

interface ProvisionVerificationResult {
  categoryId: string;
  categoryName: string;
  month: string;
  provisioning: Transaction | null;
  realTransactions: Transaction[];
  expectedProvisionAmount: number;
  actualProvisionAmount: number;
  isCorrect: boolean;
  discrepancy: number;
}

export function ProvisionDiscountVerification() {
  const { user } = useAuth();
  const [results, setResults] = useState<ProvisionVerificationResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Buscar transações dos últimos 3 meses
  const dateFrom = new Date();
  dateFrom.setMonth(dateFrom.getMonth() - 3);
  const dateFromStr = dateFrom.toISOString().split('T')[0];

  const { data: allTransactions } = useTransactions({
    dateFrom: dateFromStr,
    pageSize: null, // Trazer todas
  });

  const { data: provisionsOnly } = useTransactions({
    isProvision: 'true',
    dateFrom: dateFromStr,
    pageSize: null,
  });

  useEffect(() => {
    if (!allTransactions || !provisionsOnly) return;

    // Agrupar por categoria e mês
    const groupMap = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        month: string;
        provisioning: Transaction | null;
        realTransactions: Transaction[];
      }
    >();

    // Processar provisões
    provisionsOnly.data?.forEach((prov) => {
      const month = prov.date.substring(0, 7); // YYYY-MM
      const key = `${prov.category_id}-${month}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          categoryId: prov.category_id,
          categoryName: 'Unknown', // Será preenchido depois
          month,
          provisioning: null,
          realTransactions: [],
        });
      }

      const group = groupMap.get(key)!;
      group.provisioning = prov;
    });

    // Processar transações reais (não provisões)
    allTransactions.data?.forEach((tx) => {
      if (tx.is_provision || tx.is_fixed) return;

      const month = tx.date.substring(0, 7); // YYYY-MM
      const key = `${tx.category_id}-${month}`;

      if (groupMap.has(key)) {
        const group = groupMap.get(key)!;
        group.realTransactions.push(tx);
      }
    });

    // Calcular discrepâncias
    const verificationResults = Array.from(groupMap.values())
      .filter((group) => group.provisioning !== null) // Só verificar grupos com provisão
      .map((group) => {
        const prov = group.provisioning!;
        const sumRealTransactions = group.realTransactions.reduce(
          (sum, tx) => sum + Math.abs(tx.amount),
          0
        );

        const expectedAmount = Math.abs(prov.amount) - sumRealTransactions;
        const actualAmount = Math.abs(prov.amount); // Amount atual na BD

        return {
          categoryId: group.categoryId,
          categoryName: group.categoryName,
          month: group.month,
          provisioning: prov,
          realTransactions: group.realTransactions,
          expectedProvisionAmount: expectedAmount,
          actualProvisionAmount: actualAmount,
          isCorrect: Math.abs(expectedAmount - actualAmount) < 0.01, // Margem de erro de R$ 0,01
          discrepancy: expectedAmount - actualAmount,
        };
      });

    setResults(verificationResults);
    setIsLoading(false);
  }, [allTransactions, provisionsOnly]);

  if (isLoading) {
    return <div className="text-muted-foreground">Carregando verificação de provisões...</div>;
  }

  const correctCount = results.filter((r) => r.isCorrect).length;
  const incorrectCount = results.length - correctCount;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Verificação de Desconto de Provisões
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Total de Provisões</p>
              <p className="text-2xl font-bold">{results.length}</p>
            </div>
            <div className="p-3 bg-success/10 rounded-lg">
              <p className="text-sm text-success">Corretas ✓</p>
              <p className="text-2xl font-bold text-success">{correctCount}</p>
            </div>
            <div className="p-3 bg-destructive/10 rounded-lg">
              <p className="text-sm text-destructive">Com Discrepância</p>
              <p className="text-2xl font-bold text-destructive">{incorrectCount}</p>
            </div>
          </div>

          {incorrectCount > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {incorrectCount} provisão(ões) com desconto incorreto. Verifique abaixo.
              </AlertDescription>
            </Alert>
          )}

          {incorrectCount === 0 && results.length > 0 && (
            <Alert className="bg-success/10 border-success/20">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <AlertDescription className="text-success">
                ✓ Todos os descontos de provisões estão funcionando corretamente!
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Detalhes de cada provisão */}
      {results.map((result) => (
        <Card key={`${result.categoryId}-${result.month}`}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">
                  {result.categoryName || 'Sem Categoria'} - {result.month}
                </CardTitle>
              </div>
              <Badge variant={result.isCorrect ? 'default' : 'destructive'}>
                {result.isCorrect ? 'Correto ✓' : 'Erro ✗'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Valor Original (Provisão)</p>
                <p className="font-semibold">
                  {Math.abs(result.provisioning?.amount || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Transações Reais</p>
                <p className="font-semibold">
                  {result.realTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Esperado na Provisão:</span>
                <span className="font-semibold">{result.expectedProvisionAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Atual na Provisão:</span>
                <span className="font-semibold">{result.actualProvisionAmount.toFixed(2)}</span>
              </div>

              {!result.isCorrect && (
                <div className="flex justify-between text-sm pt-2 border-t text-destructive">
                  <span>Discrepância:</span>
                  <span className="font-bold">
                    {result.discrepancy > 0 ? '+' : ''}
                    {result.discrepancy.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {result.realTransactions.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-sm font-semibold mb-2">Transações que consomem esta provisão:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {result.realTransactions.map((tx) => (
                    <div key={tx.id} className="text-xs p-1 bg-muted rounded">
                      <div className="flex justify-between">
                        <span>{tx.description}</span>
                        <span className="font-semibold">
                          {Math.abs(tx.amount).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        {tx.date} - Status: {tx.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {results.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Nenhuma provisão encontrada para verificar.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
