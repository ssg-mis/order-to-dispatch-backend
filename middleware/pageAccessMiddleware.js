const { db } = require("../config");

const pageAccess = async (req, res, next) => {
    const { page } = req.body;
    if(!page) {
        return res.status(400).json({
            success: false,
            message: "Specify system page name"
        });
    }

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

        res.pageAccessDetails = result.rows[0];
        next();
    }
    catch(error) {
        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        });
    }
};