const db = require("./config/db");
async function checkAccess() {
    try {
        const result = await db.query("SELECT username, phone_no, page_access FROM login");
        console.log(JSON.stringify(result.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
checkAccess();
