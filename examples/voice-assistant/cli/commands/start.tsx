import { ConfigManager } from '../config/manager.js';
import React from 'react';
import { render } from 'ink';
import App from '../ui/App.js';
import { createVoiceAdapters } from '../voice-adapters/index.js';

interface StartCommandArgs {
  model?: string;
  'tts-provider'?: string;
  'stt-provider'?: string;
  theme?: string;
  verbose?: boolean;
}

export async function startVoiceAssistant(
  configManager: ConfigManager,
  args: StartCommandArgs
): Promise<void> {
  try {
    const config = configManager.getConfig();
    // TODO: Apply command-line overrides from 'args' to 'config'

    console.log('🚀 Initializing AgentKit...');

    // Create voice adapters based on configuration
    const adapters = await createVoiceAdapters(config);

    console.log('🎤 Launching AgentKit UI...');

    // Clear console before starting the UI for a clean experience
    console.clear();

    const app = render(<App config={config} adapters={adapters} />);

    // Keep the process alive until the app is unmounted (e.g., by pressing Ctrl+C)
    await app.waitUntilExit();

    console.log('👋 AgentKit CLI stopped.');

  } catch (error) {
    console.error('❌ Failed to start voice assistant:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
} 