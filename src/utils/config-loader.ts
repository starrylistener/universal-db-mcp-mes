/**
 * Configuration Loader
 * Unified configuration loading from multiple sources with priority:
 * CLI args > Environment variables > Config file > Defaults
 */

import { config as dotenvConfig } from 'dotenv';
import type { AppConfig, HttpConfig } from '../types/http.js';

// Load environment variables from .env file
dotenvConfig();

/**
 * Default HTTP configuration
 */
const DEFAULT_HTTP_CONFIG: HttpConfig = {
  port: 3000,
  host: '0.0.0.0',
  apiKeys: [],
  cors: {
    origins: '*',
    credentials: false,
  },
  rateLimit: {
    max: 100,
    window: '1m',
  },
  logging: {
    level: 'info',
    pretty: false,
  },
  session: {
    timeout: 3600000, // 1 hour
    cleanupInterval: 300000, // 5 minutes
  },
};

/**
 * Load configuration from environment variables
 */
export function loadFromEnv(): Partial<AppConfig> {
  const config: Partial<AppConfig> = {};

  // Mode
  if (process.env.MODE) {
    config.mode = process.env.MODE as 'mcp' | 'http';
  }

  // HTTP configuration
  if (process.env.HTTP_PORT || process.env.HTTP_HOST || process.env.API_KEYS) {
    config.http = {
      ...DEFAULT_HTTP_CONFIG,
      port: process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : DEFAULT_HTTP_CONFIG.port,
      host: process.env.HTTP_HOST || DEFAULT_HTTP_CONFIG.host,
      apiKeys: process.env.API_KEYS ? process.env.API_KEYS.split(',').map(k => k.trim()) : [],
      cors: {
        origins: process.env.CORS_ORIGINS || DEFAULT_HTTP_CONFIG.cors.origins,
        credentials: process.env.CORS_CREDENTIALS === 'true',
      },
      rateLimit: {
        max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : DEFAULT_HTTP_CONFIG.rateLimit.max,
        window: process.env.RATE_LIMIT_WINDOW || DEFAULT_HTTP_CONFIG.rateLimit.window,
      },
      logging: {
        level: (process.env.LOG_LEVEL as any) || DEFAULT_HTTP_CONFIG.logging.level,
        pretty: process.env.LOG_PRETTY === 'true',
      },
      session: {
        timeout: process.env.SESSION_TIMEOUT ? parseInt(process.env.SESSION_TIMEOUT, 10) : DEFAULT_HTTP_CONFIG.session.timeout,
        cleanupInterval: process.env.SESSION_CLEANUP_INTERVAL ? parseInt(process.env.SESSION_CLEANUP_INTERVAL, 10) : DEFAULT_HTTP_CONFIG.session.cleanupInterval,
      },
    };
  }

  // Database configuration (for single-connection mode)
  if (process.env.DB_TYPE) {
    config.database = {
      type: process.env.DB_TYPE as any,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      filePath: process.env.DB_FILE_PATH,
      allowWrite: process.env.DB_ALLOW_WRITE === 'true',
    };
  }

  // Error table configuration
  if (process.env.ERROR_TABLE || process.env.ERROR_DATABASE) {
    config.errorTable = {
      errorDatabase: process.env.ERROR_DATABASE,
      errorTable: process.env.ERROR_TABLE,
      errorSeqName: process.env.ERROR_SEQ_NAME || 'mt_error_message_s',
      errorTlTable: process.env.ERROR_TL_TABLE,
      errorMultilang: process.env.ERROR_MULTILANG === 'true',
      errorLocales: process.env.ERROR_LOCALES
        ? process.env.ERROR_LOCALES.split(',').map(s => s.trim())
        : ['zh_CN', 'en_US'],
      errorSeqSuffix: process.env.ERROR_SEQ_SUFFIX || '001',
    };
  }

  return config;
}

/**
 * Merge multiple configuration objects with priority
 */
export function mergeConfigs(...configs: Partial<AppConfig>[]): AppConfig {
  const merged: AppConfig = {
    mode: 'mcp', // Default mode
  };

  for (const config of configs) {
    if (config.mode) {
      merged.mode = config.mode;
    }
    if (config.database) {
      merged.database = { ...merged.database, ...config.database };
    }
    if (config.http) {
      merged.http = { ...merged.http, ...config.http };
    }
    if (config.errorTable) {
      merged.errorTable = { ...merged.errorTable, ...config.errorTable };
    }
  }

  // Ensure HTTP config exists if in HTTP mode
  if (merged.mode === 'http' && !merged.http) {
    merged.http = DEFAULT_HTTP_CONFIG;
  }

  return merged;
}

/**
 * Load complete configuration
 */
export function loadConfig(): AppConfig {
  // Load from environment variables
  const envConfig = loadFromEnv();

  // Merge with defaults
  const config = mergeConfigs(
    {
      mode: 'mcp',
      http: DEFAULT_HTTP_CONFIG,
    },
    envConfig
  );

  return config;
}

/**
 * Validate configuration
 */
export function validateConfig(config: AppConfig): void {
  if (config.mode === 'http') {
    if (!config.http) {
      throw new Error('HTTP 模式需要 HTTP 配置');
    }
    if (config.http.apiKeys.length === 0) {
      console.warn('⚠️  警告: 未配置 API Keys，建议设置 API_KEYS 环境变量');
    }
  }
}
