/**
 * Service to discover and format phone numbers from dynamic attribute sets.
 * Mirrors the logic used in the core Campaign Import consumer for consistency.
 */
export class PhoneDiscoveryService {
  private static readonly PHONE_KEYWORDS = [
    'waid', 'phonenumber', 'phone', 'phoneno', 'contact', 'mobile',
    'telephone', 'mobileno', 'phonenumbertextformat', 'phonecolumn',
    'destination', 'recipient', 'callto', 'receiver'
  ];

  /**
   * Identifies the most likely phone number field in a set of attributes
   * and returns it in E.164 format.
   */
  static getE164Phone(attributes: Record<string, unknown>): string | null {
    const keys = Object.keys(attributes);
    
    const phoneKey = keys.find(k => {
      const normalized = k.toLowerCase().trim().replace(/[\s_-]/g, '');
      return this.PHONE_KEYWORDS.some(kw => normalized.includes(kw));
    });

    if (!phoneKey) {
      return null;
    }

    const rawValue = attributes[phoneKey];
    if (rawValue == null) return null;

    // Extract digits
    const digits = String(rawValue).replace(/\D/g, '');
    
    if (!digits) return null;

    // Ensure E.164 (starts with +)
    // If the original string had a +, preserve it. Otherwise, assume it needs one.
    const originalString = String(rawValue).trim();
    return originalString.startsWith('+') ? `+${digits}` : `+${digits}`;
  }
}
