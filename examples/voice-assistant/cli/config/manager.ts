import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import stripJsonComments from 'strip-json-comments';
import { AgentKitConfig, AgentKitConfigSchema, validateConfig } from './schema.js';

export interface ConfigSource {
  type: 'global' | 'project' | 'environment';
  path?: string;
  exists: boolean;
  config?: Partial<AgentKitConfig>;
}

export class ConfigManager {
  private _config: AgentKitConfig | null = null;
  private _sources: ConfigSource[] = [];

  constructor(private projectRoot: string = process.cwd()) {}

  /**
   * Load and merge configuration from all sources
   */
  async loadConfig(): Promise<AgentKitConfig> {
    if (this._config) {
      return this._config;
    }

    // Reset sources
    this._sources = [];

    // Load configurations in order of precedence (lowest to highest)
    const globalConfig = await this.loadGlobalConfig();
    const projectConfig = await this.loadProjectConfig();
    const envConfig = this.loadEnvironmentConfig();

    // Merge configurations (later configs override earlier ones)
    const mergedConfig = this.mergeConfigs([
      globalConfig?.config || {},
      projectConfig?.config || {},
      envConfig?.config || {},
    ]);

    // Validate and apply defaults
    this._config = validateConfig(mergedConfig);
    
    return this._config;
  }

  /**
   * Get the current loaded configuration
   */
  getConfig(): AgentKitConfig {
    if (!this._config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this._config;
  }

  /**
   * Get information about configuration sources
   */
  getSources(): ConfigSource[] {
    return [...this._sources];
  }

  /**
   * Load global configuration from user's home directory
   */
  private async loadGlobalConfig(): Promise<ConfigSource> {
    const globalConfigPath = path.join(os.homedir(), '.agentkit', 'settings.json');
    
    try {
      const exists = await this.fileExists(globalConfigPath);
      if (!exists) {
        const source: ConfigSource = { type: 'global', path: globalConfigPath, exists: false };
        this._sources.push(source);
        return source;
      }

      const content = await fs.readFile(globalConfigPath, 'utf-8');
      const config = JSON.parse(stripJsonComments(content));
      
      const source: ConfigSource = { 
        type: 'global', 
        path: globalConfigPath, 
        exists: true, 
        config 
      };
      this._sources.push(source);
      return source;
    } catch (error) {
      throw new Error(`Failed to load global config from ${globalConfigPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load project-specific configuration
   */
  private async loadProjectConfig(): Promise<ConfigSource> {
    const projectConfigPath = path.join(this.projectRoot, '.agentkit', 'settings.json');
    
    try {
      const exists = await this.fileExists(projectConfigPath);
      if (!exists) {
        const source: ConfigSource = { type: 'project', path: projectConfigPath, exists: false };
        this._sources.push(source);
        return source;
      }

      const content = await fs.readFile(projectConfigPath, 'utf-8');
      const config = JSON.parse(stripJsonComments(content));
      
      const source: ConfigSource = { 
        type: 'project', 
        path: projectConfigPath, 
        exists: true, 
        config 
      };
      this._sources.push(source);
      return source;
    } catch (error) {
      throw new Error(`Failed to load project config from ${projectConfigPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load configuration from environment variables
   */
  private loadEnvironmentConfig(): ConfigSource {
    const config: Partial<AgentKitConfig> = {};

    // Map environment variables to config structure
    if (process.env.AGENTKIT_MODEL_PROVIDER) {
      config.defaultModel = {
        provider: process.env.AGENTKIT_MODEL_PROVIDER as any,
        modelName: process.env.AGENTKIT_MODEL_NAME || 'gpt-4o',
      };
    }

    if (process.env.AGENTKIT_TTS_PROVIDER) {
      config.tts = {
        provider: process.env.AGENTKIT_TTS_PROVIDER as any,
        options: {}
      };
    }

    if (process.env.AGENTKIT_UI_THEME) {
      config.ui = {
        theme: process.env.AGENTKIT_UI_THEME as any,
        hideTips: process.env.AGENTKIT_HIDE_TIPS === 'true',
        autoAcceptSafeTools: process.env.AGENTKIT_AUTO_ACCEPT_SAFE_TOOLS !== 'false',
      };
    }

    const source: ConfigSource = { 
      type: 'environment', 
      exists: Object.keys(config).length > 0, 
      config 
    };
    this._sources.push(source);
    return source;
  }

  /**
   * Merge multiple configuration objects
   */
  private mergeConfigs(configs: Partial<AgentKitConfig>[]): Partial<AgentKitConfig> {
    return configs.reduce((merged, config) => {
      return this.deepMerge(merged, config);
    }, {});
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a default configuration file
   */
  async createDefaultConfig(type: 'global' | 'project'): Promise<string> {
    const defaultConfig = AgentKitConfigSchema.parse({});
    const configDir = type === 'global' 
      ? path.join(os.homedir(), '.agentkit')
      : path.join(this.projectRoot, '.agentkit');
    
    const configPath = path.join(configDir, 'settings.json');

    // Ensure directory exists
    await fs.mkdir(configDir, { recursive: true });

    // Write default configuration with comments
    const configWithComments = `{
  // AgentKit CLI Configuration
  // See https://docs.agentkit.dev/cli/configuration for full documentation
  
  // Default model configuration
  "defaultModel": {
    "provider": "${defaultConfig.defaultModel.provider}",
    "modelName": "${defaultConfig.defaultModel.modelName}"
  },
  
  // Text-to-Speech configuration
  "tts": {
    "provider": "${defaultConfig.tts.provider}",
    "options": {}
  },
  
  // Speech-to-Text configuration
  "stt": {
    "provider": "${defaultConfig.stt.provider}",
    "options": {}
  },
  
  // Wake word detection configuration
  "wakeWord": {
    "provider": "${defaultConfig.wakeWord.provider}",
    "options": {
      "keyword": "${defaultConfig.wakeWord.options.keyword}",
      "sensitivity": ${defaultConfig.wakeWord.options.sensitivity}
    }
  },
  
  // Tool configuration
  "tools": {
    "enabledTools": ${JSON.stringify(defaultConfig.tools.enabledTools, null, 4).replace(/\n/g, '\n    ')}
  },
  
  // File system configuration
  "fileSystem": {
    "root": "${defaultConfig.fileSystem.root}",
    "respectGitIgnore": ${defaultConfig.fileSystem.respectGitIgnore}
  },
  
  // UI configuration
  "ui": {
    "theme": "${defaultConfig.ui.theme}",
    "hideTips": ${defaultConfig.ui.hideTips},
    "autoAcceptSafeTools": ${defaultConfig.ui.autoAcceptSafeTools}
  }
}`;

    await fs.writeFile(configPath, configWithComments, 'utf-8');
    return configPath;
  }

  /**
   * Reset cached configuration (useful for testing or when config files change)
   */
  reset(): void {
    this._config = null;
    this._sources = [];
  }
} 