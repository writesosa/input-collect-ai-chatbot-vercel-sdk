"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import users from "./users.json";
import Airtable from "airtable";

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

// Initialize Airtable base
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base("your_base_id");

export async function continueConversation(history: Message[]) {
  "use server";

  try {
    console.log("[LLM] continueConversation");
    const { text, toolResults } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a Wonderland assistant!
        Reply with nicely formatted markdown. 
        Keep your replies short and concise. 
        If this is the first reply send a nice welcome message.
        If the selected Account is different mention account or company name once.

        Perform the following actions:
        - Create a new account in Wonderland when the user requests it.
        - Modify an existing account in Wonderland when the user requests it.
        - Delete an existing account in Wonderland when the user requests it.

        When creating or modifying an account:
        - Extract the required information (e.g., account name, description, or specific fields to update) from the user's input.
        - Ensure all extracted values are sent outside the user message in a structured format.
        - Confirm the action with the user before finalizing.
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
    console.error("[LLM] Error in continueConversation:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      raw: error,
    });

    return {
      messages: [
        ...history,
        {
          role: "assistant" as const,
          content: `There's a problem executing the request. Please try again. Error details: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
    };
  }
}

const createAccount = tool({
  description: "Create a new account in Wonderland and log actions.",
  parameters: z.object({
    name: z.string().min(1).describe("The name of the account holder."),
    description: z.string().min(1).describe("A description for the account."),
  }),
  execute: async ({ name, description }) => {
    console.log("[TOOL] createAccount", { name, description });

    try {
      // Validate input explicitly
      if (!name || !description) {
        throw new Error("Name or description is missing.");
      }

      // Create a new record in Airtable
      console.log("[TOOL] Creating a new Airtable record...");
      const createdRecord = await airtableBase("Accounts").create({
        Name: name,
        Description: description,
      });

      console.log("[TOOL] Account created successfully in Airtable:", createdRecord);

      return {
        message: `Account created successfully for ${name} with the description: ${description}. Record ID: ${createdRecord.id}`,
        recordId: createdRecord.id,
      };
    } catch (error) {
      console.error("[TOOL] Error creating account in Airtable:", error);

      // Handle and throw detailed error
      const errorDetails =
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : { message: "Unknown error occurred.", raw: error };

      throw new Error(
        JSON.stringify({
          error: `Failed to create account for ${name}.`,
          details: errorDetails,
        })
      );
    }
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

    // Update Airtable record
    const records = await airtableBase("Accounts")
      .select({ filterByFormula: `{AccountNumber} = "${accountNumber}"` })
      .firstPage();

    if (records.length > 0) {
      const recordId = records[0].id;
      await airtableBase("Accounts").update(recordId, {
        [fieldToUpdate]: newValue,
      });
    }

    return {
      message: `Successfully simulated modifying account ${accountNumber}. Updated ${fieldToUpdate} to ${newValue}.`,
    };
  },
});
