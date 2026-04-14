const axios = require("axios");

// ================================================================
// SEQUENTIAL MESSAGE QUEUE
// Ensures messages are sent one-by-one across all concurrent requests
// ================================================================
const messageQueue = [];
let isProcessingQueue = false;

/**
 * Processes the global message queue sequentially.
 */
const processQueue = async () => {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    while (messageQueue.length > 0) {
        const { apiUrl, payload, headers, resolve, reject } = messageQueue.shift();
        try {
            const response = await axios.post(apiUrl, payload, { headers });
            
            // Delay between messages (e.g. 800ms) to ensure "one-by-one" requirement
            await new Promise(r => setTimeout(r, 800));
            
            resolve(response.data);
        } catch (error) {
            console.error(`[WHATSAPP-QUEUE] Failed to send to ${payload.to}:`, error.response?.data || error.message);
            reject(error);
        }
    }

    isProcessingQueue = false;
};

/**
 * Adds a message to the global queue and returns a promise that resolves when sent.
 */
const enqueueMessage = (apiUrl, payload, headers) => {
    return new Promise((resolve, reject) => {
        messageQueue.push({ apiUrl, payload, headers, resolve, reject });
        processQueue();
    });
};

/**
 * WhatsApp notification service using Meta WhatsApp Cloud API.
 */
const whatsappShareService = async (docDetails, pageAccessDetails = [], targetPage = '') => {
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

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
                finalDocDetails.order_type          = finalDocDetails.order_type          || order.order_type;
                finalDocDetails.do_date             = finalDocDetails.do_date             || order.delivery_date || order.party_so_date;
                finalDocDetails.customer_name       = finalDocDetails.customer_name       || order.customer_name;
                finalDocDetails.oil_type            = finalDocDetails.oil_type            || order.oil_type;
                finalDocDetails.rate_15_kg          = finalDocDetails.rate_15_kg          || order.rate_per_15kg;
                finalDocDetails.rate_1_ltr          = finalDocDetails.rate_1_ltr          || order.rate_per_ltr;
                finalDocDetails.order_punch_remarks = finalDocDetails.order_punch_remarks || order.order_punch_remarks;
            }
        } catch (dbErr) {
            console.error('[WHATSAPP-NOTIFY] Failed to fetch order details', dbErr);
        }
    }

    const isPreApproval = finalDocDetails?.order_type?.toLowerCase() === 'pre approval';
    const templateName  = isPreApproval ? 'order_preapproval_notify' : 'order_dispatch_notify';

    const cleanParam = (val, fallback = '-') => {
        if (!val) return fallback;
        return String(val)
            .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
            .replace(/[\u2600-\u27FF]/gu, '')
            .replace(/\*/g, '')
            .replace(/\s*\(.*?\)\s*$/, '')
            .trim() || fallback;
    };

    const buildTemplateComponents = () => {
        if (isPreApproval) {
            return [{
                type: "body",
                parameters: [
                    { type: "text", text: cleanParam(finalDocDetails?.stage,              'Pre-Approval') },
                    { type: "text", text: cleanParam(finalDocDetails?.order_type,         'Pre Approval') },
                    { type: "text", text: cleanParam(finalDocDetails?.do_date,            '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.do_number,          '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.customer_name,      '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.oil_type,           '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.rate_15_kg,         '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.rate_1_ltr,         '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.order_punch_remarks,'-') },
                ]
            }];
        } else {
            return [{
                type: "body",
                parameters: [
                    { type: "text", text: cleanParam(finalDocDetails?.stage,              'New Order') },
                    { type: "text", text: cleanParam(finalDocDetails?.order_type,         '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.do_date,            '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.do_number,          '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.customer_name,      '-') },
                    { type: "text", text: cleanParam(finalDocDetails?.order_punch_remarks,'-') },
                ]
            }];
        }
    };

    let lastResponse = null;

    // Loop over recipients and enqueue messages
    for (const recipient of recipients) {
        if (!recipient.phone_no) continue;

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

        if (hasModifyAccess) {
            let cleanPhone = recipient.phone_no.replace(/[\s\+\-\(\)]/g, '');
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

                console.log(`[WHATSAPP] ⚡ Enqueuing "${templateName}" to "${recipient.username}" (${cleanPhone})...`);
                
                // Use the sequential queue
                lastResponse = await enqueueMessage(apiUrl, payload, headers);
                
                console.log(`[WHATSAPP] ✅ Message sent to "${recipient.username}" (${cleanPhone})`);
            } catch (err) {
                console.error(`[WHATSAPP] ❌ Failed for "${recipient.username}" (${cleanPhone}):`, err.message);
            }
        }
    }

    if (DEBUG_MODE) console.log(`[WHATSAPP-DEBUG] === FINISHED NOTIFICATION PROCESS ===\n`);
    return lastResponse;
};

module.exports = { whatsappShareService };