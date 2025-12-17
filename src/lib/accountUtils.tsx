import { Wallet, PiggyBank, CreditCard, TrendingUp, Utensils } from "lucide-react";

export const getAccountIcon = (type: string, className: string = "h-5 w-5") => {
  switch (type) {
    case "checking":
      return <Wallet className={className} />;
    case "savings":
      return <PiggyBank className={className} />;
    case "credit":
      return <CreditCard className={className} />;
    case "investment":
      return <TrendingUp className={className} />;
    case "meal_voucher":
      return <Utensils className={className} />;
    default:
      return <Wallet className={className} />;
  }
};

export const getAccountTypeLabel = (type: string) => {
  switch (type) {
    case "checking":
      return "Corrente";
    case "savings":
      return "Poupança";
    case "credit":
      return "Cartão de Crédito";
    case "investment":
      return "Investimento";
    case "meal_voucher":
      return "Vale Refeição/Alimentação";
    default:
      return type;
  }
};

export const getAccountTypeBadge = (type: string) => {
  const variants = {
    checking: "default",
    savings: "default",
    credit: "destructive",
    investment: "default",
    meal_voucher: "default",
  } as const;
  return variants[type as keyof typeof variants] || "default";
};

export const getAccountTypeBadgeColor = (type: string) => {
  const colors = {
    checking: "bg-blue-600 text-white hover:bg-blue-700",
    savings: "bg-green-600 text-white hover:bg-green-700",
    credit: "bg-red-600 text-white hover:bg-red-700",
    investment: "bg-purple-600 text-white hover:bg-purple-700",
    meal_voucher: "bg-orange-600 text-white hover:bg-orange-700",
  } as const;
  return colors[type as keyof typeof colors] || "bg-blue-600 text-white hover:bg-blue-700";
};
