/**
 * Security utilities for CRUD app
 * Protects against OWASP Top 10 vulnerabilities
 */

// Input validation and sanitization
export const validateInput = (input: string): boolean => {
  // Check for empty or whitespace-only input
  if (!input || !input.trim()) {
    return false;
  }
  
  // Check length limits (prevent DoS attacks)
  if (input.length > 1000) {
    return false;
  }
  
  // Check for potentially malicious patterns
  const maliciousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
    /javascript:/gi, // JavaScript protocol
    /on\w+\s*=/gi, // Event handlers
    /data:text\/html/gi, // Data URLs with HTML
    /vbscript:/gi, // VBScript protocol
    /<iframe/gi, // Iframe tags
    /<object/gi, // Object tags
    /<embed/gi, // Embed tags
    /<link/gi, // Link tags
    /<meta/gi, // Meta tags
    /<style/gi, // Style tags
    /expression\s*\(/gi, // CSS expressions
    /url\s*\(/gi, // CSS url() functions
    /@import/gi, // CSS imports
  ];
  
  return !maliciousPatterns.some(pattern => pattern.test(input));
};

// HTML sanitization - removes potentially dangerous HTML
export const sanitizeHtml = (input: string): string => {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Content Security Policy validation
export const isValidContent = (content: string): boolean => {
  // Additional validation for content
  const trimmed = content.trim();
  
  // Check for SQL injection patterns (even though we're not using SQL)
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(--|\/\*|\*\/|;|'|"|\||&|\+)/g,
  ];
  
  // Check for XSS patterns
  const xssPatterns = [
    /javascript:/gi,
    /vbscript:/gi,
    /onload/gi,
    /onerror/gi,
    /onclick/gi,
    /onmouseover/gi,
    /<script/gi,
    /<\/script>/gi,
    /eval\(/gi,
    /alert\(/gi,
    /confirm\(/gi,
    /prompt\(/gi,
  ];
  
  const hasSqlInjection = sqlPatterns.some(pattern => pattern.test(trimmed));
  const hasXss = xssPatterns.some(pattern => pattern.test(trimmed));
  
  return !hasSqlInjection && !hasXss;
};

// Rate limiting for client-side operations
class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  
  constructor(maxAttempts: number = 10, windowMs: number = 60000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }
  
  isAllowed(key: string): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(key) || [];
    
    // Remove old attempts outside the window
    const validAttempts = attempts.filter(time => now - time < this.windowMs);
    
    if (validAttempts.length >= this.maxAttempts) {
      return false;
    }
    
    validAttempts.push(now);
    this.attempts.set(key, validAttempts);
    
    return true;
  }
  
  reset(key: string): void {
    this.attempts.delete(key);
  }
}

export const rateLimiter = new RateLimiter();

// Generate secure IDs to prevent enumeration attacks
export const generateSecureId = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const moreRandom = Math.random().toString(36).substring(2, 15);
  return `${timestamp}_${random}${moreRandom}`;
};

// Input length validation
export const validateLength = (input: string, maxLength: number = 1000): boolean => {
  return input.length <= maxLength;
};

// Prevent prototype pollution
export const safeObjectCreate = (data: any): any => {
  const safeData = Object.create(null);
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
      safeData[key] = data[key];
    }
  }
  return safeData;
};

// Content validation for different contexts
export const validateForContext = (input: string, context: 'text' | 'attribute' | 'url' = 'text'): boolean => {
  switch (context) {
    case 'text':
      return validateInput(input) && isValidContent(input);
    case 'attribute':
      return validateInput(input) && !/[<>"'&]/g.test(input);
    case 'url':
      try {
        const url = new URL(input);
        return ['http:', 'https:'].includes(url.protocol);
      } catch {
        return false;
      }
    default:
      return validateInput(input);
  }
};

// Security headers simulation (for educational purposes)
export const getSecurityHeaders = () => ({
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com; img-src 'self' data: https:;",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
});

// Audit logging for security events
export const auditLog = (event: string, details: any = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    details: safeObjectCreate(details),
    userAgent: navigator.userAgent,
    url: window.location.href,
  };
  
  // In a real app, this would be sent to a secure logging service
  console.warn('[SECURITY AUDIT]', logEntry);
};