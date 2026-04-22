# Ultra Browser - AI Browser Agent (SvelteKit Refactor)

Este projeto é uma **reconstrução completa** da extensão original, agora utilizando SvelteKit 5 (Runes) e TypeScript, com uma interface moderna inspirada no **Claude Browser**.

## 🚀 Novas Funcionalidades

1.  **AI Streaming steps:** A interface agora exibe em tempo real o **raciocínio (thought)** da IA e as **etapas de execução** de ferramentas (tool chips) antes de dar a resposta final.
2.  **Design "Claude-Inspired":** Estética minimalista com tons de cinza suave (`#F9FAFB`), tipografia Geist/Inter e cantos arredondados (16px).
3.  **Arquitetura SvelteKit SSG:** Configurado com `adapter-static` para total compatibilidade com Manifest V3.
4.  **Agente Reativo:** Loop de agente (Pensar -> Agir -> Observar -> Responder) orquestrado no Service Worker com comunicação via Chrome Messaging.

## 🛠️ Tecnologias
-   **Frontend:** Svelte 5 (Runes), Tailwind CSS 4.
-   **Agente:** Adaptadores para Gemini, Anthropic e OpenAI.
-   **Ferramentas:** Browser Tools (Navigation, Screenshot, Click, Type, Script Execution) via Chrome Debugger.
-   **Testes:** Vitest com JSDOM e Mocks de API do Chrome.

## 📦 Comandos de Desenvolvimento

### Instalação
```bash
pnpm install
```

### Desenvolvimento (SvelteKit UI)
```bash
pnpm dev
```

### Build e Empacotamento
Para gerar a extensão pronta para uso:
```bash
# Compila a UI e o Service Worker, gerando a pasta dist/
pnpm run build:extension

# Opcional: Gera um .zip da extensão
pnpm run zip:extension
```

## 📂 Estrutura do Projeto (Novo)
- `src/routes/`: UI principal (Side Panel) do agente.
- `src/lib/components/`: Componentes modulares (`ChatBubble`, `ThoughtBlock`, `ToolChip`).
- `src/lib/stores/`: Gerenciamento de estado reativo e persistência (`historyStore`).
- `src/lib/tools/`: Ferramentas de navegador em TypeScript.
- `src/lib/services/llm/`: Adaptadores de streaming para provedores de IA.
- `src/background/agent.ts`: Orquestrador central do loop do agente.

## 📝 Guia de Contribuição
- **Adicionar Ferramentas:** Insira a definição em `src/lib/types/tools.ts` e a implementação em `src/lib/tools/browser.ts`.
- **Estilização:** Utilize os tokens de design definidos em `brain/design.yaml` através do Tailwind 4.
- **Testes:** Sempre adicione testes unitários em `src/lib/tools/*.test.ts` ao modificar ferramentas.
