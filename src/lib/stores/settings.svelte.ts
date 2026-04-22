import { browser } from '$app/environment';

export interface Persona {
  id: string;
  name: string;
  icon: string;
  systemPrompt: string;
}

export const PERSONAS: Persona[] = [
  { id: 'general', name: 'Geral', icon: '🤖', systemPrompt: 'Você é um assistente útil e eficiente.' },
  { id: 'developer', name: 'Desenvolvedor', icon: '💻', systemPrompt: 'Você é um engenheiro de software sênior. Forneça código limpo, eficiente e bem documentado.' },
  { id: 'writer', name: 'Escritor', icon: '✍️', systemPrompt: 'Você é um redator criativo e revisor gramatical. Foco em clareza, tom e estilo.' },
  { id: 'analyst', name: 'Analista', icon: '📊', systemPrompt: 'Você é um analista de dados. Foco em precisão, lógica e insights baseados em fatos.' }
];

export interface Settings {
  provider: 'gemini' | 'anthropic' | 'openai' | 'deepseek' | 'custom';
  apiKey: string;
  model: string;
  baseUrl?: string;
  personaId?: string;
}

class SettingsStore {
  settings = $state<Settings>({
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-1.5-flash',
    personaId: 'general'
  });

  planModeEnabled = $state(false);
  initialized = $state(false);

  constructor() {
    if (browser) {
      this.load();
    }
  }

  get currentPersona() {
    return PERSONAS.find(p => p.id === this.settings.personaId) || PERSONAS[0];
  }

  async load() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const data = await chrome.storage.local.get('settings');
      if (data.settings) {
        this.settings = { ...this.settings, ...data.settings };
      }
    }
    this.initialized = true;
  }

  async save(newSettings: Settings) {
    this.settings = newSettings;
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ settings: newSettings });
    }
  }

  get isConfigured() {
    return this.settings.apiKey.length > 0;
  }
}

export const settingsStore = new SettingsStore();
