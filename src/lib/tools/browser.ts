import type { ToolDefinition } from '../types/tools.js';

/**
 * Interface for the browser tools that includes the execute method with typed parameters.
 */
export interface BrowserTool<P = any, R = any> extends ToolDefinition {
  execute(params: P): Promise<R>;
}

/**
 * Ensures that the debugger is attached to the specified tab.
 */
async function ensureDebuggerAttached(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.getTargets((targets) => {
      const isAttached = targets.some(t => t.tabId === tabId && t.attached);
      if (!isAttached) {
        chrome.debugger.attach({ tabId: tabId }, "1.3", () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  });
}

/**
 * Evaluates a JavaScript expression in the context of a tab using the Chrome Debugger API.
 * This bypasses CSP restrictions.
 */
async function evaluateInTab(tabId: number, expression: string): Promise<any> {
  await ensureDebuggerAttached(tabId);
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(
      { tabId: tabId },
      "Runtime.evaluate",
      {
        expression: expression,
        returnByValue: true,
        awaitPromise: true
      },
      (result: any) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (result && result.exceptionDetails) {
          const e = result.exceptionDetails;
          const msg = e.exception ? e.exception.description : e.text;
          reject(new Error(msg));
        } else {
          resolve(result.result.value);
        }
      }
    );
  });
}

/**
 * Wait for a tab to finish loading.
 */
async function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Timeout of 10s as a safety measure
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 10000);
  });
}

/**
 * List of browser tools to be used by the agent.
 */
export const BROWSER_TOOLS: BrowserTool[] = [
  {
    name: "list_tabs",
    description: "Lista todas as abas abertas",
    parameters: { type: "object", properties: {}, required: [] },
    async execute() {
      const tabs = await chrome.tabs.query({});
      return tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active }));
    }
  },
  {
    name: "navigate",
    description: "Navega para uma URL na aba ativa ou em nova aba",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "A URL para navegar" },
        new_tab: { type: "boolean", description: "Se deve abrir em uma nova aba" }
      },
      required: ["url"]
    },
    async execute({ url, new_tab }: { url: string; new_tab?: boolean }) {
      if (new_tab) {
        const tab = await chrome.tabs.create({ url });
        if (tab.id) await waitForTabLoad(tab.id);
        return { tabId: tab.id, url };
      } else {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab && tab.id) {
          await chrome.tabs.update(tab.id, { url });
          await waitForTabLoad(tab.id);
          return { tabId: tab.id, url };
        }
        return { error: "No active tab found" };
      }
    }
  },
  {
    name: "screenshot",
    description: "Captura screenshot da aba ativa em base64 PNG",
    parameters: { type: "object", properties: {}, required: [] },
    async execute() {
      const window = await chrome.windows.getLastFocused();
      if (!window || !window.id) return { error: "No focused window found" };
      // captureVisibleTab takes a windowId
      const dataUrl = await chrome.tabs.captureVisibleTab(window.id, { format: "png" });
      return { image: dataUrl };
    }
  },
  {
    name: "get_content",
    description: "Extrai todo o texto visível da página atual",
    parameters: { type: "object", properties: {}, required: [] },
    async execute() {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id) return { error: "No active tab found" };
      try {
        const result = await evaluateInTab(tab.id, "document.body.innerText");
        return { content: result };
      } catch(e: any) {
        return { error: e.message };
      }
    }
  },
  {
    name: "click",
    description: "Clica em elemento via seletor CSS",
    parameters: {
      type: "object",
      properties: { 
        selector: { type: "string", description: "O seletor CSS do elemento para clicar" } 
      },
      required: ["selector"]
    },
    async execute({ selector }: { selector: string }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id) return { error: "No active tab found" };
      const script = `
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: "Elemento não encontrado: " + ${JSON.stringify(selector)} };
          if (el instanceof HTMLElement) {
            el.click();
            return { success: true, selector: ${JSON.stringify(selector)} };
          }
          return { error: "O elemento não é clicável" };
        })();
      `;
      try {
        const result = await evaluateInTab(tab.id, script);
        return result;
      } catch(e: any) {
        return { error: e.message };
      }
    }
  },
  {
    name: "type_text",
    description: "Digita texto em um campo via seletor CSS",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "O seletor CSS do campo" },
        text: { type: "string", description: "O texto para digitar" },
        clear_first: { type: "boolean", description: "Se deve limpar o campo antes de digitar" }
      },
      required: ["selector", "text"]
    },
    async execute({ selector, text, clear_first = true }: { selector: string; text: string; clear_first?: boolean }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id) return { error: "No active tab found" };
      const script = `
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: "Elemento não encontrado: " + ${JSON.stringify(selector)} };
          if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
            return { error: "O elemento não é um campo de entrada" };
          }
          if (${clear_first}) el.value = '';
          el.focus();
          el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true };
        })();
      `;
      try {
        const result = await evaluateInTab(tab.id, script);
        return result;
      } catch(e: any) {
        return { error: e.message };
      }
    }
  },
  {
    name: "execute_script",
    description: "Executa JavaScript arbitrário na página ativa",
    parameters: {
      type: "object",
      properties: { 
        script: { type: "string", description: "O código JavaScript para executar" } 
      },
      required: ["script"]
    },
    async execute({ script }: { script: string }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id) return { error: "No active tab found" };
      try {
        // Wrap in async IIFE to allow top-level return and await
        const wrappedScript = `(async () => {
${script}
        })()`;
        const result = await evaluateInTab(tab.id, wrappedScript);
        return { result };
      } catch (e: any) {
        return { error: e.message };
      }
    }
  },
  {
    name: "scroll",
    description: "Rola a página",
    parameters: {
      type: "object",
      properties: {
        direction: { 
          type: "string", 
          enum: ["up", "down", "top", "bottom"],
          description: "A direção para rolar"
        },
        amount: { 
          type: "number", 
          description: "A quantidade de pixels para rolar (para up/down)"
        }
      },
      required: ["direction"]
    },
    async execute({ direction, amount = 500 }: { direction: "up" | "down" | "top" | "bottom"; amount?: number }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id) return { error: "No active tab found" };
      const script = `
        (() => {
          const dir = ${JSON.stringify(direction)};
          const amt = ${amount};
          let dx = 0, dy = 0;
          if (dir === 'up') dy = -amt;
          else if (dir === 'down') dy = amt;
          else if (dir === 'top') dy = -999999;
          else if (dir === 'bottom') dy = 999999;
          window.scrollBy(dx, dy);
          return { success: true };
        })();
      `;
      try {
        const result = await evaluateInTab(tab.id, script);
        return result;
      } catch(e: any) {
        return { error: e.message };
      }
    }
  },
  {
    name: "wait_for_element",
    description: "Aguarda um elemento aparecer no DOM",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "O seletor CSS do elemento" },
        timeout_ms: { type: "number", description: "Tempo máximo de espera em ms" }
      },
      required: ["selector"]
    },
    async execute({ selector, timeout_ms = 5000 }: { selector: string; timeout_ms?: number }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id) return { error: "No active tab found" };
      const script = `
        new Promise((resolve) => {
          const sel = ${JSON.stringify(selector)};
          const timeout = ${timeout_ms};
          if (document.querySelector(sel)) return resolve({ found: true });
          const obs = new MutationObserver(() => {
            if (document.querySelector(sel)) { 
              obs.disconnect(); 
              resolve({ found: true }); 
            }
          });
          obs.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => { 
            obs.disconnect(); 
            resolve({ found: false, timeout: true }); 
          }, timeout);
        })
      `;
      try {
        const result = await evaluateInTab(tab.id, script);
        return result;
      } catch(e: any) {
        return { error: e.message };
      }
    }
  },
  {
    name: "get_page_info",
    description: "Retorna título, URL e metadados da página atual",
    parameters: { type: "object", properties: {}, required: [] },
    async execute() {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab) return { error: "No active tab found" };
      return { title: tab.title, url: tab.url, tabId: tab.id };
    }
  },
  {
    name: "switch_tab",
    description: "Alterna para uma aba específica pelo ID",
    parameters: {
      type: "object",
      properties: {
        tab_id: { type: "number", description: "O ID da aba para ativar" }
      },
      required: ["tab_id"]
    },
    async execute({ tab_id }: { tab_id: number }) {
      try {
        await chrome.tabs.update(tab_id, { active: true });
        const tab = await chrome.tabs.get(tab_id);
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        return { success: true, message: `Aba ${tab_id} agora está ativa` };
      } catch (e: any) {
        return { error: e.message };
      }
    }
  },
  {
    name: "get_value",
    description: "Obtém o valor de um campo de entrada ou o texto de um elemento",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "O seletor CSS do elemento" }
      },
      required: ["selector"]
    },
    async execute({ selector }: { selector: string }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id) return { error: "No active tab found" };
      const script = `
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: "Elemento não encontrado" };
          return el.value !== undefined ? el.value : el.innerText;
        })();
      `;
      try {
        const result = await evaluateInTab(tab.id, script);
        return { value: result };
      } catch(e: any) {
        return { error: e.message };
      }
    }
  },
  {
    name: "select_option",
    description: "Seleciona uma opção em um elemento <select>",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "O seletor CSS do elemento <select>" },
        value: { type: "string", description: "O valor da opção para selecionar" }
      },
      required: ["selector", "value"]
    },
    async execute({ selector, value }: { selector: string; value: string }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id) return { error: "No active tab found" };
      const script = `
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: "Elemento não encontrado" };
          if (!(el instanceof HTMLSelectElement)) return { error: "O elemento não é um <select>" };
          el.value = ${JSON.stringify(value)};
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, selectedValue: el.value };
        })();
      `;
      try {
        const result = await evaluateInTab(tab.id, script);
        return result;
      } catch(e: any) {
        return { error: e.message };
      }
    }
  },
  {
    name: "hover",
    description: "Passa o mouse sobre um elemento",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "O seletor CSS do elemento" }
      },
      required: ["selector"]
    },
    async execute({ selector }: { selector: string }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id) return { error: "No active tab found" };
      const script = `
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: "Elemento não encontrado" };
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          return { success: true };
        })();
      `;
      try {
        const result = await evaluateInTab(tab.id, script);
        return result;
      } catch(e: any) {
        return { error: e.message };
      }
    }
  },
  {
    name: "capture_node",
    description: "Captura o conteúdo HTML ou tira um print de um elemento específico",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "O seletor CSS do elemento" },
        format: { type: "string", enum: ["html", "png"], description: "O formato da captura (html ou png)" }
      },
      required: ["selector"]
    },
    async execute({ selector, format = "html" }: { selector: string; format?: "html" | "png" }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id) return { error: "No active tab found" };
      
      try {
        if (format === "html") {
          const script = `
            (() => {
              const el = document.querySelector(${JSON.stringify(selector)});
              if (!el) return { error: "Elemento não encontrado" };
              return el.outerHTML;
            })();
          `;
          const result = await evaluateInTab(tab.id, script);
          return { html: result };
        } else {
          // Captura as coordenadas do elemento
          const rectScript = `
            (() => {
              const el = document.querySelector(${JSON.stringify(selector)});
              if (!el) return { error: "Elemento não encontrado" };
              const rect = el.getBoundingClientRect();
              return {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
                devicePixelRatio: window.devicePixelRatio || 1
              };
            })();
          `;
          const rect = await evaluateInTab(tab.id, rectScript);
          if (rect.error) return rect;

          const window = await chrome.windows.getLastFocused();
          if (!window || !window.id) return { error: "No focused window found" };
          
          const dataUrl = await chrome.tabs.captureVisibleTab(window.id, { format: "png" });
          const croppedBase64 = await cropImage(dataUrl, rect);
          return { image: `data:image/png;base64,${croppedBase64}` };
        }
      } catch(e: any) {
        return { error: e.message };
      }
    }
  },
  {
    name: "upload_file",
    description: "Faz o upload de um arquivo para um campo de input",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "O seletor CSS do campo de input type='file'" },
        file_path: { type: "string", description: "O caminho absoluto do arquivo para upload" }
      },
      required: ["selector", "file_path"]
    },
    async execute({ selector, file_path }: { selector: string; file_path: string }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab || !tab.id) return { error: "No active tab found" };

      try {
        // Nota: O upload de arquivos via extensão requer privilégios de debugger para ser confiável
        await chrome.debugger.attach({ tabId: tab.id }, "1.3");
        const { root } = (await chrome.debugger.sendCommand({ tabId: tab.id }, "DOM.getDocument")) as any;
        const { nodeId } = (await chrome.debugger.sendCommand({ tabId: tab.id }, "DOM.querySelector", { 
          nodeId: root.nodeId, 
          selector 
        })) as any;
        
        await chrome.debugger.sendCommand({ tabId: tab.id }, "DOM.setFileInputFiles", { 
          nodeId, 
          files: [file_path] 
        });
        
        await chrome.debugger.detach({ tabId: tab.id });
        return { success: true, message: `Arquivo ${file_path} selecionado com sucesso.` };
      } catch (e: any) {
        // Fallback: tenta desanexar se der erro
        try { await chrome.debugger.detach({ tabId: tab.id }); } catch {}
        return { error: `Erro ao fazer upload: ${e.message}. Certifique-se que o caminho é absoluto.` };
      }
    }
  }
];

/**
 * Detaches the debugger from all tabs where it is currently attached.
 * Used for cleanup when the agent finishes its task.
 */
export async function detachAllDebuggers(): Promise<void> {
  return new Promise((resolve) => {
    chrome.debugger.getTargets((targets) => {
      const attachedTargets = targets.filter(t => t.attached && t.tabId);
      if (attachedTargets.length === 0) {
        resolve();
        return;
      }

      let count = 0;
      attachedTargets.forEach((target) => {
        chrome.debugger.detach({ tabId: target.tabId }, () => {
          count++;
          if (count === attachedTargets.length) {
            resolve();
          }
        });
      });
    });
  });
}

/**
 * Recorta uma imagem em Base64 usando OffscreenCanvas.
 */
async function cropImage(dataUrl: string, rect: any): Promise<string> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);
  
  const dpr = rect.devicePixelRatio || 1;
  const canvas = new OffscreenCanvas(rect.width * dpr, rect.height * dpr);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error("Failed to get 2d context for OffscreenCanvas");

  ctx.drawImage(
    imageBitmap,
    rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr, // Origem
    0, 0, rect.width * dpr, rect.height * dpr // Destino
  );
  
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      resolve(base64data.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(croppedBlob);
  });
}
