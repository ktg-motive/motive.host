// Shared domain name validation and normalization.

// FQDN regex: labels 1-63 chars (alphanumeric + hyphens, not starting/ending with hyphen),
// at least two labels, TLD is alphabetic 2-63 chars.
const FQDN_RE =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type DomainValidationResult =
  | { valid: true; domain: string }
  | { valid: false; error: string };

/**
 * Validate and normalize a domain name input.
 * Trims, lowercases, strips trailing dot, and checks FQDN format.
 */
export function validateDomain(input: string): DomainValidationResult {
  const domain = input.trim().toLowerCase().replace(/\.$/, '');

  if (domain.length === 0) {
    return { valid: false, error: 'Domain name is required' };
  }

  if (domain.length > 253) {
    return { valid: false, error: 'Domain name exceeds maximum length' };
  }

  if (!FQDN_RE.test(domain)) {
    return { valid: false, error: 'Invalid domain name format' };
  }

  return { valid: true, domain };
}

/**
 * Validate a domain search query. More lenient — allows bare labels
 * (e.g. "mysite") that will be appended with a TLD later.
 */
export function validateDomainQuery(input: string): DomainValidationResult {
  const query = input.trim().toLowerCase();

  if (query.length === 0) {
    return { valid: false, error: 'Search query is required' };
  }

  if (query.length > 253) {
    return { valid: false, error: 'Search query exceeds maximum length' };
  }

  // Allow bare labels (no dot) — the route will append .com
  if (!query.includes('.')) {
    // Just validate it's a valid label
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(query)) {
      return { valid: false, error: 'Invalid domain name format' };
    }
    return { valid: true, domain: query };
  }

  // Has a dot — validate as FQDN
  const domain = query.replace(/\.$/, '');
  if (!FQDN_RE.test(domain)) {
    return { valid: false, error: 'Invalid domain name format' };
  }

  return { valid: true, domain };
}
