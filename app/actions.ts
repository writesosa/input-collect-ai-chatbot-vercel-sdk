<div id="chatbot-container" style="border: 1px solid #ccc; padding: 10px; width: 300px;">
  <div id="chatbot-messages" style="height: 200px; overflow-y: auto; border-bottom: 1px solid #ccc; margin-bottom: 10px;"></div>
  <input type="text" id="chatbot-input" placeholder="Type your message..." style="width: 80%;" />
  <button id="chatbot-send" style="width: 18%;">Send</button>
</div>

<script>
  async function fetchAirtableRecord(recordId) {
    console.log(`[LOG] Fetching Airtable record for ID: ${recordId}`);

    const response = await fetch(`https://api.airtable.com/v0/yourBaseId/yourTableName/${recordId}`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer yourAirtableAPIKey',
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      console.error('[LOG] Error fetching Airtable record:', response.statusText);
      return null;
    }

    const data = await response.json();
    console.log('[LOG] Successfully fetched Airtable record:', data);
    return data.fields;
  }

  async function updateAirtableRecord(recordId, newUsername, newPassword) {
    console.log(`[LOG] Updating Airtable record for ID: ${recordId} with new username and password.`);

    const response = await fetch(`https://api.airtable.com/v0/yourBaseId/yourTableName/${recordId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer yourAirtableAPIKey',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          username: newUsername,
          password: newPassword
        }
      })
    });

    if (!response.ok) {
      console.error('[LOG] Error updating Airtable record:', response.statusText);
      return null;
    }

    const updatedData = await response.json();
    console.log('[LOG] Successfully updated Airtable record:', updatedData);
    return updatedData;
  }

  document.getElementById('chatbot-send').addEventListener('click', async () => {
    const inputField = document.getElementById('chatbot-input');
    const message = inputField.value.trim();
    if (message) {
      displayMessage('user', message);
      inputField.value = '';
      
      const urlParams = new URLSearchParams(window.location.search);
      const recordId = urlParams.get('recordId');
      
      if (!recordId) {
        console.error('[LOG] No record ID found in URL.');
        return;
      }

      // Fetch Airtable record and send it to GPT
      const airtableData = await fetchAirtableRecord(recordId);
      
      if (airtableData) {
        const payload = {
          userMessage: message,
          airtableData: airtableData,
        };

        console.log('[LOG] Sending payload to GPT:', payload);

        try {
          const response = await fetch('https://input-collect-ai-chatbot-vercel-sdk.vercel.app/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messages: [{ role: 'user', content: message }], recordData: airtableData }),
          });

          if (!response.body) {
            throw new Error('ReadableStream not supported in this browser.');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let assistantMessage = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            assistantMessage += decoder.decode(value, { stream: true });
            displayMessage('assistant', assistantMessage);
          }

          console.log('[LOG] GPT Response:', assistantMessage);

          // Assuming GPT returns the new username and password as part of the message
          const extractedData = extractUsernameAndPassword(assistantMessage);
          if (extractedData) {
            const { newUsername, newPassword } = extractedData;

            // Update Airtable with the new username and password
            const updatedRecord = await updateAirtableRecord(recordId, newUsername, newPassword);

            if (updatedRecord) {
              console.log('[LOG] Airtable record updated successfully:', updatedRecord);
            }
          }
        } catch (error) {
          console.error('[LOG] Error processing response:', error);
          displayMessage('assistant', 'An error occurred while processing your request.');
        }
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

  function extractUsernameAndPassword(gptResponse) {
    console.log('[LOG] Extracting new username and password from GPT response:', gptResponse);

    // Example logic: Assuming GPT response contains the new username and password
    const usernameMatch = gptResponse.match(/new username: (\S+)/);
    const passwordMatch = gptResponse.match(/new password: (\S+)/);

    if (usernameMatch && passwordMatch) {
      return {
        newUsername: usernameMatch[1],
        newPassword: passwordMatch[1],
      };
    }

    console.error('[LOG] No username or password found in GPT response.');
    return null;
  }

  // On page load, automatically send the Airtable record and an initial message to GPT
  window.addEventListener('load', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const recordId = urlParams.get('recordId');
    
    if (recordId) {
      const airtableData = await fetchAirtableRecord(recordId);
      if (airtableData) {
        const initialMessage = "Here are the details from the Airtable record.";
        const payload = {
          userMessage: initialMessage,
          airtableData: airtableData,
        };

        console.log('[LOG] Automatically sending payload to GPT:', payload);

        try {
          const response = await fetch('https://input-collect-ai-chatbot-vercel-sdk.vercel.app/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messages: [{ role: 'user', content: initialMessage }], recordData: airtableData }),
          });

          if (!response.body) {
            throw new Error('ReadableStream not supported in this browser.');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let assistantMessage = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            assistantMessage += decoder.decode(value, { stream: true });
            displayMessage('assistant', assistantMessage);
          }

          console.log('[LOG] GPT Response:', assistantMessage);

          // Assuming GPT returns the new username and password as part of the message
          const extractedData = extractUsernameAndPassword(assistantMessage);
          if (extractedData) {
            const { newUsername, newPassword } = extractedData;

            // Update Airtable with the new username and password
            const updatedRecord = await updateAirtableRecord(recordId, newUsername, newPassword);

            if (updatedRecord) {
              console.log('[LOG] Airtable record updated successfully:', updatedRecord);
            }
          }
        } catch (error) {
          console.error('[LOG] Error processing response:', error);
          displayMessage('assistant', 'An error occurred while processing your request.');
        }
      }
    }
  });
</script>
