const db = require("../config/db");

/**
 * masterTabAccess(tabKey)
 *
 * Enforces master tab permissions. Runs after authMiddleware so req.user is set.
 * Only activates when X-Master-Tab header is present (master page requests).
 * Workflow pages never send X-Master-Tab, so they pass through untouched.
 *
 * Permission logic:
 *  - admin role → always allowed
 *  - features.master_tabs missing → allowed (backward compat for existing users)
 *  - features.master_tabs[tabKey] === true → allowed
 *  - otherwise → 403
 */
const masterTabAccess = (tabKey) => async (req, res, next) => {
  // Only enforce for master-page requests (frontend sends this header only from /master)
  if (!req.headers['x-master-tab']) return next();

  const { id: userId, role } = req.user; // guaranteed set by authMiddleware

  // Only super_admin bypasses tab permission checks
  if (role === 'super_admin') return next();

  try {
    const result = await db.query(
      "SELECT features FROM login WHERE id = $1 AND status = 'active'",
      [userId]
    );

    if (!result.rows.length) {
      return res.status(403).json({ success: false, message: 'User not found or inactive' });
    }

    let featuresObj = result.rows[0].features || {};
    if (typeof featuresObj === 'string') {
      try { featuresObj = JSON.parse(featuresObj); } catch { featuresObj = {}; }
    }

    const masterTabs = featuresObj.master_tabs;

    // No master_tabs config → allow all (backward compat)
    if (!masterTabs || typeof masterTabs !== 'object') return next();

    if (masterTabs[tabKey] === true) return next();

    return res.status(403).json({
      success: false,
      message: `Access denied: you do not have permission to access the '${tabKey}' master tab`
    });
  } catch (error) {
    console.error('masterTabAccess middleware error:', error);
    return res.status(500).json({ success: false, message: 'Access check failed' });
  }
};

module.exports = { masterTabAccess };
