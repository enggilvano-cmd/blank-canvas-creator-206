/**
 * ♿ ACESSIBILIDADE - Correção de Bugs Médios
 * 
 * Helpers para adicionar ARIA labels, roles e atributos de acessibilidade
 * em componentes que estavam faltando suporte adequado.
 */

/**
 * Props comuns de acessibilidade para componentes interativos
 */
export interface AccessibilityProps {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-expanded'?: boolean;
  'aria-selected'?: boolean;
  'aria-checked'?: boolean;
  'aria-disabled'?: boolean;
  'aria-hidden'?: boolean;
  'aria-live'?: 'off' | 'polite' | 'assertive';
  'aria-busy'?: boolean;
  'aria-modal'?: boolean;
  'aria-setsize'?: number;
  'aria-posinset'?: number;
  'aria-required'?: boolean;
  'aria-invalid'?: boolean;
  'aria-controls'?: string;
  role?: string;
  tabIndex?: number;
}

/**
 * Helper para gerar IDs únicos para ARIA
 */
let idCounter = 0;
export function generateAriaId(prefix: string = 'aria'): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now()}`;
}

/**
 * Helper para criar props de loading state acessível
 */
export function getLoadingA11yProps(isLoading: boolean, label: string = 'Carregando'): AccessibilityProps {
  return {
    'aria-busy': isLoading,
    'aria-live': 'polite',
    'aria-label': isLoading ? label : undefined,
  };
}

/**
 * Helper para botões de ação com ícones (adiciona label descritivo)
 */
export function getIconButtonA11yProps(action: string, description?: string): AccessibilityProps {
  return {
    'aria-label': description || action,
    role: 'button',
    tabIndex: 0,
  };
}

/**
 * Helper para modais e dialogs
 */
export function getDialogA11yProps(
  isOpen: boolean,
  labelId?: string,
  descriptionId?: string
): AccessibilityProps {
  return {
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': labelId,
    'aria-describedby': descriptionId,
    'aria-hidden': !isOpen,
  };
}

/**
 * Helper para componentes de lista
 */
export function getListA11yProps(label?: string): AccessibilityProps {
  return {
    role: 'list',
    'aria-label': label,
    'aria-live': 'polite',
  };
}

/**
 * Helper para itens de lista
 */
export function getListItemA11yProps(index: number, total: number): AccessibilityProps {
  return {
    role: 'listitem',
    'aria-setsize': total,
    'aria-posinset': index + 1,
  };
}

/**
 * Helper para campos de formulário com validação
 */
export function getFormFieldA11yProps(
  fieldId: string,
  error?: string,
  required?: boolean
): AccessibilityProps & { id: string } {
  const errorId = error ? `${fieldId}-error` : undefined;

  return {
    id: fieldId,
    'aria-required': required,
    'aria-invalid': !!error,
    'aria-describedby': errorId,
  };
}

/**
 * Helper para mensagens de erro acessíveis
 */
export function getErrorMessageA11yProps(fieldId: string): AccessibilityProps & { id: string } {
  return {
    id: `${fieldId}-error`,
    role: 'alert',
    'aria-live': 'assertive',
  };
}

/**
 * Helper para tabs/abas
 */
export function getTabA11yProps(
  isSelected: boolean,
  panelId: string
): AccessibilityProps {
  return {
    role: 'tab',
    'aria-selected': isSelected,
    'aria-controls': panelId,
    tabIndex: isSelected ? 0 : -1,
  };
}

/**
 * Helper para painéis de tabs
 */
export function getTabPanelA11yProps(
  tabId: string,
  isHidden: boolean
): AccessibilityProps {
  return {
    role: 'tabpanel',
    'aria-labelledby': tabId,
    'aria-hidden': isHidden,
    tabIndex: 0,
  };
}

/**
 * Helper para status messages (toast, alertas)
 */
export function getStatusMessageA11yProps(
  severity: 'success' | 'error' | 'warning' | 'info'
): AccessibilityProps {
  return {
    role: severity === 'error' ? 'alert' : 'status',
    'aria-live': severity === 'error' ? 'assertive' : 'polite',
  };
}

/**
 * Helper para botões de toggle (expandir/colapsar)
 */
export function getToggleButtonA11yProps(
  isExpanded: boolean,
  controlsId: string,
  label: string
): AccessibilityProps {
  return {
    'aria-expanded': isExpanded,
    'aria-controls': controlsId,
    'aria-label': `${label} (${isExpanded ? 'expandido' : 'recolhido'})`,
    role: 'button',
    tabIndex: 0,
  };
}

/**
 * Helper para breadcrumbs
 */
export function getBreadcrumbA11yProps(): AccessibilityProps {
  return {
    'aria-label': 'Navegação estrutural',
    role: 'navigation',
  };
}

/**
 * Helper para menu dropdown
 */
export function getDropdownMenuA11yProps(
  isOpen: boolean,
  triggerId: string
): AccessibilityProps {
  return {
    role: 'menu',
    'aria-labelledby': triggerId,
    'aria-hidden': !isOpen,
  };
}

/**
 * Helper para itens de menu
 */
export function getMenuItemA11yProps(isDisabled?: boolean): AccessibilityProps {
  return {
    role: 'menuitem',
    'aria-disabled': isDisabled,
    tabIndex: isDisabled ? -1 : 0,
  };
}

/**
 * Constantes para roles ARIA comuns
 */
export const ARIA_ROLES = {
  BUTTON: 'button',
  LINK: 'link',
  NAVIGATION: 'navigation',
  MAIN: 'main',
  COMPLEMENTARY: 'complementary',
  CONTENTINFO: 'contentinfo',
  SEARCH: 'search',
  FORM: 'form',
  REGION: 'region',
  ARTICLE: 'article',
  BANNER: 'banner',
  DIALOG: 'dialog',
  ALERT: 'alert',
  STATUS: 'status',
  LIST: 'list',
  LISTITEM: 'listitem',
  TAB: 'tab',
  TABPANEL: 'tabpanel',
  MENU: 'menu',
  MENUITEM: 'menuitem',
} as const;

/**
 * Helper para adicionar suporte de teclado (Enter e Space para ativar)
 */
export function getKeyboardActivationProps(
  onClick: (event: React.KeyboardEvent | React.MouseEvent) => void
): {
  onClick: (event: React.MouseEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
} {
  return {
    onClick: (event: React.MouseEvent) => onClick(event),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick(event);
      }
    },
  };
}
