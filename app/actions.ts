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
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID || "missing_base_id");

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
      raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
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
      console.error("[TOOL] Error creating account in Airtable:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });

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
  description: "Modify any field of an existing account in Wonderland.",
  parameters: z.object({
    recordId: z.string().optional().describe("The record ID of the account to modify."),
    fields: z.record(z.string(), z.any()).nonempty("Fields object must contain at least one key-value pair.").describe("The fields to modify and their new values."),
  }),
  execute: async ({ recordId, fields }) => {
    console.log("[TOOL] modifyAccount", { recordId, fields });

    try {
      if (!recordId && !fields.Name) {
        throw new Error("Either recordId or fields.Name must be provided to identify the account.");
      }

      let accountRecord;

      if (recordId) {
        console.log("[TOOL] Searching by record ID...");
        accountRecord = await airtableBase("Accounts").find(recordId);
      } else {
        console.log("[TOOL] Searching by account name...");
        const records = await airtableBase("Accounts")
          .select({ filterByFormula: `{Name} = "${fields.Name}"` })
          .firstPage();

        if (records.length === 0) {
          throw new Error(`No account found with the name: ${fields.Name}`);
        }

        accountRecord = records[0];
      }

      console.log("[TOOL] Account found:", accountRecord);

      console.log("[TOOL] Fetching current fields for validation...");
      const currentFields = accountRecord.fields;

      console.log("[TOOL] Current fields:", currentFields);

      console.log("[TOOL] Updating account with fields:", fields);

      const updatedRecord = await airtableBase("Accounts").update(accountRecord.id, fields);

      console.log("[TOOL] Account updated successfully:", updatedRecord);

      return {
        message: `Account successfully updated. Updated fields: ${JSON.stringify(fields)}.`,
        recordId: updatedRecord.id,
      };
    } catch (error) {
      console.error("[TOOL] Error modifying account in Airtable:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });

      throw new Error(
        JSON.stringify({
          error: "Failed to modify account.",
          details: error instanceof Error ? { message: error.message, stack: error.stack } : { raw: error },
        })
      );
    }
  },
});
