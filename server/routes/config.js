const POS_LIST = require("../pos-list");
const { hasApiKey } = require("../ai/client");

function mountConfigRoutes(app) {
  app.get("/api/config", (req, res) => {
    res.json({ hasApiKey: hasApiKey(), posList: POS_LIST });
  });
}

module.exports = { mountConfigRoutes };
