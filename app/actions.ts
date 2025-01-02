// Existing script with updates applied

"use server";

import { InvalidToolArgumentsError, generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import Airtable from "airtable";

// Initialize Airtable base
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID || "missing_base_id");

// Define the Message interface
export interface Message {
  role: "user" | "assistant";
  content: string;
}

let currentRecordId: string | null = null;
let creationProgress: number | null = null; // Track user progress in account creation
let lastExtractedFields: Record<string, any> | null = null; // Remember the last extracted fields


// Helper: Convert string to Title Case
const toTitleCase = (str: string): string =>
  str.replace(/\w\S*/g, (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

// Helper: Clean Undefined Fields
const cleanFields = (fields: Record<string, any>) =>
  Object.fromEntries(Object.entries(fields).filter(([_, value]) => value !== undefined));

const extractAndRefineFields = async (
  message: string,
  logs: string[],
  previousMessage?: string
): Promise<Record<string, string>> => {
  logs.push("[LLM] Extracting account fields from user message...");

  const combinedMessage = previousMessage ? `${previousMessage} ${message}` : message;

  const extractionResponse = await generateText({
    model: openai("gpt-4o"),
    system: `You are a Wonderland assistant extracting account details.
      Extract the following fields from the user's message if available:

      {
        "Name": "Anything that sounds like an account name, company name, name for a record or something the user designates as a name.",
        "Client Company Name": "The name of the company, account or record.",
        "Website": "A website URL, if mentioned.",
        "Instagram": "An Instagram handle or link, if mentioned.",
        "Facebook": "A Facebook handle or link, if mentioned.",
        "Blog": "A blog URL, if mentioned.",
        "Description": "Anything that sounds like a description for the record being created.",
        "About the Client": "Any information supplied about the client or company.",
        "Industry": "Any mention of industry, domain, or sector.",
        "Talking Points": "Any objectives or talking points, if mentioned.",
        "Primary Objective": "Any main purpose or goal of creating this account."
      }
      Always extract all fields mentioned in the message. Do not return empty fields.
      Rewrite the extracted fields for clarity and completeness.
      Respond with a JSON object strictly following this schema.`,
    messages: [{ role: "user", content: combinedMessage }],
    maxToolRoundtrips: 1,
  });

  let extractedFields: Record<string, string> = {};

  try {
    logs.push(`[LLM] Full AI Response: ${extractionResponse.text}`);
    extractedFields = JSON.parse(extractionResponse.text.trim());
    logs.push(`[LLM] Extracted fields successfully parsed: ${JSON.stringify(extractedFields)}`);
  } catch (error) {
    logs.push("[LLM] Initial parsing failed. Attempting retry...");

    // Retry parsing logic
    const jsonStart = extractionResponse.text.indexOf("{");
    const jsonEnd = extractionResponse.text.lastIndexOf("}") + 1;
    if (jsonStart !== -1 && jsonEnd !== -1) {
      try {
        const retryJson = extractionResponse.text.substring(jsonStart, jsonEnd);
        extractedFields = JSON.parse(retryJson);
        logs.push(`[LLM] Retry successful. Parsed fields: ${JSON.stringify(extractedFields)}`);
      } catch (retryError) {
        logs.push("[LLM] Retry failed. Defaulting to empty.");
      }
    } else {
      logs.push("[LLM] No JSON structure found in response. Defaulting to empty.");
    }
  }

  lastExtractedFields = { ...lastExtractedFields, ...extractedFields }; // Merge with previously extracted fields
  return extractedFields;
};

export async function continueConversation(history: Message[]) {
  const logs: string[] = [];
  const fieldsToUpdate: Record<string, any> = {};
  let questionToAsk: string | null = null;

  try {
    logs.push("[LLM] Starting continueConversation...");

    // Intent classification
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
      const { text } = await generateText({
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
          - When the request is unknown, prompt the user for more information to establish intent.

          When creating, modifying, or switching accounts:
          - Confirm the action with the user before finalizing.
          - Provide clear feedback on the current record being worked on, including its Record ID.`,
        messages: history,
        maxToolRoundtrips: 5,
      });

      logs.push("[LLM] General query processed successfully.");
      return { messages: [...history, { role: "assistant", content: text }], logs };
    }

    // Handle account creation logic
    if (userIntent === "account_creation") {
      logs.push("[LLM] Account creation detected. Processing...");

      const userMessage = history[history.length - 1]?.content.trim() || "";
      let extractedFields = await extractAndRefineFields(userMessage, logs);

      // Use previously extracted fields if available and valid
      if (!extractedFields.Name && lastExtractedFields?.Name) {
        logs.push("[LLM] Using previously extracted Name field.");
        extractedFields.Name = lastExtractedFields.Name;
      }
      if (currentRecordId && typeof currentRecordId === "string") {
        // Ensure recordFields has a valid object for the currentRecordId
        const recordId = currentRecordId; // Explicitly narrow type to string

        if (!recordFields[recordId]) {
          recordFields[recordId] = {};
        }

        // Merge extracted fields into recordFields
        recordFields[recordId] = {
          ...recordFields[recordId],
          ...extractedFields,
        };

        logs.push(
          `[LLM] Updated fields for record ID ${recordId}: ${JSON.stringify(
            recordFields[recordId]
          )}`
        );

        // Prevent overwriting fields with blank values
        Object.entries(extractedFields).forEach(([key, value]) => {
          if (!value) {
            delete recordFields[recordId][key]; // Safe deletion with recordId
          }
        });
      } else {
        logs.push("[LLM] Skipping field updates: currentRecordId is null or invalid.");
      }


      // If Name or equivalent is missing, prompt the user for it
      if (!currentRecordId && !extractedFields.Name) {
        logs.push("[LLM] Missing Name field. Prompting user...");
        return {
          messages: [
            ...history,
            {
              role: "assistant",
              content: "A name or company name is required to create an account. Please provide it.",
            },
          ],
          logs,
        };
      }

      // Create draft if Name is available
      if (!currentRecordId && extractedFields.Name) {
        logs.push("[LLM] Creating a new draft record...");
        const createResponse = await createAccount.execute({
          Name: extractedFields.Name,
          Status: "Draft",
          "Priority Image Type": "AI Generated",
          ...cleanFields({ ...recordFields[currentRecordId], ...extractedFields }), // Merge existing fields with new ones
        });

        if (createResponse.recordId) {
          currentRecordId = createResponse.recordId;
          logs.push(`[LLM] Draft created successfully with ID: ${currentRecordId}`);
          creationProgress = 0; // Start creation flow
        } else {
          logs.push("[LLM] Failed to create draft. Exiting.");
          return {
            messages: [
              ...history,
              { role: "assistant", content: "An error occurred while creating the account. Please try again." },
            ],
            logs,
          };
        }
      }

      if (!currentRecordId) {
        logs.push("[LLM] Error: currentRecordId is null. Cannot proceed to the next question.");
        return {
          messages: [...history, { role: "assistant", content: "No record ID available to continue." }],
          logs,
        };
      }

      // Skip redundant questions
      questionToAsk = getNextQuestion(currentRecordId, logs);
      if (!questionToAsk) {
        logs.push("[LLM] No more questions to ask. All fields have been captured.");
        return {
          messages: [...history, { role: "assistant", content: "The account creation process is complete." }],
          logs,
        };
      }

      logs.push(`[LLM] Generated next question: "${questionToAsk}"`);
      return {
        messages: [...history, { role: "assistant", content: questionToAsk }],
        logs,
      };
    }
  } catch (error) {
    logs.push(`[LLM] Error during conversation: ${error instanceof Error ? error.message : "Unknown error occurred."}`);
    return { messages: [...history, { role: "assistant", content: "An error occurred." }], logs };
  }
}

// Helper: Update record fields and prevent redundant updates
const recordFields: Record<string, Record<string, any>> = {};

const updateRecordFields = (recordId: string, newFields: Record<string, any>, logs: string[]) => {
  if (!recordFields[recordId]) {
    recordFields[recordId] = {};
  }

  Object.entries(newFields).forEach(([key, value]) => {
    if (value && !recordFields[recordId][key]) {
      recordFields[recordId][key] = value;
      logs.push(`[LLM] Field updated: ${key} = ${value}`);
    } else if (recordFields[recordId][key]) {
      logs.push(`[LLM] Field already filled: ${key}. Skipping update.`);
    }
  });
};

// Helper: Determine the next question based on missing fields
const getNextQuestion = (recordId: string, logs: string[]): string | null => {
  const questions = [
    {
      progress: 0,
      prompt: "Can you share any of the following for the company: Website, Instagram, Facebook, or Blog?",
      fields: ["Website", "Instagram", "Facebook", "Blog"],
    },
    {
      progress: 1,
      prompt: "Can you tell me more about the company, including its industry, purpose, or mission?",
      fields: ["Description", "About the Client", "Industry"],
    },
    {
      progress: 2,
      prompt: "What are the major objectives or talking points you'd like to achieve with Wonderland?",
      fields: ["Talking Points", "Primary Objective"],
    },
  ];

  for (const question of questions) {
    if (creationProgress === question.progress) {
      // Check if any fields in the current question category are already filled
      const filledFields = question.fields.some((field) => recordFields[recordId]?.[field]);

      if (filledFields) {
        logs.push(
          `[LLM] Skipping question for progress ${question.progress} as some fields are already filled: ${question.fields.join(", ")}`
        );
        creationProgress++; // Advance to the next question
        continue; // Check the next question
      }

      logs.push(`[LLM] Asking question for progress ${question.progress}: "${question.prompt}"`);
      creationProgress++; // Advance to the next question
      return question.prompt;
    }
  }

  logs.push("[LLM] All predefined questions have been asked or skipped. No further questions.");
  return null; // All questions asked
};





const createAccount = tool({
  description: "Create a new account in Wonderland with comprehensive details.",
  parameters: z.object({
    Name: z.string().describe("The name of the account holder. This field is required."),
    Status: z.string().optional().default("Draft").describe("The status of the account."),
    "Priority Image Type": z
      .string()
      .optional()
      .default("AI Generated")
      .describe("The priority image type for the account, defaults to 'AI Generated'."),
    Description: z.string().optional().describe("A description for the account."),
    Website: z.string().optional().describe("The website URL of the client."),
    Instagram: z.string().optional().describe("The Instagram link of the client."),
    Facebook: z.string().optional().describe("The Facebook link of the client."),
    Blog: z.string().optional().describe("The blog URL of the client."),
    "Primary Objective": z.string().optional().describe("The primary objective of the account."),
    "Talking Points": z.string().optional().describe("Key talking points for the account."),
  }),
  execute: async (fields) => {
    const logs: string[] = [];
    let recordId: string | null = null;

    try {
      logs.push("[TOOL] Starting createAccount...");
      logs.push("[TOOL] Initial fields received:", JSON.stringify(fields, null, 2));

      // Ensure account name is provided
      if (!fields.Name) {
        logs.push("[TOOL] Missing required field: Name.");
        throw new Error("The 'Name' field is required to create an account.");
      }

      // Check for existing draft account
      logs.push("[TOOL] Checking for existing draft account with the same name...");
      const existingDraft = await airtableBase("Accounts")
        .select({
          filterByFormula: `AND({Name} = "${fields.Name}", {Status} = "Draft")`,
          maxRecords: 1,
        })
        .firstPage();

      if (existingDraft.length > 0) {
        recordId = existingDraft[0].id;
        logs.push(`[TOOL] Reusing existing draft account with Record ID: ${recordId}`);
      } else {
        // Populate missing optional fields with defaults
        logs.push("[TOOL] Creating a new draft account...");
        try {
          const record = await airtableBase("Accounts").create({
            Name: fields.Name,
            Status: fields.Status || "Draft",
            Description: fields.Description || `A general account for ${fields.Name}.`,
            Website: fields.Website || "",
            Instagram: fields.Instagram || "",
            Facebook: fields.Facebook || "",
            Blog: fields.Blog || "",
            "Primary Objective":
              fields["Primary Objective"] || `Increase visibility for ${fields.Name}.`,
            "Talking Points":
              fields["Talking Points"] || `Focus on innovation and engagement for ${fields.Name}.`,
            "Priority Image Type": fields["Priority Image Type"], // Default to "AI Generated"
          });
          recordId = record.id;
          logs.push(`[TOOL] New draft account created with Record ID: ${recordId}`);
        } catch (createError) {
          logs.push(
            "[TOOL] Error creating new draft account:",
            createError instanceof Error ? createError.message : JSON.stringify(createError)
          );
          throw createError;
        }
      }

      return {
        message: `Account successfully created or reused for "${fields.Name}".`,
        recordId,
        logs,
      };
    } catch (error) {
      logs.push(
        "[TOOL] Error during account creation:",
        error instanceof Error ? error.message : JSON.stringify(error)
      );
      console.error("[TOOL] Error during account creation:", error);

      return {
        message: "An error occurred while creating the account. Please check the logs for more details.",
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