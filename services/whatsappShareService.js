const axios = require("axios");

/**
 * WhatsApp notification service using Meta WhatsApp Cloud API.
 */
const whatsappShareService = async (docDetails, pageAccessDetails = [], targetPage = '') => {
    if (process.env.WHATSAPP_ENABLED === 'false') {
        console.log('[WHATSAPP] Disabled via WHATSAPP_ENABLED flag — skipping notification');
        return null;
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const headerImageUrl = process.env.WHATSAPP_HEADER_IMAGE_URL?.trim();

    if (!accessToken || !phoneNumberId) {
        throw new Error("Meta WhatsApp Cloud API credentials not configured");
    }

    // Meta Cloud API endpoint
    const apiUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
    const headers = {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
    };

    const DEBUG_MODE = true;

    // Handle case where some controllers might pass (phone, docDetails, pageAccess)
    // If the first argument is a string (phone), we swap them or handle it specifically
    let recipients = [];
    let finalDocDetails = docDetails;

    if (typeof docDetails === 'string' && typeof pageAccessDetails === 'object' && !Array.isArray(pageAccessDetails)) {
        // Looks like (phone, docDetails, pageAccess) call
        const phone = docDetails;
        finalDocDetails = pageAccessDetails;
        recipients = [{ phone_no: phone, username: 'Manual Share', has_access: true }];
        if (DEBUG_MODE) console.log(`[WHATSAPP-DEBUG] Detected manual share call with phone: ${phone}`);
    } else if (Array.isArray(pageAccessDetails)) {
        recipients = pageAccessDetails;
    }

    if (DEBUG_MODE) {
        console.log(`\n[WHATSAPP-DEBUG] === STARTING NOTIFICATION PROCESS (Meta Cloud API) ===`);
        console.log(`[WHATSAPP-DEBUG] Target Page: "${targetPage}"`);
        console.log(`[WHATSAPP-DEBUG] Document Details:`, JSON.stringify(finalDocDetails));
        console.log(`[WHATSAPP-DEBUG] Total Users to Check: ${recipients.length}`);
    }

    // Enrichment logic (preserve original)
    if (finalDocDetails.do_number && (!finalDocDetails.order_type || !finalDocDetails.oil_type)) {
        try {
            const db = require('../config/db');
            const result = await db.query(
                'SELECT * FROM order_dispatch WHERE order_no = $1 LIMIT 1',
                [finalDocDetails.do_number]
            );
            if (result.rows.length > 0) {
                const order = result.rows[0];
                finalDocDetails.order_type = finalDocDetails.order_type || order.order_type;
                finalDocDetails.do_date = finalDocDetails.do_date || order.delivery_date || order.party_so_date;
                finalDocDetails.customer_name = finalDocDetails.customer_name || order.customer_name;
                finalDocDetails.oil_type = finalDocDetails.oil_type || order.oil_type;
                finalDocDetails.rate_15_kg = finalDocDetails.rate_15_kg || order.rate_per_15kg;
                finalDocDetails.rate_1_ltr = finalDocDetails.rate_1_ltr || order.rate_per_ltr;
                finalDocDetails.order_punch_remarks = finalDocDetails.order_punch_remarks || order.order_punch_remarks;
            }
        } catch (dbErr) {
            console.error('[WHATSAPP-NOTIFY] Failed to fetch order details', dbErr);
        }
    }

    const orderTypeStr = String(finalDocDetails?.order_type || '').toLowerCase().trim();
    const isPreApproval = orderTypeStr === 'pre approval' || orderTypeStr === 'pre-approval';
    const templateName = isPreApproval ? 'order_preapproval_notify' : 'order_dispatch_notify';

    const cleanParam = (val, fallback = '-') => {
        if (!val) return fallback;
        return String(val)
            .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
            .replace(/[\u2600-\u27FF]/gu, '')
            // Removed .replace(/\*/g, '') to allow basic bolding if supported by template
            .replace(/[\n\r\t]/g, ' ')   // WhatsApp rejects newlines/tabs in template params
            .replace(/\s{5,}/g, '    ')  // WhatsApp rejects 5+ consecutive spaces
            .replace(/\s*\(.*?\)\s*$/, '')
            .trim() || fallback;
    };

    const buildTemplateComponents = () => {
        const components = [];
        
        // Add header image if configured
        if (headerImageUrl) {
            components.push({
                type: "header",
                parameters: [
                    {
                        type: "image",
                        image: { link: headerImageUrl }
                    }
                ]
            });
        }

        if (isPreApproval) {
            components.push({
                type: "body",
                parameters: [
                    { type: "text", text: cleanParam(finalDocDetails?.stage, 'Pre-Approval') },
                    { type: "text", text: cleanParam(finalDocDetails?.order_type, 'Pre Approval') },
                    { type: "text", text: cleanParam(finalDocDetails?.do_date, '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.do_number, '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.customer_name, '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.oil_type, '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.rate_15_kg, '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.rate_1_ltr, '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.order_punch_remarks, '-') },
                ]
            });
        } else {
            components.push({
                type: "body",
                parameters: [
                    { type: "text", text: cleanParam(finalDocDetails?.stage, 'New Order') },
                    { type: "text", text: cleanParam(finalDocDetails?.order_type, '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.do_date, '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.do_number, '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.customer_name, '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.order_punch_remarks, '-') },
                ]
            });
        }
        
        return components;
    };

    // Send to all eligible recipients in parallel — one round-trip total instead of N sequential sends
    const sendResults = await Promise.allSettled(
        recipients
            .filter(recipient => recipient.phone_no)
            .map(async (recipient) => {
                let hasModifyAccess = false;

                // If it's a manual share (recipient.has_access is set) or targetPage is empty, skip access check
                if (recipient.has_access || !targetPage) {
                    hasModifyAccess = true;
                } else {
                    const normalizedTarget = targetPage.toLowerCase().trim();
                    let accessData = recipient.page_access;
                    if (typeof accessData === 'string') {
                        try { accessData = JSON.parse(accessData); }
                        catch (e) { accessData = accessData.split(',').map(s => s.trim()); }
                    }

                    if (Array.isArray(accessData)) {
                        hasModifyAccess = accessData.some(p => p && p.toLowerCase().trim() === normalizedTarget);
                    } else if (accessData && typeof accessData === 'object') {
                        hasModifyAccess = Object.keys(accessData).some(k =>
                            k.toLowerCase().trim() === normalizedTarget &&
                            accessData[k] && accessData[k].toLowerCase().trim() === 'modify'
                        );
                    }
                }

                if (!hasModifyAccess) return null;

                let cleanPhone = String(recipient.phone_no || '').replace(/[\s\+\-\(\)]/g, '');
                if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

                try {
                    const components = buildTemplateComponents();
                    const payload = {
                        messaging_product: "whatsapp",
                        to: cleanPhone,
                        type: "template",
                        template: {
                            name: templateName,
                            language: { code: "en" },
                            components
                        }
                    };

                    console.log(`[WHATSAPP] ⚡ Sending "${templateName}" to "${recipient.username}" (${cleanPhone})...`);
                    console.log(`[WHATSAPP] 📤 Outgoing message payload:`, JSON.stringify(payload, null, 2));

                    const response = await axios.post(apiUrl, payload, { headers, timeout: 10000 });

                    console.log(`[WHATSAPP] ✅ Message sent to "${recipient.username}" (${cleanPhone})`);
                    console.log(`[WHATSAPP] 📥 Meta API response:`, JSON.stringify(response.data, null, 2));

                    return response.data;
                } catch (err) {
                    console.error(`[WHATSAPP] ❌ Failed for "${recipient.username}" (${cleanPhone}):`, err.response?.data || err.message);
                    return null;
                }
            })
    );

    const lastResponse = sendResults.find(result => result.status === 'fulfilled' && result.value)?.value || null;

    if (DEBUG_MODE) console.log(`[WHATSAPP-DEBUG] === FINISHED NOTIFICATION PROCESS ===\n`);
    return lastResponse;
};

module.exports = { whatsappShareService };