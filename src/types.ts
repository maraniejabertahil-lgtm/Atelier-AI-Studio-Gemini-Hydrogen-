export type StudioView = 'lab' | 'skills' | 'tools' | 'connectors';

export type GeminiModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'local-smollm2-360m'
  | 'local-qwen25-500m';

export type ThinkingLevelOption = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

export type ParamType = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';

export interface ToolParam {
  name: string;
  type: ParamType;
  description: string;
  required: boolean;
}

export interface SkillDoc {
  id: string;
  name: string;
  filename: string;
  description: string;
  tags: string[];
  content: string;
  updatedAt: string;
}

export interface CustomTool {
  id: string;
  name: string;
  description: string;
  parameters: ToolParam[];
  handlerType: 'javascript' | 'json_template' | 'connector';
  jsCode?: string;
  jsonTemplate?: string;
  connectorId?: string;
  updatedAt: string;
}

export interface PluginConfig {
  id: string;
  name: string;
  kind: 'google_search' | 'url_context' | 'studio_memory' | 'skill_router' | 'custom_bundle';
  description: string;
  bundledSkillIds?: string[];
  bundledToolIds?: string[];
  bundledConnectorIds?: string[];
  updatedAt: string;
}

export interface ConnectorHeader {
  key: string;
  value: string;
}

export interface Connector {
  id: string;
  name: string;
  toolName: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  authType: 'none' | 'bearer' | 'header';
  authHeaderName?: string;
  authToken?: string;
  headers: ConnectorHeader[];
  parameters: ToolParam[];
  bodyTemplate?: string;
  lastTestedAt?: string;
  lastStatus?: number;
  updatedAt: string;
}

export interface StudioMemoryNote {
  id: string;
  key: string;
  content: string;
  updatedAt: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  data: string; // base64 for binary/images or raw text for text files
  isText?: boolean;
  size: number;
}

export interface ToolExecutionTrace {
  id: string;
  toolName: string;
  source: 'custom_tool' | 'connector' | 'plugin_memory' | 'skill_router';
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface TokenUsageStats {
  promptTokens: number;
  candidatesTokens: number;
  thoughtsTokens?: number;
  totalTokens: number;
  latencyMs: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  thoughts?: string;
  attachments?: ChatAttachment[];
  toolTraces?: ToolExecutionTrace[];
  groundingSources?: GroundingSource[];
  tokenUsage?: TokenUsageStats;
  error?: string;
  createdAt: string;
}

export type StudioVoiceName = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

export interface PromptSession {
  id: string;
  title: string;
  model: GeminiModelId;
  thinkingLevel: ThinkingLevelOption;
  systemInstruction: string;
  activeSkillIds: string[];
  activeToolIds: string[];
  activePluginIds: string[];
  activeConnectorIds: string[];
  responseFormat: 'text' | 'json';
  responseSchemaJson: string;
  voiceName?: StudioVoiceName;
  autoSpeak?: boolean;
  messages: ChatMessage[];
  updatedAt: string;
}

export interface StudioState {
  studioVersion?: number;
  skills: SkillDoc[];
  tools: CustomTool[];
  plugins: PluginConfig[];
  connectors: Connector[];
  memories: StudioMemoryNote[];
  sessions: PromptSession[];
  activeSessionId: string;
}
