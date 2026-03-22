// OmniBox 代理 Worker v1.0.0 - 主入口
// 通用网络代理服务

import { ProxyHandler } from './proxy.js';
import { CONFIG, type EnvVariables } from './config.js';
import { getUnrestrictedCorsHeaders, generateRequestId, Logger, getHTMLResponse, createJsonHeaders, constantTimeEqual } from './utils.js';
import { getErrorPageTemplate } from './templates.js';

declare global {
  var thisProxyServerUrlHttps: string;
  var thisProxyServerUrl_hostOnly: string;
}

interface HealthCheckResponse {
  status: string;
  timestamp: string;
  version: string;
  service: string;
  globals: {
    https: string;
    host: string;
  };
  features: {
    enhancedProxyMode: boolean;
    originalFunctionality: boolean;
    corsSupport: boolean;
    passwordProtection: boolean;
    proxyHint: boolean;
  };
}

interface StatusResponse {
  status: string;
  proxyMode: string;
  timestamp: number;
  version: string;
  cors: string;
  passwordProtected: boolean;
  hintEnabled: boolean;
}

async function handleRequest(request: Request, env: EnvVariables): Promise<Response> {
  const logger = Logger.create('Worker', env);
  const requestId = generateRequestId();
  logger.setRequestId(requestId);

  const url = new URL(request.url);

  (globalThis as any).thisProxyServerUrlHttps = `${url.protocol}//${url.hostname}/`;
  (globalThis as any).thisProxyServerUrl_hostOnly = url.host;

  const proxyHandler = new ProxyHandler(env);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: getUnrestrictedCorsHeaders(),
      status: 204
    });
  }

  if (url.pathname.startsWith('/api/')) {
    return handleApiRequest(url, request, env);
  }

  const originalResponse = await proxyHandler.handleRequest(request);

  const newHeaders = new Headers(originalResponse.headers);
  Object.entries(getUnrestrictedCorsHeaders()).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });
  newHeaders.set('X-Request-Id', requestId);

  const finalResponse = new Response(originalResponse.body, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers: newHeaders
  });

  return finalResponse;
}

async function handleApiRequest(
  url: URL,
  request: Request,
  env: EnvVariables
): Promise<Response> {
  const headers = createJsonHeaders();

  if (url.pathname === '/api/health') {
    const healthResponse: HealthCheckResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: CONFIG.VERSION,
      service: 'OmniBox Proxy Worker',
      globals: {
        https: (globalThis as any).thisProxyServerUrlHttps || 'NOT_SET',
        host: (globalThis as any).thisProxyServerUrl_hostOnly || 'NOT_SET'
      },
      features: {
        enhancedProxyMode: true,
        originalFunctionality: true,
        corsSupport: true,
        passwordProtection: !!(env.PROXY_PASSWORD || CONFIG.DEFAULT_PASSWORD),
        proxyHint: true
      }
    };
    return new Response(JSON.stringify(healthResponse), { headers });
  }

  if (url.pathname === '/api/status') {
    const statusResponse: StatusResponse = {
      status: 'active',
      proxyMode: 'omnibox-enhanced',
      timestamp: Date.now(),
      version: CONFIG.VERSION,
      cors: 'unrestricted',
      passwordProtected: !!(env.PROXY_PASSWORD || CONFIG.DEFAULT_PASSWORD),
      hintEnabled: true
    };
    return new Response(JSON.stringify(statusResponse), { headers });
  }

  const notFoundResponse = {
    error: 'API endpoint not found'
  };
  return new Response(JSON.stringify(notFoundResponse), {
    status: 404,
    headers
  });
}

export default {
  async fetch(request: Request, env: EnvVariables, _ctx: ExecutionContext): Promise<Response> {
    const logger = Logger.create('Worker', env);

    try {
      return await handleRequest(request, env);
    } catch (error) {
      logger.error('OmniBox Worker error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: env.DEBUG === 'true' ? (error instanceof Error ? error.stack : undefined) : undefined
      });

      const errorMessage = env.DEBUG === 'true'
        ? (error instanceof Error ? error.message : 'Unknown error')
        : '服务暂时不可用，请稍后重试';

      return getHTMLResponse(
        getErrorPageTemplate('服务错误', errorMessage, 500),
        500
      );
    }
  }
};
