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

let currentRecordId: string | null = null;
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

let currentRecordId: string | null = null;

export async function continueConversation(history: Message[]) {
  const logs: string[] = [];
  const fieldsToUpdate: Record<string, any> = {};

  let progressTracker = {
    name: false,
    description: false,
    website: false,
    objectives: false,
  };

  const updateProgressTracker = (field: keyof typeof progressTracker) => {
    if (progressTracker.hasOwnProperty(field)) progressTracker[field] = true;
  };

  const allFieldsComplete = () => Object.values(progressTracker).every((status) => status);

  const getNextPrompt = (fields: Record<string, any>, tracker: typeof progressTracker, accountName: string) => {
    if (!tracker.description) return `Could you provide a brief description of the company "${accountName}" and its industry?`;
    if (!tracker.website) return `Could you share the company's website and any social media links?`;
    if (!tracker.objectives) return `Could you share any major talking points and primary objectives for "${accountName}"?`;
    return "";
  };

  try {
    logs.push("[LLM] Starting continueConversation...");
    console.log("[LLM] Starting continueConversation...");

    const detectIntentWithLLM = async (history: Message[]) => {
      const { text } = await generateText({
        model: openai("gpt-4o"),
        system: `
Wonderland is an AI-powered public relations automation system. It dynamically generates content, websites, blog posts, and images to market companies effectively.

You are a Wonderland assistant!
- Reply with nicely formatted markdown.
- Keep your replies short and concise.
- If this is the first reply, send a nice welcome message.
- If the selected Account is different, mention the account or company name once.

Perform the following actions:
- Create a new account in Wonderland when the user requests it.
- Modify an existing account in Wonderland when the user requests it.
- Delete an existing account in Wonderland when the user requests it.
- Synchronize all fields dynamically in real-time as new information becomes available.
- Validate actions to ensure they are successfully executed in Airtable.
- Confirm the current record being worked on, including the Record ID.
- After creating an account, follow up with prompts for:
  1. A brief description of the company and the industry.
  2. The company's website and any social media links.
  3. Major talking points and primary objectives.
        `,
        messages: history,
        maxTokens: 50,
      });

      return text.toLowerCase().includes("create") || text.toLowerCase().includes("make")
        ? "create"
        : text.toLowerCase().includes("modify") || text.toLowerCase().includes("edit")
        ? "modify"
        : text.toLowerCase().includes("delete") || text.toLowerCase().includes("remove")
        ? "delete"
        : "unknown";
    };

    const intent = await detectIntentWithLLM(history);

    if (intent === "unknown") {
      return {
        messages: [
          ...history,
          {
            role: "assistant",
            content: "What would you like to do: create, modify, or delete an account?",
          },
        ],
        logs,
      };
    }

    if (intent === "create" && !currentRecordId) {
      logs.push("[LLM] Creating new account...");
      const createResponse = await createAccount.execute({
        Name: fieldsToUpdate.Name || "Unnamed Account",
        "Priority Image Type": "AI Generated",
      });

      if (createResponse.recordId) {
        currentRecordId = createResponse.recordId;
        logs.push(`[TOOL] Draft created with Record ID: ${currentRecordId}`);
        progressTracker.name = true;
      } else {
        throw new Error("Failed to create draft account.");
      }
    }

    if (intent === "modify" && currentRecordId) {
      logs.push(`[LLM] Modifying account with Record ID: ${currentRecordId}`);
      const modifyResponse = await modifyAccount.execute({
        recordId: currentRecordId,
        fields: fieldsToUpdate,
      });

      if (modifyResponse.recordId !== currentRecordId) {
        throw new Error("Record ID mismatch during update.");
      }

      logs.push(`[TOOL] Fields updated successfully for Record ID: ${currentRecordId}`);
    }

    const nextPrompt = allFieldsComplete()
      ? `The account "${fieldsToUpdate.Name}" has been updated with the provided details. Would you like to finalize and create the account as active?`
      : getNextPrompt(fieldsToUpdate, progressTracker, fieldsToUpdate.Name || "Unnamed Account");

    return {
      messages: [
        ...history,
        { role: "assistant", content: nextPrompt },
      ],
      logs,
    };
  } catch (error) {
    logs.push("[LLM] Error during conversation:", error instanceof Error ? error.message : JSON.stringify(error));
    console.error("[LLM] Error during conversation:", error);

    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: `An error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      logs,
    };
  }
}


// Helper: Convert string to Title Case
const toTitleCase = (str: string): string =>
  str.replace(/\w\S*/g, (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

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
    const autoGeneratedFields: Record<string, string> = {};

    try {
      logs.push("[TOOL] Starting createAccount...");
      logs.push("[TOOL] Initial fields received:", JSON.stringify(fields, null, 2));

      // Convert Name and Client Company Name to Title Case
      if (fields.Name) fields.Name = toTitleCase(fields.Name);
      if (fields["Client Company Name"]) fields["Client Company Name"] = toTitleCase(fields["Client Company Name"]);

      const accountName = fields.Name || fields["Client Company Name"];
      if (!accountName) {
        return { message: "Please provide the account name.", logs };
      }

      // Check for existing draft
      const existingDraft = await airtableBase("Accounts")
        .select({
          filterByFormula: `AND({Name} = "${accountName}", {Status} = "Draft")`,
          maxRecords: 1,
        })
        .firstPage();

      if (existingDraft.length > 0) {
        recordId = existingDraft[0].id;
        logs.push(`[TOOL] Reusing existing draft with Record ID: ${recordId}`);
      } else {
        // Auto-generate missing fields
        autoGeneratedFields.Description = fields.Description || `A general account for ${accountName}.`;
        autoGeneratedFields["About the Client"] =
          fields["About the Client"] || `The client specializes in ${fields.Description?.toLowerCase() || "their field"}.`;
        autoGeneratedFields["Primary Objective"] =
          fields["Primary Objective"] || `To enhance visibility for ${accountName} in ${fields.Industry || "their industry"}.`;
        autoGeneratedFields["Talking Points"] =
          fields["Talking Points"] || `Focus on innovation and engagement for ${accountName}.`;
        autoGeneratedFields["Contact Information"] =
          fields["Contact Information"] || "Contact details not provided.";

        logs.push("[TOOL] Auto-generated fields:", JSON.stringify(autoGeneratedFields, null, 2));

        // Create draft account
        const record = await airtableBase("Accounts").create({
          Name: accountName,
          Status: "Draft",
          ...autoGeneratedFields,
          ...fields,
        });

        recordId = record.id;
        logs.push(`[TOOL] Created new draft record with ID: ${recordId}`);
      }

      return {
        message: `Draft account successfully created or reused for "${accountName}".`,
        recordId,
        logs,
      };
    } catch (error) {
      logs.push("[TOOL] Error during account creation:", error instanceof Error ? error.message : JSON.stringify(error));
      console.error("[TOOL] Error during account creation:", error);

      return {
        message: `An error occurred during account creation.`,
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
    const logs: string[] = [];
    try {
      logs.push("[TOOL] Starting modifyAccount...");
      logs.push(`Record ID: ${recordId}, Fields: ${JSON.stringify(fields)}`);

      // Ensure the record ID matches the currentRecordId
      if (recordId !== currentRecordId) {
        throw new Error(
          `Attempting to modify the wrong record. Expected: ${currentRecordId}, Provided: ${recordId}`
        );
      }

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

      // Update currentRecordId to reflect the updated record
      currentRecordId = updatedRecord.id;

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

      // Ensure the record ID matches the currentRecordId
      if (recordId !== currentRecordId) {
        throw new Error(
          `Attempting to delete the wrong record. Expected: ${currentRecordId}, Provided: ${recordId}`
        );
      }

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

      // Clear currentRecordId since the record has been deleted
      currentRecordId = null;

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

const switchRecord = tool({
  description: "Switch the current record being worked on in Wonderland by looking up an account by its name, company, website, or other fields.",
  parameters: z.object({
    lookupField: z.string().describe("The field to search by, such as 'Name', 'Client Company Name', or 'Client URL'."),
    lookupValue: z.string().describe("The value to search for in the specified field."),
  }),
  execute: async ({ lookupField, lookupValue }) => {
    const logs: string[] = [];
    try {
      logs.push("[TOOL] Starting switchRecord...");
      logs.push(`Looking up record by ${lookupField}: ${lookupValue}`);

      // Ensure lookupField is a valid field in the Airtable schema
      const validFields = [
        "Name",
        "Client Company Name",
        "Client URL",
        "Description",
        "Industry",
        "Primary Contact Person",
      ];
      if (!validFields.includes(lookupField)) {
        throw new Error(
          `Invalid lookupField: ${lookupField}. Valid fields are ${validFields.join(", ")}.`
        );
      }

      // Query Airtable to find the record
      const matchingRecords = await airtableBase("Accounts")
        .select({
          filterByFormula: `{${lookupField}} = "${lookupValue}"`,
          maxRecords: 1,
        })
        .firstPage();

      if (matchingRecords.length === 0) {
        throw new Error(`No record found with ${lookupField}: "${lookupValue}".`);
      }

      const matchedRecord = matchingRecords[0];
      currentRecordId = matchedRecord.id;

      logs.push(
        `[TOOL] Successfully switched to record ID: ${currentRecordId} (${lookupField}: ${lookupValue}).`
      );

      return {
        message: `Successfully switched to the account for "${lookupValue}" (Record ID: ${currentRecordId}).`,
        recordId: currentRecordId,
        logs,
      };
    } catch (error) {
      logs.push(
        "[TOOL] Error during switchRecord:",
        error instanceof Error ? error.message : JSON.stringify(error)
      );
      throw { message: "Failed to switch records. Check logs for details.", logs };
    }
  },
});

