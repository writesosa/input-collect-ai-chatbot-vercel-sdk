"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import users from "./users.json";
import Airtable from "airtable";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Simulated user data for logging and updates
const currentUserData = {
  name: "",
  accountNumber: "",
  phoneNumber: "",
  balance: 0,
};

// Initialize Airtable base
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID || "missing_base_id");

export async function continueConversation(history: Message[]) {
  "use server";

  try {
    console.log("[LLM] continueConversation");
    const { text, toolResults } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a Wonderland assistant!
        Reply with nicely formatted markdown. 
        Keep your replies short and concise. 
        If this is the first reply send a nice welcome message.
        If the selected Account is different mention account or company name once.

        Perform the following actions:
        - Create a new account in Wonderland when the user requests it.
        - Modify an existing account in Wonderland when the user requests it.
        - Delete an existing account in Wonderland when the user requests it.

        When creating or modifying an account:
        - Extract the required information (e.g., account name, description, or specific fields to update) from the user's input.
        - Ensure all extracted values are sent outside the user message in a structured format.
        - Confirm the action with the user before finalizing.
        `,
      messages: history,
      maxToolRoundtrips: 5,
      tools: {
        createAccount,
        modifyAccount,
        deleteAccount,
      },
    });

    return {
      messages: [
        ...history,
        {
          role: "assistant" as const,
          content:
            text ||
            toolResults.map((toolResult) => toolResult.result).join("\n"),
        },
      ],
    };
  } catch (error) {
    console.error("[LLM] Error in continueConversation:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    });

    return {
      messages: [
        ...history,
        {
          role: "assistant" as const,
          content: `There's a problem executing the request. Please try again. Error details: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
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
      logs.push("[TOOL] createAccount started.");
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

      // Fetch existing records for suggestions
      logs.push("[TOOL] Fetching existing records for suggestions...");
      const existingRecords = await airtableBase("Accounts").select().firstPage();
      const primaryContactSuggestions = existingRecords
        .map((record) => record.get("Primary Contact Person"))
        .filter((value): value is string => typeof value === "string");

      // Fetch available industry options from Airtable
      logs.push("[TOOL] Fetching available industries...");
      const allowedIndustries = await airtableBase("Accounts").select({ fields: ["Industry"] }).all();
      const industryOptions = allowedIndustries
        .map((record) => record.get("Industry"))
        .filter((value): value is string => typeof value === "string");

      // Guess Industry based on client information
      const guessIndustry = (info: string) => {
        if (/jeep|car|vehicle|automobile/i.test(info)) return "Automotive";
        if (/dog|pet/i.test(info)) return "Pet Care";
        if (/legal|law/i.test(info)) return "Legal";
        return "General";
      };
      fields.Industry = fields.Industry || guessIndustry(fields.Description || fields["About the Client"] || "");

      logs.push(`[TOOL] Industry guessed: ${fields.Industry}`);

      // Rewrite Description based on client-provided info
      const rewriteDescription = (info: string) => {
        return `This account is dedicated to ${info.toLowerCase()}, aiming to enhance visibility and engagement in the ${fields.Industry || "General"} sector with a focus on tailored solutions.`;
      };
      fields.Description = fields.Description || rewriteDescription(fields["About the Client"] || fields.Name || "");

      // Generate Primary Objective and Talking Points based on client info
      const generatePrimaryObjective = (info: string) => {
        return `To promote ${info.toLowerCase()} effectively and achieve maximum engagement with the target audience.`;
      };
      const generateTalkingPoints = (info: string) => {
        return `Highlighting ${info.toLowerCase()} with a focus on quality, customer-first strategies, and innovative solutions.`;
      };
      fields["Primary Objective"] =
        fields["Primary Objective"] || generatePrimaryObjective(fields.Description || fields.Name || "");
      fields["Talking Points"] =
        fields["Talking Points"] || generateTalkingPoints(fields.Description || fields.Name || "");

      logs.push("[TOOL] Finalized Primary Objective and Talking Points.");

      // Prompt for Priority Image field if missing
      const priorityImageOptions = [
        "AI Generated",
        "Stock Images",
        "Google Images",
        "Social Media",
        "Uploaded Media",
      ];
      if (!fields["Priority Image"]) {
        logs.push("[TOOL] Priority Image missing.");
        return {
          message: `What kind of images should this account generate or display? Please choose one of the following options: ${priorityImageOptions.join(
            ", "
          )}`,
          logs,
        };
      }
      if (!priorityImageOptions.includes(fields["Priority Image"])) {
        logs.push("[TOOL] Invalid Priority Image option.");
        return {
          message: `Invalid choice for Priority Image. Please choose from: ${priorityImageOptions.join(", ")}`,
          logs,
        };
      }

      // Prompt for Primary Contact Person if missing
      if (!fields["Primary Contact Person"]) {
        const suggestionMessage = primaryContactSuggestions.length > 0
          ? `The following primary contact persons are available: ${primaryContactSuggestions.join(", ")}. Is one of them the contact person for this account, or should we add someone else?`
          : "No existing contact persons found. Please provide a contact person for this account.";
        logs.push("[TOOL] Missing Primary Contact Person detected.");
        return { message: suggestionMessage, logs };
      }

      // Merge suggested values with provided fields
      const finalFields = {
        ...fields,
        Status: fields.Status || "New",
        "Client URL": fields["Client URL"] || "https://example.com",
        "Contact Information": fields["Contact Information"] || "contact@example.com",
        Description: fields.Description.padEnd(600, "."),
      };

      logs.push("[TOOL] Final fields prepared for account creation:", JSON.stringify(finalFields, null, 2));

      // Create a new record in Airtable
      logs.push("[TOOL] Creating a new Airtable record...");
      const createdRecord = await airtableBase("Accounts").create(finalFields);

      if (!createdRecord || !createdRecord.id) {
        logs.push("[TOOL] Airtable record creation failed: No valid record ID returned.");
        throw new Error("Failed to create the account in Airtable. Please check your fields and try again.");
      }

      logs.push(`[TOOL] Account created successfully in Airtable. Record ID: ${createdRecord.id}`);

      return {
        message: `Account created successfully for ${fields.Name} with the provided and suggested details. Record ID: ${createdRecord.id}`,
        recordId: createdRecord.id,
        logs,
      };
    } catch (error) {
      logs.push("[TOOL] Error during account creation:", error instanceof Error ? error.message : JSON.stringify(error));

      return {
        message: "Account creation failed. Check logs for details.",
        logs,
      };
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
    console.log("[TOOL] modifyAccount", { recordId, fields });

    try {
      if (!recordId) {
        throw new Error("recordId is required to identify the account.");
      }

      console.log("[TOOL] Searching by record ID...");
      const accountRecord = await airtableBase("Accounts").find(recordId);

      if (!accountRecord) {
        throw new Error(`No account found with the record ID: ${recordId}`);
      }

      console.log("[TOOL] Account found:", accountRecord);

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

      console.log("[TOOL] Updating account with fields:", fields);

      const updatedRecord = await airtableBase("Accounts").update(accountRecord.id, fields);

      console.log("[TOOL] Account updated successfully:", updatedRecord);

      return {
        message: `Account successfully updated. Updated fields: ${JSON.stringify(fields)}.`,
        recordId: updatedRecord.id,
      };
    } catch (error) {
      console.error("[TOOL] Error modifying account in Airtable:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });

      throw new Error(
        JSON.stringify({
          error: "Failed to modify account.",
          details: error instanceof Error ? { message: error.message, stack: error.stack } : { raw: error },
        })
      );
    }
  },
});

const deleteAccount = tool({
  description: "Delete an existing account in Wonderland by changing its status to 'Deleted'.",
  parameters: z.object({
    recordId: z.string().describe("The record ID of the account to delete."),
  }),
  execute: async ({ recordId }) => {
    console.log("[TOOL] deleteAccount", { recordId });

    try {
      if (!recordId) {
        throw new Error("recordId is required to identify the account.");
      }

      console.log("[TOOL] Searching by record ID...");
      const accountRecord = await airtableBase("Accounts").find(recordId);

      if (!accountRecord) {
        throw new Error(`No account found with the record ID: ${recordId}`);
      }

      console.log("[TOOL] Account found:", accountRecord);

      console.log("[TOOL] Changing account status to 'Deleted'...");
      const updatedRecord = await airtableBase("Accounts").update(accountRecord.id, { Status: "Deleted" });

      console.log("[TOOL] Account status updated successfully:", updatedRecord);

      return {
        message: `Account with record ID ${recordId} has been successfully marked as 'Deleted'.`,
        recordId: updatedRecord.id,
      };
    } catch (error) {
      console.error("[TOOL] Error deleting account in Airtable:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        raw: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });

      throw new Error(
        JSON.stringify({
          error: "Failed to delete account.",
          details: error instanceof Error ? { message: error.message, stack: error.stack } : { raw: error },
        })
      );
    }
  },
});
