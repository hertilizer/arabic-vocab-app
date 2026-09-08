const { mountConfigRoutes } = require("./config");
const { mountAiRoutes } = require("./ai");
const { mountWordRoutes } = require("./words");
const { mountExportRoutes } = require("./export");

function mountRoutes(app) {
  mountConfigRoutes(app);
  mountAiRoutes(app);
  mountWordRoutes(app);
  mountExportRoutes(app);
}

module.exports = { mountRoutes };
