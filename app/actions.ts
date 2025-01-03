actions.ts

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

  if (!message || message.trim() === "") {
    logs.push("[LLM] Empty user message detected. Skipping field extraction.");
    return {};
  }

  const combinedMessage = previousMessage ? `${previousMessage} ${message}` : message;

  let extractedFields: Record<string, string> = {};
  let extractionResponse: { text: string } | null = null;

  try {
    extractionResponse = await generateText({
      model: openai("gpt-4o"),
      system: `You are a Wonderland assistant extracting account details.
        Extract the following fields from the user's message if available:

        {
          "Name": "Account or company name.",
          "Client Company Name": "The associated company.",
          "Website": "A website URL.",
          "Instagram": "An Instagram handle or link.",
          "Facebook": "A Facebook handle or link.",
          "Blog": "A blog URL.",
          "Description": "Description for the account.",
          "Industry": "Mention of industry.",
          "Talking Points": "Objectives or talking points.",
          "Primary Objective": "Main purpose or goal."
        }
        Always respond with a JSON object strictly following this schema.`,
      messages: [{ role: "user", content: combinedMessage }],
      maxToolRoundtrips: 1,
    });

    logs.push(`[LLM] Full AI Response: ${extractionResponse.text}`);
    extractedFields = JSON.parse(extractionResponse.text.trim());
    logs.push(`[LLM] Extracted fields successfully parsed: ${JSON.stringify(extractedFields)}`);
  } catch (error) {
    logs.push("[LLM] Initial parsing failed. Attempting retry...");

    if (extractionResponse?.text) {
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
  }

  // Ensure safe merging with null checks
  lastExtractedFields = { ...lastExtractedFields || {}, ...extractedFields || {} };
  return extractedFields;
};

export async function continueConversation(history: Message[]) {
  const logs: string[] = [];
  const fieldsToUpdate: Record<string, any> = {};
  let questionToAsk: string | null = null;

  try {
    logs.push("[LLM] Starting continueConversation...");

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

    // General query handling (Unmodified)
    if (userIntent === "general_query") {
      logs.push("[LLM] General query detected. Passing to standard processing.");
      const { text } = await generateText({
        model: openai("gpt-4o"),
        system: `You are a Wonderland assistant!`,
        messages: history,
        maxToolRoundtrips: 5,
      });

      return { messages: [...history, { role: "assistant", content: text }], logs };
    }

    // Account creation logic (Retained and unmodified)
    // Handles intent "account_creation" with extracted fields and step-by-step question flow

  } catch (error) {
    logs.push(`[LLM] Error during conversation: ${error instanceof Error ? error.message : "Unknown error occurred."}`);
    return {
      messages: [...history, { role: "assistant", content: "An error occurred while processing your request." }],
      logs,
    };
  }
}

    // Handle account creation logic
    if (userIntent === "account_creation") {
      logs.push("[LLM] Account creation detected. Processing...");

      const userMessage = history[history.length - 1]?.content.trim() || "";
      const extractedFields = await extractAndRefineFields(userMessage, logs);
        // Update immediately upon receiving user input
        if (currentRecordId && extractedFields) {
          logs.push(`[LLM] Immediately updating Airtable for record ID: ${currentRecordId} with extracted fields.`);
          try {
            // Exclude questionsAsked from the update payload
            const fieldsToUpdate = Object.fromEntries(
              Object.entries(extractedFields).filter(([key]) => key !== "questionsAsked")
            );
            await updateRecordFields(currentRecordId, fieldsToUpdate, logs);
            logs.push(`[LLM] Field updated for record ID ${currentRecordId}: ${JSON.stringify(fieldsToUpdate)}`);
          } catch (error) {
            logs.push(`[LLM] Failed to update Airtable for record ID ${currentRecordId}: ${
              error instanceof Error ? error.message : "Unknown error."
            }`);
          }
        }

        // Ensure questions are tracked internally and not synced with Airtable
        if (currentRecordId && !recordFields[currentRecordId]?.questionsAsked) {
          recordFields[currentRecordId] = {
            ...recordFields[currentRecordId],
            questionsAsked: [],
          };
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

      if (!currentRecordId && extractedFields.Name) {
        logs.push("[LLM] Creating new record because currentRecordId is null or invalid.");
        try {
              const createResponse = await createAccount.execute({
                ...Object.fromEntries(
                  Object.entries(cleanFields(extractedFields)).filter(([key]) => key !== "questionsAsked")
                ), // Exclude questionsAsked field
                Name: extractedFields.Name,
                Status: "Draft",
              });

          if (createResponse?.recordId) {
            currentRecordId = createResponse.recordId;
            recordFields[currentRecordId] = { ...extractedFields };
            logs.push(`[LLM] New account created successfully with ID: ${currentRecordId}`);
          } else {
            throw new Error("Failed to retrieve a valid record ID after account creation.");
          }
        } catch (error) {
          logs.push(`[LLM] Account creation error: ${error instanceof Error ? error.message : "Unknown error"}`);
          return {
            messages: [
              ...history,
              {
                role: "assistant",
                content: "An error occurred while creating the account. Please try again or contact support.",
              },
            ],
            logs,
          };
        }
      }

      // Ensure questions are asked in sequence
      if (currentRecordId) {
        logs.push("[LLM] Preparing to invoke getNextQuestion...");
        questionToAsk = getNextQuestion(currentRecordId, logs);
        questionAsked = !!questionToAsk;

        if (!questionToAsk) {
          logs.push(`[LLM] Syncing record fields before marking account creation as complete for record ID: ${currentRecordId}`);
          try {
            await updateRecordFields(currentRecordId, recordFields[currentRecordId], logs);
          } catch (syncError) {
            logs.push(`[LLM] Failed to sync fields: ${syncError instanceof Error ? syncError.message : syncError}`);
          }

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

      if (!questionAsked && currentRecordId) {
        logs.push("[LLM] Re-checking for unanswered questions...");

        const allQuestions = [
          "Can you share any of the following for the company: Website, Instagram, Facebook, or Blog?",
          "Can you tell me more about the company, including its industry, purpose, or mission?",
          "What are the major objectives or talking points you'd like to achieve with Wonderland?",
        ];

        let unaskedQuestions: string[] = [];
        if (currentRecordId !== null && recordFields[currentRecordId]) {
          const record = recordFields[currentRecordId];
          unaskedQuestions = allQuestions.filter(
            (q) => !record.questionsAsked?.includes(q)
          );
        } else {
          logs.push("[LLM] currentRecordId is null or recordFields[currentRecordId] is undefined.");
        }

        if (unaskedQuestions.length > 0) {
          const nextUnaskedQuestion = unaskedQuestions[0];
          logs.push(`[LLM] Re-asking missing question: "${nextUnaskedQuestion}"`);
          recordFields[currentRecordId].questionsAsked = [
            ...(recordFields[currentRecordId]?.questionsAsked || []),
            nextUnaskedQuestion,
          ];
          return {
            messages: [...history, { role: "assistant", content: nextUnaskedQuestion }],
            logs,
          };
        }
        logs.push("[LLM] Fallback confirmed all questions were asked.");
      }

      logs.push("[LLM] No more questions to ask. Account creation complete.");
      return {
        messages: [...history, { role: "assistant", content: "The account creation process is complete." }],
        logs,
      };
    }
  } catch (error) {
    logs.push(`[LLM] Error during conversation: ${error instanceof Error ? error.message : "Unknown error occurred."}`);
    return {
      messages: [...history, { role: "assistant", content: "An error occurred while processing your request." }],
      logs,
    };
  }
}




// Avoid filling defaults for optional fields during account creation
const createAccount = tool({
  description: "Create a new account in Wonderland with comprehensive details.",
  parameters: z.object({
    Name: z.string().describe("The name of the account holder. This field is required."),
    Status: z.string().optional().default("Draft").describe("The status of the account."),
    Description: z.string().optional(),
    Website: z.string().optional(),
    Instagram: z.string().optional(),
    Facebook: z.string().optional(),
    Blog: z.string().optional(),
        "Client Company Name": z.string().optional(),
    "Primary Objective": z.string().optional(),
    "Talking Points": z.string().optional(),
  }),
  execute: async (fields) => {
    const logs: string[] = [];
    let recordId: string | null = null;

    try {
      logs.push("[TOOL] Starting createAccount...");
      logs.push("[TOOL] Initial fields received:", JSON.stringify(fields, null, 2));

      if (!fields.Name) {
        logs.push("[TOOL] Missing required field: Name.");
        throw new Error("The 'Name' field is required to create an account.");
      }

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
  // Filter out "questionsAsked" and create the record
  const sanitizedFields = Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => key !== "questionsAsked" && value !== null && value !== "")
  );

  const record = await airtableBase("Accounts").create({
    Name: sanitizedFields.Name,
    Status: sanitizedFields.Status || "Draft",
    ...sanitizedFields, // Add remaining sanitized fields
  });

  recordId = record.id;
  logs.push(`[TOOL] New draft account created with Record ID: ${recordId}`);
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
      return {
        message: "An error occurred while creating the account.",
        logs,
      };
    }
  },
});

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
    // Skip if already asked
    if (recordFields[recordId]?.questionsAsked?.includes(question.prompt)) {
      logs.push(`[LLM] Question already asked: "${question.prompt}"`);
      continue;
    }

    // Check if any associated fields are missing
    const anyFieldMissing = question.fields.some(
      (field) => !recordFields[recordId]?.[field] || recordFields[recordId][field].trim() === ""
    );

    if (anyFieldMissing) {
      logs.push(`[LLM] Missing fields detected for progress ${question.progress}. Asking: "${question.prompt}"`);
      recordFields[recordId].questionsAsked = [
        ...(recordFields[recordId].questionsAsked || []),
        question.prompt,
      ]; // Persist question tracking
      return question.prompt;
    }

    logs.push(`[LLM] All fields complete for progress ${question.progress}. Skipping question.`);
  }

  logs.push("[LLM] All questions asked or fields filled. No further questions.");
  return null;
};




// Helper: Update record fields and prevent redundant updates
const recordFields: Record<string, Record<string, any>> = {};
const updateRecordFields = async (
  recordId: string,
  newFields: Record<string, any>,
  logs: string[]
) => {
  if (!recordFields[recordId]) {
    recordFields[recordId] = {};
  }

  // Filter out `questionsAsked` and sanitize fields
  const sanitizedFields = Object.fromEntries(
    Object.entries(newFields).filter(([key, value]) => key !== "questionsAsked" && value !== null && value !== "")
  );

  // Update `recordFields` with sanitized fields
  Object.entries(sanitizedFields).forEach(([key, value]) => {
    if (
      !recordFields[recordId][key] || 
      recordFields[recordId][key] !== value
    ) {
      recordFields[recordId][key] = value;
      logs.push(`[LLM] Field updated for record ID ${recordId}: ${key} = ${value}`);
    } else {
      logs.push(
        `[LLM] Skipping update for field ${key} on record ID ${recordId}. Current value: ${
          recordFields[recordId][key]
        }, New value: ${value}`
      );
    }
  });

  // Perform the Airtable update
  try {
    await airtableBase("Accounts").update(recordId, sanitizedFields);
    logs.push(`[LLM] Airtable updated successfully for record ID: ${recordId}`);
  } catch (error) {
    logs.push(
      `[LLM] Failed to update Airtable for record ID ${recordId}: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
};




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
