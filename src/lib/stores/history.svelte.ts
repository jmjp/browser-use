import { browser } from '$app/environment';
import type { AgentMessage, AgentStep, ChatSession } from '$lib/types/agent';

export function createHistoryStore() {
  let sessions = $state<ChatSession[]>([]);
  let currentSessionId = $state<string | null>(null);
  let loading = $state(true);

  // Derived current session
  const currentSession = $derived(
    sessions.find(s => s.id === currentSessionId) || null
  );

  const messages = $derived(currentSession?.messages || []);

  // Initialize from chrome.storage
  if (browser && chrome?.storage?.local) {
    chrome.storage.local.get(['chat_sessions', 'current_session_id'], (result) => {
      if (Array.isArray(result.chat_sessions)) {
        // Hydrate dates
        sessions = result.chat_sessions.map((s: any) => ({
          ...s,
          last_updated: new Date(s.last_updated),
          created_at: new Date(s.created_at),
          messages: s.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
            steps: m.steps.map((st: any) => ({
              ...st,
              timestamp: new Date(st.timestamp)
            }))
          }))
        }));
      } else {
        sessions = [];
      }
      
      currentSessionId = result.current_session_id || (sessions.length > 0 ? sessions[0].id : null);
      
      // If no sessions, create the first one
      if (sessions.length === 0) {
        createNewSession('Nova Conversa');
      }
      
      loading = false;
    });
  } else {
    loading = false;
  }

  function save() {
    if (browser && chrome?.storage?.local) {
      chrome.storage.local.set({ 
        chat_sessions: sessions,
        current_session_id: currentSessionId
      });
    }
  }

  function createNewSession(title = 'Nova Conversa') {
    const newId = Math.random().toString(36).substring(7);
    const newSession: ChatSession = {
      id: newId,
      title,
      messages: [],
      created_at: new Date(),
      last_updated: new Date()
    };
    sessions.unshift(newSession);
    currentSessionId = newId;
    save();
    return newId;
  }

  function switchSession(id: string) {
    if (sessions.find(s => s.id === id)) {
      currentSessionId = id;
      save();
    }
  }

  function deleteSession(id: string) {
    const index = sessions.findIndex(s => s.id === id);
    if (index !== -1) {
      sessions = sessions.filter(s => s.id !== id);
      if (currentSessionId === id) {
        currentSessionId = sessions.length > 0 ? sessions[0].id : null;
        if (!currentSessionId) createNewSession();
      }
      save();
    }
  }

  function updateSessionTitle(id: string, title: string) {
    const session = sessions.find(s => s.id === id);
    if (session) {
      session.title = title;
      save();
    }
  }

  function addMessage(message: AgentMessage) {
    if (currentSession) {
      currentSession.messages.push(message);
      currentSession.last_updated = new Date();
      
      // Auto-title if it's the first message
      if (currentSession.messages.length === 1 && message.role === 'user') {
        const textStep = message.steps.find(s => s.type === 'text');
        if (textStep) {
          const title = textStep.content.slice(0, 30) + (textStep.content.length > 30 ? '...' : '');
          currentSession.title = title;
        }
      }
      
      save();
    }
  }

  function addStep(messageId: string, step: AgentStep) {
    if (currentSession) {
      const msg = currentSession.messages.find((m) => m.id === messageId);
      if (msg) {
        msg.steps.push(step);
        currentSession.last_updated = new Date();
        save();
      }
    }
  }

  function updateStep(messageId: string, stepId: string, updates: Partial<AgentStep>) {
    if (currentSession) {
      const msg = currentSession.messages.find((m) => m.id === messageId);
      if (msg) {
        const step = msg.steps.find((s) => s.id === stepId);
        if (step) {
          Object.assign(step, updates);
          currentSession.last_updated = new Date();
          save();
        }
      }
    }
  }

  function updateLastStepContent(messageId: string, contentDelta: string) {
    if (currentSession) {
      const msg = currentSession.messages.find((m) => m.id === messageId);
      if (msg && msg.steps.length > 0) {
        const lastStep = msg.steps[msg.steps.length - 1];
        lastStep.content += contentDelta;
        currentSession.last_updated = new Date();
        save();
      }
    }
  }

  function clear() {
    if (currentSession) {
      currentSession.messages = [];
      currentSession.last_updated = new Date();
      save();
    }
  }

  return {
    get sessions() { return sessions; },
    get currentSessionId() { return currentSessionId; },
    get messages() { return messages; },
    get loading() { return loading; },
    createNewSession,
    switchSession,
    deleteSession,
    updateSessionTitle,
    addMessage,
    addStep,
    updateStep,
    updateLastStepContent,
    clear
  };
}

export const historyStore = createHistoryStore();
