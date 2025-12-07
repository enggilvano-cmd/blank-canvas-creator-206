import { useState, useEffect } from "react";

export interface TableResponsiveConfig {
  showMobileCards: boolean;
  showTabletMultiRow: boolean;
  maxColumns: number;
  fontSize: string;
  padding: string;
  spacing: string;
  headerSize: string;
  iconSize: string;
}

export function useResponsiveTable() {
  const [config, setConfig] = useState<TableResponsiveConfig>({
    showMobileCards: false,
    showTabletMultiRow: false,
    maxColumns: 10,
    fontSize: "text-sm",
    padding: "p-4",
    spacing: "space-y-4", 
    headerSize: "text-sm",
    iconSize: "h-4 w-4"
  });

  useEffect(() => {
    const updateConfig = () => {
      const width = window.innerWidth;
      
      if (width < 640) { // Mobile - usar cards
        setConfig({
          showMobileCards: true,
          showTabletMultiRow: false,
          maxColumns: 2,
          fontSize: "text-xs",
          padding: "p-3",
          spacing: "space-y-3",
          headerSize: "text-xs",
          iconSize: "h-3 w-3"
        });
      } else if (width < 768) { // Small tablet - layout de múltiplas linhas
        setConfig({
          showMobileCards: false,
          showTabletMultiRow: true,
          maxColumns: 5,
          fontSize: "text-sm",
          padding: "p-2 sm:p-3",
          spacing: "space-y-2 sm:space-y-3",
          headerSize: "text-sm",
          iconSize: "h-4 w-4"
        });
      } else if (width < 1024) { // Tablet - layout de múltiplas linhas
        setConfig({
          showMobileCards: false,
          showTabletMultiRow: true,
          maxColumns: 6,
          fontSize: "text-sm",
          padding: "p-3",
          spacing: "space-y-3",
          headerSize: "text-sm",
          iconSize: "h-4 w-4"
        });
      } else { // Desktop - layout de tabela tradicional
        setConfig({
          showMobileCards: false,
          showTabletMultiRow: false,
          maxColumns: 7,
          fontSize: "text-sm",
          padding: "p-4",
          spacing: "space-y-4",
          headerSize: "text-sm", 
          iconSize: "h-4 w-4"
        });
      }
    };

    updateConfig();
    window.addEventListener("resize", updateConfig);
    return () => window.removeEventListener("resize", updateConfig);
  }, []);

  return config;
}