// Enhanced script with updates applied systematically

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
const recordFields: Record<string, Record<string, any>> = {}; // Track fields for records

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

  const extractionResponse = await generateText({
    model: openai("gpt-4o"),
    system: `You are a Wonderland assistant extracting any available account details from user input.
      Respond with a JSON object formatted as follows:
      {
        "Name": "Account name or similar",
        "Client Company Name": "Company or client name",
        "Website": "URL if mentioned",
        "Instagram": "Instagram handle or link",
        "Facebook": "Facebook handle or link",
        "Blog": "Blog URL if mentioned",
        "Description": "Description or details",
        "About the Client": "Details about the client",
        "Industry": "Mention of industry",
        "Talking Points": "Objectives or talking points",
        "Primary Objective": "Main purpose or goal"
      }`,
    messages: [{ role: "user", content: combinedMessage }],
    maxToolRoundtrips: 1,
  });

  let extractedFields: Record<string, string> = {};
  const responseText = extractionResponse.text.trim();

  try {
    logs.push(`[LLM] Full AI Response: ${responseText}`);

    const jsonMatch = responseText.match(/\{.*?\}/s);
    if (jsonMatch) {
      extractedFields = JSON.parse(jsonMatch[0]);
      logs.push(`[LLM] Extracted fields parsed: ${JSON.stringify(extractedFields)}`);
    } else {
      throw new Error("No valid JSON structure found in AI response.");
    }
  } catch (error) {
    logs.push(`[LLM] Parsing error: ${error instanceof Error ? error.message : "Unknown error."}`);
  }

  if (lastExtractedFields) {
    for (const [key, value] of Object.entries(lastExtractedFields)) {
      if (!extractedFields[key] || extractedFields[key].trim() === "") {
        extractedFields[key] = value;
        if (value && value.trim() !== "") {
          logs.push(`[LLM] Retained previous value for ${key}: ${value}`);
        }
      }
    }
  }

lastExtractedFields = { ...(lastExtractedFields || {}), ...(extractedFields || {}) };
  logs.push(`[LLM] Final merged fields: ${JSON.stringify(lastExtractedFields)}`);
  return extractedFields;
};


const getUnansweredQuestions = (recordId: string, logs: string[]): string[] => {
  const allQuestions = [
    "Can you share any of the following for the company: Website, Instagram, Facebook, or Blog?",
    "Can you tell me more about the company, including its industry, purpose, or mission?",
    "What are the major objectives or talking points you'd like to achieve with Wonderland?",
  ];

  if (!recordFields[recordId]) {
    logs.push("[LLM] No record fields found for current record ID. Returning all questions.");
    return allQuestions;
  }

  const answeredQuestions = recordFields[recordId]?.questionsAsked || [];
  const unansweredQuestions = allQuestions.filter((q) => !answeredQuestions.includes(q));

  logs.push(`[LLM] Retrieved unanswered questions for record ID ${recordId}: ${JSON.stringify(unansweredQuestions)}`);
  return unansweredQuestions;
};



const updateRecordFields = async (
  recordId: string,
  newFields: Record<string, any>,
  logs: string[]
) => {
  if (!recordFields[recordId]) {
    recordFields[recordId] = {};
  }

  const sanitizedFields = Object.fromEntries(
    Object.entries(newFields).filter(([key, value]) => key !== "questionsAsked" && value !== null && value !== "")
  );

  Object.entries(sanitizedFields).forEach(([key, value]) => {
    if (!recordFields[recordId][key] || recordFields[recordId][key] !== value) {
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

  try {
    await airtableBase("Accounts").update(recordId, sanitizedFields);
    logs.push(`[LLM] Airtable updated successfully for record ID: ${recordId}`);
  } catch (error) {
    logs.push(
      `[LLM] Failed to update Airtable for record ID ${recordId}: ${
        error instanceof Error ? error.message : "Unknown error."
      }`
    );
  }
};

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

      // Validate the record ID
      if (!recordId) {
        throw new Error("recordId is required to identify the account.");
      }
      if (recordId !== currentRecordId) {
        throw new Error(
          `Attempting to delete the wrong record. Expected: ${currentRecordId}, Provided: ${recordId}`
        );
      }

      // Fetch the account record
      const accountRecord = await airtableBase("Accounts").find(recordId);
      if (!accountRecord) {
        throw new Error(`No account found with the record ID: ${recordId}`);
      }

      logs.push("[TOOL] Account found:", JSON.stringify(accountRecord, null, 2));

      // Update the account status to "Deleted"
      logs.push("[TOOL] Changing account status to 'Deleted'...");
      const updatedRecord = await airtableBase("Accounts").update(accountRecord.id, { Status: "Deleted" });

      logs.push("[TOOL] Account status updated successfully:", JSON.stringify(updatedRecord, null, 2));

      // Clear the currentRecordId
      currentRecordId = null;

      return {
        message: `Account with record ID ${recordId} has been successfully marked as 'Deleted'.`,
        recordId: updatedRecord.id,
        logs,
      };
    } catch (error) {
      logs.push(`[TOOL] Error deleting account in Airtable: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
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

      // Ensure lookupField is valid
      const validFields = ["Name", "Client Company Name", "Client URL", "Description", "Industry", "Primary Contact Person"];
      if (!validFields.includes(lookupField)) {
        throw new Error(
          `Invalid lookupField: ${lookupField}. Valid fields are ${validFields.join(", ")}.`
        );
      }

      // Query Airtable for the matching record
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
      logs.push(`[TOOL] Error during switchRecord: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
      throw { message: "Failed to switch records. Check logs for details.", logs };
    }
  },
});

export async function continueConversation(history: Message[]) {
  const logs: string[] = [];
  let questionToAsk: string | null = null;

  try {
    logs.push("[LLM] Starting continueConversation...");

    // Step 1: Classify User Intent
    const intentResponse = await generateText({
      model: openai("gpt-4o"),
      system: `You are a Wonderland assistant.
        Classify the user's latest message into one of the following intents:
        - "account_creation": If the user is asking to create, update, or manage an account.
        - "general_query": If the user is asking a general question about Wonderland or unrelated topics.
        - "unknown": If the intent is not clear.
        Respond only with the classification.`,
      messages: history,
      maxToolRoundtrips: 1,
    });

    const userIntent = intentResponse.text.trim();
    logs.push(`[LLM] Detected intent: ${userIntent}`);
if (userIntent === "unknown") {
  logs.push("[LLM] Unknown intent detected. Reinterpreting input...");
  const retryResponse = await generateText({
    model: openai("gpt-4o"),
    system: `You are a Wonderland assistant.
      Retry understanding the user message within the current workflow context.
      If still unclear, prompt the user for more information.`,
    messages: history,
  });

  const reinterpretedIntent = retryResponse.text.trim();
  logs.push(`[LLM] Reinterpreted intent: ${reinterpretedIntent}`);

  if (reinterpretedIntent === "unknown") {
    logs.push("[LLM] Reinterpretation failed. Prompting user for clarification...");
    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: "I didn't quite understand that. Could you clarify your request?",
        },
      ],
      logs,
    };
  }

  logs.push("[LLM] Successfully reinterpreted intent. Routing to appropriate workflow...");
  history.push({ role: "assistant", content: `Reinterpreted intent: ${reinterpretedIntent}` });
  return await continueConversation(history);
}


    // Step 3: Handle "Account Creation" Intent
    if (userIntent === "account_creation") {
      logs.push("[LLM] Account creation detected. Processing...");
      const userMessage = history[history.length - 1]?.content.trim() || "";
      const extractedFields = await extractAndRefineFields(userMessage, logs);

      // Validate the presence of the Name field
if (!currentRecordId && (!extractedFields.Name || extractedFields.Name.trim() === "") && (!extractedFields["Client Company Name"] || extractedFields["Client Company Name"].trim() === "")) {
  logs.push("[LLM] Missing Name or Client Company Name field. Prompting user...");
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
      ...cleanFields(extractedFields),
      Name: extractedFields.Name,
      Status: "Draft",
    });

    if (createResponse?.recordId) {
      currentRecordId = createResponse.recordId;
      logs.push(`[LLM] New account created successfully with ID: ${currentRecordId}`);
    } else {
      throw new Error("Failed to retrieve a valid record ID after account creation.");
    }
  } catch (error) {
    logs.push(`[LLM] Account creation error: ${
      error instanceof Error ? error.message : "Unknown error"
    }`);
    return {
      messages: [...history, { role: "assistant", content: "An error occurred while creating the account. Please try again or contact support." }],
      logs,
    };
  }
}


    if (currentRecordId) {
  logs.push("[LLM] Preparing to invoke getNextQuestion...");
  questionToAsk = getNextQuestion(currentRecordId, logs);

  if (!questionToAsk) {
    logs.push(`[LLM] Syncing record fields before marking account creation as complete for record ID: ${currentRecordId}`);
    try {
      await updateRecordFields(currentRecordId, recordFields[currentRecordId], logs);
    } catch (syncError) {
      logs.push(`[LLM] Failed to sync fields: ${
        syncError instanceof Error ? syncError.message : syncError
      }`);
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


    // Step 4: Handle "General Query" Intent
    if (userIntent === "general_query") {
      logs.push("[LLM] General query detected. Processing...");
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

    logs.push("[LLM] No further actions detected. Returning clarification request.");
    return {
      messages: [
        ...history,
        { role: "assistant", content: "I'm sorry, I couldn't understand your request. Could you clarify or provide more details?" },
      ],
      logs,
    };
  } catch (error) {
    logs.push(`[LLM] Error during conversation: ${error instanceof Error ? error.message : "Unknown error occurred."}`);
    return {
      messages: [...history, { role: "assistant", content: "An error occurred while processing your request." }],
      logs,
    };
  }
}


const createAccount = tool({
  description: "Create a new account in Wonderland with comprehensive details.",
  parameters: z.object({
    Name: z.string().nonempty("The 'Name' field is required.").describe("The name of the account holder."),
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
        const sanitizedFields = Object.fromEntries(
          Object.entries(fields).filter(([_, value]) => value !== null && value !== "")
        );
        const record = await airtableBase("Accounts").create({
          ...sanitizedFields,
        });
        recordId = record.id;
        logs.push(`[TOOL] New draft account created with Record ID: ${recordId}`);
      }

      return { message: `Account successfully created for "${fields.Name}".`, recordId, logs };
    } catch (error) {
      logs.push(
        "[TOOL] Error during account creation:",
        error instanceof Error ? error.message : "Unknown error."
      );
      throw { message: "An error occurred while creating the account.", logs };
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
    if (recordFields[recordId]?.questionsAsked?.includes(question.prompt)) {
      logs.push(`[LLM] Question already asked: "${question.prompt}"`);
      continue;
    }

    const anyFieldMissing = question.fields.some(
      (field) => !recordFields[recordId]?.[field] || recordFields[recordId][field].trim() === ""
    );

    if (anyFieldMissing) {
      logs.push(`[LLM] Missing fields detected for progress ${question.progress}. Asking: "${question.prompt}"`);
      recordFields[recordId].questionsAsked = [
        ...(recordFields[recordId]?.questionsAsked || []),
        question.prompt,
      ];
      return question.prompt;
    }

    logs.push(`[LLM] All fields complete for progress ${question.progress}. Skipping question.`);
  }

  logs.push("[LLM] All questions asked or fields filled. No further questions.");
  return null;
};
