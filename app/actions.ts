"use server";

import { z } from "zod";
import { tool, generateText } from "ai";
import { updateAirtableRecord } from "./utils/airtable";

// Tool to dynamically modify Airtable records
const modifyRecord = tool({
  description: "Modify an Airtable record dynamically.",
  parameters: z.object({
    recordId: z.string().describe("The ID of the record to modify."),
    tableName: z.string().describe("The name of the Airtable table."),
    updates: z.record(z.string(), z.any()).describe("Key-value pairs of fields to update."),
  }),
  execute: async ({ recordId, tableName, updates }) => {
    try {
      const result = await updateAirtableRecord(tableName, recordId, updates);
      console.log("[DEBUG] Airtable Update Success:", result);
      return result;
    } catch (error) {
      console.error("[ERROR] Airtable Update Failed:", error);
      throw new Error("Failed to update Airtable record.");
    }
  },
});

export async function continueConversation(
  history: Message[],
  pageType: string,
  recordId: string,
  fields: Record<string, any>
) {
  try {
    const { text } = await generateText({
      model: "gpt-4",
      system: `
        You are an assistant for managing Airtable records. Available actions:
        - modifyRecord: Update Airtable fields dynamically.
        Current record fields: ${JSON.stringify(fields)}
      `,
      messages: history,
      tools: { modifyRecord },
    });
    return { messages: [...history, { role: "assistant", content: text }] };
  } catch (error) {
    console.error("[ERROR] continueConversation:", error);
    throw error;
  }
}
