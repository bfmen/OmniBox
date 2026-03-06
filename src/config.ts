// Configuration and Constants Module
// Centralized configuration for OmniBox Proxy Worker

export interface CacheTTLConfig {
  HTML: number;
  CSS: number;
  JS: number;
  IMAGE: number;
  FONT: number;
  JSON: number;
  DEFAULT: number;
}

export interface FeaturesConfig {
  ENABLE_CACHE: boolean;
  ENABLE_COMPRESSION: boolean;
  ENABLE_RATE_LIMITING: boolean;
  ENABLE_USER_AGENT_BLOCKING: boolean;
  ENABLE_CONTENT_FILTERING: boolean;
  ENABLE_ANALYTICS: boolean;
  ENABLE_DEBUG_LOGGING: boolean;
}

export interface PerformanceConfig {
  MAX_REDIRECT_DEPTH: number;
  REQUEST_TIMEOUT: number;
  MAX_RESPONSE_SIZE: number;
  CONCURRENT_REQUESTS_LIMIT: number;
}

export interface HeadersConfig {
  REMOVE_HEADERS: string[];
  ADD_HEADERS: Record<string, string>;
  CORS_HEADERS: Record<string, string>;
}

export interface ContentTypesConfig {
  HTML: string[];
  CSS: string[];
  JS: string[];
  JSON: string[];
  XML: string[];
  IMAGES: string[];
  FONTS: string[];
}

export interface URLPatternsConfig {
  SPECIAL_DOMAINS: string[];
  BYPASS_URLS: string[];
}

export interface ErrorMessagesConfig {
  INVALID_URL: string;
  ACCESS_DENIED: string;
  RATE_LIMITED: string;
  PROXY_ERROR: string;
  CACHE_ERROR: string;
  NETWORK_ERROR: string;
}

export interface RateLimitConfig {
  REQUESTS_PER_MINUTE: number;
  WINDOW_SIZE: number;
}

export interface LoggingConfig {
  LEVELS: {
    ERROR: number;
    WARN: number;
    INFO: number;
    DEBUG: number;
  };
  DEFAULT_LEVEL: number;
}

export interface APIConfig {
  HEALTH_CHECK: string[];
  STATUS: string;
  CACHE_CLEAR: string;
  STATS: string;
  CONFIG: string;
}

export interface EnvironmentOverride {
  FEATURES?: Partial<FeaturesConfig>;
  CACHE_TTL?: Partial<CacheTTLConfig>;
  LOGGING?: Partial<LoggingConfig>;
}

export interface EnvOverridesConfig {
  development: EnvironmentOverride;
  staging: EnvironmentOverride;
  production: EnvironmentOverride;
}

export interface AppConfig {
  VERSION: string;
  NAME: string;
  URL_SEPARATOR: string;
  DEFAULT_PASSWORD: string;
  PASSWORD_COOKIE_NAME: string;
  LAST_VISIT_COOKIE_NAME: string;
  PROXY_HINT_COOKIE_NAME: string;
  CACHE_PREFIX: string;
  MAX_CACHE_SIZE: number;
  CACHE_TTL: CacheTTLConfig;
  REPLACE_URL_OBJ: string;
  HTML_INJECT_FUNC_NAME: string;
  PROXY_HINT_DELAY: number;
  DEBUG_MODE: string;
  CORS_MAX_AGE: number;
  BLOCKED_EXTENSIONS: string[];
  BLOCKED_USER_AGENTS: string[];
  RATE_LIMIT: RateLimitConfig;
  CONTENT_TYPES: ContentTypesConfig;
  URL_PATTERNS: URLPatternsConfig;
  ERROR_MESSAGES: ErrorMessagesConfig;
  ROBOTS_TXT: string;
  CRAWLER_BLOCK_MESSAGE: string;
  FEATURES: FeaturesConfig;
  PERFORMANCE: PerformanceConfig;
  HEADERS: HeadersConfig;
  API: APIConfig;
  LOGGING: LoggingConfig;
  ENV_OVERRIDES: EnvOverridesConfig;
}

export interface EnvVariables {
  ENVIRONMENT?: string;
  PROXY_PASSWORD?: string;
  MAX_CACHE_SIZE?: string;
  ENABLE_DEBUG?: string;
  KV_CACHE?: KVNamespace;
  DEBUG?: string;
  LOG_LEVEL?: string;
  SHOW_PASSWORD_PAGE?: string;
  CACHE_HTML_TTL?: string;
  CACHE_CSS_TTL?: string;
  CACHE_JS_TTL?: string;
  CACHE_IMAGE_TTL?: string;
  CACHE_FONT_TTL?: string;
  CACHE_JSON_TTL?: string;
  CACHE_DEFAULT_TTL?: string;
}

export const CONFIG: AppConfig = {
  VERSION: '1.0.0',
  NAME: 'OmniBox Proxy Worker',

  URL_SEPARATOR: '/',
  DEFAULT_PASSWORD: '',

  PASSWORD_COOKIE_NAME: '__OMNIBOX_PWD__',
  LAST_VISIT_COOKIE_NAME: '__OMNIBOX_VISITEDSITE__',
  PROXY_HINT_COOKIE_NAME: '__OMNIBOX_HINT__',

  CACHE_PREFIX: 'omnibox-proxy-cache-v1.0',
  MAX_CACHE_SIZE: 1024 * 1024,

  CACHE_TTL: {
    HTML: 3600,
    CSS: 86400,
    JS: 86400,
    IMAGE: 2592000,
    FONT: 2592000,
    JSON: 1800,
    DEFAULT: 3600
  },

  REPLACE_URL_OBJ: '__location__omnibox__',
  HTML_INJECT_FUNC_NAME: 'parseAndInsertDoc',
  PROXY_HINT_DELAY: 5000,
  DEBUG_MODE: 'DEBUG_OMNIBOX_MODE',

  CORS_MAX_AGE: 86400,

  BLOCKED_EXTENSIONS: [
    '.exe', '.bat', '.cmd', '.scr', '.pif', '.com',
    '.msi', '.msp', '.gadget', '.jar', '.app', '.deb', '.rpm'
  ],

  BLOCKED_USER_AGENTS: [
    'Bytespider',
    'bingbot',
    'Googlebot',
    'facebookexternalhit'
  ],

  RATE_LIMIT: {
    REQUESTS_PER_MINUTE: 60,
    WINDOW_SIZE: 60000
  },

  CONTENT_TYPES: {
    HTML: ['text/html', 'application/xhtml+xml'],
    CSS: ['text/css'],
    JS: ['application/javascript', 'application/x-javascript', 'text/javascript'],
    JSON: ['application/json', 'text/json'],
    XML: ['application/xml', 'text/xml'],
    IMAGES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    FONTS: ['font/woff', 'font/woff2', 'font/ttf', 'font/otf', 'application/font-woff']
  },

  URL_PATTERNS: {
    SPECIAL_DOMAINS: [
      'google.com',
      'youtube.com',
      'facebook.com',
      'twitter.com'
    ],

    BYPASS_URLS: [
      '/favicon.ico',
      '/robots.txt',
      '/sitemap.xml',
      '/.well-known/'
    ]
  },

  ERROR_MESSAGES: {
    INVALID_URL: 'Invalid URL format. Please enter a valid website address.',
    ACCESS_DENIED: 'Access denied. Please check your credentials.',
    RATE_LIMITED: 'Too many requests. Please wait before trying again.',
    PROXY_ERROR: 'Proxy service error. Please try again later.',
    CACHE_ERROR: 'Cache service error.',
    NETWORK_ERROR: 'Network connection error. Please check your internet connection.'
  },

  ROBOTS_TXT: `User-Agent: *
Disallow: /
Crawl-delay: 10

# OmniBox Proxy Worker - Not for crawling
# This is a proxy service, not content to be indexed`,

  CRAWLER_BLOCK_MESSAGE: `
<html>
<head><title>Access Restricted</title></head>
<body>
  <h1>Access Restricted</h1>
  <p>This proxy service is not available for automated crawling.</p>
  <p>Please use standard browsing methods to access content.</p>
</body>
</html>`,

  FEATURES: {
    ENABLE_CACHE: true,
    ENABLE_COMPRESSION: true,
    ENABLE_RATE_LIMITING: true,
    ENABLE_USER_AGENT_BLOCKING: true,
    ENABLE_CONTENT_FILTERING: true,
    ENABLE_ANALYTICS: false,
    ENABLE_DEBUG_LOGGING: false
  },

  PERFORMANCE: {
    MAX_REDIRECT_DEPTH: 5,
    REQUEST_TIMEOUT: 30000,
    MAX_RESPONSE_SIZE: 50 * 1024 * 1024,
    CONCURRENT_REQUESTS_LIMIT: 10
  },

  HEADERS: {
    REMOVE_HEADERS: [
      'Content-Security-Policy',
      'Content-Security-Policy-Report-Only',
      'Permissions-Policy',
      'Cross-Origin-Embedder-Policy',
      'Cross-Origin-Resource-Policy',
      'X-Frame-Options',
      'Strict-Transport-Security'
    ],

    ADD_HEADERS: {
      'X-OmniBox-Proxy': '1.0.0',
      'X-Proxy-Service': 'OmniBox Proxy Worker',
      'X-Content-Type-Options': 'nosniff'
    },

    CORS_HEADERS: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Expose-Headers': '*'
    }
  },

  API: {
    HEALTH_CHECK: ['/api/health', '/_health'],
    STATUS: '/api/status',
    CACHE_CLEAR: '/api/cache/clear',
    STATS: '/api/stats',
    CONFIG: '/api/config'
  },

  LOGGING: {
    LEVELS: {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    },
    DEFAULT_LEVEL: 1
  },

  ENV_OVERRIDES: {
    development: {
      FEATURES: {
        ENABLE_DEBUG_LOGGING: true,
        ENABLE_ANALYTICS: false
      },
      CACHE_TTL: {
        HTML: 60,
        CSS: 300,
        JS: 300
      },
      LOGGING: {
        DEFAULT_LEVEL: 3
      }
    },

    staging: {
      FEATURES: {
        ENABLE_DEBUG_LOGGING: true,
        ENABLE_ANALYTICS: true
      },
      LOGGING: {
        DEFAULT_LEVEL: 2
      }
    },

    production: {
      FEATURES: {
        ENABLE_DEBUG_LOGGING: false,
        ENABLE_ANALYTICS: true
      },
      LOGGING: {
        DEFAULT_LEVEL: 1
      }
    }
  }
};

export function getConfig(env: EnvVariables = {}): AppConfig {
  const environment = env.ENVIRONMENT || 'production';
  const envOverrides = CONFIG.ENV_OVERRIDES[environment as keyof EnvOverridesConfig] || {};

  const mergedConfig = JSON.parse(JSON.stringify(CONFIG)) as AppConfig;

  if (envOverrides.FEATURES) {
    Object.assign(mergedConfig.FEATURES, envOverrides.FEATURES);
  }

  if (envOverrides.CACHE_TTL) {
    Object.assign(mergedConfig.CACHE_TTL, envOverrides.CACHE_TTL);
  }

  if (envOverrides.LOGGING) {
    Object.assign(mergedConfig.LOGGING, envOverrides.LOGGING);
  }

  if (env.PROXY_PASSWORD) {
    mergedConfig.DEFAULT_PASSWORD = env.PROXY_PASSWORD;
  }

  if (env.MAX_CACHE_SIZE) {
    mergedConfig.MAX_CACHE_SIZE = parseInt(env.MAX_CACHE_SIZE, 10);
  }

  if (env.ENABLE_DEBUG === 'true') {
    mergedConfig.FEATURES.ENABLE_DEBUG_LOGGING = true;
    mergedConfig.LOGGING.DEFAULT_LEVEL = 3;
  }

  return mergedConfig;
}

export function validateConfig(config: Partial<AppConfig>): string[] {
  const errors: string[] = [];

  if (!config.VERSION) {
    errors.push('VERSION is required');
  }

  if (!config.CACHE_PREFIX) {
    errors.push('CACHE_PREFIX is required');
  }

  if (typeof config.MAX_CACHE_SIZE !== 'number' || config.MAX_CACHE_SIZE <= 0) {
    errors.push('MAX_CACHE_SIZE must be a positive number');
  }

  if (!config.CACHE_TTL || typeof config.CACHE_TTL !== 'object') {
    errors.push('CACHE_TTL must be an object');
  }

  return errors;
}

export function getFeatureFlag(feature: keyof FeaturesConfig, config: AppConfig = CONFIG): boolean {
  return config.FEATURES[feature] ?? false;
}

export function shouldBypassUrl(pathname: string): boolean {
  return CONFIG.URL_PATTERNS.BYPASS_URLS.some(pattern =>
    pathname.startsWith(pattern)
  );
}

export function requiresSpecialHandling(hostname: string): boolean {
  return CONFIG.URL_PATTERNS.SPECIAL_DOMAINS.some(domain =>
    hostname.includes(domain)
  );
}

export function getCacheTTL(contentType: string | null, config: AppConfig = CONFIG): number {
  if (!contentType) return config.CACHE_TTL.DEFAULT;

  const type = contentType.toLowerCase();

  if (config.CONTENT_TYPES.HTML.some(t => type.includes(t))) {
    return config.CACHE_TTL.HTML;
  }
  if (config.CONTENT_TYPES.CSS.some(t => type.includes(t))) {
    return config.CACHE_TTL.CSS;
  }
  if (config.CONTENT_TYPES.JS.some(t => type.includes(t))) {
    return config.CACHE_TTL.JS;
  }
  if (config.CONTENT_TYPES.JSON.some(t => type.includes(t))) {
    return config.CACHE_TTL.JSON;
  }
  if (config.CONTENT_TYPES.IMAGES.some(t => type.includes(t))) {
    return config.CACHE_TTL.IMAGE;
  }
  if (config.CONTENT_TYPES.FONTS.some(t => type.includes(t))) {
    return config.CACHE_TTL.FONT;
  }

  return config.CACHE_TTL.DEFAULT;
}
