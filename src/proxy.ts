// Enhanced Proxy Handler - Core Proxy Logic
// Handles all proxy-related functionality for OmniBox

import { CONFIG, type EnvVariables } from './config.js';
import { ContentInjector } from './injector.js';
import { getMainPageTemplate, getPasswordPageTemplate, getErrorPageTemplate } from './templates.js';
import { getCookie, getHTMLResponse, getUnrestrictedCorsHeaders, constantTimeEqual, hashPassword } from './utils.js';
import { CacheManager } from './cache.js';

export interface RedirectResult {
  redirect: true;
  response: Response;
}

function replaceProxyUrls(value: string, actualUrl: URL): string {
  const proxyHttps = (globalThis as any).thisProxyServerUrlHttps;
  const proxyHost = (globalThis as any).thisProxyServerUrl_hostOnly;

  if (!proxyHttps || !proxyHost) return value;

  return value
    .replaceAll(`${proxyHttps}http`, 'http')
    .replaceAll(proxyHttps, `${actualUrl.protocol}//${actualUrl.hostname}/`)
    .replaceAll(proxyHttps.slice(0, -1), `${actualUrl.protocol}//${actualUrl.hostname}`)
    .replaceAll(proxyHost, actualUrl.host);
}

export class ProxyHandler {
  private env: EnvVariables;
  private cacheManager: CacheManager | null;
  private injector: ContentInjector;
  private password: string;
  private showPasswordPage: boolean;

  constructor(env: EnvVariables, cacheManager: CacheManager | null) {
    this.env = env;
    this.cacheManager = cacheManager;
    this.injector = new ContentInjector();
    this.password = env.PROXY_PASSWORD || CONFIG.DEFAULT_PASSWORD;
    this.showPasswordPage = env.SHOW_PASSWORD_PAGE !== 'false';
  }

  /**
   * 对密码做 SHA-256 哈希（服务端），用于与 Cookie 中存储的客户端哈希值比对。
   * 采用异步方法，避免阻塞 Worker 主线程。
   */
  private async hashPasswordValue(password: string): Promise<string> {
    return hashPassword(password);
  }

  async handleRequest(request: Request): Promise<Response> {
    const userAgent = request.headers.get('User-Agent') || '';
    if (this.isBlockedCrawler(userAgent)) {
      return getHTMLResponse(CONFIG.CRAWLER_BLOCK_MESSAGE);
    }

    const siteCookie = request.headers.get('Cookie');
    if (this.password && !(await this.validatePassword(siteCookie))) {
      return this.handleWrongPassword();
    }

    const url = new URL(request.url);

    if (request.url.endsWith('favicon.ico')) {
      // 使用内嵌 SVG 避免请求外部域名（原跳转百度会泄漏用户 IP）
      const svgIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌐</text></svg>';
      return new Response(svgIcon, {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' }
      });
    }

    if (request.url.endsWith('robots.txt')) {
      return new Response(CONFIG.ROBOTS_TXT, {
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    const actualUrlStr = this.extractActualUrl(url);

    if (actualUrlStr === '') {
      return getHTMLResponse(getMainPageTemplate());
    }

    const actualUrl = this.validateAndNormalizeUrl(actualUrlStr, siteCookie);
    if (typeof actualUrl === 'object' && 'redirect' in actualUrl) {
      return actualUrl.response;
    }

    return await this.processProxyRequest(request, actualUrl as URL, siteCookie);
  }

  /**
   * 检查 User-Agent 是否在爬虫黑名单中。
   * 默认屏蔽常见恶意爬虫，支持通过 BLOCKED_UA_PATTERNS 环境变量追加自定义模式（逗号分隔）。
   */
  private isBlockedCrawler(userAgent: string): boolean {
    if (!userAgent) return false;
    const defaultPatterns = ['Bytespider', 'GPTBot', 'CCBot', 'SemrushBot', 'AhrefsBot'];
    const customPatterns = (this.env.BLOCKED_UA_PATTERNS || '')
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);
    const allPatterns = [...defaultPatterns, ...customPatterns];
    return allPatterns.some(pattern => userAgent.includes(pattern));
  }

  async validatePassword(siteCookie: string | null): Promise<boolean> {
    if (!this.password) return true;

    if (!siteCookie) return false;

    const cookieValue = getCookie(CONFIG.PASSWORD_COOKIE_NAME, siteCookie);
    if (!cookieValue) return false;

    // Cookie 中存储的是客户端 SHA-256(password) 哈希值
    // 服务端同样对 PROXY_PASSWORD 做哈希后比对，避免明文密码存在 Cookie 中
    const expectedHash = await this.hashPasswordValue(this.password);
    return constantTimeEqual(cookieValue, expectedHash);
  }

  private handleWrongPassword(): Response {
    if (this.showPasswordPage) {
      return getHTMLResponse(getPasswordPageTemplate(CONFIG.PASSWORD_COOKIE_NAME));
    } else {
      return getHTMLResponse('<h1>403 Forbidden</h1><br>You do not have access to view this webpage.');
    }
  }

  private extractActualUrl(url: URL): string {
    const pathIndex = url.pathname.indexOf(CONFIG.URL_SEPARATOR);
    if (pathIndex === -1) return '';

    let extractedUrl = url.pathname.substring(pathIndex + CONFIG.URL_SEPARATOR.length) +
           url.search + url.hash;

    try {
      const decodedUrl = decodeURIComponent(extractedUrl);
      if (decodedUrl !== extractedUrl && this.looksLikeEncodedUrl(extractedUrl)) {
        extractedUrl = decodedUrl;
      }
    } catch {
      // URL 解码失败，保持原样
    }

    return extractedUrl;
  }

  private looksLikeEncodedUrl(url: string): boolean {
    return url.includes('%3A%2F%2F') ||
           url.includes('%2F') ||
           url.includes('%3A') ||
           url.includes('%3F') ||
           url.includes('%3D') ||
           url.includes('%26');
  }

  private validateAndNormalizeUrl(actualUrlStr: string, siteCookie: string | null): URL | RedirectResult {
    try {
      let testUrl = actualUrlStr;
      if (!testUrl.startsWith('http')) {
        testUrl = 'https://' + testUrl;
      }

      const urlObj = new URL(testUrl);
      if (!urlObj.host.includes('.')) {
        throw new Error('Invalid host');
      }
    } catch {
      if (siteCookie) {
        const lastVisit = getCookie(CONFIG.LAST_VISIT_COOKIE_NAME, siteCookie);
        if (lastVisit) {
          return {
            redirect: true,
            response: Response.redirect(`${(globalThis as any).thisProxyServerUrlHttps}${lastVisit}/${actualUrlStr}`, 302)
          };
        }
      }
      return {
        redirect: true,
        response: getHTMLResponse(getErrorPageTemplate('URL 格式错误', `无效的网址格式: ${actualUrlStr}`, 400))
      };
    }

    if (!actualUrlStr.startsWith('http') && !actualUrlStr.includes('://')) {
      return {
        redirect: true,
        response: Response.redirect(`${(globalThis as any).thisProxyServerUrlHttps}https://${actualUrlStr}`, 302)
      };
    }

    const actualUrl = new URL(actualUrlStr);

    if (actualUrlStr !== actualUrl.href) {
      return {
        redirect: true,
        response: Response.redirect(`${(globalThis as any).thisProxyServerUrlHttps}${actualUrl.href}`, 302)
      };
    }

    return actualUrl;
  }

  private async processProxyRequest(request: Request, actualUrl: URL, siteCookie: string | null): Promise<Response> {
    const clientHeaders = this.modifyClientHeaders(request.headers, actualUrl);

    const clientBody = await this.modifyClientBody(request, actualUrl);

    const modifiedRequest = new Request(actualUrl, {
      headers: clientHeaders,
      method: request.method,
      body: clientBody,
      redirect: 'manual'
    });

    // 添加超时控制，防止目标站无响应时 Worker 挂起
    const timeoutMs = CONFIG.PERFORMANCE.REQUEST_TIMEOUT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(new Request(modifiedRequest, { signal: controller.signal }));
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        return getHTMLResponse(getErrorPageTemplate('请求超时', `目标站点响应超时（>${timeoutMs / 1000}s）`, 504));
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (response.status.toString().startsWith('3') && response.headers.get('Location')) {
      try {
        const redirectUrl = new URL(response.headers.get('Location')!, actualUrl.href).href;
        return Response.redirect(`${(globalThis as any).thisProxyServerUrlHttps}${redirectUrl}`, 302);
      } catch {
        return getHTMLResponse(
          getErrorPageTemplate('重定向错误', `无法处理重定向: ${response.headers.get('Location')}`, 500)
        );
      }
    }

    return await this.processResponse(response, actualUrl, siteCookie);
  }

  private modifyClientHeaders(headers: Headers, actualUrl: URL): Headers {
    const modifiedHeaders = new Headers();

    // 内部代理 Cookie 名称列表，不应透传给上游站点，避免泄露密码哈希和访问历史
    const internalCookieNames = [
      CONFIG.PASSWORD_COOKIE_NAME,
      CONFIG.LAST_VISIT_COOKIE_NAME,
      CONFIG.PROXY_HINT_COOKIE_NAME
    ];

    headers.forEach((value, key) => {
      if (key.toLowerCase() === 'cookie') {
        // 过滤掉内部 Cookie，只将业务 Cookie 透传给上游
        const filteredCookie = value
          .split(';')
          .map(part => part.trim())
          .filter(part => {
            const cookieName = part.split('=')[0].trim();
            return !internalCookieNames.includes(cookieName);
          })
          .join('; ');

        if (filteredCookie) {
          modifiedHeaders.set(key, replaceProxyUrls(filteredCookie, actualUrl));
        }
        return;
      }

      const newValue = replaceProxyUrls(value, actualUrl);
      modifiedHeaders.set(key, newValue);
    });

    // 设置正确的 Referer 头，避免上游服务器因 Referer 校验拒绝请求
    // 某些资源服务器（如 CDN）会验证 Referer 是否来自同域
    if (!modifiedHeaders.has('Referer')) {
      modifiedHeaders.set('Referer', actualUrl.origin + '/');
    }

    // 设置 Origin 头，某些 API 服务器需要验证
    if (!modifiedHeaders.has('Origin')) {
      modifiedHeaders.set('Origin', actualUrl.origin);
    }

    return modifiedHeaders;
  }

  private async modifyClientBody(request: Request, actualUrl: URL): Promise<ReadableStream | string | null> {
    if (!request.body) return null;

    try {
      const [body1, body2] = request.body.tee();
      const bodyText = await new Response(body1).text();

      if (bodyText.includes((globalThis as any).thisProxyServerUrlHttps) ||
          bodyText.includes((globalThis as any).thisProxyServerUrl_hostOnly)) {
        return bodyText
          .replaceAll((globalThis as any).thisProxyServerUrlHttps, actualUrl.href)
          .replaceAll((globalThis as any).thisProxyServerUrl_hostOnly, actualUrl.host);
      } else {
        return body2;
      }
    } catch {
      return request.body;
    }
  }

  /**
   * 安全读取响应体文本，限制最大大小和读取时间，防止内存溢出和卡死。
   * 当响应体超过 maxSize 或读取超时时抛出错误，调用方应降级为透传。
   */
  private async safeReadText(body: ReadableStream<Uint8Array>, maxSize: number): Promise<string> {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const readTimeout = 10000; // 10 秒读取超时

    try {
      // 使用 Promise.race 实现读取超时
      const readWithTimeout = async (): Promise<string> => {
        while (true) {
          const readPromise = reader.read();
          const timeoutPromise = new Promise<{ done: true; value: undefined }>((_, reject) => {
            setTimeout(() => reject(new Error('Read timeout')), readTimeout);
          });

          const { done, value } = await Promise.race([readPromise, timeoutPromise]) as any;

          if (done) break;

          totalSize += value.length;
          if (totalSize > maxSize) {
            throw new Error(`Response body exceeds maximum size (${maxSize} bytes)`);
          }
          chunks.push(value);
        }

        // 合并所有 chunks 并解码
        const combined = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        return new TextDecoder().decode(combined);
      };

      return await readWithTimeout();
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 根据请求 URL 的文件后缀推断期望的 Content-Type。
   * 用于修正「上游返回 4xx/5xx + text/html 错误页」但实际是 CSS/JS/字体等资源的情况，
   * 避免浏览器因 MIME type mismatch 拒绝加载样式/脚本。
   */
  private getExpectedContentTypeFromUrl(urlPath: string): string | null {
    const lower = urlPath.toLowerCase().split('?')[0];
    const extMap: Record<string, string> = {
      '.css':   'text/css',
      '.js':    'application/javascript',
      '.mjs':   'application/javascript',
      '.cjs':   'application/javascript',
      '.jsx':   'application/javascript',
      '.tsx':   'application/javascript',
      '.ts':    'application/javascript',
      '.json':  'application/json',
      '.xml':   'application/xml',
      '.svg':   'image/svg+xml',
      '.woff':  'font/woff',
      '.woff2': 'font/woff2',
      '.ttf':   'font/ttf',
      '.otf':   'font/otf',
      '.eot':   'application/vnd.ms-fontobject'
    };
    for (const [ext, ct] of Object.entries(extMap)) {
      if (lower.endsWith(ext)) return ct;
    }
    return null;
  }

  private async processResponse(response: Response, actualUrl: URL, siteCookie: string | null): Promise<Response> {
    const contentType = response.headers.get('Content-Type') || '';
    const hasProxyHintCookie = getCookie(CONFIG.PROXY_HINT_COOKIE_NAME, siteCookie) !== '';

    // ── 错误响应的 Content-Type 修正 ──────────────────────────────────────────
    // 场景：上游对 CSS/JS/字体等资源请求返回了 4xx/5xx + Content-Type: text/html 错误页。
    // 例如：assets.jable.tv/app.css?15 → 403 + text/html（IP 被封）
    // 此时浏览器发现 <link rel=stylesheet> 的响应 CT 是 text/html，会报 MIME 错误并拒绝加载。
    // 修正策略：根据 URL 后缀推断应有的 CT，用空 body 替换错误页，保持正确的 MIME 类型。
    // 这样浏览器不报 MIME 错误，仅静默失败（样式/脚本缺失），不影响页面其他内容正常加载。
    if (response.status >= 400 && contentType.includes('text/html')) {
      const expectedCt = this.getExpectedContentTypeFromUrl(actualUrl.pathname);
      if (expectedCt && !expectedCt.includes('html')) {
        const errorResponse = new Response('', {
          status: response.status,
          statusText: response.statusText,
          headers: { 'Content-Type': expectedCt }
        });
        this.removeRestrictiveHeaders(errorResponse, hasProxyHintCookie);
        return errorResponse;
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    let modifiedResponse: Response;
    let isHTML = false;

    const isTextContent = contentType.startsWith('text/');

    // octet-stream 需要特殊处理：只有当 URL 后缀明确为脚本文件时，才尝试读文本做 JS 升级。
    // 否则直接 passthrough，避免 .text() 破坏字体/PDF/二进制下载文件的内容。
    const urlPath = actualUrl.pathname.toLowerCase();
    const isLikelyScriptByUrl = /\.(js|mjs|ts|jsx|tsx|cjs)([?#]|$)/.test(urlPath);
    const isOctetStream = contentType === 'application/octet-stream';
    const isTypescript = contentType.includes('application/x-typescript') ||
                         contentType.includes('application/typescript');

    const isPotentialHTML = contentType.includes('html') ||
                           contentType.includes('javascript') ||
                           contentType === '' ||
                           (isOctetStream && isLikelyScriptByUrl) || // octet-stream 仅在 URL 像脚本时才读文本
                           isTypescript;

    // 响应体大小预检：超出 MAX_RESPONSE_SIZE 直接透传，避免 Worker 内存溢出
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    const maxSize = CONFIG.PERFORMANCE.MAX_RESPONSE_SIZE;
    const isLargeFile = contentLength > 0 && contentLength > maxSize;

    // 对于 JS/CSS 等文本资源，如果文件过大（>5MB），直接透传避免内存问题
    // 同时也避免处理超大 JS 文件导致的超时
    const maxTextProcessSize = 5 * 1024 * 1024; // 5MB
    const isTooLargeForTextProcessing = contentLength > maxTextProcessSize;

    if (isLargeFile || isTooLargeForTextProcessing) {
      const passthrough = new Response(response.body, response);
      this.processCookies(passthrough, actualUrl, false, hasProxyHintCookie);
      this.removeRestrictiveHeaders(passthrough, hasProxyHintCookie);
      return passthrough;
    }

    // 对于没有 content-length 的响应，使用流式读取并限制大小
    if (response.body && (isTextContent || isPotentialHTML)) {
      // 克隆 body，以便在读取失败时可以降级透传
      const [bodyForRead, bodyForFallback] = response.body.tee();

      // 安全读取文本，限制最大大小防止内存溢出
      const maxSafeTextSize = 5 * 1024 * 1024; // 5MB
      let body: string;

      try {
        body = await this.safeReadText(bodyForRead, maxSafeTextSize);
      } catch {
        // 如果读取失败（文件过大），使用备份的 body 透传
        const passthrough = new Response(bodyForFallback, response);
        this.processCookies(passthrough, actualUrl, false, hasProxyHintCookie);
        this.removeRestrictiveHeaders(passthrough, hasProxyHintCookie);
        return passthrough;
      }

      const actualContentType = this.detectActualContentType(body, contentType);

      // isHTML 的判断必须同时满足：
      // 1. detectActualContentType 升级到 text/html（contentType 为空或 octet-stream 时才会发生）
      // 2. body 真的包含 <html 标签
      // 关键：如果上游声明了明确的非 HTML 类型（text/css、application/json 等），
      // detectActualContentType 会直接 return 原始类型，actualContentType 不含 text/html，
      // 所以 isHTML 永远为 false，不会强制覆盖 Content-Type。
      isHTML = actualContentType.includes('text/html') && body.includes('<html');

      if (actualContentType.includes('html') || actualContentType.includes('javascript')) {
        body = body.replaceAll('window.location', `window.${CONFIG.REPLACE_URL_OBJ}`);
        body = body.replaceAll('document.location', `document.${CONFIG.REPLACE_URL_OBJ}`);
      }

      if (isHTML) {
        body = await this.injector.injectHTML(body, actualUrl.href, hasProxyHintCookie);
      } else if (isTextContent || actualContentType.includes('javascript')) {
        body = this.injector.replaceURLsInText(body);
      }

      // 用解码后的明文 body 构建响应时，必须去除原始的 Content-Encoding 和 Content-Length，
      // 否则浏览器会把明文当作 gzip 等格式再次解码，导致乱码。
      modifiedResponse = new Response(body, response);
      modifiedResponse.headers.delete('content-encoding');
      modifiedResponse.headers.delete('content-length');

      if (isHTML) {
        // 确保 HTML 响应有正确的 Content-Type，防止浏览器 MIME 嗅探出错
        modifiedResponse.headers.set('Content-Type', 'text/html; charset=utf-8');
      } else if (!contentType && actualContentType && actualContentType !== 'text/plain') {
        // contentType 为空时，补全由 detectActualContentType 推断出的类型
        modifiedResponse.headers.set('Content-Type', actualContentType);
      }
      // 注意：contentType 有值（如 text/css）时不做任何 set，保持原始 Content-Type 不变
    } else {
      modifiedResponse = new Response(response.body, response);
    }

    this.processCookies(modifiedResponse, actualUrl, isHTML, hasProxyHintCookie);

    this.removeRestrictiveHeaders(modifiedResponse, hasProxyHintCookie);

    return modifiedResponse;
  }

  private detectActualContentType(body: string, declaredContentType: string): string {
    if (declaredContentType.includes('text/html')) {
      return declaredContentType;
    }

    // 已有明确的非 HTML content-type 时，直接沿用，不做任何升级
    // 防止 CSS/JS/JSON 文件被误判为 text/html，导致浏览器 MIME 检查失败（ERR: not a supported stylesheet MIME type）
    if (declaredContentType &&
        declaredContentType !== 'application/octet-stream' &&
        !declaredContentType.includes('application/x-typescript') &&
        !declaredContentType.includes('application/typescript')) {
      return declaredContentType;
    }

    const trimmedBody = body.trim();

    // 只有在 contentType 完全未声明（空串）时，才凭结构特征升级为 HTML。
    // octet-stream / typescript 类型不在此处升级为 HTML（它们会在下方尝试升级为 JS）。
    // 这防止了上游用 octet-stream 返回 HTML 错误页时，代理错误地注入 JS 脚本的问题。
    if (!declaredContentType &&
        (trimmedBody.startsWith('<!DOCTYPE') ||
         trimmedBody.startsWith('<html') ||
         trimmedBody.startsWith('<HTML') ||
         (trimmedBody.startsWith('<') && trimmedBody.includes('<head') && trimmedBody.includes('<body')))) {
      return 'text/html; charset=utf-8';
    }

    // JS 类型升级：必须上游已声明为 octet-stream 或 typescript，不凭内容特征猜测
    if (declaredContentType === 'application/octet-stream' ||
        declaredContentType.includes('application/x-typescript') ||
        declaredContentType.includes('application/typescript')) {
      if (trimmedBody.startsWith('<script') || trimmedBody.startsWith('(function') ||
          trimmedBody.startsWith('!function') || trimmedBody.startsWith('define(') ||
          trimmedBody.startsWith('export ') || trimmedBody.startsWith('import ')) {
        return 'application/javascript; charset=utf-8';
      }
    }

    return declaredContentType || 'text/plain';
  }

  private processCookies(response: Response, actualUrl: URL, isHTML: boolean, hasProxyHintCookie: boolean): void {
    const headers = response.headers;

    // 使用 getAll 正确获取所有 Set-Cookie header（CF Workers 支持）
    // headers.entries() 对多个同名 header 可能只保留最后一个
    let rawCookies: string[];
    if (typeof (headers as any).getAll === 'function') {
      rawCookies = (headers as any).getAll('set-cookie');
    } else {
      // 降级：从 entries 收集
      rawCookies = [];
      for (const [key, value] of headers.entries()) {
        if (key.toLowerCase() === 'set-cookie') {
          rawCookies.push(value);
        }
      }
    }

    if (rawCookies.length > 0) {
      // 删除原有 Set-Cookie，重新逐条 append
      headers.delete('set-cookie');

      rawCookies.forEach(rawCookie => {
        // 修复：直接用 split(',') 会把 expires 日期中的逗号（如 "Thu, 01 Jan..."）误作分隔符
        const cookies = this.splitSetCookieHeader(rawCookie);

        cookies.forEach(cookieStr => {
          const parts = cookieStr.split(';').map(part => part.trim());

          // 修复 Cookie Path：将上游 path 转换为代理前缀路径
          // 例如上游 path=/user → 代理 path=/https://github.com/user
          const pathIndex = parts.findIndex(part => part.toLowerCase().startsWith('path='));
          let originalPath = '/';
          if (pathIndex !== -1) {
            originalPath = parts[pathIndex].substring('path='.length) || '/';
          }
          // 拼接为代理路径：/origin + originalPath（确保 originalPath 以 / 开头）
          const normalizedPath = originalPath.startsWith('/') ? originalPath : '/' + originalPath;
          const proxyPath = '/' + actualUrl.origin + normalizedPath;

          if (pathIndex !== -1) {
            parts[pathIndex] = `Path=${proxyPath}`;
          } else {
            parts.push(`Path=${proxyPath}`);
          }

          // 将 domain 替换为代理域名
          const domainIndex = parts.findIndex(part => part.toLowerCase().startsWith('domain='));
          if (domainIndex !== -1) {
            parts[domainIndex] = `Domain=${(globalThis as any).thisProxyServerUrl_hostOnly}`;
          } else {
            parts.push(`Domain=${(globalThis as any).thisProxyServerUrl_hostOnly}`);
          }

          headers.append('Set-Cookie', parts.join('; '));
        });
      });
    }

    if (isHTML && response.status === 200) {
      // HttpOnly 防止代理页面 JS 读取访问历史；Secure 确保仅 HTTPS 传输
      const lastVisitCookie = `${CONFIG.LAST_VISIT_COOKIE_NAME}=${actualUrl.origin}; Path=/; Domain=${(globalThis as any).thisProxyServerUrl_hostOnly}; HttpOnly; Secure; SameSite=Lax`;
      headers.append('Set-Cookie', lastVisitCookie);

      if (!hasProxyHintCookie) {
        const expiryDate = new Date();
        expiryDate.setTime(expiryDate.getTime() + 24 * 60 * 60 * 1000);
        const hintCookie = `${CONFIG.PROXY_HINT_COOKIE_NAME}=1; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax; Secure`;
        headers.append('Set-Cookie', hintCookie);
      }
    }
  }

  /**
   * 正确分割 Set-Cookie 响应头中的多个 Cookie 值。
   * 不能直接 split(',')，因为 expires 日期（如 "Thu, 01 Jan 1970"）内含合法逗号。
   * 策略：逗号后若以星期缩写开头则认为是日期延续，否则若符合 "name=" 格式则视为新 Cookie。
   */
  private splitSetCookieHeader(header: string): string[] {
    const result: string[] = [];
    const parts = header.split(',');
    let current = parts[0];

    for (let i = 1; i < parts.length; i++) {
      const trimmed = parts[i].trimStart();
      const isDateContinuation = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(trimmed);
      const looksLikeNewCookie = /^[^=;\s]+\s*=/.test(trimmed);

      if (!isDateContinuation && looksLikeNewCookie) {
        result.push(current.trim());
        current = parts[i];
      } else {
        current += ',' + parts[i];
      }
    }
    result.push(current.trim());
    return result;
  }

  private removeRestrictiveHeaders(response: Response, hasProxyHintCookie: boolean): void {
    const headers = response.headers;

    headers.set('Access-Control-Allow-Origin', '*');
    // X-Frame-Options 已在 REMOVE_HEADERS 中统一删除，此处不再重复设置

    CONFIG.HEADERS.REMOVE_HEADERS.forEach(header => {
      headers.delete(header);
    });

    if (!hasProxyHintCookie) {
      headers.set('Cache-Control', 'max-age=0');
    }

    Object.entries(getUnrestrictedCorsHeaders()).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }
}
