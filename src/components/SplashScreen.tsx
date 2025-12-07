import { useEffect, useState } from 'react';

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 300);
    }, 800); // Reduzido para 800ms para agilizar a inicialização

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-primary transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex flex-col items-center gap-8 animate-fade-in">
        {/* Logo */}
        <div className="relative animate-scale-in">
          <img
            src="/logo.svg"
            alt="PlaniFlow"
            className="w-32 h-32 rounded-3xl animate-pulse"
          />
        </div>

        {/* App name */}
        <h1 className="text-4xl font-bold text-primary-foreground animate-fade-in" style={{ animationDelay: '0.2s' }}>
          PlaniFlow
        </h1>

        {/* Loading spinner */}
        <div className="flex items-center gap-2 animate-fade-in" style={{ animationDelay: '0.4s' }}>
          <div className="flex gap-1.5">
            <div
              className="w-2 h-2 rounded-full bg-primary-foreground animate-bounce"
              style={{ animationDelay: '0s' }}
            />
            <div
              className="w-2 h-2 rounded-full bg-primary-foreground animate-bounce"
              style={{ animationDelay: '0.15s' }}
            />
            <div
              className="w-2 h-2 rounded-full bg-primary-foreground animate-bounce"
              style={{ animationDelay: '0.3s' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
