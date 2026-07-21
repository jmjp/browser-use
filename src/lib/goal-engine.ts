import { BROWSER_TOOLS } from '$lib/tools/browser';

// ===== WORKFLOW ENGINE =====

export type WorkflowStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowConfig {
  portals: string[];
  keywords: string[];
  maxApps: number;
  minScore: number;
  dryRun: boolean;
  apiKey: string;
  model: string;
  baseUrl: string;
  profile: CandidateProfile;
}

export interface CandidateProfile {
  skills: string[];
  experience: string;
  targetRoles: string[];
  workModes: string[];
}

export interface WorkflowState {
  status: WorkflowStatus;
  step: string;
  portal: string;
  page: number;
  found: number;
  scored: number;
  applied: number;
  failed: number;
  msg: string;
  log: string[];
}

type StepFn = () => Promise<'next' | 'retry' | 'done' | 'fail'>;

/**
 * AutoApply Workflow — state machine, não agente.
 * 
 * Cada passo sabe EXATAMENTE o que fazer. LLM só processa texto.
 * 
 * FLUXO:
 *   init → search → parse → score → apply → next_page → search → ... → done
 */
export class AutoApplyWorkflow {
  private cfg: WorkflowConfig;
  state: WorkflowState;
  private cancelled = false;
  private appliedUrls = new Set<string>();

  constructor(cfg: WorkflowConfig) {
    this.cfg = cfg;
    this.state = {
      status: 'idle',
      step: '',
      portal: cfg.portals[0] || '',
      page: 1,
      found: 0, scored: 0, applied: 0, failed: 0,
      msg: '',
      log: [],
    };
  }

  async start(onChange?: (s: WorkflowState) => void) {
    this.cancelled = false;
    this.state.status = 'running';
    this.log(`🚀 Auto-Apply iniciado`);
    this.log(`🔍 ${this.cfg.portals.join(', ')} | "${this.cfg.keywords.join('", "')}"`);
    this.log(`🎯 ${this.cfg.maxApps} vagas | score >= ${this.cfg.minScore}`);
    this.log(this.cfg.dryRun ? '🔵 DRY RUN' : '🔴 MODO REAL');
    onChange?.(this.state);

    try {
      // Workflow principal: para cada portal, navega páginas
      for (const portal of this.cfg.portals) {
        if (this.shouldStop()) break;
        this.state.portal = portal;
        this.state.page = 1;

        let emptyPages = 0;
        while (emptyPages < 3 && !this.shouldStop()) {
          const jobs = await this.stepSearch();
          if (this.shouldStop()) break;
          
          if (jobs.length === 0) {
            emptyPages++;
            this.state.page++;
            continue;
          }
          emptyPages = 0;
          this.state.found += jobs.length;

          for (const job of jobs) {
            if (this.shouldStop() || this.atMax()) break;
            if (this.appliedUrls.has(job.url)) continue;

            const score = await this.stepScore(job);
            if (this.shouldStop()) break;
            this.state.scored++;

            if (score >= this.cfg.minScore) {
              const ok = await this.stepApply(job, score);
              this.appliedUrls.add(job.url);
              if (ok) this.state.applied++;
              else this.state.failed++;
            }
            onChange?.(this.state);
          }

          this.state.page++;
          await sleep(2000);
        }
      }

      this.state.status = this.cancelled ? 'cancelled' : 'completed';
      this.state.msg = this.state.status === 'completed'
        ? `✅ ${this.state.applied} candidaturas realizadas`
        : `🛑 Parado pelo usuário`;
      this.log(this.state.msg);
    } catch (e: any) {
      this.state.status = 'failed';
      this.state.msg = `❌ ${e.message}`;
      this.log(this.state.msg);
    }
    onChange?.(this.state);
  }

  cancel() {
    this.cancelled = true;
  }

  // ===== STEP 1: SEARCH =====

  private async stepSearch(): Promise<Job[]> {
    const { portal, page } = this.state;
    const kw = this.cfg.keywords[0];
    const url = SEARCH_URLS[portal]?.(kw, page);
    if (!url) return [];
    
    this.log(`📡 ${portal} pág ${page}`);
    this.state.step = `Buscando ${portal} pág ${page}`;

    const nav = findTool('navigate');
    if (!nav) return [];
    await nav.execute({ url });
    await sleep(4000);

    const content = findTool('get_content');
    if (!content) return [];
    const res = await content.execute({}) as any;
    const text = (res.content || '') as string;

    return this.extractJobs(text, portal);
  }

  // ===== STEP 2: SCORE =====

  private async stepScore(job: Job): Promise<number> {
    this.state.step = `Analisando ${job.title}`;
    const prompt = `Analise se a vaga combina com o perfil do candidato.
Responda APENAS um número inteiro de 1 a 10.
10 = vaga PERFEITA. 1 = totalmente incompatível.
Considere: skills, senioridade, modelo de trabalho.

VAGA: ${job.title} | ${job.company} | ${job.location}
PERFIL: ${this.cfg.profile.skills.join(', ')}
EXPERIÊNCIA: ${this.cfg.profile.experience}
ALVO: ${this.cfg.profile.targetRoles.join(', ')}`;

    const raw = await this.llm(prompt);
    const score = parseInt(raw.trim(), 10);
    const s = isNaN(score) ? 5 : Math.max(1, Math.min(10, score));
    this.log(`  🎯 ${job.title} → ${s}/10`);
    return s;
  }

  // ===== STEP 3: APPLY =====

  private async stepApply(job: Job, score: number): Promise<boolean> {
    this.state.step = `Aplicando ${job.title}`;
    this.log(`  📝 Aplicando: ${job.title} (${score}/10)`);
    if (this.cfg.dryRun) return true;

    try {
      // Navega
      const nav = findTool('navigate');
      if (!nav) return false;
      await nav.execute({ url: job.url });
      await sleep(3000);

      // Clica em candidatar (tentativa determinística)
      const click = findTool('click');
      if (!click) return false;

      for (const sel of APPLY_SELECTORS) {
        try {
          await click.execute({ selector: sel });
          await sleep(1500);
        } catch { continue; }
      }

      // Preenche formulário via LLM
      const content = findTool('get_content');
      if (content) {
        const res = await content.execute({}) as any;
        const formText = (res.content || '') as string;

        const plan = await this.llmFill(`Preencha o formulário de candidatura abaixo.
Responda APENAS JSON array: [{"selector":"css","value":"texto"}]
Apenas campos que precisam de preenchimento.
Use os dados do perfil: ${this.cfg.profile.skills.join(', ')}
Experiência: ${this.cfg.profile.experience}

FORMULÁRIO:
${formText.slice(0, 4000)}`);

        const fields = tryParseJSON(plan) as Array<{selector: string; value: string}> | null;
        if (fields) {
          const type = findTool('type_text');
          const select = findTool('select_option');
          for (const f of fields) {
            if (f.selector && f.value) {
              try {
                await type?.execute({ selector: f.selector, text: f.value });
                await select?.execute({ selector: f.selector, value: f.value });
              } catch {}
              await sleep(300);
            }
          }
        }
      }

      this.log(`  ✅ Aplicou: ${job.title}`);
      return true;
    } catch (e: any) {
      this.log(`  ❌ Falha: ${e.message}`);
      return false;
    }
  }

  // ===== LLM HELPERS =====

  private async llm(prompt: string): Promise<string> {
    try {
      const res = await fetch(this.cfg.baseUrl || 'https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: this.cfg.model || 'deepseek-v4-flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 500,
        }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    } catch {
      return '';
    }
  }

  private async llmFill(prompt: string): Promise<string> {
    try {
      const res = await fetch(this.cfg.baseUrl || 'https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: this.cfg.model || 'deepseek-v4-flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    } catch {
      return '[]';
    }
  }

  // ===== EXTRACT JOBS FROM TEXT =====

  private async extractJobs(text: string, portal: string): Promise<Job[]> {
    const raw = await this.llm(`Extraia as vagas de emprego do texto abaixo.
Responda APENAS JSON array. Se não encontrar, responda [].
Formato: [{"title":"...","company":"...","url":"...","location":"..."}]

TEXTO:
${text.slice(0, 6000)}`);

    const arr = tryParseJSON(raw);
    return Array.isArray(arr)
      ? arr.map((j: any) => ({ ...j, portal }))
      : [];
  }

  // ===== HELPERS =====

  private log(msg: string) {
    const t = new Date().toLocaleTimeString();
    this.state.log.push(`[${t}] ${msg}`);
    this.state.msg = msg;
  }

  private shouldStop() {
    return this.cancelled || this.state.status === 'cancelled';
  }

  private atMax() {
    return this.state.applied >= this.cfg.maxApps;
  }
}

// ===== TYPES =====

interface Job {
  title: string;
  company: string;
  url: string;
  location: string;
  portal: string;
}

// ===== CONSTANTS =====

const SEARCH_URLS: Record<string, (kw: string, page: number) => string> = {
  gupy: (kw, p) => `https://portal.gupy.io/job-search?term=${encodeURIComponent(kw)}&page=${p}`,
  linkedin: (kw, p) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(kw)}&start=${(p-1)*25}`,
  indeed: (kw, p) => `https://br.indeed.com/jobs?q=${encodeURIComponent(kw)}&start=${(p-1)*10}`,
  programathor: (kw, p) => `https://programathor.com.br/jobs?search=${encodeURIComponent(kw)}&page=${p}`,
  geekhunter: (kw, p) => `https://www.geekhunter.com.br/vagas?q=${encodeURIComponent(kw)}&pagina=${p}`,
  catho: (kw, p) => `https://www.catho.com.br/vagas/${encodeURIComponent(kw)}/?page=${p}`,
  infojobs: (kw, p) => `https://www.infojobs.com.br/vagas/${encodeURIComponent(kw)}?page=${p}`,
};

const APPLY_SELECTORS = [
  'button:has(span:contains("Candidatar"))',
  'button:has(span:contains("Apply"))',
  'button:has(span:contains("Inscreva"))',
  '[data-testid="apply-button"]',
  '[data-testid="job-apply"]',
  'button:contains("Candidatar")',
  'button:contains("Apply")',
  'button:contains("Inscreva")',
  '.apply-button',
  'a:contains("Candidatar")',
];

// ===== UTILITIES =====

function findTool(name: string) {
  return BROWSER_TOOLS.find(t => t.name === name) as any;
}

function tryParseJSON(s: string): any {
  try {
    const m = s.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
