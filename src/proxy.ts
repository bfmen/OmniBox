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

  private async processResponse(response: Response, actualUrl: URL, siteCookie: string | null): Promise<Response> {
    const contentType = response.headers.get('Content-Type') || '';
    const hasProxyHintCookie = getCookie(CONFIG.PROXY_HINT_COOKIE_NAME, siteCookie) !== '';

    let modifiedResponse: Response;
    let isHTML = false;

    const isTextContent = contentType.startsWith('text/');
    const isPotentialHTML = contentType.includes('html') ||
                           contentType.includes('javascript') ||
                           contentType === '' ||
                           contentType === 'application/octet-stream' ||
                           contentType.includes('application/x-typescript') ||
                           contentType.includes('application/typescript');

    // 响应体大小预检：超出 MAX_RESPONSE_SIZE 直接透传，避免 Worker 内存溢出
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    const maxSize = CONFIG.PERFORMANCE.MAX_RESPONSE_SIZE;
    if (contentLength > 0 && contentLength > maxSize) {
      const passthrough = new Response(response.body, response);
      this.processCookies(passthrough, actualUrl, false, hasProxyHintCookie);
      this.removeRestrictiveHeaders(passthrough, hasProxyHintCookie);
      return passthrough;
    }

    if (response.body && (isTextContent || isPotentialHTML)) {
      let body = await response.text();

      const actualContentType = this.detectActualContentType(body, contentType);
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

      modifiedResponse = new Response(body, response);

      if (contentType !== actualContentType && isHTML) {
        modifiedResponse.headers.set('Content-Type', 'text/html; charset=utf-8');
      }
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

    const trimmedBody = body.trim();

    // 仅凭 HTML 结构特征升级为 text/html，不依赖 JS 关键字（避免内联 script 的 HTML 被误判为 JS）
    if (trimmedBody.startsWith('<!DOCTYPE') ||
        trimmedBody.startsWith('<html') ||
        trimmedBody.startsWith('<HTML') ||
        (trimmedBody.startsWith('<') && trimmedBody.includes('<head') && trimmedBody.includes('<body'))) {
      return 'text/html; charset=utf-8';
    }

    // JS 类型升级：必须上游已声明为 octet-stream 或 typescript，不凭内容特征猜测
    // 防止含内联 <script> 的 HTML 被误判为 JS，导致跳过 HTML 注入流程
    if (declaredContentType === 'application/octet-stream' ||
        declaredContentType.includes('application/x-typescript') ||
        declaredContentType.includes('application/typescript')) {
      // 只有明确以 script 标签或典型 JS 模块语法开头才升级
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
    const cookieHeaders: Array<{ headerName: string; headerValue: string }> = [];

    for (const [key, value] of headers.entries()) {
      if (key.toLowerCase() === 'set-cookie') {
        cookieHeaders.push({ headerName: key, headerValue: value });
      }
    }

    cookieHeaders.forEach(cookieHeader => {
      // 修复：直接用 split(',') 会把 expires 日期中的逗号（如 "Thu, 01 Jan..."）误作分隔符
      const cookies = this.splitSetCookieHeader(cookieHeader.headerValue);

      for (let i = 0; i < cookies.length; i++) {
        const parts = cookies[i].split(';').map(part => part.trim());

        const pathIndex = parts.findIndex(part => part.toLowerCase().startsWith('path='));
        let originalPath = '/';
        if (pathIndex !== -1) {
          originalPath = parts[pathIndex].substring('path='.length);
        }

        const absolutePath = '/' + new URL(originalPath, actualUrl.href).href;

        if (pathIndex !== -1) {
          parts[pathIndex] = `Path=${absolutePath}`;
        } else {
          parts.push(`Path=${absolutePath}`);
        }

        const domainIndex = parts.findIndex(part => part.toLowerCase().startsWith('domain='));
        if (domainIndex !== -1) {
          parts[domainIndex] = `domain=${(globalThis as any).thisProxyServerUrl_hostOnly}`;
        } else {
          parts.push(`domain=${(globalThis as any).thisProxyServerUrl_hostOnly}`);
        }

        cookies[i] = parts.join('; ');
      }

      headers.set(cookieHeader.headerName, cookies.join(', '));
    });

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
    headers.set('X-Frame-Options', 'ALLOWALL');

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
