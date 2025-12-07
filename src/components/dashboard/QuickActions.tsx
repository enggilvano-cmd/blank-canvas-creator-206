import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, ArrowRightLeft, CreditCard, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface QuickActionsProps {
  onAddTransaction: () => void;
  onTransfer: () => void;
}

export const QuickActions = ({ onAddTransaction, onTransfer }: QuickActionsProps) => {
  const navigate = useNavigate();

  return (
    <Card className="p-6">
      <h3 className="text-headline font-semibold mb-4">Ações Rápidas</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Button
          onClick={onAddTransaction}
          className="h-auto flex-col gap-2 py-4"
          variant="outline"
        >
          <Plus className="h-5 w-5" />
          <span className="text-caption">Nova Transação</span>
        </Button>
        
        <Button
          onClick={onTransfer}
          className="h-auto flex-col gap-2 py-4"
          variant="outline"
        >
          <ArrowRightLeft className="h-5 w-5" />
          <span className="text-caption">Transferência</span>
        </Button>
        
        <Button
          onClick={() => navigate("/credit-bills")}
          className="h-auto flex-col gap-2 py-4"
          variant="outline"
        >
          <CreditCard className="h-5 w-5" />
          <span className="text-caption">Faturas</span>
        </Button>
        
        <Button
          onClick={() => navigate("/accounting-reports")}
          className="h-auto flex-col gap-2 py-4"
          variant="outline"
        >
          <FileText className="h-5 w-5" />
          <span className="text-caption">Relatórios</span>
        </Button>
      </div>
    </Card>
  );
};
