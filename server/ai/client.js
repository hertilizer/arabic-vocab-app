const Anthropic = require("@anthropic-ai/sdk");

let client = null;

function hasApiKey() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function parseJsonResponse(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

function requireClient() {
  const anthropic = getClient();
  if (!anthropic) {
    throw Object.assign(new Error("No ANTHROPIC_API_KEY configured"), { code: "NO_API_KEY" });
  }
  return anthropic;
}

// 5-minute ephemeral cache. Writes cost 1.25x input; hits cost 0.1x.
// Sonnet 4.5 ignores this silently if the prefix is under 1024 tokens.
function cachedSystem(text) {
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

module.exports = { hasApiKey, getClient, requireClient, parseJsonResponse, cachedSystem };
