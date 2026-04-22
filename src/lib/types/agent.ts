export type StepType = 'thought' | 'tool_use' | 'tool_result' | 'text';

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string; // Base64 or URL
  previewUrl?: string;
}

export interface AgentStep {
  id: string;
  type: StepType;
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AgentThought extends AgentStep {
  type: 'thought';
}

export interface AgentToolUse extends AgentStep {
  type: 'tool_use';
  tool_name: string;
  input: string;
  result?: AgentToolResult;
}

export interface AgentToolResult extends AgentStep {
  type: 'tool_result';
  tool_use_id: string;
  output: any;
  is_error: boolean;
}

export interface AgentText extends AgentStep {
  type: 'text';
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  steps: AgentStep[];
  timestamp: Date;
  attachments?: Attachment[];
  is_plan_mode?: boolean;
  model?: string;
  persona?: string;
  token_usage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: AgentMessage[];
  last_updated: Date;
  created_at: Date;
}

