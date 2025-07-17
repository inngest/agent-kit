#!/usr/bin/env node
import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ConfigManager } from './cli/config/manager.js';
import { startVoiceAssistant } from './cli/commands/start.tsx';
import { configCommand } from './cli/commands/config.js';
import { statusCommand } from './cli/commands/status.js';

async function main() {
  const configManager = new ConfigManager();

  try {
    // Load configuration
    await configManager.loadConfig();
    
    // Set up CLI with yargs
    const cli = yargs(hideBin(process.argv))
      .scriptName('agentkit')
      .usage('$0 <command> [options]')
      .help()
      .alias('help', 'h')
      .version()
      .alias('version', 'v')
      .demandCommand(1, 'You must specify a command')
      .strict()
      .recommendCommands()
      .showHelpOnFail(true);

    // Register commands
    cli.command(
      ['start', '$0'],
      'Start the AgentKit voice assistant',
      (yargs) => {
        return yargs
          .option('model', {
            type: 'string',
            description: 'Override the default model',
          })
          .option('tts-provider', {
            type: 'string',
            choices: ['openai', 'elevenlabs'],
            description: 'Override the TTS provider',
          })
          .option('stt-provider', {
            type: 'string', 
            choices: ['openai'],
            description: 'Override the STT provider',
          })
          .option('theme', {
            type: 'string',
            choices: ['default', 'dark', 'light'],
            description: 'Override the UI theme',
          })
          .option('verbose', {
            type: 'boolean',
            alias: 'v',
            description: 'Enable verbose output',
            default: false,
          });
      },
      async (argv) => {
        await startVoiceAssistant(configManager, argv);
      }
    );

    cli.command(
      'config <action>',
      'Manage AgentKit configuration',
      (yargs) => {
        return yargs
          .positional('action', {
            describe: 'Configuration action to perform',
            choices: ['show', 'init', 'edit', 'validate'] as const,
            demandOption: true,
          })
          .option('global', {
            type: 'boolean',
            description: 'Use global configuration instead of project-specific',
            default: false,
          })
          .option('format', {
            choices: ['json', 'yaml', 'table'] as const,
            description: 'Output format for config show',
          });
      },
      async (argv) => {
        await configCommand(configManager, argv);
      }
    );

    cli.command(
      'status',
      'Show AgentKit system status and configuration info',
      (yargs) => {
        return yargs
          .option('verbose', {
            type: 'boolean',
            alias: 'v',
            description: 'Show detailed status information',
            default: false,
          });
      },
      async (argv) => {
        await statusCommand(configManager, argv);
      }
    );

    // Parse and execute
    await cli.parse();

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Run the CLI
main().catch((error) => {
  console.error('❌ CLI Error:', error);
  process.exit(1);
}); 