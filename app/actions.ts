"use server";

import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { updateAirtableRecord, fetchAirtableData } from "./utils/airtable";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Tool to modify fields of an Airtable record
const modifyRecord = tool({
  description: "Modify details of an Airtable record dynamically.",
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
      const result = await updateAirtableRecord(tableName, recordId, updates);
      return {
        status: "success",
        message: `The record in table '${tableName}' was updated successfully.`,
        updates: result,
      };
    } catch (error) {
      console.error("[ERROR] Updating Airtable Record:", error);
      return { status: "failed", message: "Failed to update the Airtable record." };
    }
  },
});

// Function to handle conversation logic
export async function continueConversation(
  history: Message[],
  pageType: string,
  recordId: string,
  fields?: Record<string, any>
) {
  try {
    if (!fields && pageType && recordId) {
      fields = await fetchAirtableData(pageType, recordId);
    }

    const { text } = await generateText({
      model: openai("gpt-4"),
      system: `
        You are an assistant for managing Airtable records. 
        Use the fields provided to confirm or update the record dynamically.
      `,
      messages: history,
      tools: { modifyRecord },
    });

    console.log("[DEBUG] Generated Assistant Response:", text);

    return {
      messages: [
        ...history,
        { role: "assistant", content: text },
      ],
    };
  } catch (error) {
    console.error("[ERROR] continueConversation:", error);
    return {
      messages: [
        ...history,
        { role: "assistant", content: "An error occurred. Please try again." },
      ],
    };
  }
}
