"use server";

import { InvalidToolArgumentsError, generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import Airtable from "airtable";

// Initialize Airtable base
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID || "missing_base_id");

export interface Message {
  role: "user" | "assistant";
  content: string;
}
export async function continueConversation(history: Message[]) {
  const logs: string[] = [];
  let draftCreated = false;

  try {
    logs.push("[LLM] Starting continueConversation...");
    console.log("[LLM] Starting continueConversation...");

    // Check if the account name exists in the history
    const accountName = history.find(
      (msg) =>
        msg.role === "user" &&
        (msg.content.toLowerCase().includes("create an account") ||
          msg.content.toLowerCase().includes("called"))
    )?.content.match(/called\s(.+)/i)?.[1];

    if (accountName && !draftCreated) {
      logs.push(`[LLM] Detected account name: ${accountName}`);
      console.log(`[LLM] Detected account name: ${accountName}`);

      // Invoke createAccount to create a draft
      const createResponse = await createAccount.execute({ Name: accountName });
      logs.push(`[TOOL] Draft created with Record ID: ${createResponse.recordId}`);
      draftCreated = true;
    }

    const { text, toolResults } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a Wonderland assistant!
        Reply with nicely formatted markdown. 
        Keep your replies short and concise. 
        If this is the first reply, send a nice welcome message.
        If the selected Account is different, mention the account or company name once.

        Perform the following actions:
        - Create a new account in Wonderland when the user requests it.
        - Modify an existing account in Wonderland when the user requests it.
        - Delete an existing account in Wonderland when the user requests it.

        When creating or modifying an account:
        - Create the account in Draft status as soon as the Name or Client Company Name is known.
        - Extract the required information (e.g., account name, description, or specific fields to update) from the user's input.
        - Ensure all extracted values are sent outside the user message in a structured format.
        - Confirm the action with the user before finalizing.`,
      messages: history,
      maxToolRoundtrips: 5,
      tools: {
        createAccount,
        modifyAccount,
        deleteAccount,
      },
    });

    logs.push("[LLM] Conversation processed successfully.");
    console.log("[LLM] Conversation processed successfully.");

    // Collect TOOL logs
    toolResults.forEach((toolResult) => {
      if (toolResult.result && toolResult.result.logs) {
        toolResult.result.logs.forEach((log: string) => {
          logs.push(log);
          console.log("[TOOL LOG]", log);
        });
      }
    });

    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content:
            text ||
            toolResults.map((toolResult) => toolResult.result.message).join("\n"),
        },
      ],
      logs, // Include all logs in the response
    };
  } catch (error) {
    logs.push("[LLM] Error during conversation:", error instanceof Error ? error.message : JSON.stringify(error));
    console.error("[LLM] Error during conversation:", error);

    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: `There's a problem executing the request. Please try again. Error details: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
      logs,
    };
  }
}

const createAccount = tool({
  description: "Create a new account in Wonderland with comprehensive details.",
  parameters: z.object({
    Name: z.string().optional().describe("The name of the account holder."),
    Description: z.string().optional().describe("A description for the account."),
    "Client Company Name": z.string().optional().describe("The name of the client company."),
    "Client URL": z.string().optional().describe("The client's URL."),
    Industry: z.string().optional().describe("The industry of the client."),
    "Primary Contact Person": z.string().optional().describe("The primary contact person."),
    "About the Client": z.string().optional().describe("Information about the client."),
    "Primary Objective": z.string().optional().describe("The primary objective of the account."),
    "Talking Points": z.string().optional().describe("Key talking points for the account."),
    "Contact Information": z.string().optional().describe("Contact details for the client."),
    "Priority Image Type": z.string().optional().describe("Image priorities for the account."),
  }),
  execute: async (fields) => {
    const logs: string[] = [];
    let recordId: string | null = null;

    try {
      logs.push("[TOOL] Starting createAccount...");
      console.log("[TOOL] Starting createAccount...");
      logs.push("[TOOL] Initial fields received:", JSON.stringify(fields, null, 2));

      // Convert Name and Client Company Name to Title Case
      const toTitleCase = (str: string) =>
        str.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

      if (fields.Name) fields.Name = toTitleCase(fields.Name);
      if (fields["Client Company Name"]) fields["Client Company Name"] = toTitleCase(fields["Client Company Name"]);

      // Use Client Company Name as fallback if Name is not provided
      const accountName = fields.Name || fields["Client Company Name"];
      if (!accountName) {
        return {
          message: "Please provide the account name to begin creating the account.",
          logs,
        };
      }

      // Fetch allowed values for Priority Image Type
      const allowedPriorityImageTypes = ["AI Generated", "Google Images", "Stock Images", "Uploaded Media", "Social Media"];

      // Validate Priority Image Type
      if (fields["Priority Image Type"] && !allowedPriorityImageTypes.includes(fields["Priority Image Type"])) {
        return {
          message: `The provided Priority Image Type "${fields["Priority Image Type"]}" is not valid. Please choose one of the following: ${allowedPriorityImageTypes.join(
            ", "
          )}.`,
          logs,
        };
      }

      // Create draft account immediately if it doesn't already exist
      if (!recordId) {
        const initialRecord = await airtableBase("Accounts").create({
          Name: accountName,
          Status: "Draft", // Automatically set to Draft
        });
        recordId = initialRecord.id;

        logs.push(`[TOOL] Created draft account with Record ID: ${recordId}`);
        console.log(`[TOOL] Created draft account with Record ID: ${recordId}`);
      }

      // Auto-generate missing fields
      const autoGeneratedFields: Record<string, string> = {};
      if (!fields.Description) {
        autoGeneratedFields.Description = `A general account for ${accountName}.`;
      }
      if (!fields["About the Client"]) {
        autoGeneratedFields["About the Client"] = `The client specializes in ${
          fields.Description?.toLowerCase() || "their field"
        }.`;
      }
      if (!fields["Primary Objective"]) {
        autoGeneratedFields["Primary Objective"] = `To enhance visibility for ${accountName} in ${
          fields.Industry || "their industry"
        }.`;
      }
      if (!fields["Talking Points"]) {
        autoGeneratedFields["Talking Points"] = `Focus on innovation and engagement for ${accountName}.`;
      }
      if (!fields["Contact Information"]) {
        autoGeneratedFields["Contact Information"] = "Contact details not provided.";
      }
      if (!fields["Priority Image Type"]) {
        autoGeneratedFields["Priority Image Type"] = ""; // Default to blank
      }

      logs.push("[TOOL] Auto-generated fields:", JSON.stringify(autoGeneratedFields, null, 2));
      console.log("[TOOL] Auto-generated fields:", autoGeneratedFields);

      // Update the record with additional and auto-generated fields
      const updateFields = { ...fields, ...autoGeneratedFields };
      delete updateFields.Name; // Name was already used in the initial creation
      delete updateFields["Client Company Name"]; // Same logic as Name
      const updatedRecord = await airtableBase("Accounts").update(recordId, updateFields);

      logs.push("[TOOL] Updated account fields incrementally:", JSON.stringify(updateFields, null, 2));
      console.log("[TOOL] Updated account fields incrementally:", updateFields);

      // Continue gathering information without revealing that the draft was created
      return {
        message: `Got it! Here's what I have so far for the account "${accountName}":
        
        **Name:** ${accountName}
        **Description:** ${updateFields.Description}
        **Priority Image Type:** ${updateFields["Priority Image Type"] || "Not provided"}
        **Status:** Draft
        
        Would you like to add more details, such as the industry, contact person, or primary objective?`,
        recordId,
        logs,
      };
    } catch (error) {
      logs.push("[TOOL] Error during account creation:", error instanceof Error ? error.message : JSON.stringify(error));
      console.error("[TOOL] Error during account creation:", error);
      throw { message: "Account creation failed. Check logs for details.", logs };
    }
  },
});


const modifyAccount = tool({
  description: "Modify any field of an existing account in Wonderland.",
  parameters: z.object({
    recordId: z.string().describe("The record ID of the account to modify."),
    fields: z.object({
      Name: z.string().optional(),
      Description: z.string().optional(),
      "Client Company Name": z.string().optional(),
      "Client URL": z.string().optional(),
      Status: z.string().optional(),
      Industry: z.string().optional(),
      "Primary Contact Person": z.string().optional(),
      "About the Client": z.string().optional(),
      "Primary Objective": z.string().optional(),
      "Talking Points": z.string().optional(),
      "Contact Information": z.string().optional(),
    })
      .partial()
      .refine((obj) => Object.keys(obj).length > 0, {
        message: "At least one field must be provided to update.",
      }),
  }),
  execute: async ({ recordId, fields }) => {
    const logs: string[] = [];
    try {
      logs.push("[TOOL] Starting modifyAccount...");
      logs.push(`Record ID: ${recordId}, Fields: ${JSON.stringify(fields)}`);

      if (!recordId) {
        throw new Error("recordId is required to identify the account.");
      }

      const accountRecord = await airtableBase("Accounts").find(recordId);

      if (!accountRecord) {
        throw new Error(`No account found with the record ID: ${recordId}`);
      }

      logs.push("[TOOL] Account found:", JSON.stringify(accountRecord, null, 2));

      // Match Status and Industry to closest allowed values dynamically
      const allowedStatuses = ["Active", "Disabled", "New"];
      if (fields.Status) {
        fields.Status = allowedStatuses.reduce((closest, current) =>
          fields.Status!.toLowerCase().includes(current.toLowerCase()) ? current : closest,
          allowedStatuses[0]
        );
      }

      const allowedIndustries = await airtableBase("Accounts").select({ fields: ["Industry"] }).all();
      const industryOptions = allowedIndustries
        .map((record) => record.get("Industry"))
        .filter((value): value is string => typeof value === "string");
      if (fields.Industry && industryOptions.length > 0) {
        fields.Industry = industryOptions.reduce((closest, current) =>
          fields.Industry!.toLowerCase().includes(current.toLowerCase()) ? current : closest,
          industryOptions[0]
        );
      }

      logs.push("[TOOL] Updating account with fields:", JSON.stringify(fields, null, 2));

      const updatedRecord = await airtableBase("Accounts").update(accountRecord.id, fields);

      logs.push("[TOOL] Account updated successfully:", JSON.stringify(updatedRecord, null, 2));

      return {
        message: `Account successfully updated. Updated fields: ${JSON.stringify(fields)}.`,
        recordId: updatedRecord.id,
        logs,
      };
    } catch (error) {
      logs.push("[TOOL] Error modifying account in Airtable:", error instanceof Error ? error.message : JSON.stringify(error));
      throw { message: "Failed to modify account. Check logs for details.", logs };
    }
  },
});

const deleteAccount = tool({
  description: "Delete an existing account in Wonderland by changing its status to 'Deleted'.",
  parameters: z.object({
    recordId: z.string().describe("The record ID of the account to delete."),
  }),
  execute: async ({ recordId }) => {
    const logs: string[] = [];
    try {
      logs.push("[TOOL] Starting deleteAccount...");
      logs.push(`Record ID: ${recordId}`);

      if (!recordId) {
        throw new Error("recordId is required to identify the account.");
      }

      const accountRecord = await airtableBase("Accounts").find(recordId);

      if (!accountRecord) {
        throw new Error(`No account found with the record ID: ${recordId}`);
      }

      logs.push("[TOOL] Account found:", JSON.stringify(accountRecord, null, 2));

      logs.push("[TOOL] Changing account status to 'Deleted'...");
      const updatedRecord = await airtableBase("Accounts").update(accountRecord.id, { Status: "Deleted" });

      logs.push("[TOOL] Account status updated successfully:", JSON.stringify(updatedRecord, null, 2));

      return {
        message: `Account with record ID ${recordId} has been successfully marked as 'Deleted'.`,
        recordId: updatedRecord.id,
        logs,
      };
    } catch (error) {
      logs.push("[TOOL] Error deleting account in Airtable:", error instanceof Error ? error.message : JSON.stringify(error));
      throw { message: "Failed to delete account. Check logs for details.", logs };
    }
  },
});