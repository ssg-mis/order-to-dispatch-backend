const axios = require("axios");

const whatsappShareService = async (docDetails, pageAccessDetails, targetPage) => {
    const productId = process.env.WHATSAPP_PRODUCT_ID;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const apiToken = process.env.WHATSAPP_API_TOKEN;

    if (!productId || !phoneId || !apiToken) {
        const error = new Error("Maytapi credentials not configured");
        throw error;
    }

    const apiUrl = `https://api.maytapi.com/api/${productId}/${phoneId}/sendMessage`;
    const headers = {
        "x-maytapi-key": apiToken,
        "Content-Type": "application/json",
    };

    // Enable detailed debug logging
    const DEBUG_MODE = process.env.WHATSAPP_DEBUG === 'true' || true;

    if (DEBUG_MODE) {
        console.log(`\n[WHATSAPP-DEBUG] === STARTING NOTIFICATION PROCESS ===`);
        console.log(`[WHATSAPP-DEBUG] Target Page: "${targetPage}"`);
        console.log(`[WHATSAPP-DEBUG] Document Details:`, JSON.stringify(docDetails));
        console.log(`[WHATSAPP-DEBUG] Total Users to Check: ${pageAccessDetails.length}`);
    }

    if (docDetails.do_number && (!docDetails.order_type || !docDetails.oil_type)) {
        try {
            const db = require('../config/db');
            const result = await db.query('SELECT * FROM order_dispatch WHERE order_no = $1 LIMIT 1', [docDetails.do_number]);
            if (result.rows.length > 0) {
                const order = result.rows[0];
                docDetails.order_type = docDetails.order_type || order.order_type;
                docDetails.do_date = docDetails.do_date || order.delivery_date || order.party_so_date;
                docDetails.customer_name = docDetails.customer_name || order.customer_name;
                docDetails.oil_type = docDetails.oil_type || order.oil_type;
                docDetails.rate_15_kg = docDetails.rate_15_kg || order.rate_per_15kg;
                docDetails.rate_1_ltr = docDetails.rate_1_ltr || order.rate_per_ltr;
                docDetails.order_punch_remarks = docDetails.order_punch_remarks || order.order_punch_remarks;
            }
        } catch (dbErr) {
            console.error('[WHATSAPP-NOTIFY] Failed to fetch order details for notifications', dbErr);
        }
    }

    const isRegularOrder = docDetails?.order_type?.toLowerCase() === 'regular';
    const isPreApproval = docDetails?.order_type?.toLowerCase() === 'pre approval';

    const templateLines = [
        docDetails.stage || `📄 *Document Shared*`,
        "",
        `*Order Type:* ${docDetails?.order_type || '-'}`,
        `*DO Date:* ${docDetails?.do_date || '-'}`,
        `*DO Number:* ${docDetails?.do_number || '-'}`,
        `*Customer Name:* ${docDetails?.customer_name || '-'}`,
    ];

    if (isPreApproval) {
        templateLines.push(
            `*Oil Type:* ${docDetails?.oil_type || '-'}`,
            `*Rate per 15 Kg:* ₹${docDetails?.rate_15_kg || '-'}`,
            `*Rate per 1 Ltr:* ₹${docDetails?.rate_1_ltr || '-'}`
        );
    }

    templateLines.push(`*Remarks:* ${docDetails?.order_punch_remarks || '-'}`);

    const textMessage = templateLines.join('\n');

    let response = null;

    for (const users of pageAccessDetails) {
        if (!users.phone_no) continue; // Skip if no phone number exists

        let hasAccess = false;
        const normalizedTarget = targetPage.toLowerCase().trim();

        // Robust parsing of page_access
        let accessData = users.page_access;
        if (typeof accessData === 'string') {
            try {
                accessData = JSON.parse(accessData);
            } catch (e) {
                // If not JSON, try comma separated
                accessData = accessData.split(',').map(s => s.trim());
            }
        }

        if (Array.isArray(accessData)) {
            hasAccess = accessData.some(p => p && typeof p === 'string' && p.toLowerCase().trim() === normalizedTarget);
        } else if (accessData && typeof accessData === 'object') {
            hasAccess = Object.keys(accessData).some(k =>
                k.toLowerCase().trim() === normalizedTarget &&
                accessData[k] &&
                accessData[k].toLowerCase().trim() !== 'view_only'
            );
        }

        if (hasAccess) {
            // Clean up phone number (remove +, spaces, dashes, ensure country code)
            let cleanPhone = users.phone_no.replace(/[\s\+\-\(\)]/g, '');
            if (cleanPhone.length === 10) {
                cleanPhone = `91${cleanPhone}`; // Default to India (+91) if 10 digits
            }

            // Maytapi formatting: usually requires @c.us for individual numbers
            const maytapiNumber = cleanPhone.includes('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;

            if (DEBUG_MODE) {
                console.log(`[WHATSAPP-DEBUG] ✅ Match! User "${users.username}" has access.`);
                console.log(`[WHATSAPP-DEBUG] Original Phone: ${users.phone_no} | Cleaned: ${cleanPhone} | Maytapi ID: ${maytapiNumber}`);
            }

            try {
                const payload = {
                    to_number: 917223820412,
                    type: "text",
                    message: textMessage,
                };

                if (DEBUG_MODE) console.log(`[WHATSAPP-DEBUG] Sending Payload:`, JSON.stringify(payload));

                response = await axios.post(apiUrl, payload, { headers });

                if (DEBUG_MODE) {
                    console.log(`[WHATSAPP-DEBUG] 🟢 API Success for ${users.username}:`, JSON.stringify(response.data));
                }
            } catch (apiError) {
                console.error(`[WHATSAPP-DEBUG] 🔴 API Error for ${users.username}:`, apiError.response?.data || apiError.message);
                if (apiError.response?.status === 400 && DEBUG_MODE) {
                    console.log(`[WHATSAPP-DEBUG] HINT: A 400 error often means the phone number is invalid or not registered on WhatsApp.`);
                }
            }
        } else {
            if (DEBUG_MODE) {
                console.log(`[WHATSAPP-DEBUG] ❌ User "${users.username}" does not have access. Access data:`, JSON.stringify(accessData));
            }
        }
    }

    if (DEBUG_MODE) console.log(`[WHATSAPP-DEBUG] === FINISHED NOTIFICATION PROCESS ===\n`);

    return response ? response.data : null;
};

module.exports = { whatsappShareService };