import { ConfigManager } from '../config/manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

interface StatusCommandArgs {
  verbose?: boolean;
}

interface SystemCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}

export async function statusCommand(
  configManager: ConfigManager,
  args: StatusCommandArgs
): Promise<void> {
  try {
    console.log('🔍 AgentKit System Status\n');

    // Run system checks
    const checks = await runSystemChecks(configManager, args.verbose);
    
    // Display results
    displayStatusResults(checks, args.verbose);
    
    // Summary
    const passed = checks.filter(c => c.status === 'pass').length;
    const failed = checks.filter(c => c.status === 'fail').length;
    const warnings = checks.filter(c => c.status === 'warn').length;
    
    console.log(`\n📊 Summary: ${passed} passed, ${warnings} warnings, ${failed} failed`);
    
    if (failed > 0) {
      console.log('\n❌ Some critical checks failed. AgentKit may not work properly.');
      process.exit(1);
    } else if (warnings > 0) {
      console.log('\n⚠️  Some checks have warnings. AgentKit should work but with limited functionality.');
    } else {
      console.log('\n✅ All checks passed! AgentKit is ready to use.');
    }
    
  } catch (error) {
    console.error('❌ Status check failed:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

async function runSystemChecks(configManager: ConfigManager, verbose?: boolean): Promise<SystemCheck[]> {
  const checks: SystemCheck[] = [];

  // Configuration check
  try {
    const config = configManager.getConfig();
    const sources = configManager.getSources();
    const validSources = sources.filter(s => s.exists);
    
    checks.push({
      name: 'Configuration',
      status: 'pass',
      message: `Loaded from ${validSources.length} source(s)`,
      details: verbose ? `Sources: ${validSources.map(s => s.type).join(', ')}` : undefined
    });
  } catch (error) {
    checks.push({
      name: 'Configuration',
      status: 'fail',
      message: 'Configuration validation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // Environment variables check
  const requiredEnvVars = [
    'OPENAI_API_KEY',
    'PICOVOICE_ACCESS_KEY'
  ];
  
  const optionalEnvVars = [
    'ELEVENLABS_API_KEY',
    'ELEVENLABS_VOICE_ID',
    'NOTION_API_KEY',
    'EXA_API_KEY'
  ];

  const missingRequired = requiredEnvVars.filter(env => !process.env[env]);
  const missingOptional = optionalEnvVars.filter(env => !process.env[env]);

  if (missingRequired.length > 0) {
    checks.push({
      name: 'Environment Variables',
      status: 'fail',
      message: `Missing required variables: ${missingRequired.join(', ')}`,
      details: 'Set these in your .env file for the agent to work.'
    });
  } else if (missingOptional.length > 0) {
    checks.push({
      name: 'Environment Variables',
      status: 'warn',
      message: `Missing optional variables: ${missingOptional.join(', ')}`,
      details: 'These are not required but enable extra features (e.g. ElevenLabs, Notion).'
    });
  } else {
    checks.push({
      name: 'Environment Variables',
      status: 'pass',
      message: 'All required environment variables are set.'
    });
  }

  // FFmpeg check (required for audio playback)
  try {
    await execAsync('which ffmpeg');
    checks.push({
      name: 'FFmpeg',
      status: 'pass',
      message: 'FFmpeg is installed and available',
    });
  } catch (error) {
    checks.push({
      name: 'FFmpeg',
      status: 'fail',
      message: 'FFmpeg not found',
      details: 'Install with: brew install ffmpeg (macOS) or apt-get install ffmpeg (Linux)'
    });
  }

  // Node.js version check
  try {
    const nodeVersion = process.version;
    const versionParts = nodeVersion.slice(1).split('.');
    const majorVersionStr = versionParts[0];
    
    if (!majorVersionStr) {
      throw new Error('Invalid version format');
    }
    
    const majorVersion = parseInt(majorVersionStr, 10);
    
    if (majorVersion >= 18) {
      checks.push({
        name: 'Node.js Version',
        status: 'pass',
        message: `Node.js ${nodeVersion} (compatible)`,
      });
    } else {
      checks.push({
        name: 'Node.js Version',
        status: 'warn',
        message: `Node.js ${nodeVersion} (recommend v18+)`,
        details: 'Some features may not work with older Node.js versions'
      });
    }
  } catch (error) {
    checks.push({
      name: 'Node.js Version',
      status: 'fail',
      message: 'Could not determine Node.js version',
    });
  }

  // Inngest dev server check (optional but recommended)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch('http://localhost:8288/health', {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      checks.push({
        name: 'Inngest Dev Server',
        status: 'pass',
        message: 'Inngest dev server is running',
        details: 'Available at http://localhost:8288'
      });
    } else {
      checks.push({
        name: 'Inngest Dev Server',
        status: 'warn',
        message: 'Inngest dev server responded but not healthy',
        details: 'Start with: npx inngest-cli dev'
      });
    }
  } catch (error) {
    checks.push({
      name: 'Inngest Dev Server',
      status: 'warn',
      message: 'Inngest dev server not running',
      details: 'Start with: npx inngest-cli dev (required for agent execution)'
    });
  }

  // File permissions check
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      await fs.access(homeDir, fs.constants.W_OK);
      checks.push({
        name: 'File Permissions',
        status: 'pass',
        message: 'Can write to home directory',
      });
    } else {
      checks.push({
        name: 'File Permissions',
        status: 'warn',
        message: 'Could not determine home directory',
        details: 'HOME or USERPROFILE environment variable not set'
      });
    }
  } catch (error) {
    checks.push({
      name: 'File Permissions',
      status: 'warn',
      message: 'Limited file system access',
      details: 'May not be able to create global configuration files'
    });
  }

  return checks;
}

function displayStatusResults(checks: SystemCheck[], verbose?: boolean): void {
  checks.forEach(check => {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    console.log(`${icon} ${check.name}: ${check.message}`);
    
    if (verbose && check.details) {
      console.log(`   └─ ${check.details}`);
    }
  });
}
 