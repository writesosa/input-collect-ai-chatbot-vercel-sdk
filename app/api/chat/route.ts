document.getElementById('chatbot-send').addEventListener('click', async () => {
  const inputField = document.getElementById('chatbot-input');
  const message = inputField.value.trim();
  if (message) {
    displayMessage('user', message);
    inputField.value = '';
    try {
      const response = await fetch('https://input-collect-ai-chatbot-vercel-sdk.vercel.app/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: message }] }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantMessage += chunk;
        updateLastAssistantMessage(assistantMessage); // Update in real-time
      }
    } catch (error) {
      console.error('Error:', error);
      displayMessage('assistant', 'An error occurred while processing your request.');
    }
  }
});

function displayMessage(role, content) {
  const messagesContainer = document.getElementById('chatbot-messages');
  const messageElement = document.createElement('div');
  messageElement.textContent = `${role === 'user' ? 'You' : 'Assistant'}: ${content}`;
  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateLastAssistantMessage(content) {
  const messagesContainer = document.getElementById('chatbot-messages');
  const lastMessageElement = messagesContainer.querySelector('div.assistant:last-child');
  if (lastMessageElement) {
    lastMessageElement.textContent = `Assistant: ${content}`;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}
