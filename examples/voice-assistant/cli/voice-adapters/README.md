# Voice Adapters

This directory contains voice adapters for different providers used in the configurable voice assistant CLI.

## How it Works

The CLI is started with a single `runAgentCLI(config)` function call in `cli/index.ts`. This function handles all initialization, the main run loop, and process cleanup automatically.

To configure the CLI, you simply instantiate the adapters you want and pass them into a `config` object.

### Configuration Example

```typescript
// in cli/index.ts

// 1. Instantiate your desired adapters
const openaiVoice = new OpenAIVoiceAdapter({
  tts: { model: "tts-1-hd", voice: "nova" },
});
const elevenlabs = new ElevenLabsAdapter();

// 2. Assemble the config object
const config = {
  stt: openaiVoice,
  tts: elevenlabs, // Easily swap to openaiVoice if desired
  wakeWord: new PicovoiceAdapter(),
  inngest: new Inngest({ id: "cli-assistant-app" }),
};

// 3. Run the CLI
runAgentCLI(config);
```

### Customizing Your Setup

To customize, simply modify the config object in `cli/index.ts`:

1.  Change TTS model/voice options in the `OpenAIVoiceAdapter` constructor.
2.  Switch between providers by assigning a different adapter instance to `stt` or `tts`.
3.  Add a custom voice ID for ElevenLabs in its constructor.

## Unified Provider Adapters

### OpenAI Voice Adapter (`OpenAIVoiceAdapter`)

Combines both speech-to-text (Whisper) and text-to-speech capabilities.

**Capabilities:**

- **STT**: Whisper model
- **TTS**: `tts-1` (fast) and `tts-1-hd` (quality)
- **Voices**: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

### ElevenLabs Adapter (`ElevenLabsAdapter`)

High-quality text-to-speech provider.

### Picovoice Adapter (`PicovoiceAdapter`)

Handles wake word detection and voice recording.

## Environment Variables

- `OPENAI_API_KEY`: Required for OpenAI capabilities
- `ELEVENLABS_API_KEY`: Required for ElevenLabs TTS
- `PICOVOICE_ACCESS_KEY`: Required for wake word detection

## Requirements

- `ffmpeg` must be installed for audio playback (`brew install ffmpeg` on macOS)
- Appropriate API keys for the services you want to use

## Enhanced Logging

The voice assistant now provides detailed logging of the entire agent network execution process. When you run the CLI, you'll see:

### Agent Execution Flow

- 🔍 **Memory Operations**: When the system searches for and retrieves relevant memories
- 🤖 **Agent Calls**: Which specific agent is being executed (memory-retriever, personal-assistant, memory-manager)
- 📊 **Execution Summaries**: Overview of what each agent accomplished

### Tool Usage Details

- 🔧 **Tool Calls**: Exactly which tools are being invoked (maps, calendar, email, etc.)
- 📥 **Tool Inputs**: The parameters and data being passed to each tool
- ✅ **Tool Completion**: When tools finish executing
- 📤 **Tool Results**: The outputs and responses from each tool

### Example Log Output

```
🔍 Starting memory retrieval...
📋 Calling memory-retriever-agent
🤖 Calling personal-assistant-agent
💭 Agent is analyzing your request and determining which tools to use...
🔧 Called tool: get_todays_events
📥 Input: {}
✅ Tool 'get_todays_events' completed
📤 Result: Found 3 events for today...
🔧 Called tool: provide_final_answer
✅ Personal assistant completed
💾 Calling memory-manager-agent
✅ All agents completed successfully
```

This enhanced logging gives you complete visibility into how your voice assistant processes requests, which tools it uses, and what information it gathers to provide responses.
