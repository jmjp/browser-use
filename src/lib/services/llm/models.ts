export async function fetchAvailableModels(
	provider: string,
	apiKey: string,
	baseUrl?: string
): Promise<string[]> {
	if (!apiKey && provider !== 'custom') {
		throw new Error('Chave de API é necessária para buscar modelos.');
	}

	let url = '';
	let headers: Record<string, string> = {};

	if (provider === 'gemini') {
		url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
		const res = await fetch(url);
		if (!res.ok) {
			const errText = await res.text();
			throw new Error(`Erro na API Gemini (${res.status}): ${errText}`);
		}
		const data = await res.json();
		if (Array.isArray(data.models)) {
			// Filtra modelos que suportam geração de conteúdo e limpa o prefixo 'models/'
			return data.models
				.filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
				.map((m: any) => m.name.replace(/^models\//, ''));
		}
		return [];
	}

	if (provider === 'openai' || provider === 'deepseek' || provider === 'custom') {
		let rootUrl = baseUrl || 'https://api.openai.com/v1';
		if (provider === 'deepseek' && !baseUrl) {
			rootUrl = 'https://api.deepseek.com/v1';
		}
		// Remove barra final se houver
		rootUrl = rootUrl.replace(/\/+$/, '');

		// Garante que o endpoint /models seja chamado
		url = rootUrl.endsWith('/models') ? rootUrl : `${rootUrl}/models`;
		headers['Authorization'] = `Bearer ${apiKey}`;

		const res = await fetch(url, { headers });
		if (!res.ok) {
			const errText = await res.text();
			throw new Error(`Erro na API (${res.status}): ${errText}`);
		}
		const data = await res.json();
		if (Array.isArray(data.data)) {
			return data.data.map((m: any) => m.id).sort();
		}
		return [];
	}

	if (provider === 'anthropic') {
		url = 'https://api.anthropic.com/v1/models';
		headers['x-api-key'] = apiKey;
		headers['anthropic-version'] = '2023-06-01';
		headers['dangerously-allow-browser'] = 'true';

		const res = await fetch(url, { headers });
		if (!res.ok) {
			const errText = await res.text();
			throw new Error(`Erro na API Anthropic (${res.status}): ${errText}`);
		}
		const data = await res.json();
		if (Array.isArray(data.data)) {
			return data.data.map((m: any) => m.id);
		}
		return [];
	}

	return [];
}
