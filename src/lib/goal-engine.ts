import type { LLMAdapter, LLMConfig } from '$lib/services/llm/interface';
import { getLLMAdapter } from '$lib/services/llm';
import { BROWSER_TOOLS } from '$lib/tools/browser';

// ========== GOAL TYPES ==========

export type GoalStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface AutoApplyGoal {
  id: string;
  type: GoalType;
  objective: string;
  status: GoalStatus;
  progress: GoalProgress;
  config: GoalConfig;
  created_at: Date;
  updated_at: Date;
}

export type GoalType = 
  | 'search_and_apply'
  | 'search_jobs'
  | 'apply_to_saved'
  | 'check_responses'
  | 'custom';

export interface GoalConfig {
  portals: string[];        // gupy, linkedin, indeed, etc.
  keywords: string[];       // "golang", "backend", etc.
  locations: string[];
  work_models: string[];    // remote, hybrid, onsite
  max_applications: number;
  min_score: number;        // minimum match score to apply
  dry_run: boolean;
  profile: CandidateProfile;
}

export interface CandidateProfile {
  name: string;
  skills: string[];
  experience: string;
  target_roles: string[];
  preferred_locations: string[];
  work_models: string[];
  resume_path?: string;
}

export interface GoalProgress {
  jobs_found: number;
  jobs_scored: number;
  jobs_applied: number;
  jobs_failed: number;
  current_action: string;
  last_result?: string;
}

export interface ScoredJob {
  title: string;
  company: string;
  url: string;
  portal: string;
  location: string;
  score: number;
  reason: string;
  applied: boolean;
}

// ========== GOAL ENGINE ==========

export class GoalEngine {
  private llm: LLMAdapter;
  private goals: Map<string, AutoApplyGoal> = new Map();
  private running = false;

  constructor(llmConfig: LLMConfig) {
    this.llm = getLLMAdapter(llmConfig);
  }

  async createGoal(type: GoalType, objective: string, config: GoalConfig): Promise<AutoApplyGoal> {
    const goal: AutoApplyGoal = {
      id: crypto.randomUUID(),
      type,
      objective,
      status: 'running',
      progress: {
        jobs_found: 0,
        jobs_scored: 0,
        jobs_applied: 0,
        jobs_failed: 0,
        current_action: 'Iniciando...',
      },
      config,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.goals.set(goal.id, goal);
    return goal;
  }

  async runGoal(goalId: string, onProgress?: (goal: AutoApplyGoal) => void): Promise<void> {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error(`Goal ${goalId} not found`);
    if (this.running) throw new Error('Another goal is already running');
    
    this.running = true;
    try {
      await this.executeGoal(goal, onProgress);
    } finally {
      this.running = false;
    }
  }

  private async executeGoal(goal: AutoApplyGoal, onProgress?: (g: AutoApplyGoal) => void): Promise<void> {
    switch (goal.type) {
      case 'search_and_apply':
        await this.searchAndApplyLoop(goal, onProgress);
        break;
      case 'search_jobs':
        await this.searchJobsLoop(goal, onProgress);
        break;
      case 'custom':
        await this.customLoop(goal, onProgress);
        break;
      default:
        goal.status = 'failed';
        goal.progress.current_action = `Tipo de goal não implementado: ${goal.type}`;
    }
  }

  /**
   * MAIN LOOP: Search → Score → Apply → Repeat until max_applications reached
   * 
   * This is the core persistent loop. It keeps going until:
   * - Max applications reached
   * - No more jobs found
   * - User cancels
   */
  private async searchAndApplyLoop(goal: AutoApplyGoal, onProgress?: (g: AutoApplyGoal) => void): Promise<void> {
    const appliedJobs = new Set<string>(); // avoid duplicates
    let searchPage = 1;
    let consecutiveEmptyPages = 0;

    while (goal.status === 'running') {
      // Check if we hit the target
      if (goal.progress.jobs_applied >= goal.config.max_applications) {
        goal.status = 'completed';
        goal.progress.current_action = `✅ ${goal.progress.jobs_applied} candidaturas realizadas`;
        this.updateGoal(goal, onProgress);
        return;
      }

      // For each portal, search for jobs
      for (const portal of goal.config.portals) {
        if (goal.status !== 'running') break;

        goal.progress.current_action = `Buscando vagas em ${portal} (página ${searchPage})...`;
        this.updateGoal(goal, onProgress);

        // 1. Search: use LLM + browser to find jobs on the portal
        const jobs = await this.searchPortal(portal, goal.config.keywords, searchPage);
        
        if (jobs.length === 0) {
          consecutiveEmptyPages++;
          if (consecutiveEmptyPages >= 3) {
            goal.progress.current_action = 'Sem mais vagas encontradas';
            goal.status = 'completed';
            this.updateGoal(goal, onProgress);
            return;
          }
          continue;
        }
        consecutiveEmptyPages = 0;

        // 2. Score each job using LLM
        for (const job of jobs) {
          if (goal.progress.jobs_applied >= goal.config.max_applications) break;
          if (appliedJobs.has(job.url)) continue;

          goal.progress.current_action = `Analisando: ${job.title} - ${job.company}`;
          this.updateGoal(goal, onProgress);

          const score = await this.scoreJob(job, goal.config.profile);
          job.score = score.score;
          job.reason = score.reason;
          goal.progress.jobs_scored++;

          // 3. Apply if score is high enough
          if (score.score >= goal.config.min_score) {
            const result = await this.applyToJob(job, goal.config);
            job.applied = result.success;
            appliedJobs.add(job.url);

            if (result.success) {
              goal.progress.jobs_applied++;
              goal.progress.current_action = `✅ Aplicou: ${job.title} (score ${score.score})`;
            } else {
              goal.progress.jobs_failed++;
              goal.progress.current_action = `❌ Falha: ${job.title} - ${result.error}`;
            }
            this.updateGoal(goal, onProgress);
          }
        }

        goal.progress.jobs_found += jobs.length;
      }

      searchPage++;
      
      // Brief pause between pages to avoid rate limiting
      await this.sleep(2000);
    }
  }

  private async searchJobsLoop(goal: AutoApplyGoal, onProgress?: (g: AutoApplyGoal) => void): Promise<void> {
    // Simplified: just search and score, don't apply
    goal.config.max_applications = 0;
    await this.searchAndApplyLoop(goal, onProgress);
  }

  private async customLoop(goal: AutoApplyGoal, onProgress?: (g: AutoApplyGoal) => void): Promise<void> {
    // Custom goal: the LLM decides the steps
    const llm = this.llm;
    let iteration = 0;
    const maxIterations = 20;

    while (goal.status === 'running' && iteration < maxIterations) {
      iteration++;
      
      goal.progress.current_action = `Iteração ${iteration}: executando plano...`;
      this.updateGoal(goal, onProgress);

      // Ask LLM what to do next
      const plan = await llm.generateResponse([
        { role: 'system', content: `Você é um agente autônomo. Seu objetivo é: ${goal.objective}
          Com base nas ferramentas disponíveis (navegar, clicar, digitar, extrair texto, screenshot, executar JS),
          qual o PRÓXIMO passo específico? Responda com UM action JSON:
          {"action": "navigate"|"click"|"type"|"extract"|"wait"|"done", "params": {...}, "reason": "por que este passo"}
          Se o objetivo foi alcançado, responda {"action": "done", "reason": "objetivo concluído"}` },
        { role: 'user', content: `Progresso atual: ${goal.progress.current_action}. Iteração ${iteration}/${maxIterations}.` }
      ]);

      // Parse and execute the action
      const action = this.parseAction(plan);
      if (!action) {
        goal.progress.current_action = `Erro ao interpretar resposta da IA: ${plan}`;
        continue;
      }

      if (action.action === 'done') {
        goal.status = 'completed';
        goal.progress.current_action = action.reason || 'Objetivo concluído';
        this.updateGoal(goal, onProgress);
        return;
      }

      // Execute via browser tools
      const result = await this.executeAction(action);
      goal.progress.last_result = JSON.stringify(result).slice(0, 200);
      this.updateGoal(goal, onProgress);
    }

    if (iteration >= maxIterations) {
      goal.status = 'failed';
      goal.progress.current_action = `Limite de ${maxIterations} iterações atingido`;
      this.updateGoal(goal, onProgress);
    }
  }

  // ========== PORTAL SEARCH ==========

  private async searchPortal(portal: string, keywords: string[], page: number): Promise<ScoredJob[]> {
    // Use LLM to build search URL based on portal
    const searchPages: Record<string, (kw: string, p: number) => string> = {
      gupy: (kw, p) => `https://portal.gupy.io/job-search?term=${encodeURIComponent(kw)}&page=${p}`,
      linkedin: (kw, p) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(kw)}&start=${(p-1)*25}`,
      indeed: (kw, p) => `https://br.indeed.com/jobs?q=${encodeURIComponent(kw)}&start=${(p-1)*10}`,
      programathor: (kw, p) => `https://programathor.com.br/jobs?search=${encodeURIComponent(kw)}&page=${p}`,
      geekhunter: (kw, p) => `https://www.geekhunter.com.br/vagas?q=${encodeURIComponent(kw)}&pagina=${p}`,
    };

    const searchFn = searchPages[portal];
    if (!searchFn) return [];

    // Navigate to search page and extract jobs
    const url = searchFn(keywords[0] || '', page);
    
    const navigateTool = BROWSER_TOOLS.find(t => t.name === 'navigate');
    if (!navigateTool) return [];

    await navigateTool.execute({ url });
    await this.sleep(3000);

    // Get page content
    const contentTool = BROWSER_TOOLS.find(t => t.name === 'get_content');
    if (!contentTool) return [];

    const content = await contentTool.execute({}) as any;
    const pageText = content.content || '';

    // Use LLM to extract jobs from page text
    const llm = this.llm;
    const response = await llm.generateResponse([
      { role: 'system', content: `Extraia as vagas de emprego do texto abaixo. 
        Responda APENAS com um JSON array: [{"title": "...", "company": "...", "url": "...", "location": "..."}]
        Se não encontrar vagas, responda []` },
      { role: 'user', content: pageText.slice(0, 8000) }
    ]);

    try {
      const jobs = JSON.parse(response);
      return Array.isArray(jobs) ? jobs : [];
    } catch {
      return [];
    }
  }

  // ========== JOB SCORING ==========

  private async scoreJob(job: ScoredJob, profile: CandidateProfile): Promise<{ score: number; reason: string }> {
    const llm = this.llm;
    const response = await llm.generateResponse([
      { role: 'system', content: `Você é um analista de vagas. Analise se a vaga combina com o perfil do candidato.
        Responda APENAS com JSON: {"score": 1-10, "reason": "explicação concisa"}
        Score 10 = perfeito. Score 1 = incompatível.
        Considere: skills, senioridade, localização, modelo de trabalho.` },
      { role: 'user', content: `VAGA: ${job.title} - ${job.company} (${job.location})
        PERFIL: ${profile.skills.join(', ')} | ${profile.experience}
        ALVO: ${profile.target_roles.join(', ')} | ${profile.work_models.join(', ')}` }
    ]);

    try {
      const result = JSON.parse(response);
      return { score: Math.max(1, Math.min(10, result.score || 5)), reason: result.reason || '' };
    } catch {
      return { score: 5, reason: 'parse error' };
    }
  }

  // ========== JOB APPLICATION ==========

  private async applyToJob(job: ScoredJob, config: GoalConfig): Promise<{ success: boolean; error?: string }> {
    if (config.dry_run) {
      return { success: true };
    }

    // 1. Navigate to the job page
    const navigateTool = BROWSER_TOOLS.find(t => t.name === 'navigate');
    if (!navigateTool) return { success: false, error: 'navigate tool not found' };
    
    await navigateTool.execute({ url: job.url });
    await this.sleep(3000);

    // 2. Look for apply button using LLM
    const contentTool = BROWSER_TOOLS.find(t => t.name === 'get_content');
    if (!contentTool) return { success: false, error: 'content tool not found' };

    const content = await contentTool.execute({}) as any;
    const pageText = content.content || '';

    // 3. Ask LLM what to click/do to apply
    const llm = this.llm;
    const plan = await llm.generateResponse([
      { role: 'system', content: `Você está na página de uma vaga de emprego. 
        O objetivo é encontrar e clicar no botão de candidatura.
        Analise o texto da página e responda:
        Qual seletor CSS usar para clicar em "Candidatar-se" ou "Apply"?
        Se não encontrar, responda: {"found": false, "reason": "..."}
        Se encontrar: {"found": true, "selector": "...", "method": "click"}` },
      { role: 'user', content: pageText.slice(0, 6000) }
    ]);

    try {
      const action = JSON.parse(plan);
      if (!action.found) {
        return { success: false, error: action.reason || 'apply button not found' };
      }

      // Click the apply button
      const clickTool = BROWSER_TOOLS.find(t => t.name === 'click');
      if (clickTool) {
        await clickTool.execute({ selector: action.selector });
        await this.sleep(2000);
      }

      // 4. Fill the application form
      // Get form fields
      const formContent = await contentTool.execute({}) as any;
      
      // Ask LLM to fill the form
      const formPlan = await llm.generateResponse([
        { role: 'system', content: `Você está preenchendo um formulário de candidatura.
          Analise o texto da página e gere as respostas.
          Responda com JSON array: [{"selector": "css", "value": "resposta"}]
          Apenas campos que precisam ser preenchidos.
          Use informações do perfil do candidato.` },
        { role: 'user', content: `FORMULÁRIO: ${(formContent.content || '').slice(0, 5000)}
          PERFIL: ${config.profile.skills.join(', ')} | ${config.profile.experience}` }
      ]);

      try {
        const fields = JSON.parse(formPlan);
        const typeTool = BROWSER_TOOLS.find(t => t.name === 'type_text');
        const selectTool = BROWSER_TOOLS.find(t => t.name === 'select_option');

        for (const field of fields) {
          if (field.selector && field.value) {
            if (selectTool) {
              await selectTool.execute({ selector: field.selector, value: field.value }).catch(() => {});
            }
            if (typeTool) {
              await typeTool.execute({ selector: field.selector, text: field.value }).catch(() => {});
            }
            await this.sleep(500);
          }
        }
      } catch {}

      // 5. Submit
      // Try common submit selectors
      const submitSelectors = [
        'button[type="submit"]', 
        'input[type="submit"]',
        '[data-testid="submit"]',
        '.submit-button',
        'button:contains("Enviar")',
        'button:contains("Candidatar")',
      ];

      for (const sel of submitSelectors) {
        try {
          if (clickTool) {
            await clickTool.execute({ selector: sel });
            await this.sleep(2000);
          }
        } catch {}
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // ========== ACTION EXECUTOR (for custom goals) ==========

  private async executeAction(action: ActionPlan): Promise<any> {
    const tool = BROWSER_TOOLS.find(t => t.name === action.action);
    if (!tool) return { error: `Unknown tool: ${action.action}` };
    try {
      return await tool.execute(action.params || {});
    } catch (e: any) {
      return { error: e.message };
    }
  }

  private parseAction(text: string): ActionPlan | null {
    try {
      // Try to find JSON in the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {}
    return null;
  }

  private updateGoal(goal: AutoApplyGoal, onProgress?: (g: AutoApplyGoal) => void): void {
    goal.updated_at = new Date();
    if (onProgress) onProgress(goal);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}

interface ActionPlan {
  action: string;
  params?: Record<string, any>;
  reason?: string;
}
