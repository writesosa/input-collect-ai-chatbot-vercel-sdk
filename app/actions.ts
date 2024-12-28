"use server";

import { InvalidToolArgumentsError, generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { updateAirtableRecord, fetchAirtableData } from "./utils/airtable";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Tool to dynamically modify Airtable records
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

      console.log("[DEBUG] Airtable Update Successful:", result);
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

// Core function to handle conversation and record updates
export async function continueConversation(
  history: Message[],
  pageType: string,
  recordId: string,
  fields: Record<string, any>
) {
  try {
    console.log("[DEBUG] Starting Conversation with Context:", { history, pageType, recordId, fields });

    const systemPrompt = `
      You are an assistant for managing and modifying Airtable records. You have access to the following actions:
      - modifyRecord: Modify any field of an Airtable record dynamically.
      
      Use the fields provided in the initial context for making decisions. Ensure that updates are relevant to the record and confirm changes with the user before applying them.
      
      Here are the current details of the record:
      ${JSON.stringify(fields)}

      Respond concisely and use markdown for formatting. Confirm modifications before executing them.
    `;

    const { text, toolResults } = await generateText({
      model: openai("gpt-4"),
      system: systemPrompt,
      messages: history,
      maxToolRoundtrips: 5,
      tools: { modifyRecord },
    });

    const assistantMessages = [
      ...history,
      {
        role: "assistant" as const,
        content: text || toolResults.map((toolResult) => toolResult.result).join("\n"),
      },
    ];

    console.log("[DEBUG] Assistant Response:", assistantMessages);
    return {
      messages: assistantMessages,
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
