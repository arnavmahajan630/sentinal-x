export interface ServiceInfo {
  name: string;
  category:
    | 'email'
    | 'ai'
    | 'payments'
    | 'sms'
    | 'cloud'
    | 'http'
    | 'cache'
    | 'messaging'
    | 'auth'
    | 'storage';
}

/** package (or scope prefix ending with `/`) → external service. Extend here. */
const TABLE: [string, ServiceInfo][] = [
  ['nodemailer', { name: 'Nodemailer', category: 'email' }],
  ['@sendgrid/', { name: 'SendGrid', category: 'email' }],
  ['mailgun.js', { name: 'Mailgun', category: 'email' }],
  ['mailgun-js', { name: 'Mailgun', category: 'email' }],
  ['openai', { name: 'OpenAI', category: 'ai' }],
  ['@anthropic-ai/sdk', { name: 'Anthropic', category: 'ai' }],
  ['@google/generative-ai', { name: 'Google Generative AI', category: 'ai' }],
  ['@google/genai', { name: 'Google Generative AI', category: 'ai' }],
  ['stripe', { name: 'Stripe', category: 'payments' }],
  ['@stripe/', { name: 'Stripe', category: 'payments' }],
  ['razorpay', { name: 'Razorpay', category: 'payments' }],
  ['twilio', { name: 'Twilio', category: 'sms' }],
  ['aws-sdk', { name: 'AWS', category: 'cloud' }],
  ['@aws-sdk/', { name: 'AWS', category: 'cloud' }],
  ['firebase-admin', { name: 'Firebase', category: 'cloud' }],
  ['firebase', { name: 'Firebase', category: 'cloud' }],
  ['cloudinary', { name: 'Cloudinary', category: 'storage' }],
  ['@slack/', { name: 'Slack', category: 'messaging' }],
  ['redis', { name: 'Redis', category: 'cache' }],
  ['ioredis', { name: 'Redis', category: 'cache' }],
  ['axios', { name: 'HTTP Client', category: 'http' }],
  ['got', { name: 'HTTP Client', category: 'http' }],
  ['node-fetch', { name: 'HTTP Client', category: 'http' }],
  ['cross-fetch', { name: 'HTTP Client', category: 'http' }],
  ['undici', { name: 'HTTP Client', category: 'http' }],
  ['superagent', { name: 'HTTP Client', category: 'http' }],
  ['request', { name: 'HTTP Client', category: 'http' }],
  ['needle', { name: 'HTTP Client', category: 'http' }],
  ['ky', { name: 'HTTP Client', category: 'http' }],
];

export function serviceFor(pkg: string): ServiceInfo | null {
  for (const [key, info] of TABLE) {
    if (key.endsWith('/') ? pkg.startsWith(key) : pkg === key) return info;
  }
  return null;
}
