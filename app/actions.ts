"use server";

import { generateText, tool, nanoid } from "ai";
import { z } from "zod";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Airtable API constants
const AIRTABLE_API_KEY = "patuiAgEvFzitXyIu.a0fed140f02983ccc3dfeed6c02913b5e2593253cb784a08c3cfd8ac96518ba0";
const AIRTABLE_BASE_ID = "appFf0nHuVTVWRjTa";
const AIRTABLE_ACCOUNTS_TABLE = "Accounts";

export async function continueConversation(history: Message[], record: any = null) {
  try {
    console.log("[LLM] continueConversation - History:", JSON.stringify(history, null, 2));
    console.log("[LLM] Record for context:", JSON.stringify(record, null, 2));

    const initialMessage = record
      ? { role: "assistant", content: `Here's your account: ${JSON.stringify(record)}` }
      : null;

    const result = await generateText({
      model: {
        type: "openai-chat", // Specify the model type
        name: "gpt-4-turbo", // Specify the model name
      },
      system: `You are a Wonderland assistant! 
        Reply with nicely formatted markdown. 
        Keep your replies short and concise. 
        If this is the first reply send a nice welcome message.
        If the selected Account is different mention account or company name once.

        Perform the following actions:
        - Create a new account in Wonderland when the user requests it.
        - Modify an existing account in Wonderland when the user requests it.

        When creating or modifying an account:
        - Extract the required information (e.g., account name, description, or specific fields to update) from the user's input.
        - Ensure all extracted values are sent outside the user message in a structured format.
        - Confirm the action with the user before finalizing.
        
        Log all actions and results.`,
      messages: initialMessage ? [initialMessage, ...history] : history,
      tools: {
        createAccount,
        modifyAccount,
      },
    });

    console.log("[LLM] Result from generateText:", JSON.stringify(result, null, 2));

    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: result.text || "I'm sorry, something went wrong. Please try again.",
        },
      ],
    };
  } catch (error) {
    console.error("[LLM] Error in continueConversation:", error);
    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: `An error occurred while processing your request. Error details: ${error.message}`,
        },
      ],
    };
  }
}
