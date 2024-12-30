"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import Airtable from "airtable";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

// Initialize Airtable base
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base("your_base_id");

// Function to handle continuing a conversation
export async function continueConversation(history: Message[]) {
  "use server";

  try {
    console.log("[LLM] continueConversation");

    const { text, toolResults } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a Wonderland assistant!
        Reply with nicely formatted markdown. 
        Keep your replies short and concise. 
        If this is the first reply, send a warm welcome message.
        If multiple accounts are provided, list them in a clear, structured format.

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
    if (error instanceof InvalidToolArgumentsError) {
      console.error("[continueConversation] Invalid tool arguments:", error.toJSON());
    } else {
      console.error("[continueConversation] Error:", error);
    }

    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: "An error occurred while processing your request. Please try again.",
        },
      ],
    };
  }
}

// Tool to create a new account
const createAccount = tool({
  description: "Simulate creating a new account in Wonderland.",
  parameters: z.object({
    name: z.string().min(1).describe("The name of the account holder."),
    description: z.string().min(1).describe("A description for the account."),
  }),
  execute: async ({ name, description }) => {
    console.log("[TOOL] createAccount", { name, description });

    const newAccountNumber = nanoid();
    console.log(
      `[SIMULATION] Account Created: Name: ${name}, Description: ${description}, Account Number: ${newAccountNumber}`
    );

    await airtableBase("Accounts").create({
      Name: name,
      Description: description,
      AccountNumber: newAccountNumber,
    });

    return {
      message: `Successfully created a new account for ${name} with the description: "${description}". Account Number: ${newAccountNumber}`,
    };
  },
});

// Tool to modify an existing account
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

    const records = await airtableBase("Accounts")
      .select({ filterByFormula: `{AccountNumber} = "${accountNumber}"` })
      .firstPage();

    if (records.length === 0) {
      throw new Error(`No account found with Account Number: ${accountNumber}`);
    }

    const recordId = records[0].id;
    await airtableBase("Accounts").update(recordId, {
      [fieldToUpdate]: newValue,
    });

    console.log(
      `[SIMULATION] Account Modified: Account Number: ${accountNumber}, Field Updated: ${fieldToUpdate}, New Value: ${newValue}`
    );

    return {
      message: `Successfully updated account ${accountNumber}. Changed ${fieldToUpdate} to "${newValue}".`,
    };
  },
});

// Helper function to log user interaction on the frontend
export async function logUserInteraction(interaction: string, recordId: string | null = null) {
  console.log("[User Interaction] Logging interaction:", interaction, "Record ID:", recordId);

  const log = {
    Interaction: interaction,
    RecordID: recordId || "N/A",
    Timestamp: new Date().toISOString(),
  };

  await airtableBase("InteractionLogs").create(log);
  console.log("[User Interaction] Logged interaction successfully.");
}
