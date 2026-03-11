const db = require('./config/db');

async function checkDb() {
    try {
        const result = await db.query('SELECT * FROM var_calc ORDER BY calculation_date DESC LIMIT 5');
        console.log('Var Calc Records:', JSON.stringify(result.rows, null, 2));
        process.exit(0);
    } catch (error) {
        console.error('Error checking DB:', error);
        process.exit(1);
    }
}

checkDb();
