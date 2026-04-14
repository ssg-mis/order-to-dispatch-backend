const { whatsappShareService } = require("../services/whatsappShareService");

const whatsappShare = async (req, res) => {
    const { phone, docDetails } = req.body;
    if (!phone || !docDetails) {
        return res.status(400).json({
            success: false,
            message: "Phone or Document is required"
        });
    }

    try {
        // Correctly pass arguments to the service: (docDetails, pageAccessDetails, targetPage)
        // We create a temporary recipient object for the specific phone number provided
        const recipients = [{ 
            phone_no: phone, 
            username: 'Manual Share', 
            has_access: true 
        }];
        
        const result = await whatsappShareService(docDetails, recipients);
        
        return res.status(200).json({
            success: true,
            message: "Message sent in queue",
            data: result
        });
    }
    catch (error) {
        console.error("[WHATSAPP] Share error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to enqueue message"
        });
    }
};

module.exports = { whatsappShare };