"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export interface Message {
  role: "user" | "assistant";
  content: string;
  username?: string; // Track the username in the message for memory retention
}

// Sample data storage for accounts
const users: Record<string, any> = {};

// Tool to create a new user account
const createAccount = tool({
  description: "Create a new user account with a unique username and additional details.",
  parameters: z.object({
    username: z.string().min(4).describe("Unique username for the account."),
    email: z.string().email().describe("Email address of the user."),
    description: z.string().describe("Description for the account."),
  }),
  execute: async ({ username, email, description }) => {
    if (users[username]) {
      return {
        status: "failed",
        message: `Account with username '${username}' already exists.`,
      };
    }
    users[username] = { username, email, description, id: nanoid() };
    console.log(`[LOG] Account created: ${username}`);
    return {
      status: "success",
      message: `Account for ${username} created successfully.`,
    };
  },
});

// Tool to modify an existing user account
const modifyAccount = tool({
  description: "Modify details of an existing user account, such as Name and Description.",
  parameters: z.object({
    username: z.string().min(4).describe("Username of the account to modify."),
    name: z.string().optional().describe("New name for the account."),
    description: z.string().optional().describe("New description for the account."),
  }),
  execute: async ({ username, name, description }) => {
    const user = users[username];
    if (!user) {
      return {
        status: "failed",
        message: `User with username '${username}' not found.`,
      };
    }

    if (name) {
      user.name = name;
      console.log(`[LOG] Account name for ${username} updated to: ${name}`);
    }
    if (description) {
      user.description = description;
      console.log(`[LOG] Account description for ${username} updated.`);
    }

    return {
      status: "success",
      message: `Account for ${username} updated successfully.`,
    };
  },
});

// Tool to delete an existing user account
const deleteAccount = tool({
  description: "Delete an existing user account.",
  parameters: z.object({
    username: z.string().min(4).describe("Username of the account to delete."),
  }),
  execute: async ({ username }) => {
    if (!users[username]) {
      return {
        status: "failed",
        message: `User with username '${username}' not found.`,
      };
    }

    delete users[username];
    console.log(`[LOG] Account deleted: ${username}`);
    return {
      status: "success",
      message: `Account for ${username} deleted successfully.`,
    };
  },
});

export async function continueConversation(history: Message[]) {
  "use server";

  try {
    const { text, toolResults } = await generateText({
      model: openai("gpt-4"),
      system: `You are an assistant for managing user accounts. You can perform the following actions:
        - createAccount: Create a new user account.
        - modifyAccount: Modify an existing user account (Name and Description only).
        - deleteAccount: Delete an existing user account.
        Respond with concise and clear information. Use markdown formatting where appropriate.`,
      messages: history,
      maxToolRoundtrips: 5,
      tools: {
        createAccount,
        modifyAccount,
        deleteAccount,
      },
    });

    // Update the conversation history with the assistant's response
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
    if (error instanceof InvalidToolArgumentsError) {
      console.error(error.toJSON());
    } else {
      console.error(error);
    }
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
