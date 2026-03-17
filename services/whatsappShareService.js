const axios = require("axios");

const whatsappShareService = async (phone, docDetails) => {
    const productId = process.env.WHATSAPP_PRODUCT_ID;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const apiToken = process.env.WHATSAPP_API_TOKEN;

    if(!productId || !phoneId || !apiToken) {
        const error = new Error("Maytapi credentials not configured");
        throw error;
    }

    const apiUrl = `https://api.maytapi.com/api/${productId}/${phoneId}/sendMessage`;
    const headers = {
        "x-maytapi-key": apiToken,
        "Content-Type": "application/json",
    };

    const templateLines = [
        docDetails.stage || `📄 *Document Shared*`,
        "",
        `*Order Type:* ${docDetails?.order_type || '-'}`,
        `*DO Date:* ${docDetails?.do_date || '-'}`,
        `*DO Number:* ${docDetails?.do_number || '-'}`,
        `*Customer Name:* ${docDetails?.customer_name || '-'}`,
        `*Oil Type:* ${docDetails?.oil_type || '-'}`,
        `*Rate per 15 Kg:* ₹${docDetails?.rate_15_kg || '-'}`,
        `*Rate per 1 Ltr:* ₹${docDetails?.rate_1_ltr || '-'}`,
        `*Remarks:* ${docDetails?.order_punch_remarks || '-'}`
    ];

    const textMessage = templateLines.join('\n');

    const response = await axios.post(apiUrl, {
        to_number: phone,
        type: "text",
        message: textMessage,
    }, { headers });

    return response.data;
};

module.exports = { whatsappShareService };