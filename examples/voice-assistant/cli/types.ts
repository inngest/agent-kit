import { Inngest } from 'inngest';

export namespace AgentCLI {
    // Core voice capability interfaces
    export interface TextToSpeechPlayer {
        play(text: string): Promise<void>;
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
    export interface WakeWordAndRecorder extends WakeWordDetector, VoiceRecorder, VoiceAdapter {}

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

    /**
     * Enhanced Logging Features:
     * 
     * The CLI now provides detailed logging of the agent network execution:
     * 
     * 🔍 Memory operations (searching, retrieving)
     * 🤖 Agent execution (which agent is running)
     * 🔧 Tool calls (what tools are being used)
     * 📥 Tool inputs (parameters passed to tools)
     * ✅ Tool completion status
     * 📤 Tool results (outputs from tools)
     * 📊 Agent execution summaries
     * 💬 Text responses from agents
     * 
     * This provides full visibility into:
     * - Which agents are called and when
     * - What tools each agent uses
     * - The inputs and outputs of each tool
     * - The flow of execution through the agent network
     */
} 