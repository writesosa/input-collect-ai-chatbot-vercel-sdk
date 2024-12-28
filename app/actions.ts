"use server";

import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { updateAirtableRecord, fetchAirtableData } from "./utils/airtable";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Tool to dynamically modify fields of an Airtable record
const modifyRecord = tool({
  description: "Modify details of an Airtable record dynamically based on provided fields.",
  parameters: z.object({
    recordId: z.string().describe("The ID of the record to modify."),
    tableName: z.string().describe("The Airtable table name (e.g., Accounts, Journeys)."),
    updates: z.record(z.string(), z.any()).describe(
      "Key-value pairs of fields to update. Keys are field names, and values are the new field values."
    ),
  }),
  execute: async ({ recordId, tableName, updates }) => {
    try {
      console.log("[DEBUG] Modifying Airtable Record:", { recordId, tableName, updates });

      // Update the record in Airtable
      const result = await updateAirtableRecord(tableName, recordId, updates);

      return {
        status: "success",
        message: `The record in table '${tableName}' was updated successfully.`,
        updates: result,
      };
    } catch (error) {
      console.error("[ERROR] Updating Airtable Record:", error);
      return {
        status: "failed",
        message: "Failed to update the Airtable record.",
      };
    }
  },
});

// Conversation logic for managing Airtable records
export async function continueConversation(
  history: Message[],
  pageType: string,
  recordId: string,
  fields?: Record<string, any>
) {
  "use server";

  try {
    // Fetch Airtable data if fields are not provided
    if (!fields && pageType && recordId) {
      fields = await fetchAirtableData(pageType, recordId);
    }

    if (!fields) {
      throw new Error("Fields are required for processing the conversation.");
    }

    const { text, toolResults } = await generateText({
      model: openai("gpt-4"),
      system: `
        You are an assistant for managing and modifying Airtable records. You can:
        - modifyRecord: Modify fields of an Airtable record dynamically.

        Current Record:
        ${JSON.stringify(fields)}

        Respond concisely and confirm changes before applying them.
      `,
      messages: history,
      tools: { modifyRecord },
    });

    const assistantMessages = [
      ...history,
      {
        role: "assistant" as const,
        content: text || toolResults.map((toolResult) => toolResult.result).join("\n"),
      },
    ];

    return {
      messages: assistantMessages,
    };
  } catch (error) {
    console.error("[ERROR] Processing Conversation:", error);

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

// Function for logging the full interaction (Optional, if required)
export function logInteraction(logData: any) {
  console.log("[LOG] Interaction Data:", JSON.stringify(logData, null, 2));
}
