/**
 * WhatsApp Cloud API configuration (server-side only).
 * Variables are loaded from process.env — do not prefix with VITE_.
 * @see .env.example
 */

const REQUIRED_KEYS = [
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_BILL_TEMPLATE_NAME',
];

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   phoneNumberId: string;
 *   businessAccountId: string | null;
 *   accessToken: string;
 *   billTemplateName: string;
 *   templateLanguage: string;
 *   apiVersion: string;
 *   graphApiBaseUrl: string;
 * }}
 */
export function getWhatsAppConfig(env = process.env) {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing WhatsApp environment variables: ${missing.join(', ')}. Copy .env.example to .env and set them.`
    );
  }

  const apiVersion = (env.WHATSAPP_API_VERSION || 'v19.0').trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID.trim();

  const billTemplateName = (env.WHATSAPP_BILL_TEMPLATE_NAME || 'bill').trim();
  const templateLanguage = (env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US').trim();

  return {
    phoneNumberId,
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || null,
    accessToken: env.WHATSAPP_ACCESS_TOKEN.trim(),
    billTemplateName,
    templateLanguage,
    restaurantName: (env.WHATSAPP_RESTAURANT_NAME || 'OPULENCE Restaurant').trim(),
    apiVersion,
    graphApiBaseUrl: `https://graph.facebook.com/${apiVersion}`,
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isWhatsAppConfigured(env = process.env) {
  return REQUIRED_KEYS.every((key) => Boolean(env[key]?.trim()));
}
