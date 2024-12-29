"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import users from "./users.json";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Simulated user data for logging and updates
const currentUserData = {
  name: "",
  accountNumber: "",
  phoneNumber: "",
  balance: 0,
};

export async function continueConversation(history: Message[]) {
  "use server";

  try {
    console.log("[LLM] continueConversation");
    const { text, toolResults } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a Wonderland assistant! You only know things about Wonderland. Reply with nicely formatted markdown. Keep your reply short and concise. Don't overwhelm the user with too much information. 

        You can _only_ perform the following actions:
        - createAccount: Simulate creating a new account in Wonderland. This tool and the parameters' collection must only be called if the user has said they want to create an account. Call the createAccount tool only when you have all required parameters. Otherwise, keep asking the user. Don't come up with the information yourself. Once you have the complete information, ask the user to confirm the new account creation before calling the tool by showing a summary of the information.
        - modifyAccount: Simulate modifying an account in Wonderland. This tool and the parameters must only be called if the user has indicated they wish to modify an account. Call the modifyAccount tool only when you have required information for the field to update. Otherwise, keep asking the user. Once you have the complete information, ask the user to confirm the request before calling the tool by showing the request information.

        Don't perform any other actions.
        `,
      messages: history,
      maxToolRoundtrips: 5,
      tools: {
        createAccount,
        modifyAccount,
      },
    });

    return {
      messages: [
        ...history,
        {
          role: "assistant" as const,
          content:
            text ||
            toolResults.map((toolResult) => toolResult.result).join("\n"),
        },
      ],
    };
  } catch (error) {
    if (error instanceof InvalidToolArgumentsError) {
      console.log(error.toJSON());
    } else {
      console.log(error);
    }
    return {
      messages: [
        ...history,
        {
          role: "assistant" as const,
          content: "There's a problem executing the request. Please try again.",
        },
      ],
    };
  }
}

const createAccount = tool({
  description: "Simulate creating a new account in Wonderland.",
  parameters: z.object({
    name: z.string().min(1).describe("The name of the account holder."),
    description: z.string().min(1).describe("A description for the account."),
  }),
  execute: async ({ name, description }) => {
    console.log("[TOOL] createAccount", { name, description });

    // Simulate account creation
    const newAccountNumber = nanoid();
    console.log(
      `[SIMULATION] Account Created: Name: ${name}, Description: ${description}, Account Number: ${newAccountNumber}`
    );

    return {
      message: `Successfully simulated creating an account for ${name} with the description: ${description}. Account Number: ${newAccountNumber}`,
    };
  },
});

const modifyAccount = tool({
  description: "Simulate modifying an account in Wonderland.",
  parameters: z.object({
    accountNumber: z
      .string()
      .min(4)
      .describe("The account number of the account to modify."),
    fieldToUpdate: z
      .string()
      .min(1)
      .describe(
        "The field to update (e.g., name, phoneNumber, balance). Must be a valid field."
      ),
    newValue: z
      .string()
      .min(1)
      .describe("The new value to assign to the specified field."),
  }),
  execute: async ({ accountNumber, fieldToUpdate, newValue }) => {
    console.log("[TOOL] modifyAccount", { accountNumber, fieldToUpdate, newValue });

    // Simulate account modification
    console.log(
      `[SIMULATION] Account Modified: Account Number: ${accountNumber}, Field Updated: ${fieldToUpdate}, New Value: ${newValue}`
    );

    return {
      message: `Successfully simulated modifying account ${accountNumber}. Updated ${fieldToUpdate} to ${newValue}.`,
    };
  },
});
