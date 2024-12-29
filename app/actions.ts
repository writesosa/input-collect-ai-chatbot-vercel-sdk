"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Sample data storage
const users: Record<string, any> = {};
const journeys: Record<string, any> = {};

// Tool to create a new user account
const createAccount = tool({
  description: "Create a new user account with a unique username and additional details.",
  parameters: z.object({
    username: z.string().min(4).describe("Unique username for the account."),
    email: z.string().email().describe("Email address of the user."),
    password: z.string().min(6).describe("Password for the account."),
  }),
  execute: async ({ username, email, password }) => {
    if (users[username]) {
      return {
        status: "failed",
        message: "Username already exists.",
      };
    }
    users[username] = { username, email, password, id: nanoid() };
    return {
      status: "success",
      message: `Account for ${username} created successfully.`,
    };
  },
});

// Tool to modify an existing user account
const modifyAccount = tool({
  description: "Modify details of an existing user account.",
  parameters: z.object({
    username: z.string().min(4).describe("Username of the account to modify."),
    email: z.string().email().optional().describe("New email address."),
    password: z.string().min(6).optional().describe("New password."),
  }),
  execute: async ({ username, email, password }) => {
    const user = users[username];
    if (!user) {
      return {
        status: "failed",
        message: "User not found.",
      };
    }
    if (email) user.email = email;
    if (password) user.password = password;
    return {
      status: "success",
      message: `Account for ${username} updated successfully.`,
    };
  },
});

// Tool to create a new journey
const createJourney = tool({
  description: "Create a new journey with a unique title and description.",
  parameters: z.object({
    title: z.string().min(4).describe("Title of the journey."),
    description: z.string().describe("Description of the journey."),
    createdBy: z.string().describe("Username of the creator."),
  }),
  execute: async ({ title, description, createdBy }) => {
    if (!users[createdBy]) {
      return {
        status: "failed",
        message: "Creator user not found.",
      };
    }
    const journeyId = nanoid();
    journeys[journeyId] = { title, description, createdBy, id: journeyId };
    return {
      status: "success",
      message: `Journey '${title}' created successfully.`,
    };
  },
});

// Tool to modify an existing journey
const modifyJourney = tool({
  description: "Modify details of an existing journey.",
  parameters: z.object({
    journeyId: z.string().describe("ID of the journey to modify."),
    title: z.string().min(4).optional().describe("New title of the journey."),
    description: z.string().optional().describe("New description of the journey."),
  }),
  execute: async ({ journeyId, title, description }) => {
    const journey = journeys[journeyId];
    if (!journey) {
      return {
        status: "failed",
        message: "Journey not found.",
      };
    }
    if (title) journey.title = title;
    if (description) journey.description = description;
    return {
      status: "success",
      message: `Journey '${journey.title}' updated successfully.`,
    };
  },
});

export async function continueConversation(history: Message[]) {
  "use server";

  try {
    const { text, toolResults } = await generateText({
      model: openai("gpt-4"),
      system: `You are an assistant for managing user accounts and journeys. You can perform the following actions:
        - createAccount: Create a new user account.
        - modifyAccount: Modify an existing user account.
        - createJourney: Create a new journey.
        - modifyJourney: Modify an existing journey.
        Respond with concise and clear information. Use markdown formatting where appropriate.`,
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
