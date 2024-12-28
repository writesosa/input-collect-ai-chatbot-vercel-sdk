"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { updateAirtableRecord } from "./utils/airtable";

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
      console.log("[DEBUG] Attempting to modify Airtable Record:", { recordId, tableName, updates });

      const result = await updateAirtableRecord(tableName, recordId, updates);

      console.log("[DEBUG] Airtable Record Updated Successfully:", result);

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

export async function continueConversation(
  history: Message[],
  pageType: string,
  recordId: string,
  fields: Record<string, any>
) {
  try {
    const systemPrompt = `
      You are an assistant for managing and modifying Airtable records. You can perform the following actions:
      - modifyRecord: Modify any field of an Airtable record dynamically.
      
      Use the fields provided in the context for making decisions. Here are the current record details:
      ${JSON.stringify(fields)}
      
      Confirm all changes with the user before executing them. Respond concisely.
    `;

    console.log("[DEBUG] Starting Conversation with Context:", { pageType, recordId, fields });

    const { text, toolResults } = await generateText({
      model: openai("gpt-4"),
      system: systemPrompt,
      messages: history,
      maxToolRoundtrips: 5,
      tools: { modifyRecord },
    });

    console.log("[DEBUG] Assistant Messages:", text);
    console.log("[DEBUG] Tool Results:", toolResults);

    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: text || toolResults.map((toolResult) => toolResult.result).join("\n"),
        },
      ],
    };
  } catch (error) {
    console.error("[ERROR] Processing Conversation:", error);

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
