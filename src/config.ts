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

export interface PerformanceConfig {
  MAX_REDIRECT_DEPTH: number;
  REQUEST_TIMEOUT: number;
  MAX_RESPONSE_SIZE: number;
  CONCURRENT_REQUESTS_LIMIT: number;
  PRELOAD_URLS: string[];
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

export interface ErrorMessagesConfig {
  INVALID_URL: string;
  ACCESS_DENIED: string;
  PROXY_ERROR: string;
  CACHE_ERROR: string;
  NETWORK_ERROR: string;
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
  HEALTH_CHECK: string;
  STATUS: string;
  CACHE_CLEAR: string;
  CACHE_PRELOAD: string;
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
  CONTENT_TYPES: ContentTypesConfig;
  ERROR_MESSAGES: ErrorMessagesConfig;
  ROBOTS_TXT: string;
  CRAWLER_BLOCK_MESSAGE: string;
  PERFORMANCE: PerformanceConfig;
  HEADERS: HeadersConfig;
  API: APIConfig;
  LOGGING: LoggingConfig;
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

  CONTENT_TYPES: {
    HTML: ['text/html', 'application/xhtml+xml'],
    CSS: ['text/css'],
    JS: ['application/javascript', 'application/x-javascript', 'text/javascript'],
    JSON: ['application/json', 'text/json'],
    XML: ['application/xml', 'text/xml'],
    IMAGES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    FONTS: ['font/woff', 'font/woff2', 'font/ttf', 'font/otf', 'application/font-woff']
  },

  ERROR_MESSAGES: {
    INVALID_URL: 'Invalid URL format. Please enter a valid website address.',
    ACCESS_DENIED: 'Access denied. Please check your credentials.',
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

  PERFORMANCE: {
    MAX_REDIRECT_DEPTH: 5,
    REQUEST_TIMEOUT: 30000,
    MAX_RESPONSE_SIZE: 50 * 1024 * 1024,
    CONCURRENT_REQUESTS_LIMIT: 10,
    PRELOAD_URLS: []
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
    HEALTH_CHECK: '/api/health',
    STATUS: '/api/status',
    CACHE_CLEAR: '/api/cache/clear',
    CACHE_PRELOAD: '/api/cache/preload'
  },

  LOGGING: {
    LEVELS: {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    },
    DEFAULT_LEVEL: 1
  }
};
