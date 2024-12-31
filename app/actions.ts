"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import Airtable from "airtable";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Initialize Airtable base
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID || "missing_base_id");

export async function continueConversation(history: Message[]) {
  const logs: string[] = [];
  try {
    logs.push("[LLM] Starting continueConversation...");

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

    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content:
            text ||
            toolResults.map((toolResult) => toolResult.result).join("\n"),
        },
      ],
      logs,
    };
  } catch (error) {
    logs.push("[LLM] Error during conversation:", error instanceof Error ? error.message : JSON.stringify(error));

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
    Instagram: z.string().optional().describe("The Instagram handle of the client."),
    Facebook: z.string().optional().describe("The Facebook page URL of the client."),
    Blog: z.string().optional().describe("The blog URL of the client."),
    Status: z.string().optional().describe("The status of the account."),
    Industry: z.string().optional().describe("The industry of the client."),
    "Primary Contact Person": z.string().optional().describe("The primary contact person."),
    "About the Client": z.string().optional().describe("Information about the client."),
    "Primary Objective": z.string().optional().describe("The primary objective of the account."),
    "Talking Points": z.string().optional().describe("Key talking points for the account."),
    "Contact Information": z.string().optional().describe("Contact information for the client."),
    "Priority Image": z.string().optional().describe("The type of images this account should generate or display."),
  }),
  execute: async (fields) => {
    const logs: string[] = [];
    try {
      logs.push("[TOOL] Starting createAccount...");
      logs.push("[TOOL] Initial fields received:", JSON.stringify(fields, null, 2));

      // Ensure Name and Company Name consistency
      if (!fields.Name && fields["Client Company Name"]) {
        fields.Name = fields["Client Company Name"];
      } else if (!fields["Client Company Name"] && fields.Name) {
        fields["Client Company Name"] = fields.Name;
      }

      // Title case the Name field
      if (fields.Name) {
        fields.Name = fields.Name.replace(/\b\w/g, (char) => char.toUpperCase());
      }

      logs.push("[TOOL] Updated Name and Client Company Name consistency.");

      // Fetch available industry options from Airtable
      logs.push("[TOOL] Fetching available industries...");
      const allowedIndustries = await airtableBase("Accounts").select({ fields: ["Industry"] }).all();
      const industryOptions = allowedIndustries
        .map((record) => record.get("Industry"))
        .filter((value): value is string => typeof value === "string");

      if (industryOptions.length === 0) {
        logs.push("[TOOL] No industries found in Airtable.");
        throw { message: "No industries available in Airtable.", logs };
      }

      logs.push(`[TOOL] Available industries: ${industryOptions.join(", ")}`);

      // Prompt ChatGPT to guess or show all industries dynamically
      if (!fields.Industry) {
        logs.push("[TOOL] Industry not provided. Asking AI for suggestion.");
        return {
          message: `I couldn't determine the industry for the account. Based on the provided description, here are some suggestions or all available options: ${industryOptions.join(", ")}. Please select one.`,
          logs,
        };
      }

      if (!industryOptions.includes(fields.Industry)) {
        logs.push("[TOOL] Invalid industry provided.");
        return {
          message: `The provided industry "${fields.Industry}" is not valid. Available options are: ${industryOptions.join(", ")}. Please select a valid industry.`,
          logs,
        };
      }

      logs.push(`[TOOL] Industry selected: ${fields.Industry}`);

      // Ensure "About the Client" is dynamic
      fields["About the Client"] =
        fields["About the Client"] ||
        `The client specializes in ${fields.Description?.toLowerCase() || "their field"}.`;

      logs.push("[TOOL] About the Client rewritten dynamically.");

      // Generate Primary Objective
      fields["Primary Objective"] =
        fields["Primary Objective"] || `Enhance visibility for ${fields.Name || "the client"} in ${fields.Industry}.`;

      logs.push("[TOOL] Primary Objective dynamically generated.");

      // Prepare for talking points
      const gptPrompt = `Given the following details about an account: 
      Name: ${fields.Name}, 
      Industry: ${fields.Industry}, 
      Description: ${fields.Description}, 
      Client Details: ${fields["About the Client"]}, 
      generate engaging talking points for marketing and strategy.`;

      logs.push("[TOOL] Sending prompt to AI for Talking Points.");
      const aiResponse = await generateText({ prompt: gptPrompt });
      fields["Talking Points"] = aiResponse.text;

      logs.push("[TOOL] Talking Points dynamically generated by AI.");

      // Finalize fields
      const finalFields = {
        ...fields,
        Status: fields.Status || "New",
      };

      logs.push("[TOOL] Final fields prepared for Airtable creation:", JSON.stringify(finalFields, null, 2));

      // Create the account in Airtable
      logs.push("[TOOL] Creating account in Airtable...");
      const createdAccount = await airtableBase("Accounts").create(finalFields);

      if (!createdAccount || !createdAccount.id) {
        logs.push("[TOOL] Airtable creation failed.");
        throw { message: "Account creation failed in Airtable.", logs };
      }

      logs.push("[TOOL] Account created successfully in Airtable:", JSON.stringify(createdAccount, null, 2));

      // Fetch the newly created record to verify
      const verifiedAccount = await airtableBase("Accounts").find(createdAccount.id);

      if (!verifiedAccount) {
        logs.push("[TOOL] Verification failed: Account not found after creation.");
        throw { message: "Account verification failed. It was not found in Airtable.", logs };
      }

      logs.push("[TOOL] Account verified successfully in Airtable:", JSON.stringify(verifiedAccount, null, 2));

      // Summarize all fields
      const summary = `### Account Created Successfully\n\n**User-Provided Fields:**\n${JSON.stringify(fields, null, 2)}\n\n**AI-Generated Fields:**\n- Industry: ${fields.Industry}\n- About the Client: ${fields["About the Client"]}\n- Primary Objective: ${fields["Primary Objective"]}\n- Talking Points: ${fields["Talking Points"]}\n\n**Account Record:**\n${JSON.stringify(verifiedAccount.fields, null, 2)}`;
      logs.push("[TOOL] Summary prepared:", summary);

      return { message: summary, logs };
    } catch (error) {
      logs.push("[TOOL] Error during account creation:", error instanceof Error ? error.message : JSON.stringify(error));
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