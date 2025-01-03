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
        "Name": "Anything that resembles an account, account name, company name, name for a record or something the user designates as a name for the session.",
        "Client Company Name": "The name of the company, account or record.",
        "Website": "Any website URL, if mentioned that isn't Facebook or Instagram.",
        "Instagram": "An Instagram handle or link, if mentioned.",
        "Facebook": "A Facebook handle or link, if mentioned.",
        "Blog": "A blog URL, if mentioned.",
        "Description": "Anything that sounds like a description for the record being created.",
        "About the Client": "Any information supplied about the client or company.",
        "Industry": "Any mention of industry, domain, or sector.",
        "Talking Points": "Any objectives or talking points, if mentioned.",
        "Primary Objective": "Any main purpose or goal of creating this account."
      }
      Only return valid links for Website, Instagram, Facebook and Blog and format them if they are invalid.
      The Name, Company Name or Website may be the same, check the previous user message if unsure to see what they are responding to.
      Guess the industry from information available if possible.`,
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
    "Can you share a Website, Instagram, Facebook, or Blog for the new account?",
    "Can you tell me a little more about the company, including its purpose, or mission?",
    "What are the major talking points or overal objectives you'd like to achieve with Wonderland?",
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
          - "switch_record": If the user is asking to switch to a different record by specifying a name, company, or URL.
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
            { role: "assistant", content: "I didn't quite understand that. Could you clarify your request?" },
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

  // Merge new fields into recordFields
if (currentRecordId) {
  // Merge new fields into recordFields
  recordFields[currentRecordId] = {
    ...recordFields[currentRecordId],
    ...cleanFields(extractedFields),
  };
  logs.push(`[LLM] Updated fields for record ID ${currentRecordId}: ${JSON.stringify(recordFields[currentRecordId])}`);

  // Sync updated fields to Airtable
  try {
    await updateRecordFields(currentRecordId, cleanFields(extractedFields), logs);
    logs.push(`[LLM] Synced new fields to Airtable for record ID ${currentRecordId}`);
  } catch (syncError) {
    logs.push(`[LLM] Error syncing new fields to Airtable: ${syncError instanceof Error ? syncError.message : syncError}`);
  }
}

  // Validate the presence of required fields (Name or Client Company Name)
  if (!currentRecordId && (!extractedFields.Name || !extractedFields["Client Company Name"])) {
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

  // Create a new record if necessary
  if (!currentRecordId && extractedFields.Name) {
    try {
      logs.push("[LLM] Creating a new account...");
      const createResponse = await createAccount.execute({
        ...cleanFields(extractedFields),
        Name: extractedFields.Name,
        Status: "Draft",
      });

      if (createResponse?.recordId) {
        currentRecordId = createResponse.recordId;
        logs.push(`[LLM] Account created successfully with ID: ${currentRecordId}`);

        // Initialize recordFields for the new account
        recordFields[currentRecordId] = {
          questionsAsked: [],
          ...extractedFields,
        };
      } else {
        throw new Error("Failed to retrieve a valid record ID.");
      }
    } catch (error) {
      logs.push(`[LLM] Account creation error: ${error instanceof Error ? error.message : "Unknown error"}`);
      return {
        messages: [...history, { role: "assistant", content: "An error occurred while creating the account. Please try again." }],
        logs,
      };
    }
  }

  // Handle next question or complete the process
  if (currentRecordId) {
    questionToAsk = getNextQuestion(currentRecordId, logs);
    if (!questionToAsk) {
      try {
        await updateRecordFields(currentRecordId, recordFields[currentRecordId], logs);
        logs.push("[LLM] Account creation process completed.");
        return {
          messages: [...history, { role: "assistant", content: "The account creation process is complete." }],
          logs,
        };
      } catch (syncError) {
        logs.push(`[LLM] Error updating record fields: ${syncError instanceof Error ? syncError.message : syncError}`);
      }
    } else {
      logs.push(`[LLM] Asking next question: "${questionToAsk}"`);
      return {
        messages: [...history, { role: "assistant", content: questionToAsk }],
        logs,
      };
    }
  }
}
if (userIntent === "switch_record" || userIntent === "update_record") {
  logs.push(`[LLM] ${userIntent === "switch_record" ? "Switch record" : "Update record"} detected. Processing...`);
  const userMessage = history[history.length - 1]?.content.trim() || "";

  // Extract lookup details or update fields
  const extractedFields = await extractAndRefineFields(userMessage, logs);
  const lookupField = extractedFields.Name ? "Name" : extractedFields["Client Company Name"] ? "Client Company Name" : extractedFields.Description ? "Description" : "About the Client";
  const lookupValue = extractedFields[lookupField];

  if (!lookupValue) {
    logs.push("[LLM] Missing details for lookup. Prompting user...");
    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: "Please specify the name, description, or client company of the record you'd like to switch to or update.",
        },
      ],
      logs,
    };
  }

  try {
    const tool = userIntent === "switch_record" ? switchRecord : updateRecord;
    const toolArgs = userIntent === "switch_record"
      ? { lookupField, lookupValue }
      : { lookupField, lookupValue, updates: extractedFields };

    const { message, recordId, logs: toolLogs } = await tool.execute(toolArgs);
    logs.push(...toolLogs);

    if (userIntent === "switch_record") {
      currentRecordId = recordId;
    }

    return {
      messages: [...history, { role: "assistant", content: message }],
      logs,
    };
  } catch (error) {
    logs.push(`[LLM] Error during ${userIntent === "switch_record" ? "switch record" : "update record"}: ${error.message}`);
    return {
      messages: [...history, { role: "assistant", content: `An error occurred while ${userIntent === "switch_record" ? "switching records" : "updating the record"}.` }],
      logs,
    };
  }
}

if (userIntent === "update_record") {
  logs.push("[LLM] Update record detected. Processing...");
  const userMessage = history[history.length - 1]?.content.trim() || "";

  // Extract fields from user input
  const extractedFields = await extractAndRefineFields(userMessage, logs);
  const lookupField = extractedFields.Name
    ? "Name"
    : extractedFields["Client Company Name"]
    ? "Client Company Name"
    : extractedFields.Description
    ? "Description"
    : extractedFields["About the Client"]
    ? "About the Client"
    : null;

  const lookupValue = lookupField ? extractedFields[lookupField] : null;

  if (!lookupValue) {
    logs.push("[LLM] Missing details for lookup or update. Prompting user...");
    return {
      messages: [
        ...history,
        {
          role: "assistant",
          content: "Please specify the name, description, or client company of the record you'd like to update.",
        },
      ],
      logs,
    };
  }

  try {
    // If no current record or the user explicitly mentions a different record, switch records
    if (!currentRecordId || lookupValue !== recordFields[currentRecordId]?.[lookupField]) {
      logs.push("[LLM] Switching to a new record before updating...");
      const { recordId, logs: switchLogs } = await switchRecord.execute({
        lookupField,
        lookupValue,
      });
      logs.push(...switchLogs);

      currentRecordId = recordId;
    }

    // Perform the update
    const updates = cleanFields(extractedFields); // Only include fields with valid values
    logs.push("[LLM] Updating the current record...");
    const { message, logs: updateLogs } = await updateRecord.execute({
      recordId: currentRecordId,
      updates,
    });
    logs.push(...updateLogs);

    return {
      messages: [...history, { role: "assistant", content: message }],
      logs,
    };
  } catch (error) {
    logs.push(`[LLM] Error during update record: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    return {
      messages: [...history, { role: "assistant", content: "An error occurred while updating the record. Please try again." }],
      logs,
    };
  }
}



    // Handle General Queries
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

    // Default fallback for unclear scenarios
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



const updateRecord = tool({
  description: "Update fields for an existing account in Wonderland, including switching to a different record if specified.",
  parameters: z.object({
    recordId: z.string().optional().describe("The record ID of the account to update. If omitted, the assistant will search for it."),
    lookupField: z.string().optional().describe("Field to search for a record if switching, such as 'Name', 'Description', or 'Client Company Name'."),
    lookupValue: z.string().optional().describe("Value to search in the specified field."),
    updates: z.record(z.string(), z.any()).describe("Key-value pairs of fields to update."),
  }),
  execute: async ({ recordId, lookupField, lookupValue, updates }) => {
    const logs: string[] = [];
    try {
      logs.push("[TOOL] Starting updateRecord...");
      if (!recordId && (!lookupField || !lookupValue)) {
        throw new Error("Either recordId or lookupField and lookupValue must be provided.");
      }

      // If no recordId is provided, perform a record search
      if (!recordId) {
        logs.push(`[TOOL] Searching for record by ${lookupField}: ${lookupValue}`);
        const matchingRecords = await airtableBase("Accounts")
          .select({
            filterByFormula: `{${lookupField}} = "${lookupValue}"`,
            maxRecords: 1,
          })
          .firstPage();

        if (matchingRecords.length === 0) {
          throw new Error(`No record found with ${lookupField}: "${lookupValue}".`);
        }

        recordId = matchingRecords[0].id;
        logs.push(`[TOOL] Found record with ID: ${recordId}`);
      }

      logs.push(`[TOOL] Updating record ID: ${recordId}`);
      logs.push(`[TOOL] Updates: ${JSON.stringify(updates)}`);

      const sanitizedUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== null && value !== "")
      );

      const updatedRecord = await airtableBase("Accounts").update(recordId, sanitizedUpdates);

      logs.push(`[TOOL] Record updated successfully: ${JSON.stringify(updatedRecord.fields)}`);
      return {
        message: `Account with record ID ${recordId} successfully updated.`,
        logs,
      };
    } catch (error) {
      logs.push(`[TOOL] Error updating record: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
      throw { message: "Failed to update the record. Check logs for details.", logs };
    }
  },
});


const switchRecord = tool({
  description: "Switch the current record being worked on in Wonderland by searching for a record by field and value.",
  parameters: z.object({
    lookupField: z.string().describe("The field to search by, such as 'Name', 'Description', 'About the Client', or 'Client Company Name'."),
    lookupValue: z.string().describe("The value to search for in the specified field."),
  }),
  execute: async ({ lookupField, lookupValue }) => {
    const logs: string[] = [];
    try {
      logs.push("[TOOL] Starting switchRecord...");
      logs.push(`Looking up record by ${lookupField}: ${lookupValue}`);

      // Validate lookupField
      const validFields = ["Name", "Description", "About the Client", "Client Company Name"];
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

      logs.push(`[TOOL] Successfully switched to record ID: ${currentRecordId} (${lookupField}: ${lookupValue}).`);
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