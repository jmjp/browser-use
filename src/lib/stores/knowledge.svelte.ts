export interface KnowledgeMemory {
	id: string;
	title: string;
	urlPattern?: string; // Ex: "linkedin.com/jobs" ou "*"
	stepsSummary: string; // Descrição textual refinada do aprendizado/fluxo
	toolsUsed: string[];
	createdAt: string;
}

class KnowledgeStore {
	memories = $state<KnowledgeMemory[]>([]);

	constructor() {
		this.load();
	}

	async load() {
		if (typeof chrome !== 'undefined' && chrome.storage?.local) {
			const res = await chrome.storage.local.get('agent_memories');
			if (res.agent_memories) {
				this.memories = res.agent_memories;
			}
		} else {
			const local = localStorage.getItem('agent_memories');
			if (local) {
				this.memories = JSON.parse(local);
			}
		}
	}

	async saveMemory(memory: Omit<KnowledgeMemory, 'id' | 'createdAt'>) {
		const newMemory: KnowledgeMemory = {
			...memory,
			id: Math.random().toString(36).substring(2, 9),
			createdAt: new Date().toISOString()
		};
		this.memories = [newMemory, ...this.memories];
		await this.persist();
		return newMemory;
	}

	async deleteMemory(id: string) {
		this.memories = this.memories.filter((m) => m.id !== id);
		await this.persist();
	}

	private async persist() {
		if (typeof chrome !== 'undefined' && chrome.storage?.local) {
			await chrome.storage.local.set({ agent_memories: $state.snapshot(this.memories) });
		} else {
			localStorage.setItem('agent_memories', JSON.stringify($state.snapshot(this.memories)));
		}
	}
}

export const knowledgeStore = new KnowledgeStore();
