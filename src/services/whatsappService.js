/**
 * WhatsApp Cloud API (Meta) — server-side only.
 *
 * Bill PDFs must use the Media Upload API (multipart POST), then template header
 * document.id — never a public URL / link parameter.
 */

import { getWhatsAppConfig } from '../lib/whatsapp/config.js';

const DEFAULT_TEMPLATE_LANGUAGE = 'en_US';

/**
 * @param {string} to E.164 digits only (e.g. 919876543210), no leading +
 */
export function normalizeRecipientPhone(to) {
  const digits = String(to ?? '').replace(/\D/g, '');
  if (!digits) {
    throw new Error('Recipient phone number is required.');
  }
  return digits;
}

/**
 * Media Upload API: POST graph.facebook.com/{version}/{phone-number-id}/media
 *
 * @param {ReturnType<typeof getWhatsAppConfig>} config
 */
export function mediaUploadUrl(config) {
  return `${config.graphApiBaseUrl}/${config.phoneNumberId}/media`;
}

/**
 * Messages API: POST graph.facebook.com/{version}/{phone-number-id}/messages
 *
 * @param {ReturnType<typeof getWhatsAppConfig>} config
 * @param {string} [path]
 */
export function messagesUrl(config, path = '/messages') {
  return `${config.graphApiBaseUrl}/${config.phoneNumberId}${path}`;
}

/**
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} mimeType
 */
function formFilePart(buffer, filename, mimeType) {
  if (typeof File !== 'undefined') {
    return new File([buffer], filename, { type: mimeType });
  }
  return new Blob([buffer], { type: mimeType });
}

/**
 * Upload binary media via Meta Media Upload API (multipart/form-data).
 * Returns media_id used in template document headers — not a URL.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 *
 * @param {object} params
 * @param {Buffer} params.buffer Raw file bytes (e.g. generated PDF)
 * @param {string} params.mimeType e.g. application/pdf
 * @param {string} params.filename e.g. bill-table-5-abc123.pdf
 * @param {ReturnType<typeof getWhatsAppConfig>} [params.config]
 * @returns {Promise<string>} media_id from Meta
 */
export async function uploadMedia({ buffer, mimeType, filename, config: cfg }) {
  try {
    const config = cfg ?? getWhatsAppConfig();
    if (!buffer?.length) {
      throw new Error('Cannot upload empty media file.');
    }

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    const filePart = formFilePart(buffer, filename, mimeType);
    if (filePart instanceof Blob && !(filePart instanceof File)) {
      form.append('file', filePart, filename);
    } else {
      form.append('file', filePart);
    }

    const res = await fetch(mediaUploadUrl(config), {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.accessToken}` },
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    const mediaId = data.id;

    if (!res.ok || !mediaId) {
      const detail =
        data?.error?.message ||
        data?.error?.error_user_msg ||
        JSON.stringify(data?.error || data);
      throw new Error(`WhatsApp Media Upload API failed (${res.status}): ${detail}`);
    }

    return mediaId;
  } catch (err) {
    throw err;
  }
}

/**
 * Template header for a native in-chat PDF (document.id from Media Upload — no link).
 *
 * @param {string} mediaId
 * @param {string} filename
 */
export function buildDocumentHeaderComponent(mediaId, filename) {
  return {
    type: 'header',
    parameters: [
      {
        type: 'document',
        document: {
          id: mediaId,
          filename,
        },
      },
    ],
  };
}

/**
 * @param {object} params
 * @param {ReturnType<typeof getWhatsAppConfig>} [params.config]
 * @param {Record<string, unknown>} params.body
 */
async function graphRequest({ config: cfg, body }) {
  try {
    const config = cfg ?? getWhatsAppConfig();
    const res = await fetch(messagesUrl(config), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail =
        data?.error?.message ||
        data?.error?.error_user_msg ||
        JSON.stringify(data?.error || data);
      throw new Error(`WhatsApp API error (${res.status}): ${detail}`);
    }

    return data;
  } catch (err) {
    throw err;
  }
}

/**
 * Send an approved template message.
 */
export async function sendTemplateMessage({
  to,
  templateName,
  languageCode,
  components,
  config,
}) {
  try {
    const cfg = config ?? getWhatsAppConfig();
    const recipient = normalizeRecipientPhone(to);
    const lang = languageCode ?? cfg.templateLanguage ?? DEFAULT_TEMPLATE_LANGUAGE;

    const template = {
      name: templateName,
      language: { code: lang },
    };
    if (components?.length) {
      template.components = components;
    }

    return graphRequest({
      config: cfg,
      body: {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template,
      },
    });
  } catch (err) {
    throw err;
  }
}

/**
 * Send the configured "bill" template to a customer.
 */
export async function sendBillTemplate({ to, components, languageCode, config }) {
  try {
    const cfg = config ?? getWhatsAppConfig();
    return sendTemplateMessage({
      to,
      templateName: cfg.billTemplateName,
      languageCode: languageCode ?? cfg.templateLanguage,
      components,
      config: cfg,
    });
  } catch (err) {
    throw err;
  }
}

/**
 * Send a plain text message (only within the 24-hour customer service window).
 */
export async function sendTextMessage({ to, text, config }) {
  try {
    const cfg = config ?? getWhatsAppConfig();
    const recipient = normalizeRecipientPhone(to);

    return graphRequest({
      config: cfg,
      body: {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { body: String(text) },
      },
    });
  } catch (err) {
    throw err;
  }
}

export const whatsappService = {
  normalizeRecipientPhone,
  mediaUploadUrl,
  messagesUrl,
  uploadMedia,
  buildDocumentHeaderComponent,
  sendTemplateMessage,
  sendBillTemplate,
  sendTextMessage,
  getConfig: getWhatsAppConfig,
};
