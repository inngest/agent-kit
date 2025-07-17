export * from "./elevenlabs";
export * from "./openai-voice";
export * from "./picovoice";

import { Inngest } from 'inngest';
import { AgentKitConfig } from '../config/schema.js';
import { ElevenLabsAdapter } from './elevenlabs.js';
import { OpenAIVoiceAdapter } from './openai-voice.js';
import { PicovoiceAdapter } from './picovoice.js';
import type { AgentCLI } from '../types.js';

export interface VoiceAdapters {
  inngest: Inngest;
  tts: any;
  stt: any;
  wakeWord: any;
}

export async function createVoiceAdapters(config: AgentKitConfig): Promise<VoiceAdapters> {
  // Create Inngest client
  const inngest = new Inngest({ 
    id: "voice-assistant",
    retryFunction: () => ({ attempts: 0 })
  });

  // Create TTS adapter based on configuration
  let tts;
  switch (config.tts.provider) {
    case 'elevenlabs':
      const elevenLabsOptions: AgentCLI.ElevenLabsVoiceOptions = {
        voiceId: config.tts.options.voiceId
      };
      tts = new ElevenLabsAdapter(elevenLabsOptions);
      break;
    case 'openai':
    default:
      const openAITTSOptions: AgentCLI.OpenAIVoiceOptions = {
        tts: {
          model: config.tts.options.model,
          voice: config.tts.options.voice
        }
      };
      tts = new OpenAIVoiceAdapter(openAITTSOptions);
      break;
  }

  // Create STT adapter based on configuration (reuse OpenAI for now)
  let stt;
  switch (config.stt.provider) {
    case 'openai':
    default:
      const openAISTTOptions: AgentCLI.OpenAIVoiceOptions = {
        tts: {
          model: config.stt.options.model as any,
          voice: 'alloy' // Default voice for STT
        }
      };
      stt = new OpenAIVoiceAdapter(openAISTTOptions);
      break;
  }

  // Create wake word adapter based on configuration
  let wakeWord;
  switch (config.wakeWord.provider) {
    case 'picovoice':
    default:
      wakeWord = new PicovoiceAdapter();
      break;
  }

  return {
    inngest,
    tts,
    stt,
    wakeWord,
  };
}