import 'dotenv/config';
import { Inngest } from 'inngest';
import { runAgentCLI } from './app';
import { OpenAIVoiceAdapter } from './voice-adapters/openai-voice';
// import { ElevenLabsAdapter } from './voice-adapters/elevenlabs';
import { PicovoiceAdapter } from './voice-adapters/picovoice';

// --- Configuration ---
// Easily customize your voice assistant by changing the adapters below.

const openaiVoice = new OpenAIVoiceAdapter({
    tts: {
        model: 'tts-1',    // Use 'tts-1-hd' for higher quality
        voice: 'alloy'     // Options: alloy, echo, fable, onyx, nova, shimmer
    }
});

// const elevenlabs = new ElevenLabsAdapter({
//    voiceId: 'your-custom-voice-id' // Optional: specify a custom voice ID
// });

const config = {
    stt: openaiVoice,
    tts: openaiVoice,
    
    // --- Option 2: Mixed providers (OpenAI STT + ElevenLabs TTS for custom voices) ---
    // stt: openaiVoice,
    // tts: elevenlabs,

    // --- Core Adapters ---
    wakeWord: new PicovoiceAdapter(),
    inngest: new Inngest({ id: 'cli-assistant-app' })
};

// --- Start Application ---
// This single function call initializes and runs the entire CLI.
runAgentCLI(config); 