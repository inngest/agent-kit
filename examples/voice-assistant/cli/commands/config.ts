import { ConfigManager } from '../config/manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn } from 'child_process';

const execAsync = promisify(exec);

interface ConfigCommandArgs {
  action: 'show' | 'init' | 'edit' | 'validate';
  global?: boolean;
  format?: 'json' | 'yaml' | 'table';
}

export async function configCommand(
  configManager: ConfigManager,
  args: ConfigCommandArgs
): Promise<void> {
  try {
    switch (args.action) {
      case 'show':
        await showConfig(configManager, args);
        break;
      case 'init':
        await initConfig(configManager, args);
        break;
      case 'edit':
        await editConfig(configManager, args);
        break;
      case 'validate':
        await validateConfig(configManager);
        break;
      default:
        throw new Error(`Unknown config action: ${args.action}`);
    }
  } catch (error) {
    console.error('❌ Config command failed:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

async function showConfig(configManager: ConfigManager, args: ConfigCommandArgs): Promise<void> {
  const config = configManager.getConfig();
  const sources = configManager.getSources();

  console.log('📋 AgentKit Configuration\n');

  // Show configuration sources
  console.log('📂 Configuration Sources:');
  sources.forEach(source => {
    const status = source.exists ? '✅' : '❌';
    const path = source.path || 'environment variables';
    console.log(`  ${status} ${source.type}: ${path}`);
  });
  console.log();

  // Show configuration based on format
  switch (args.format) {
    case 'json':
      console.log('🔧 Current Configuration (JSON):');
      console.log(JSON.stringify(config, null, 2));
      break;
    case 'yaml':
      console.log('🔧 Current Configuration (YAML):');
      // Simple YAML-like output for now
      console.log(configToYamlString(config));
      break;
    case 'table':
    default:
      console.log('🔧 Current Configuration:');
      printConfigTable(config);
      break;
  }
}

async function initConfig(configManager: ConfigManager, args: ConfigCommandArgs): Promise<void> {
  const configType = args.global ? 'global' : 'project';
  
  console.log(`🚀 Initializing ${configType} AgentKit configuration...`);
  
  try {
    const configPath = await configManager.createDefaultConfig(configType);
    console.log(`✅ Created default configuration at: ${configPath}`);
    console.log(`\n📝 You can now edit this file to customize your AgentKit settings.`);
    console.log(`   Run 'npm run cli config edit${args.global ? ' --global' : ''}' to open it in your editor.`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('EEXIST')) {
      console.log(`⚠️  Configuration file already exists. Use 'npm run cli config edit${args.global ? ' --global' : ''}' to modify it.`);
    } else {
      throw error;
    }
  }
}

async function editConfig(configManager: ConfigManager, args: ConfigCommandArgs): Promise<void> {
  const sources = configManager.getSources();
  const targetSource = sources.find(s => 
    args.global ? s.type === 'global' : s.type === 'project'
  );

  if (!targetSource || !targetSource.exists || !targetSource.path) {
    const configType = args.global ? 'global' : 'project';
    console.log(`❌ No ${configType} configuration file found.`);
    console.log(`   Run 'npm run cli config init${args.global ? ' --global' : ''}' to create one first.`);
    return;
  }

  console.log(`📝 Opening configuration file: ${targetSource.path}`);
  
  const editor = process.env.EDITOR || process.env.VISUAL || 'code';
  
  return new Promise((resolve, reject) => {
    const editorProcess = spawn(editor, [`"${targetSource.path!}"`], {
      shell: true,
      stdio: 'inherit'
    });

    editorProcess.on('exit', (code) => {
      if (code === 0) {
        console.log('\n✅ Editor closed. Configuration changes will take effect on next CLI run.');
      } else {
        console.log(`\n⚠️ Editor exited with code ${code}.`);
      }
      resolve();
    });

    editorProcess.on('error', (err) => {
      console.log(`\n⚠️  Could not open editor '${editor}'. Please edit the file manually:`);
      console.log(`   ${targetSource.path}`);
      reject(err);
    });
  });
}

async function validateConfig(configManager: ConfigManager): Promise<void> {
  console.log('🔍 Validating AgentKit configuration...');
  
  try {
    // Reset and reload configuration to validate
    configManager.reset();
    await configManager.loadConfig();
    
    console.log('✅ Configuration is valid!');
    
    const sources = configManager.getSources();
    const validSources = sources.filter(s => s.exists);
    
    if (validSources.length > 0) {
      console.log('\n📂 Loaded configuration from:');
      validSources.forEach(source => {
        console.log(`  ✅ ${source.type}: ${source.path || 'environment variables'}`);
      });
    }
  } catch (error) {
    console.log('❌ Configuration validation failed!');
    throw error;
  }
}

function printConfigTable(config: any, prefix = ''): void {
  for (const [key, value] of Object.entries(config)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      console.log(`  📁 ${fullKey}:`);
      printConfigTable(value, fullKey);
    } else {
      const displayValue = Array.isArray(value) 
        ? `[${value.join(', ')}]`
        : String(value);
      console.log(`    ${key}: ${displayValue}`);
    }
  }
}

function configToYamlString(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent);
  let result = '';
  
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result += `${spaces}${key}:\n`;
      result += configToYamlString(value, indent + 1);
    } else if (Array.isArray(value)) {
      result += `${spaces}${key}:\n`;
      value.forEach(item => {
        result += `${spaces}  - ${item}\n`;
      });
    } else {
      result += `${spaces}${key}: ${value}\n`;
    }
  }
  
  return result;
} 