// openai.js
const axios = require('axios');

async function getAIReply(messages) {
  // Normalize messages into new API format
  let formatted;
  if (typeof messages === 'string') {
    formatted = [
      {
        role: 'user',
        content: [{ type: 'text', text: messages }],
      },
    ];
  } else {
    formatted = messages.map(m => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }],
    }));
  }

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini', // <-- use this, new format
      messages: formatted,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const message = response.data.choices[0].message;

  // Handle both new and old response shapes
  if (Array.isArray(message.content)) {
    // New models: array of { type: "text", text: "..." }
    return message.content
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('\n');
  } else if (typeof message.content === 'string') {
    // Old models: plain string
    return message.content;
  } else {
    console.error('Unexpected OpenAI message format:', message);
    return '';
  }
}

module.exports = { getAIReply };
