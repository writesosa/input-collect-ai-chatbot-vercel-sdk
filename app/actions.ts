import { InvalidToolArgumentsError, generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { updateAirtableRecord } from "./utils/airtable";

export async function continueConversation(
  history,
  pageType,
  recordId,
  fields
) {
  try {
    const systemPrompt = `
      You are assisting with Airtable record updates. Here are the record details:
      ${JSON.stringify(fields)}
      Confirm any changes with the user before applying updates.
    `;

    const { text, toolResults } = await generateText({
      model: openai("gpt-4"),
      system: systemPrompt,
      messages: history,
      maxToolRoundtrips: 5,
      tools: {
        modifyRecord: tool({
          description: "Update Airtable record dynamically.",
          parameters: z.object({
            recordId: z.string(),
            tableName: z.string(),
            updates: z.record(z.string(), z.any()),
          }),
          execute: async ({ recordId, tableName, updates }) => {
            console.log("[DEBUG] modifyRecord called:", { recordId, tableName, updates });

            try {
              const result = await updateAirtableRecord(tableName, recordId, updates);
              console.log("[DEBUG] Airtable update result:", result);

              return {
                status: "success",
                message: "Record updated successfully.",
                updates: result,
              };
            } catch (error) {
              console.error("[ERROR] modifyRecord:", error);
              return {
                status: "failed",
                message: "Failed to update Airtable record.",
              };
            }
          },
        }),
      },
    });

    console.log("[DEBUG] Assistant Response:", text);
    console.log("[DEBUG] Tool Results:", toolResults);

    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: text || toolResults.map((tool) => tool.result).join("\n"),
        },
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
