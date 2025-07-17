import { z } from 'zod';

// Model configuration schema
const ModelConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic']).default('openai'),
  modelName: z.string().default('gpt-4o'),
});

// TTS (Text-to-Speech) configuration schema
const TTSConfigSchema = z.object({
  provider: z.enum(['openai', 'elevenlabs']).default('openai'),
  options: z.object({
    // OpenAI TTS options
    model: z.enum(['tts-1', 'tts-1-hd']).optional(),
    voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional(),
    // ElevenLabs options
    voiceId: z.string().optional(),
  }).default({}),
});

// STT (Speech-to-Text) configuration schema
const STTConfigSchema = z.object({
  provider: z.enum(['openai']).default('openai'),
  options: z.object({
    model: z.enum(['whisper-1']).optional(),
  }).default({}),
});

// Wake word configuration schema
const WakeWordConfigSchema = z.object({
  provider: z.enum(['picovoice']).default('picovoice'),
  options: z.object({
    keyword: z.enum(['jarvis']).default('jarvis'),
    sensitivity: z.number().min(0).max(1).default(0.65),
  }).default({}),
});

// Tool configuration schema
const ToolConfigSchema = z.object({
  enableMaps: z.boolean().default(true).describe('Enable Google Maps tools'),
  enableMacOS: z.boolean().default(true).describe('Enable macOS integration tools'),
  enableNotion: z.boolean().default(false).describe('Enable Notion integration'),
  enableWebSearch: z.boolean().default(true).describe('Enable web search via Exa'),
});

// File system configuration schema
const FileSystemConfigSchema = z.object({
  root: z.string().default('~/AgentWorkspace'),
  respectGitIgnore: z.boolean().default(true),
});

// UI configuration schema
const UIConfigSchema = z.object({
  theme: z.enum(['default', 'dark', 'light']).default('default'),
  hideTips: z.boolean().default(false),
  autoAcceptSafeTools: z.boolean().default(true),
});

// History configuration schema
const HistoryConfigSchema = z.object({
  mode: z.enum(['server-authoritative', 'client-authoritative', 'hybrid'])
    .default('hybrid')
    .describe('History management mode: server (fetch from DB), client (send with request), or hybrid (smart switching)'),
  maxMessagesToSend: z.number()
    .default(50)
    .describe('Maximum number of messages to send in client-authoritative mode'),
});

// Main AgentKit CLI configuration schema
export const AgentKitConfigSchema = z.object({
  // Model and agent configuration
  defaultModel: ModelConfigSchema.default({}),
  
  // Voice and audio configuration
  tts: TTSConfigSchema.default({}),
  stt: STTConfigSchema.default({}),
  wakeWord: WakeWordConfigSchema.default({}),
  
  // Tool configuration
  tools: ToolConfigSchema.default({}),
  
  // History and persistence settings
  history: HistoryConfigSchema.default({}),
  
  // File system configuration
  fileSystem: FileSystemConfigSchema.default({}),
  
  // UI/CLI configuration
  ui: UIConfigSchema.default({}),
});

// Export the inferred TypeScript type
export type AgentKitConfig = z.infer<typeof AgentKitConfigSchema>;

// Helper function to validate and parse configuration
export function validateConfig(rawConfig: unknown): AgentKitConfig {
  try {
    return AgentKitConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err => 
        `  - ${err.path.join('.')}: ${err.message}`
      ).join('\n');
      
      throw new Error(
        `Configuration validation failed:\n${formattedErrors}\n\n` +
        `Please check your settings.json file and fix the above errors.`
      );
    }
    throw error;
  }
} 