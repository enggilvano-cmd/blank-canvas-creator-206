# 📱 Sistema de Atualização Automática do PWA

## Visão Geral

O sistema de atualização automática do PWA foi implementado para garantir que os usuários sempre tenham a versão mais recente do aplicativo com cache limpo e funcionando corretamente.

## Componentes

### 1. **PWA Update Manager** (`src/lib/pwaUpdateManager.ts`)

Módulo central que gerencia:
- ✅ Verificação periódica de atualizações
- ✅ Ativação de novo Service Worker
- ✅ Limpeza completa de caches
- ✅ Limpeza de Storage (localStorage/sessionStorage)
- ✅ Reinstalação forçada do PWA

#### Recursos Principais

```typescript
import { pwaUpdateManager } from '@/lib/pwaUpdateManager';

// 1. Inicializar o gerenciador
pwaUpdateManager.init(registration, {
  checkInterval: 60 * 60 * 1000, // Verificar a cada 1 hora
  onUpdateAvailable: (registration) => {
    // Callback quando atualização está disponível
  },
  onUpdateApplied: () => {
    // Callback após atualização ser aplicada
  },
  onUpdateError: (error) => {
    // Callback em caso de erro
  }
});

// 2. Verificar atualizações manualmente
await pwaUpdateManager.checkForUpdates();

// 3. Aplicar atualização com limpeza de caches
await pwaUpdateManager.applyUpdate();

// 4. Forçar reinstalação completa
await pwaUpdateManager.forceReinstall();

// 5. Obter status
const status = pwaUpdateManager.getStatus();
// {
//   isSupported: boolean,
//   isRegistered: boolean,
//   currentVersion: string,
//   hasWaitingSW: boolean
// }
```

### 2. **Componente Reload Prompt** (`src/components/ReloadPrompt.tsx`)

Componente React que:
- Registra o Service Worker
- Inicializa o PWA Update Manager
- Mostra notificações ao usuário
- Gerencia fluxo de atualização interativa

#### Melhorias Implementadas

- ✅ Estado de carregamento durante atualização
- ✅ Menssagens de feedback mais detalhadas
- ✅ Sincronização de dados ao instalar PWA
- ✅ Funções de debug expostas globalmente

### 3. **Script de Geração de Versão** (`scripts/generate-version.js`)

Script executado automaticamente no build que:
- Lê versão do `package.json`
- Gera arquivo `public/version.json` com:
  - Versão do app
  - Timestamp do build
  - Nome do app
  - Número do build (se fornecido)

### 4. **Service Worker Customizado** (`public/push-sw.js`)

Melhorias:
- ✅ Suporte a mensagem `SKIP_WAITING` para ativar novo SW
- ✅ Suporte a mensagem `CLIENTS_CLAIM` para reivindicar clientes
- ✅ Limpeza automática de caches antigos no activate

## Fluxo de Atualização

```
┌─────────────────────────────────────────────┐
│   Novo Build Detectado                      │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │ Comparar Versão        │
         │ (via version.json)     │
         └────────────┬───────────┘
                      │
               ┌──────▼──────┐
               │  Versão     │
               │ Diferente?  │
               └──┬───────┬──┘
              SIM│       │NÃO
                 ▼       └─→ Nenhuma ação
         ┌──────────────────┐
         │ Mostrar Notif.   │
         │ "Nova Versão"    │
         └────────┬─────────┘
                  │
         ┌────────▼────────────┐
         │ Usuário clica em    │
         │ "Atualizar"         │
         └────────┬────────────┘
                  │
         ┌────────▼────────────────┐
         │ 1. Ativar novo SW       │
         │ 2. Limpar caches        │
         │ 3. Limpar storages      │
         │ 4. Recarregar página    │
         └────────┬────────────────┘
                  │
         ┌────────▼────────────────┐
         │ ✅ PWA Atualizado       │
         │ e Funcionando           │
         └────────────────────────┘
```

## Como Usar

### 1. **Atualização Automática**

A atualização ocorre automaticamente quando:
- Usuário abre o app
- A cada 1 hora (intervalo configurável)
- Detecta nova versão em `public/version.json`

### 2. **Atualização Manual (Via Interface)**

Usuário clica em "Atualizar" no toast que aparece quando há nova versão.

### 3. **Atualização Manual (Via Console/Debug)**

```javascript
// No console do navegador:

// Forçar reinstalação completa
await forceReinstallPWA();

// Ver status do PWA
pwaStatus();
// {
//   isSupported: true,
//   isRegistered: true,
//   currentVersion: "1.0.0",
//   hasWaitingSW: false
// }
```

### 4. **Compilar com Nova Versão**

```bash
# O script de versão é executado automaticamente
npm run build

# Isso gera automaticamente public/version.json com timestamp

# Para development:
npm run build:dev
```

## Fluxo de Limpeza de Cache

Quando `pwaUpdateManager.applyUpdate()` é executado:

1. **Limpar Caches Workbox**
   - Remove cache de API
   - Remove cache de imagens
   - Remove assets em cache

2. **Limpar Storage (Seletivo)**
   - Remove dados temporários
   - Mantém dados críticos do usuário (auth_*, user_*)
   - Limpa sessionStorage completamente

3. **Ativar Novo Service Worker**
   - Envia mensagem SKIP_WAITING
   - Aguarda ativação do novo SW
   - Reclama controle de clientes

4. **Recarregar Página**
   - Aguarda 500ms para garantir ativação
   - Recarrega a página com novo SW ativo

## Configuração Avançada

### Intervalo de Verificação

```typescript
pwaUpdateManager.init(registration, {
  checkInterval: 30 * 60 * 1000, // 30 minutos
});
```

### Callbacks Customizados

```typescript
pwaUpdateManager.init(registration, {
  onUpdateAvailable: (registration) => {
    console.log('Nova versão disponível!');
    // Mostrar UI customizada
  },
  onUpdateApplied: () => {
    console.log('Atualização aplicada com sucesso');
    // Analytics ou logging
  },
  onUpdateError: (error) => {
    console.error('Erro na atualização:', error);
    // Notificar usuário
  }
});
```

### Limpeza Completa de Dados

```typescript
// Desregistrar SW e limpar tudo
await pwaUpdateManager.forceReinstall();
// Isto irá:
// - Desregistrar todos os SWs
// - Limpar todos os caches
// - Limpar localStorage completamente
// - Limpar sessionStorage
// - Recarregar a página
```

## Monitoramento e Debug

### Acessar Status em Tempo Real

```javascript
// No console:
window.pwaStatus()
// Retorna: { isSupported, isRegistered, currentVersion, hasWaitingSW }
```

### Ver Logs

Todos os logs do PWA Update Manager incluem prefixo `[PWA]`:

```
[PWA] Versão atual: 1.0.0
[PWA] Update manager inicializado
[PWA] Verificando atualizações...
[PWA] Atualização pendente encontrada
[PWA] Iniciando atualização e limpeza de caches...
```

### Verificar Service Workers Registrados

```javascript
navigator.serviceWorker.getRegistrations().then(registrations => {
  console.log('Service Workers:', registrations);
});
```

### Verificar Caches

```javascript
caches.keys().then(names => {
  console.log('Caches disponíveis:', names);
});
```

## Boas Práticas

1. ✅ **Sempre gerar version.json no build**
   - O script `generate-version.js` faz isso automaticamente

2. ✅ **Manter dados críticos do usuário**
   - O sistema mantém dados com prefixo `user_` e `auth_`

3. ✅ **Testar em modo offline**
   - DevTools > Network > Offline
   - O PWA continuará funcionando

4. ✅ **Monitorar logs em produção**
   - Use o logger para rastrear problemas

5. ✅ **Permitir que usuários controlem atualizações**
   - Mostre UI clara quando há atualização
   - Deixe usuário decidir quando atualizar

## Troubleshooting

### PWA não atualiza

1. Verificar se `version.json` está sendo gerado
2. Verificar console para erros
3. Limpar browser cache manualmente
4. Usar `forceReinstallPWA()` para reinstalar completamente

### Cache não limpa

1. Verificar se caches estão sendo criados com nomes corretos
2. Usar DevTools > Application > Cache Storage
3. Chamar `forceReinstallPWA()` para limpeza forçada

### Usuario vê versão antiga

1. Verificar timestamp de modificação de `public/version.json`
2. Browser pode estar cacheando versão.json
3. Usar `Cache-Control: no-cache` no servidor

## Arquivos Relacionados

- 📄 `src/lib/pwaUpdateManager.ts` - Gerenciador de atualizações
- 🔄 `src/components/ReloadPrompt.tsx` - Componente de interface
- 📝 `public/version.json` - Arquivo de versão (auto-gerado)
- 🐚 `scripts/generate-version.js` - Script de geração
- 🔧 `public/push-sw.js` - Service Worker customizado
- ⚙️ `vite.config.ts` - Configuração VitePWA

## Suporte e Documentação

Para mais informações sobre PWAs e Service Workers:
- [VitePWA Docs](https://vite-pwa-org.netlify.app/)
- [MDN Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web.dev PWA Guide](https://web.dev/progressive-web-apps/)
