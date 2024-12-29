"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function continueConversation(history: Message[]) {
  try {
    console.log("[LLM] continueConversation");
    const { text, toolResults } = await generateText({
      model: openai({
        name: "gpt-4o",
        inputFormat: "messages",
        tools: [createAccount, modifyAccount],
      }),
      system: `You are a Wonderland assistant! You only know things about Wonderland. Reply with nicely formatted markdown. Keep your reply short and concise. Don't overwhelm the user with too much information. 
        The first message will be a payload with the current record from Wonderland and is auto-generated. When you receive it, respond with a message asking the user how you can help them with the account and mention the account or company name from the record information politely.

        Never mention the word Airtable, use Wonderland for user messages instead of Airtable.

        You can _only_ perform the following actions:
        - createAccount: Create a new account in Wonderland. This tool and the parameters' collection must only be called if the user has said they want to create an account. Call the createAccount tool only when you have all required parameters. Otherwise, keep asking the user. Once you have the complete information, ask the user to confirm the new account creation before calling the tool by showing a summary of the information.
        - modifyAccount: Modify an account in Wonderland. This tool and the parameters must only be called if the user has indicated they wish to modify an account. Call the modifyAccount tool only when you have required information for the field to update. Otherwise, keep asking the user. Once you have the complete information, ask the user to confirm the request before calling the tool by showing the request information.

        When you are creating an account or modifying an account, interpret and clarify the user description to be clear, concise, and ensure proper capitalization for the name when confirming.

        Don't perform any other actions.`,
      messages: history,
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
  name: "createAccount",
  description: "Create a new account in Wonderland.",
  parameters: z.object({
    name: z.string().min(1).describe("The name of the account holder."),
    description: z.string().min(1).describe("A description for the account."),
  }),
  execute: async ({ name, description }) => {
    console.log("[TOOL] createAccount", { name, description });

    try {
      // Create the record in Airtable
      const response = await fetch(
        "https://api.airtable.com/v0/appFf0nHuVTVWRjTa/Accounts",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer patuiAgEvFzitXyIu.a0fed140f02983ccc3dfeed6c02913b5e2593253cb784a08c3cfd8ac96518ba0`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fields: {
              Name: name,
              Description: description,
              AccountNumber: nanoid(),
            },
          }),
        }
      );

      if (!response.ok) {
        console.error("[TOOL] Error creating record:", response.status);
        throw new Error(`Failed to create record. HTTP Status: ${response.status}`);
      }

      const record = await response.json();
      console.log("[TOOL] Created record:", JSON.stringify(record, null, 2));

      return {
        message: `Successfully created an account for ${name} with the description: ${description}.`,
      };
    } catch (error) {
      console.error("[TOOL] Error in createAccount:", error);
      return {
        message: `An error occurred while creating the account: ${error.message}`,
      };
    }
  },
});

const modifyAccount = tool({
  name: "modifyAccount",
  description: "Modify an account in Wonderland.",
  parameters: z.object({
    recordId: z
      .string()
      .min(1)
      .describe("The record ID of the account to modify."),
    fieldToUpdate: z
      .string()
      .min(1)
      .describe(
        "The field to update (e.g., Name, Description). Must be a valid field."
      ),
    newValue: z
      .string()
      .min(1)
      .describe("The new value to assign to the specified field."),
  }),
  execute: async ({ recordId, fieldToUpdate, newValue }) => {
    console.log("[TOOL] modifyAccount", { recordId, fieldToUpdate, newValue });

    try {
      // Update the record in Airtable
      const response = await fetch(
        `https://api.airtable.com/v0/appFf0nHuVTVWRjTa/Accounts/${recordId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer patuiAgEvFzitXyIu.a0fed140f02983ccc3dfeed6c02913b5e2593253cb784a08c3cfd8ac96518ba0`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fields: {
              [fieldToUpdate]: newValue,
            },
          }),
        }
      );

      if (!response.ok) {
        console.error("[TOOL] Error updating record:", response.status);
        throw new Error(`Failed to update record. HTTP Status: ${response.status}`);
      }

      const record = await response.json();
      console.log("[TOOL] Updated record:", JSON.stringify(record, null, 2));

      return {
        message: `Successfully modified account with record ID ${recordId}. Updated ${fieldToUpdate} to ${newValue}.`,
      };
    } catch (error) {
      console.error("[TOOL] Error in modifyAccount:", error);
      return {
        message: `An error occurred while modifying the account: ${error.message}`,
      };
    }
  },
});
