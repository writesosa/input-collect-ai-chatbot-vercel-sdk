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
let creationProgress: number | null = null; // Track user progress in account creation

export async function continueConversation(history: Message[]) {
  const logs: string[] = [];
  const fieldsToUpdate: Record<string, any> = {};
  let questionToAsk: string | null = null;

  try {
    logs.push("[LLM] Starting continueConversation...");

    // Intent classification (NEW)
    const intentResponse = await generateText({
      model: openai("gpt-4o"),
      system: `You are a Wonderland assistant.
        Classify the user's latest message into one of the following intents:
        - "account_creation": If the user is asking to create, update, or manage an account.
        - "general_query": If the user is asking a general question about Wonderland or unrelated topics.
        Respond only with the classification.`,
      messages: history,
      maxToolRoundtrips: 1,
    });

    const userIntent = intentResponse.text.trim();
    logs.push(`[LLM] Detected intent: ${userIntent}`);

    // Handle general queries
    if (userIntent === "general_query") {
      logs.push("[LLM] General query detected. Passing to standard processing.");
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
          - Switch to a different account by looking up records based on a specific field and value.
          - Answer questions you know about Wonderland.
          - When the request is unknown prompt the user for more information to establish intent.

          When creating, modifying, or switching accounts:
          - Confirm the action with the user before finalizing.
          - Provide clear feedback on the current record being worked on, including its Record ID.`,
        messages: history,
        maxToolRoundtrips: 5,
        tools: {
          createAccount,
          modifyAccount,
          deleteAccount,
          switchRecord,
        },
      });

      logs.push("[LLM] General query processed successfully.");
      return { messages: [...history, { role: "assistant", content: text }], logs };
    }

    // Handle account creation logic
    if (userIntent === "account_creation") {
      logs.push("[LLM] Account creation detected. Processing...");

      for (const msg of history) {
        if (msg.role === "user") {
          if (!fieldsToUpdate.Name && msg.content.toLowerCase().includes("called")) {
            fieldsToUpdate.Name = toTitleCase(msg.content.match(/called\s(.+)/i)?.[1] || "");
          }
          if (!fieldsToUpdate.Description && msg.content.toLowerCase().includes("about")) {
            fieldsToUpdate.Description = msg.content.match(/about\s(.+)/i)?.[1];
          }
          if (!fieldsToUpdate.Website && msg.content.toLowerCase().includes("http")) {
            fieldsToUpdate.Website = msg.content.match(/(http[^\s]+)/i)?.[1] || "";
          }
        }
      }

      if (fieldsToUpdate.Name && !currentRecordId) {
        logs.push(`[LLM] Detected account name: ${fieldsToUpdate.Name}`);
        const createResponse = await createAccount.execute({
          Name: fieldsToUpdate.Name,
          "Priority Image Type": "AI Generated",
        });

        currentRecordId = createResponse.recordId || null;
        if (!currentRecordId) {
          throw new Error("Failed to retrieve Record ID after creating an account.");
        }
        logs.push(`[TOOL] Draft created with Record ID: ${currentRecordId}`);
      }

      // Determine the next question (if needed)
      questionToAsk = getNextQuestion(fieldsToUpdate, logs);

      if (questionToAsk) {
        logs.push(`[LLM] Asking next question: ${questionToAsk}`);
        return {
          messages: [
            ...history,
            { role: "assistant", content: questionToAsk },
          ],
          logs,
        };
      }

      // Finalize the account
      if (currentRecordId) {
        logs.push(`[LLM] All details captured. Updating record ID: ${currentRecordId} to New status.`);
        await modifyAccount.execute({
          recordId: currentRecordId,
          fields: { Status: "New" },
        });
        logs.push(`[TOOL] Record ID: ${currentRecordId} transitioned to New status.`);
      }
    }

    // Process LLM response for account-related actions
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
        - Switch to a different account by looking up records based on a specific field and value.
        - Answer questions you know about Wonderland.
        - When the request is unknown prompt the user for more information to establish intent.

        When creating, modifying, or switching accounts:
        - Confirm the action with the user before finalizing.
        - Provide clear feedback on the current record being worked on, including its Record ID.`,
      messages: history,
      maxToolRoundtrips: 5,
      tools: {
        createAccount,
        modifyAccount,
        deleteAccount,
        switchRecord,
      },
    });

    logs.push("[LLM] Account-related query processed successfully.");
    return { messages: [...history, { role: "assistant", content: text }], logs };
  } catch (error) {
    logs.push(`[LLM] Error during conversation: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    console.error("[LLM] Error during conversation:", error);
    return { messages: [...history, { role: "assistant", content: "An error occurred." }], logs };
  }
}
// Helper: Get the next question to ask during account creation
const getNextQuestion = (fields: Record<string, any>, logs: string[]): string | null => {
  if (!fields["Client URL"]) {
    logs.push("[LLM] Missing field: Client URL. Prompting user for website or social links.");
    return "Can you share the company's website or any social media links (e.g., Instagram, Facebook, Blog, or others)?";
  }

  if (!fields.Description) {
    logs.push("[LLM] Missing field: Description. Prompting user for company details.");
    return "Can you tell me more about the company, including its industry, purpose, or mission?";
  }

  if (!fields["Talking Points"]) {
    logs.push("[LLM] Missing field: Talking Points. Prompting user for major objectives.");
    return "What are the major objectives or talking points you'd like to achieve with Wonderland?";
  }

  return null; // All questions completed
};


// Helper: Validate URLs
const validateURL = (url: string): string | null => {
  try {
    const validUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
    return validUrl.href;
  } catch {
    return null;
  }
};

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

