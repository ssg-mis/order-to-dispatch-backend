const { skuSellingPriceService, updateSkuSellingPriceService } = require("../services/skuSellingPriceService")

const skuSellingPriceController = async (req, res) => {
    try {
        const result = await skuSellingPriceService(req.query);
        return res.status(200).json({
            success: true,
            data: result
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error?.message || "Something went wrong"
        });
    }
}

const updateSkuSellingPriceController = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await updateSkuSellingPriceService(id, req.body);
        return res.status(200).json({
            success: true,
            message: "Data updated successfully",
            data: result
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error?.message || "Something went wrong"
        });
    }
}

module.exports = { skuSellingPriceController, updateSkuSellingPriceController };
