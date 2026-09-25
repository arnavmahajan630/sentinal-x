import type { Tier } from './types';

export const TIER_WEIGHT: Record<Tier, number> = {
  credential: 1,
  financial: 0.9,
  pii: 0.6,
  'pii-broad': 0.3,
};

const CREDENTIAL_CONTAINS =
  /(password|passwd|passphrase|secret|apikey|privatekey|refreshtoken|accesstoken|authtoken|resettoken|verificationtoken|sessiontoken)/;
const CREDENTIAL_EXACT = /^(pwd|hash|hashedpassword|salt|token|otp|pin|sessionid|jwt)$/;
const FINANCIAL_CONTAINS =
  /(cardnumber|creditcard|debitcard|cvv|cvc|iban|accountnumber|routingnumber|bankaccount|paymentdetails|paymentmethod|billinginfo)/;
const FINANCIAL_EXACT = /^(card|payment|payments|balance|billing)$/;
const PII_EXACT =
  /^(email|emailaddress|phone|phonenumber|mobile|ssn|socialsecuritynumber|dob|dateofbirth|birthdate|address|homeaddress|passport|passportnumber|nationalid|customerid|taxid|licensenumber|driverlicense)$/;
const PII_BROAD_EXACT =
  /^(firstname|lastname|fullname|surname|ip|ipaddress|lat|lng|latitude|longitude|location|gender|age)$/;
/** bare `name` is only personal on models that describe people (not Product.name) */
const PERSON_MODEL =
  /(user|customer|profile|person|account|member|employee|patient|contact|client|student|author)/i;

export interface FieldClass {
  tier: Tier;
  weight: number;
}

/** classify a model field path (`paymentDetails.cvv`) by its last segment */
export function classifyField(modelName: string, fieldPath: string): FieldClass | null {
  const last = fieldPath.split('.').pop() ?? fieldPath;
  const n = last.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  if (!n) return null;
  let tier: Tier | null = null;
  if (CREDENTIAL_CONTAINS.test(n) || CREDENTIAL_EXACT.test(n)) tier = 'credential';
  else if (FINANCIAL_CONTAINS.test(n) || FINANCIAL_EXACT.test(n)) tier = 'financial';
  else if (PII_EXACT.test(n)) tier = 'pii';
  else if (PII_BROAD_EXACT.test(n) || (n === 'name' && PERSON_MODEL.test(modelName)))
    tier = 'pii-broad';
  return tier ? { tier, weight: TIER_WEIGHT[tier] } : null;
}

/** env-var / key names that denote secrets */
export const SECRET_NAME_RE =
  /(secret|passw(or)?d|pwd|token|api[_-]?key|apikey|private[_-]?key|credential|salt|auth[_-]?key)/i;
