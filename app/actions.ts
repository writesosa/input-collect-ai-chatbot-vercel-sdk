"use server";

import { tool, generateText } from "ai";
import { z } from "zod";
import { updateAirtableRecord } from "./utils/airtable";

export async function continueConversation(
  history: { role: "user" | "assistant"; content: string }[],
  pageType: string,
  recordId: string,
  fields: Record<string, any>
) {
  console.log("[DEBUG] Starting Conversation:", { history, pageType, recordId, fields });

  const systemPrompt = `
    You are an assistant for managing Airtable records. Modify fields dynamically.
    Current record details: ${JSON.stringify(fields)}
    Confirm changes with the user before updating.
  `;

  const modifyRecord = tool({
    description: "Modify an Airtable record dynamically.",
    parameters: z.object({
      recordId: z.string(),
      tableName: z.string(),
      updates: z.record(z.string(), z.any()),
    }),
    execute: async ({ recordId, tableName, updates }) => {
      console.log("[DEBUG] Updating Record:", { recordId, tableName, updates });
      const result = await updateAirtableRecord(tableName, recordId, updates);
      console.log("[DEBUG] Airtable Update Successful:", result);
      return `Updated fields: ${Object.keys(updates).join(", ")}`;
    },
  });

  try {
    const { text } = await generateText({
      model: "gpt-4",
      system: systemPrompt,
      messages: history,
      tools: { modifyRecord },
    });

    console.log("[DEBUG] Assistant Output:", text);
    return { messages: [...history, { role: "assistant", content: text }] };
  } catch (error) {
    console.error("[ERROR] Conversation:", error);
    return { messages: [...history, { role: "assistant", content: "Error processing request." }] };
  }
}
