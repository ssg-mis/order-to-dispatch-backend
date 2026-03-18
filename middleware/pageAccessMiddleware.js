const db = require("../config/db");

const pageAccess = async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT id, username, phone_no, page_access
            FROM login
        `);

        if(!result.rows.length) {
            return res.status(404).json({
                success: false,
                message: "Page access not found"
            });
        }

        req.pageAccessDetails = result.rows;
        console.log(req.pageAccessDetails);
        next();
    }
    catch(error) {
        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        });
    }
};

module.exports = { pageAccess };