const { whatsappShareService } = require("../services/whatsappShareService");

const whatsappShare = async (req, res) => {
    const { phone, docDetails } = req.body;
    if(!phone || !docDetails) {
        return res.status(400).json({
            success: false,
            message: "Phone or Document is required"
        });
    }

    try {
        const result = await whatsappShareService(phone, docDetails, req.pageAccessDetails);
        return res.status(200).json({
            success: true,
            message: "Message sent successfully",
            data: result
        });
    }
    catch(error) {
        console.error("[WHATSAPP] Share error:", error);
        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        });
    }
};

module.exports = { whatsappShare };