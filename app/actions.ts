"use server";

import { generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import axios from "axios";

const AIRTABLE_API_URL = "https://api.airtable.com/v0/appFf0nHuVTVWRjTa/Journeys";
const AIRTABLE_API_KEY = "patuiAgEvFzitXyIu.a0fed140f02983ccc3dfeed6c02913b5e2593253cb784a08c3cfd8ac96518ba0";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

async function logToAirtable(fields: Record<string, any>) {
  try {
    await axios.post(
      AIRTABLE_API_URL,
      { fields },
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error logging to Airtable:", error);
  }
}

const createAccount = tool({
  description: "Create a new user account with a name and description.",
  parameters: z.object({
    name: z.string().min(1).describe("The name of the user."),
    description: z.string().optional().describe("A brief description of the user."),
  }),
  execute: async ({ name, description }) => {
    const responseMessage = `Account for ${name} has been created successfully.`;
    const outgoingPayload = {
      name,
      description,
      responseMessage,
    };

    await logToAirtable({
      "User Message": `Create account for ${name}`,
      Response: responseMessage,
      "Incoming Payload": JSON.stringify({ name, description }),
      "Outgoing Payload": JSON.stringify(outgoingPayload),
      Status: "Account Created",
    });

    return responseMessage;
  },
});

const modifyAccount = tool({
  description: "Modify an existing user account identified by name.",
  parameters: z.object({
    name: z.string().min(1).describe("The name of the user to modify."),
    newName: z.string().optional().describe("The new name for the user."),
    newDescription: z.string().optional().describe("The new description for the user."),
  }),
  execute: async ({ name, newName, newDescription }) => {
    const responseMessage = `Account ${name} has been updated successfully.`;
    const outgoingPayload = {
      name,
      newName,
      newDescription,
      responseMessage,
    };

    await logToAirtable({
      "User Message": `Modify account ${name}`,
      Response: responseMessage,
      "Incoming Payload": JSON.stringify({ name, newName, newDescription }),
      "Outgoing Payload": JSON.stringify(outgoingPayload),
      Status: "Account Modified",
    });

    return responseMessage;
  },
});

const createJourney = tool({
  description: "Create a new journey with a name and description.",
  parameters: z.object({
    name: z.string().min(1).describe("The name of the journey."),
    description: z.string().optional().describe("A brief description of the journey."),
  }),
  execute: async ({ name, description }) => {
    const responseMessage = `Journey ${name} has been created successfully.`;
    const outgoingPayload = {
      name,
      description,
      responseMessage,
    };

    await logToAirtable({
      "User Message": `Create journey ${name}`,
      Response: responseMessage,
      "Incoming Payload": JSON.stringify({ name, description }),
      "Outgoing Payload": JSON.stringify(outgoingPayload),
      Status: "Journey Created",
    });

    return responseMessage;
  },
});

const modifyJourney = tool({
  description: "Modify an existing journey identified by name.",
  parameters: z.object({
    name: z.string().min(1).describe("The name of the journey to modify."),
    newName: z.string().optional().describe("The new name for the journey."),
    newDescription: z.string().optional().describe("The new description for the journey."),
  }),
  execute: async ({ name, newName, newDescription }) => {
    const responseMessage = `Journey ${name} has been updated successfully.`;
    const outgoingPayload = {
      name,
      newName,
      newDescription,
      responseMessage,
    };

    await logToAirtable({
      "User Message": `Modify journey ${name}`,
      Response: responseMessage,
      "Incoming Payload": JSON.stringify({ name, newName, newDescription }),
      "Outgoing Payload": JSON.stringify(outgoingPayload),
      Status: "Journey Modified",
    });

    return responseMessage;
  },
});

export async function continueConversation(history: Message[]) {
  try {
    const { text, toolResults } = await generateText({
      model: openai("gpt-4-turbo"),
      system: `You are an assistant for managing user accounts and journeys. You can perform the following actions:
        - createAccount: Create a new user account.
        - modifyAccount: Modify an existing user account.
        - createJourney: Create a new journey.
        - modifyJourney: Modify an existing journey.
        Respond with plain text messages to the user.`,
      messages: history,
      maxToolRoundtrips: 5,
      tools: {
        createAccount,
        modifyAccount,
        createJourney,
        modifyJourney,
      },
    });

    return {
      messages: [
        ...history,
        {
          role: "assistant" as const,
          content: text || toolResults.map((toolResult) => toolResult.result).join("\n"),
        },
      ],
    };
  } catch (error) {
    console.error("Error in continueConversation:", error);
    return {
      messages: [
        ...history,
        {
          role: "assistant" as const,
          content: "An error occurred while processing your request. Please try again.",
        },
      ],
    };
  }
}
