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
        let hasAccess = false;
        const normalizedTarget = targetPage.toLowerCase().trim();

        if (Array.isArray(users.page_access)) {
            hasAccess = users.page_access.some(p => p.toLowerCase().trim() === normalizedTarget);
        } else if (users.page_access && typeof users.page_access === 'object') {
            hasAccess = Object.keys(users.page_access).some(k =>
                k.toLowerCase().trim() === normalizedTarget && users.page_access[k]
            );
        }

        if (hasAccess) {
            console.log(`[WHATSAPP-NOTIFY] ✅ User "${users.username}" (Original DB Phone: ${users.phone_no}) has access to "${targetPage}".`);

            try {
                response = await axios.post(apiUrl, {
                    to_number: users.phone_no,
                    type: "text",
                    message: textMessage,
                }, { headers });
                console.log(`[WHATSAPP-NOTIFY] API Response:`, JSON.stringify(response.data));
            } catch (apiError) {
                console.error(`[WHATSAPP-NOTIFY] API Error:`, apiError.response?.data || apiError.message);
            }
        } else {
            const currentAccess = JSON.stringify(users.page_access);
            console.log(`[WHATSAPP-NOTIFY] ❌ User "${users.username}" does not have access to "${targetPage}". Current permissions: ${currentAccess}`);
        }
    }

    return response ? response.data : null;
};

module.exports = { whatsappShareService };