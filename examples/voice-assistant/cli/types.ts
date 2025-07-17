import { Inngest } from 'inngest';

export namespace AgentCLI {
    // Core voice capability interfaces
    export interface TextToSpeechPlayer {
        play(text: string, signal: AbortSignal): Promise<void>;
        stop(): Promise<void>;
    }

    export interface Transcriber {
        transcribe(audio: Buffer): Promise<string | null>;
    }

    export interface WakeWordDetector {
        waitForWakeWord(): Promise<void>;
    }

    export interface VoiceRecorder {
        record(): Promise<Buffer>;
    }

    export interface VoiceAdapter {
        initialize?(): Promise<void>;
        release?(): void;
    }

    // Combined interfaces for adapters that handle multiple capabilities
    export interface WakeWordAndRecorder extends WakeWordDetector, VoiceRecorder, VoiceAdapter {
        listenForSpeech(timeoutSeconds: number): Promise<Buffer | null>;
    }

    // Configuration interface for the CLI
    export interface Config {
        tts: TextToSpeechPlayer;
        stt: Transcriber;
        wakeWord: WakeWordAndRecorder;
        inngest: Inngest.Any;
    }

    // Provider-specific configuration options
    export interface OpenAIVoiceOptions {
        tts?: {
            model?: 'tts-1' | 'tts-1-hd';
            voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
        };
    }

    export interface ElevenLabsVoiceOptions {
        voiceId?: string;
    }

    export interface PicovoiceOptions {
        // Add any specific Picovoice configuration options here
    }

    // New structured event system
    export type EventType = 'agent_status' | 'tool_usage' | 'message' | 'debug' | 'system';

    export interface BaseEvent {
        type: EventType;
        timestamp: number;
        sessionId: string;
    }

    export interface AgentStatusEvent extends BaseEvent {
        type: 'agent_status';
        data: {
            agentName: string;
            status: 'thinking' | 'completed' | 'error';
            message?: string;
        };
    }

    export interface ToolUsageEvent extends BaseEvent {
        type: 'tool_usage';
        data: {
            agentName: string;
            toolName: string;
            status: 'using' | 'completed' | 'error';
            error?: string;
        };
    }

    export interface MessageEvent extends BaseEvent {
        type: 'message';
        data: {
            content: string;
            role: 'user' | 'assistant' | 'system';
        };
    }

    export interface DebugEvent extends BaseEvent {
        type: 'debug';
        data: {
            level: 'info' | 'warn' | 'error';
            message: string;
            details?: any;
        };
    }

    export interface SystemEvent extends BaseEvent {
        type: 'system';
        data: {
            event: 'workflow_start' | 'workflow_complete' | 'memory_operation' | 'transcription';
            message: string;
        };
    }

    export type CLIEvent = AgentStatusEvent | ToolUsageEvent | MessageEvent | DebugEvent | SystemEvent;

    // UI Display modes
    export type DisplayMode = 'normal' | 'debug';

    export interface UIState {
        mode: DisplayMode;
        currentAgent?: string;
        activeTools: string[];
        messages: MessageEvent[];
        systemEvents: SystemEvent[];
        debugEvents: DebugEvent[];
    }

    /**
     * Enhanced Logging Features:
     * 
     * The CLI now provides structured logging with different event types:
     * 
     * 🤖 Agent Status Events - Track which agent is thinking/working
     * 🔧 Tool Usage Events - Show tool usage in a clean format
     * 💬 Message Events - User and assistant messages
     * 🐛 Debug Events - Detailed debugging information (debug mode only)
     * ⚙️ System Events - Workflow and system-level events
     * 
     * Normal Mode Display:
     * - Shows current agent thinking status
     * - Displays "Using [tool name]" and "Used [tool name]" messages
     * - Clean conversation flow
     * 
     * Debug Mode Display:
     * - All normal mode content
     * - Detailed tool inputs/outputs
     * - Internal agent processing details
     * - Memory operation details
     */
} 