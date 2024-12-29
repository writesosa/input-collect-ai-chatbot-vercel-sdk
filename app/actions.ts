"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function continueConversation(history: Message[]) {
  "use server";

  try {
    console.log("[LLM] continueConversation");
    const { text, toolResults } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a Wonderland assistant! Reply with nicely formatted markdown. Keep your reply short and concise. Mention the account or company name politely if provided in the record information.

        Perform the following actions when requested:
        - createAccount: Create a new account in the Accounts table.
        - modifyAccount: Modify an existing account in the Accounts table.

        Log all operations and their results for user reference.
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
    console.error("[LLM] Error during conversation:", error);
    return {
      messages: [
        ...history,
        {
          role: "assistant" as const,
          content: "There was an error processing your request. Please try again.",
        },
      ],
    };
  }
}

const createAccount = tool({
  description: "Create a new account in the Accounts table.",
  parameters: z.object({
    name: z.string().min(1).describe("The name of the account holder."),
    description: z.string().min(1).describe("A description for the account."),
  }),
  execute: async ({ name, description }) => {
    console.log("[TOOL] createAccount - Input:", { name, description });

    try {
      const createResponse = await fetch(
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
            },
          }),
        }
      );

      const result = await createResponse.json();

      if (!createResponse.ok) {
        console.error("[TOOL] createAccount - Error Response:", result);
        throw new Error(`Failed to create account. ${result.error?.message || "Unknown error."}`);
      }

      console.log("[TOOL] createAccount - Success Response:", result);
      return {
        message: `Account created successfully: Name: ${name}, Description: ${description}, Record ID: ${result.id}`,
      };
    } catch (error) {
      console.error("[TOOL] createAccount - Error:", error);
      return {
        message: `Error occurred while creating the account: ${error.message}`,
      };
    }
  },
});

const modifyAccount = tool({
  description: "Modify an existing account in the Accounts table.",
  parameters: z.object({
    recordId: z.string().min(1).describe("The record ID of the account to modify."),
    fieldToUpdate: z
      .string()
      .min(1)
      .describe("The field to update (e.g., Name, Description)."),
    newValue: z.string().min(1).describe("The new value for the specified field."),
  }),
  execute: async ({ recordId, fieldToUpdate, newValue }) => {
    console.log("[TOOL] modifyAccount - Input:", { recordId, fieldToUpdate, newValue });

    try {
      const updateResponse = await fetch(
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

      const result = await updateResponse.json();

      if (!updateResponse.ok) {
        console.error("[TOOL] modifyAccount - Error Response:", result);
        throw new Error(`Failed to update account. ${result.error?.message || "Unknown error."}`);
      }

      console.log("[TOOL] modifyAccount - Success Response:", result);
      return {
        message: `Account updated successfully: Record ID: ${recordId}, Updated Field: ${fieldToUpdate}, New Value: ${newValue}`,
      };
    } catch (error) {
      console.error("[TOOL] modifyAccount - Error:", error);
      return {
        message: `Error occurred while updating the account: ${error.message}`,
      };
    }
  },
});
