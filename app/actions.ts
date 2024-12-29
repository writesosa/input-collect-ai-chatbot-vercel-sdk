"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Airtable API setup
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_TABLE_NAME = "Accounts"; // Adjust this to your Airtable table name

async function fetchAirtableRecord(recordId: string) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${recordId}`;
  const headers = {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch record: ${response.statusText}`);
  }
  return response.json();
}

async function updateAirtableRecord(recordId: string, fields: Record<string, any>) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${recordId}`;
  const headers = {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update record: ${response.statusText}`);
  }
  return response.json();
}

export async function continueConversation(history: Message[], recordId: string | null) {
  "use server";

  let airtableData = null;

  if (recordId) {
    try {
      airtableData = await fetchAirtableRecord(recordId); // Fetch the record from Airtable
    } catch (error) {
      console.error("Error fetching Airtable record:", error);
    }
  }

  try {
    const { text, toolResults } = await generateText({
      model: openai("gpt-4"),
      system: `You are an assistant for managing user accounts and journeys. You can perform the following actions:
        - Fetch Airtable records and fields.
        - Update Airtable fields dynamically based on user inputs.
        Respond with concise and clear information. Use markdown formatting where appropriate.`,
      messages: [...history, { role: "assistant", content: `Airtable Data: ${JSON.stringify(airtableData)}` }],
      maxToolRoundtrips: 5,
      tools: {
        modifyAccount: tool({
          description: "Update fields in an Airtable record.",
          parameters: z.object({
            recordId: z.string().describe("Airtable record ID."),
            fields: z.record(z.string()).describe("Fields to update."),
          }),
          execute: async ({ recordId, fields }) => {
            try {
              await updateAirtableRecord(recordId, fields);
              return { status: "success", message: "Record updated successfully." };
            } catch (error) {
              return { status: "failed", message: "Failed to update record." };
            }
          },
        }),
      },
    });

    return {
      messages: [
        ...history,
        {
          role: "assistant" as const,
          content: text || toolResults.map((toolResult) => toolResult.result).join("\n"),
        },
      ],
    };
  } catch (error) {
    if (error instanceof InvalidToolArgumentsError) {
      console.error(error.toJSON());
    } else {
      console.error(error);
    }
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
