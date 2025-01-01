
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

// Helper: Clean Undefined Fields
const cleanFields = (fields: Record<string, any>) =>
  Object.fromEntries(Object.entries(fields).filter(([_, value]) => value !== undefined));

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

      // Extract account details from the user message
      if (creationProgress !== null) {
        if (creationProgress === 0) {
          const inputs = userMessage.split(",").map((input) => input.trim());
          for (const input of inputs) {
            const url = validateURL(input);
            if (url) {
              if (!fieldsToUpdate.Website && url.includes("www")) fieldsToUpdate.Website = url;
              else if (!fieldsToUpdate.Instagram && url.includes("instagram.com"))
                fieldsToUpdate.Instagram = url;
              else if (!fieldsToUpdate.Facebook && url.includes("facebook.com"))
                fieldsToUpdate.Facebook = url;
              else if (!fieldsToUpdate.Blog) fieldsToUpdate.Blog = url;
            }
          }
          await modifyAccount.execute({ recordId: currentRecordId!, fields: cleanFields(fieldsToUpdate) });
          logs.push("[LLM] Website and Social Links updated.");
          creationProgress++;
        } else if (creationProgress === 1) {
          fieldsToUpdate.Description = userMessage || "No description provided.";
          await modifyAccount.execute({
            recordId: currentRecordId!,
            fields: { Description: fieldsToUpdate.Description },
          });
          logs.push("[LLM] Description updated.");
          creationProgress++;
        } else if (creationProgress === 2) {
          fieldsToUpdate["Talking Points"] = userMessage || "No talking points provided.";
          await modifyAccount.execute({
            recordId: currentRecordId!,
            fields: { "Talking Points": fieldsToUpdate["Talking Points"] },
          });
          logs.push("[LLM] Talking Points updated.");
          creationProgress = null; // End of flow
        }
      }

      questionToAsk = getNextQuestion(fieldsToUpdate, logs);

      if (questionToAsk) {
        logs.push(`[LLM] Asking next question: ${questionToAsk}`);
        return {
          messages: [...history, { role: "assistant", content: questionToAsk }],
          logs,
        };
      }

      if (currentRecordId && creationProgress === null) {
        logs.push(`[LLM] All details captured. Updating record ID: ${currentRecordId} to New status.`);
        await modifyAccount.execute({
          recordId: currentRecordId,
          fields: { Status: "New" },
        });
        logs.push(`[TOOL] Record ID: ${currentRecordId} transitioned to New status.`);
      }
    }
  } catch (error) {
    logs.push(`[LLM] Error during conversation: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    console.error("[LLM] Error during conversation:", error);
    return { messages: [...history, { role: "assistant", content: "An error occurred." }], logs };
  }
}

const getNextQuestion = (fields: Record<string, any>, logs: string[]): string | null => {
  if (
    (!fields.Website || !fields.Instagram || !fields.Facebook || !fields.Blog) &&
    creationProgress === 0
  ) {
    logs.push("[LLM] Missing fields: Website, Instagram, Facebook, or Blog. Prompting user for any available links.");
    return "Can you share any of the following for the company: Website, Instagram, Facebook, or Blog?";
  }

  if (!fields.Description && creationProgress === 1) {
    logs.push("[LLM] Missing field: Description. Prompting user for company details.");
    return "Can you tell me more about the company, including its industry, purpose, or mission?";
  }

  if (!fields["Talking Points"] && creationProgress === 2) {
    logs.push("[LLM] Missing field: Talking Points. Prompting user for major objectives.");
    return "What are the major objectives or talking points you'd like to achieve with Wonderland?";
  }

  return null; // All questions completed
};




const processUserInput = async (userInput: string, logs: string[]) => {
  const fieldsToUpdate: Record<string, string> = {}; // Properly define fieldsToUpdate locally
  let isUpdated = false;

  // Process Website, Instagram, Facebook, and Blog
  if (creationProgress === 0) {
    const inputs = userInput.split(",").map((item) => item.trim()); // Split input by commas

    for (const input of inputs) {
      if (input.includes("http")) {
        const url = validateURL(input);
        if (url) {
          if (!fieldsToUpdate.Website && url.includes("www")) {
            fieldsToUpdate.Website = url;
            logs.push(`[LLM] Valid Website detected: ${url}`);
          } else if (!fieldsToUpdate.Instagram && url.includes("instagram.com")) {
            fieldsToUpdate.Instagram = url;
            logs.push(`[LLM] Valid Instagram detected: ${url}`);
          } else if (!fieldsToUpdate.Facebook && url.includes("facebook.com")) {
            fieldsToUpdate.Facebook = url;
            logs.push(`[LLM] Valid Facebook detected: ${url}`);
          } else if (!fieldsToUpdate.Blog) {
            fieldsToUpdate.Blog = url;
            logs.push(`[LLM] Valid Blog detected: ${url}`);
          }
        }
      }
    }

    // Update Airtable with collected links
    await modifyAccount.execute({
      recordId: currentRecordId!,
      fields: fieldsToUpdate, // Use the locally defined fieldsToUpdate
    });

    isUpdated = true;
    logs.push("[LLM] Website, Instagram, Facebook, and Blog updated successfully.");
  }

  // Process Description
  if (creationProgress === 1) {
    fieldsToUpdate.Description = userInput;
    logs.push(`[LLM] Description captured: ${userInput}. Updating Airtable.`);
    await modifyAccount.execute({ recordId: currentRecordId!, fields: { Description: userInput } });
    isUpdated = true;
  }

  // Process Talking Points
  if (creationProgress === 2) {
    fieldsToUpdate["Talking Points"] = userInput;
    logs.push(`[LLM] Talking Points captured: ${userInput}. Updating Airtable.`);
    await modifyAccount.execute({ recordId: currentRecordId!, fields: { "Talking Points": userInput } });
    isUpdated = true;
  }

  return isUpdated;
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
        return { message: "Please provide the account name to create a new account.", logs };
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
        message: "An error occurred while creating the account. Please try again later.",
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

route.ts

import { continueConversation } from "../../actions";

export async function POST(req: Request) {
  console.log("[POST /api/chat] Request received");
  const logs: string[] = [];
  const structuredLogs: any[] = []; // For logging detailed objects

  try {
    const body = await req.json();
    logs.push("[POST /api/chat] Parsed body:", JSON.stringify(body, null, 2));

    const { messages, record } = body;

    // Validate messages
    if (!messages || !Array.isArray(messages)) {
      logs.push("[POST /api/chat] Invalid input: messages is not an array.");
      return buildErrorResponse("Invalid input format.", logs, 400);
    }

    // Validate record
    if (!record || !record.type) {
      logs.push("[POST /api/chat] No valid record provided.");
      return buildErrorResponse("Record with valid type is required.", logs, 400);
    }

    structuredLogs.push({
      message: "[POST /api/chat] Processing record and messages",
      record,
      messages,
    });

    logs.push(
      `[POST /api/chat] Processing record and messages: Record - ${JSON.stringify(
        record
      )}, Messages - ${JSON.stringify(messages)}`
    );

    // Call continueConversation
    const result = await continueConversation([
      { role: "assistant", content: `Processing record: ${JSON.stringify(record)}` },
      ...messages,
    ]);

    // Log the result
    logs.push(
      "[POST /api/chat] Response from continueConversation:",
      JSON.stringify(result, null, 2)
    );
    structuredLogs.push({
      message: "[POST /api/chat] Response from continueConversation",
      result,
    });

// Extract and log TOOL logs explicitly
if (result && result.logs && Array.isArray(result.logs)) {
  logs.push(...result.logs);
  result.logs.forEach((log) => console.log("[TOOL]", log));
}


    return new Response(
      JSON.stringify({
        ...flattenErrorResponse(result),
logs: (result && result.logs) || logs,

        structuredLogs,
      }),
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("[POST /api/chat] Error occurred:", error);

    logs.push(
      "[POST /api/chat] Error:",
      error instanceof Error ? error.message : JSON.stringify(error)
    );

    structuredLogs.push({
      message: "[POST /api/chat] Error occurred",
      error: error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error,
    });

    return buildErrorResponse(
      "An error occurred.",
      logs,
      500,
      structuredLogs,
      error instanceof Error ? error : undefined
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function flattenErrorResponse(response: any): Record<string, any> {
  if (typeof response === "object" && response !== null) {
    return Object.entries(response).reduce((acc: Record<string, any>, [key, value]) => {
      if (typeof value === "object" && value !== null) {
        const flattened = flattenErrorResponse(value);
        Object.entries(flattened).forEach(([nestedKey, nestedValue]) => {
          acc[`${key}.${nestedKey}`] = nestedValue;
        });
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});
  }
  return response;
}

function buildErrorResponse(
  message: string,
  logs: string[],
  status: number,
  structuredLogs?: any[],
  error?: Error
) {
  if (error) {
    logs.push("[POST /api/chat] Error:", error.message);
    console.error("[POST /api/chat] Error occurred:", error);
  }

  return new Response(
    JSON.stringify(
      flattenErrorResponse({
        error: message,
        details: error?.message || "Unknown error",
        stack: error?.stack,
        logs,
        structuredLogs,
      })
    ),
    {
      status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    }
  );
}

front end softr code:


<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

<div id="chatbot-container">
  <div id="chatbot-messages"></div>
  <div class="input-container">
    <textarea id="chatbot-input" placeholder="Type your message..."></textarea>
    <button id="chatbot-send">Send</button>
  </div>
</div>

<script>
  let conversationHistory = [];
  let currentRecord = null;
  let isFirstHoverHandled = false;
  const baseURL = "https://api.airtable.com/v0/appFf0nHuVTVWRjTa/Accounts";
  const apiKey = "Bearer patuiAgEvFzitXyIu.a0fed140f02983ccc3dfeed6c02913b5e2593253cb784a08c3cfd8ac96518ba0";

  // Set focus on message box on load
  window.addEventListener("load", () => {
    const inputField = document.getElementById("chatbot-input");
    inputField.focus();
  });

  // Hover to fetch and send the record or accounts list once
  document.getElementById("chatbot-container").addEventListener("mouseover", async () => {
    if (!isFirstHoverHandled) {
      isFirstHoverHandled = true;

      const isOnAccountsPage = window.location.pathname.includes("/accounts/account-details");
      if (isOnAccountsPage) {
        await fetchCurrentRecord();
      } else {
        await fetchAllAccounts();
      }
    }
  });

  // Adjust Enter key behavior
  const inputField = document.getElementById("chatbot-input");
  inputField.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("chatbot-send").click();
    }
  });

  document.getElementById("chatbot-send").addEventListener("click", async () => {
    const message = inputField.value.trim();
    if (message) {
      conversationHistory.push({ role: "user", content: message });
      displayMessage("user", message);
      inputField.value = "";
      adjustInputHeight();
      await sendConversation();
    }
  });

  inputField.addEventListener("input", () => {
    adjustInputHeight();
  });

  function adjustInputHeight() {
    inputField.style.height = "44px"; // Reset to minimum height
    inputField.style.height = Math.min(inputField.scrollHeight, 250) + "px"; // Dynamically adjust
  }

  async function sendConversation() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const recordId = urlParams.get("recordId");
      const pageType = recordId ? "accounts" : "home";

      const payload = { 
        record: { recordId, type: pageType }, 
        messages: conversationHistory 
      };

      console.log("[Frontend] Sending payload:", JSON.stringify(payload, null, 2));

      const response = await fetch("https://input-collect-ai-chatbot-vercel-sdk.vercel.app/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! Status: ${response.status}, Details: ${errorText}`);
      }

      const responseData = await response.json();
      console.log("[Frontend] Received response:", JSON.stringify(responseData, null, 2));

      // Display backend logs in the console
      if (responseData.logs && Array.isArray(responseData.logs)) {
        console.group("[Backend Logs]");
        responseData.logs.forEach((log, index) => console.log(`[Log ${index + 1}] ${log}`));
        console.groupEnd();
      }

      // Reconstruct messages from flattened response
      const reconstructedMessages = Object.keys(responseData)
        .filter((key) => key.startsWith("messages.") && key.endsWith(".role"))
        .map((key) => {
          const index = key.split(".")[1];
          return {
            role: responseData[`messages.${index}.role`],
            content: responseData[`messages.${index}.content`],
          };
        });

      console.log("[Frontend] Reconstructed messages:", reconstructedMessages);

      const assistantMessages = reconstructedMessages.filter((msg) => msg.role === "assistant");
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]?.content;

      if (lastAssistantMessage) {
        displayMessage("assistant", lastAssistantMessage);
        conversationHistory.push({ role: "assistant", content: lastAssistantMessage });
      }
    } catch (error) {
      console.error("[Frontend] Error during sendConversation:", error);
      displayMessage("assistant", `An error occurred while processing your request. Error details: ${error.message}`);
    }
  }

  function displayMessage(role, content) {
    const messagesContainer = document.getElementById("chatbot-messages");
    const messageElement = document.createElement("div");
    messageElement.className = role;

    if (typeof marked !== "undefined") {
      const parsedContent = marked.parse(content);
      messageElement.innerHTML = parsedContent;
      const lastParagraph = messageElement.querySelector("p:last-child");
      if (lastParagraph) {
        lastParagraph.style.marginBottom = "0";
      }
    } else {
      console.error("The `marked` library is not available. Rendering raw content.");
      messageElement.textContent = content;
    }

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  async function fetchCurrentRecord() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const recordId = urlParams.get("recordId");

      if (recordId) {
        console.log("[Frontend] Fetching current record for recordId:", recordId);

        const response = await fetch(`${baseURL}/${recordId}`, {
          headers: { Authorization: apiKey },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! Status: ${response.status}, Details: ${errorText}`);
        }

        const data = await response.json();
        const { id, fields } = data;
        const filteredRecord = {
          recordId: id,
          accountName: fields["Name"],
          clientFile: fields["Client File"],
        };

        currentRecord = filteredRecord;

        console.log("[Frontend] Fetched record:", JSON.stringify(filteredRecord, null, 2));

        conversationHistory.push({
          role: "system",
          content: `Record ID: ${filteredRecord.recordId}, Account Name: ${filteredRecord.accountName}, Client File: ${filteredRecord.clientFile}`,
        });

        displayMessage(
          "assistant",
          `Hello! How can I assist you today with the account for **${filteredRecord.accountName}**?`
        );
      }
    } catch (error) {
      console.error("[Frontend] Error fetching current record:", error);
      displayMessage("assistant", `An error occurred. Error details: ${error.message}`);
    }
  }

  async function fetchAllAccounts() {
    try {
      console.log("[Frontend] Fetching all accounts from 'Active' view...");

      const response = await fetch(`${baseURL}?view=Active`, {
        headers: { Authorization: apiKey },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! Status: ${response.status}, Details: ${errorText}`);
      }

      const data = await response.json();
      console.log("[Frontend] Fetched all accounts from 'Active' view:", JSON.stringify(data, null, 2));

      const accountsList = data.records.map(({ id, fields }) => {
        return {
          recordId: id,
          accountName: fields["Name"],
          clientFile: fields["Client File"],
        };
      });

      conversationHistory.push({
        role: "system",
        content: `Accounts available:\n${accountsList
          .map(
            (account) => `${account.accountName} (Record ID: ${account.recordId})`
          )
          .join("\n")}`,
      });

      displayMessage(
        "assistant",
        `Here are the accounts available from the 'Active' view:\n\n${accountsList
          .map(
            (account) => `**${account.accountName}** (Record ID: ${account.recordId})`
          )
          .join("\n")}`
      );
    } catch (error) {
      console.error("[Frontend] Error fetching all accounts from 'Active' view:", error);
      displayMessage("assistant", `An error occurred while fetching accounts. Error details: ${error.message}`);
    }
  }
</script>