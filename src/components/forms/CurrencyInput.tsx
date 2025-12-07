import { useState, useEffect, useCallback, InputHTMLAttributes } from 'react';
import { Input } from "@/components/ui/input";

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 });

interface CurrencyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number; // Valor em centavos
  onValueChange: (value: number) => void; // Retorna o valor em centavos
  allowNegative?: boolean; // Permite valores negativos
}

export function CurrencyInput({ value, onValueChange, allowNegative = false, ...props }: CurrencyInputProps) {
  // Estado apenas para controlar o sinal quando o valor é zero (ex: "-0,00")
  const [negativeZero, setNegativeZero] = useState(false);
  
  // O sinal real é derivado do valor (se != 0) ou do estado negativeZero (se == 0)
  const isNegative = value !== 0 ? value < 0 : negativeZero;

  // Inicializa o valor exibido (SEM o sinal negativo)
  const [displayValue, setDisplayValue] = useState(() => {
    const absValue = Math.abs(value);
    const formattedValue = BRL_FORMATTER.format(absValue / 100);
    return formattedValue;
  });

  // Sincroniza o displayValue quando o valor ou o sinal mudam (SEM o sinal negativo no display)
  useEffect(() => {
    const absValue = Math.abs(value);
    const formattedValue = BRL_FORMATTER.format(absValue / 100);
    setDisplayValue(formattedValue);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value: inputValue } = e.target;

    // Detectar sinal negativo na string digitada (suporta tanto '-' quanto '−')
    const hasMinus = allowNegative && (inputValue.includes('-') || inputValue.includes('−'));
    
    // Remove todos os caracteres não numéricos (exceto o ponto que pode estar lá)
    const digitsOnly = inputValue.replace(/\D/g, '');
    
    if (!digitsOnly) {
      // Se o valor for vazio, atualizamos o estado de "zero negativo" baseado no input
      setNegativeZero(hasMinus);
      setDisplayValue('0,00');
      onValueChange(0);
      return;
    }

    // Se temos dígitos, o sinal é determinado pelo hasMinus
    setNegativeZero(false); // Resetamos o estado de zero negativo
    const centsValue = parseInt(digitsOnly, 10);
    const finalValue = hasMinus ? -centsValue : centsValue;
    
    // Atualizar o display imediatamente para feedback visual (SEM o sinal)
    const absValue = Math.abs(finalValue);
    const formattedValue = BRL_FORMATTER.format(absValue / 100);
    setDisplayValue(formattedValue);
    
    // Notificar a mudança de valor
    onValueChange(finalValue);
  }, [onValueChange, allowNegative]);

  const toggleSign = useCallback(() => {
    if (!allowNegative) return;
    
    if (value === 0) {
      const newNegativeZero = !negativeZero;
      setNegativeZero(newNegativeZero);
    } else {
      const newValue = -value;
      onValueChange(newValue);
    }
  }, [allowNegative, negativeZero, value, onValueChange]);

  // Determinar o texto do botão baseado no sinal atual
  const buttonText = isNegative ? '−' : '+';
  const buttonColor = isNegative ? 'text-red-500' : 'text-green-500';

  return (
    <div className="relative">
      {allowNegative && (
        <button
          type="button"
          onClick={toggleSign}
          className={`absolute left-2 top-1/2 -translate-y-1/2 text-lg font-bold px-2 py-1 rounded hover:bg-muted transition-colors z-10 w-8 h-8 flex items-center justify-center ${buttonColor}`}
          tabIndex={-1}
          title="Alternar sinal (+/-)"
        >
          {buttonText}
        </button>
      )}
      <Input
        {...props}
        type="tel"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onFocus={(e) => {
          e.target.select();
        }}
        placeholder="0,00"
        className={allowNegative ? 'pl-12' : ''}
      />
    </div>
  );
}