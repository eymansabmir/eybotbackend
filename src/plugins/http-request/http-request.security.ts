import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { ValidationError } from '../../shared/errors';

interface SecurityPolicy {
  allowHosts: string[];
  denyHosts: string[];
  blockedHeaders: string[];
  allowPrivateIps: boolean;
}

export class HttpRequestSecurityGuard {
  constructor(private readonly policy: SecurityPolicy = loadPolicyFromEnv()) {}

  async validateOutboundRequest(url: string, headers: Record<string, string> = {}): Promise<void> {
    const parsed = this.parseUrl(url);
    this.validateProtocol(parsed.protocol);
    this.validateHostPolicy(parsed.hostname);
    this.validateHeaders(headers);

    if (!this.policy.allowPrivateIps) {
      const addresses = await resolveAddresses(parsed.hostname);
      for (const address of addresses) {
        if (isPrivateOrLocalAddress(address)) {
          throw new ValidationError('Target host resolves to a private or local IP address');
        }
      }
    }
  }

  private parseUrl(url: string): URL {
    try {
      return new URL(url);
    } catch {
      throw new ValidationError('Invalid HTTP request URL');
    }
  }

  private validateProtocol(protocol: string): void {
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new ValidationError('Only http and https protocols are allowed');
    }
  }

  private validateHostPolicy(hostname: string): void {
    const normalizedHost = hostname.toLowerCase();

    if (isLocalHostname(normalizedHost)) {
      throw new ValidationError('Local host targets are not allowed');
    }

    if (this.policy.denyHosts.some((rule) => hostMatchesRule(normalizedHost, rule))) {
      throw new ValidationError('Target host is blocked by security policy');
    }

    if (
      this.policy.allowHosts.length > 0
      && !this.policy.allowHosts.some((rule) => hostMatchesRule(normalizedHost, rule))
    ) {
      throw new ValidationError('Target host is not in the allow list');
    }
  }

  private validateHeaders(headers: Record<string, string>): void {
    for (const headerName of Object.keys(headers)) {
      const normalized = headerName.toLowerCase();
      if (this.policy.blockedHeaders.includes(normalized)) {
        throw new ValidationError(`Header '${headerName}' is not allowed`);
      }
      if (!/^[a-z0-9-]+$/i.test(headerName)) {
        throw new ValidationError(`Header '${headerName}' contains invalid characters`);
      }
    }
  }
}

function loadPolicyFromEnv(): SecurityPolicy {
  const allowHosts = splitCsv(process.env.HTTP_REQUEST_ALLOWED_HOSTS);
  const denyHosts = splitCsv(process.env.HTTP_REQUEST_DENIED_HOSTS);
  const blockedHeaders = splitCsv(process.env.HTTP_REQUEST_BLOCKED_HEADERS);

  return {
    allowHosts,
    denyHosts,
    blockedHeaders: blockedHeaders.length > 0
      ? blockedHeaders
      : ['host', 'content-length', 'transfer-encoding', 'connection'],
    allowPrivateIps: process.env.HTTP_REQUEST_ALLOW_PRIVATE_IPS === 'true',
  };
}

async function resolveAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname) !== 0) {
    return [hostname];
  }

  try {
    const results = await lookup(hostname, { all: true });
    return results.map((entry) => entry.address);
  } catch {
    return [];
  }
}

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === 'localhost.localdomain'
    || hostname.endsWith('.local');
}

function hostMatchesRule(hostname: string, rule: string): boolean {
  if (!rule) return false;
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === rule;
}

function isPrivateOrLocalAddress(address: string): boolean {
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    return isPrivateIpv4(address);
  }
  if (ipVersion === 6) {
    return isPrivateIpv6(address);
  }
  return false;
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [a, b] = octets;
  if (a === undefined || b === undefined) {
    return false;
  }
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  return normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
}
