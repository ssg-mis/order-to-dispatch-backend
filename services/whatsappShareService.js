const axios = require("axios");

/**
 * WhatsApp send engine (Meta Cloud API).
 *
 * Recipients arrive already access-filtered by stageNotifier (who to notify).
 * This layer builds the `order_dispatch_notify` template and delivers it.
 *
 * Template `order_dispatch_notify` (5 body params, in this exact order):
 *   {{1}} Customer   {{2}} DO No.   {{3}} DO Date   {{4}} Next Stage   {{5}} Processed By (previous-stage doer)
 *
 * Safety flags:
 *   WHATSAPP_ENABLED=false           -> no-op (unless dry-run)
 *   WHATSAPP_DRY_RUN=true            -> build + log, never call Meta
 *   WHATSAPP_TEST_OVERRIDE_NUMBER=n  -> compute + LOG the real intended
 *       recipients, but deliver every message to `n` ONLY (test safety — no
 *       real user is messaged while this is set).
 */
const whatsappShareService = async (docDetails = {}, recipients = [], targetPage = '') => {
  const DRY_RUN = String(process.env.WHATSAPP_DRY_RUN).toLowerCase() === 'true';
  const overrideNumber = process.env.WHATSAPP_TEST_OVERRIDE_NUMBER?.trim();

  if (process.env.WHATSAPP_ENABLED === 'false' && !DRY_RUN) {
    console.log('[WHATSAPP] Disabled via WHATSAPP_ENABLED — skipping notification');
    return null;
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const headerImageUrl = process.env.WHATSAPP_HEADER_IMAGE_URL?.trim();
  if (!DRY_RUN && (!accessToken || !phoneNumberId)) {
    throw new Error("Meta WhatsApp Cloud API credentials not configured");
  }

  const apiUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const TEMPLATE = 'order_dispatch_notify';

  // WhatsApp rejects newlines/tabs and 5+ consecutive spaces in template params.
  const clean = (val, fb = '-') => {
    if (val == null || val === '') return fb;
    return String(val)
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[☀-⟿]/gu, '')
      .replace(/[\n\r\t]/g, ' ')
      .replace(/\s{5,}/g, '    ')
      .trim() || fb;
  };

  const buildComponents = () => {
    const components = [];
    if (headerImageUrl) {
      components.push({ type: "header", parameters: [{ type: "image", image: { link: headerImageUrl } }] });
    }
    components.push({
      type: "body",
      parameters: [
        { type: "text", text: clean(docDetails.customer_name) },
        { type: "text", text: clean(docDetails.do_number) },
        { type: "text", text: clean(docDetails.do_date) },
        { type: "text", text: clean(docDetails.next_stage || targetPage) },
        { type: "text", text: clean(docDetails.processed_by) },
      ],
    });
    return components;
  };

  const intended = (recipients || []).filter((r) => r && r.phone_no);
  const intendedLabel = intended.map((r) => `${r.username || '?'}(${r.phone_no})`).join(', ') || 'none';

  // Test-override: redirect ALL delivery to one number, but log who WOULD have
  // been messaged so recipient targeting is still verifiable.
  let targets;
  if (overrideNumber) {
    console.log(`[WHATSAPP][OVERRIDE] intended recipients for "${targetPage}": ${intendedLabel} => redirecting to ${overrideNumber} ONLY`);
    targets = intended.length ? [{ phone_no: overrideNumber, username: 'TEST-OVERRIDE' }] : [];
  } else {
    targets = intended;
  }

  if (targets.length === 0) {
    console.log('[WHATSAPP] no recipients — nothing to send');
    return null;
  }

  const sendResults = await Promise.allSettled(
    targets.map(async (t) => {
      let phone = String(t.phone_no || '').replace(/[\s+\-()]/g, '');
      if (phone.length === 10) phone = `91${phone}`;

      const payload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: { name: TEMPLATE, language: { code: "en" }, components: buildComponents() },
      };

      if (DRY_RUN) {
        console.log(`[WHATSAPP][DRY-RUN] would send "${TEMPLATE}" to ${t.username} (${phone}) — payload ${JSON.stringify(payload)}`);
        return { dryRun: true, to: phone, username: t.username };
      }

      try {
        const resp = await axios.post(apiUrl, payload, { headers, timeout: 10000 });
        console.log(`[WHATSAPP] ✅ sent to ${t.username} (${phone}) — id ${resp.data?.messages?.[0]?.id || '?'}`);
        return resp.data;
      } catch (err) {
        console.error(`[WHATSAPP] ❌ failed for ${t.username} (${phone}):`, JSON.stringify(err.response?.data || err.message));
        return null;
      }
    })
  );

  return sendResults.find((r) => r.status === 'fulfilled' && r.value)?.value || null;
};

module.exports = { whatsappShareService };
