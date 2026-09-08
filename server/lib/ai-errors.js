function sendAiError(res, err, fallback) {
  if (err.code === "NO_API_KEY") {
    return res.status(412).json({
      error: "NO_API_KEY",
      message: "Add ANTHROPIC_API_KEY to your .env file to use AI features."
    });
  }
  console.error(err);
  res.status(500).json({ error: fallback, detail: String(err.message || err) });
}

module.exports = { sendAiError };
