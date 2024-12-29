"use server";

import { InvalidToolArgumentsError, generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Airtable API setup
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID as string;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY as string;
const AIRTABLE_TABLE_NAME = "Accounts"; // Adjust this to your Airtable table name

async function fetchAirtableRecord(recordId: string) {
  console.log(`[LOG] Fetching Airtable record. Record ID: ${recordId}`);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${recordId}`;
  const headers = {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  };

  try {
    const response = await fetch(url, { method: "GET", headers });
    console.log(`[LOG] Airtable fetch response status: ${response.status}`);
    if (!response.ok) {
      console.error(`[ERROR] Failed to fetch Airtable record. Status: ${response.statusText}`);
      const errorBody = await response.text();
      console.error(`[ERROR] Fetch response body: ${errorBody}`);
      throw new Error(`Error fetching record: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[LOG] Successfully fetched Airtable record:`, data);
    return data;
  } catch (error) {
    console.error(`[ERROR] fetchAirtableRecord encountered an error:`, error);
    throw error;
  }
}

async function updateAirtableRecord(recordId: string, fields: Record<string, any>) {
  console.log(`[LOG] Updating Airtable record. Record ID: ${recordId}, Fields:`, fields);
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${recordId}`;
  const headers = {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields }),
    });
    console.log(`[LOG] Airtable update request sent. URL: ${url}, Payload:`, fields);
    console.log(`[LOG] Airtable update response status: ${response.status}`);
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[ERROR] Failed to update Airtable record. Status: ${response.statusText}, Body: ${errorBody}`);
      throw new Error(`Error updating record: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[LOG] Successfully updated Airtable record:`, data);
    return data;
  } catch (error) {
    console.error(`[ERROR] updateAirtableRecord encountered an error:`, error);
    throw error;
  }
}

export async function continueConversation(history: Message[], recordId: string | null) {
  console.log(`[LOG] Starting conversation. History:`, history, `Record ID:`, recordId);

  let airtableData = null;

  if (recordId) {
    try {
      airtableData = await fetchAirtableRecord(recordId);
      console.log(`[LOG] Fetched Airtable data:`, airtableData);
    } catch (error) {
      console.error(`[ERROR] Error fetching Airtable record:`, error);
    }
  }

  try {
    const { text, toolResults } = await generateText({
      model: openai("gpt-4"),
      system: `You are an assistant for managing user accounts and journeys. You can perform the following actions:
        - Fetch Airtable records and fields.
        - Update Airtable fields dynamically based on user inputs.
        Respond with concise and clear information. Use markdown formatting where appropriate.`,
      messages: [
        ...history,
        { role: "assistant", content: `Airtable Data: ${JSON.stringify(airtableData)}` },
      ],
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
              console.log(`[LOG] Attempting to modify Airtable record:`, recordId, fields);
              const result = await updateAirtableRecord(recordId, fields);
              console.log(`[LOG] Account modification successful. Result:`, result);
              return { status: "success", message: "Record updated successfully." };
            } catch (error) {
              console.error(`[ERROR] Failed to modify Airtable record:`, error);
              return { status: "failed", message: "Failed to update record." };
            }
          },
        }),
      },
    });

    console.log(`[LOG] Generated OpenAI response:`, text || toolResults);
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
    console.error(`[ERROR] Failed to process conversation:`, error);
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
