"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import users from "./users.json";
import Airtable from "airtable";

export interface Message {
  role: "user" | "assistant" | "system";
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
    // Check if the Wonderland description has already been sent
    const wonderlandDescriptionSent = history.some(
      (message) => message.role === "system" && message.content.includes("Wonderland is an AI-powered public relations automation system")
    );

    if (!wonderlandDescriptionSent) {
      history.unshift({
        role: "system",
        content: `Wonderland is an **AI-powered public relations automation system** that dynamically generates and distributes **content, websites, blog posts, and images** to strategically market companies. Using AI, Wonderland creates **Rabbit Holes**—interconnected digital pathways that naturally direct users to curated content across the web. Wonderland excels in **automated content generation, strategic deployment, analytics, and SEO-optimized backlink strategies**, all aimed at enhancing brand visibility and engagement. It adapts content to align with client objectives, ensuring scalability, precision, and organic user interaction.`,
      });
    }

    console.log("[LLM] continueConversation");
    const { text, toolResults } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a Wonderland assistant!
        Reply with nicely formatted markdown. 
        Keep your replies short and concise. 
        If this is the first reply, send a nice welcome message.
        If the selected Account is different, mention account or company name once.

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
    console.log("[TOOL] createAccount", fields);

    try {
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
      const existingRecords = await airtableBase("Accounts").select().firstPage();
      const primaryContactSuggestions = existingRecords
        .map((record) => record.get("Primary Contact Person"))
        .filter((value): value is string => typeof value === "string");

      // Fetch available industry options from Airtable
      const allowedIndustries = await airtableBase("Accounts").select({ fields: ["Industry"] }).all();
      const industryOptions = allowedIndustries
        .map((record) => record.get("Industry"))
        .filter((value): value is string => typeof value === "string");

      // Guess Industry based on client information
      const guessIndustry = (info: string) => {
        if (/dentist|dental/i.test(info)) return "Healthcare";
        if (/jeep|car|vehicle|automobile/i.test(info)) return "Automotive";
        if (/dog|pet/i.test(info)) return "Pet Care";
        if (/legal|law/i.test(info)) return "Legal";
        return "General";
      };
      fields.Industry = fields.Industry || guessIndustry(fields.Description || fields["About the Client"] || "");

      // Generate Talking Points
      const generateTalkingPoints = (info: string) => [
        `Highlight the importance of ${info.toLowerCase()} in building trust and engagement with clients.`,
        `Leverage Wonderland's AI-driven tools to promote ${info.toLowerCase()} effectively.`,
        `Ensure consistent, high-quality messaging about ${info.toLowerCase()} across all platforms.`,
      ];
      fields["Talking Points"] =
        fields["Talking Points"] || generateTalkingPoints(fields.Description || fields.Name || "").join("\n");

      // Generate Primary Objective
      const generatePrimaryObjective = (info: string) => {
        return `To utilize Wonderland's AI-powered platform to enhance the reach, engagement, and visibility of ${info.toLowerCase()}, ensuring alignment with client goals and target audience needs.`;
      };
      fields["Primary Objective"] =
        fields["Primary Objective"] || generatePrimaryObjective(fields.Description || fields.Name || "");

      // Rewrite Description and About the Client based on client-provided info
      const rewriteDescription = (info: string) => {
        return `This account is focused on ${info.toLowerCase()}, leveraging Wonderland's AI-powered public relations system to maximize visibility and engagement in the ${fields.Industry || "General"} sector.`;
      };
      fields.Description =
        fields.Description || rewriteDescription(fields["About the Client"] || fields.Name || "");

      fields["About the Client"] =
        fields["About the Client"] ||
        `The client specializes in ${fields.Description.toLowerCase()}. Utilizing Wonderland, the account will automate content creation and strategically distribute it across platforms to align with client goals and target audience needs.`;

      // Ensure minimum 600-character recommendations for descriptions
      fields.Description = fields.Description.padEnd(600, ".");

      // Prompt for Priority Image field if missing
      const priorityImageOptions = [
        "AI Generated",
        "Stock Images",
        "Google Images",
        "Social Media",
        "Uploaded Media",
      ];
      if (!fields["Priority Image"]) {
        return {
          message: `What kind of images should this account generate or display? Please choose one of the following options: ${priorityImageOptions.join(
            ", "
          )}`,
        };
      }
      if (!priorityImageOptions.includes(fields["Priority Image"])) {
        return {
          message: `Invalid choice for Priority Image. Please choose from: ${priorityImageOptions.join(", ")}`,
        };
      }

      // Prompt for Primary Contact Person if missing
      if (!fields["Primary Contact Person"]) {
        const suggestionMessage = primaryContactSuggestions.length > 0
          ? `The following primary contact persons are available: ${primaryContactSuggestions.join(", ")}. Is one of them the contact person for this account, or should we add someone else?`
          : "No existing contact persons found. Please provide a contact person for this account.";
        return { message: suggestionMessage };
      }

      // Ask about website or social media if not provided
      if (!fields["Client URL"]) {
        return {
          message: `Does this account have a website or social media account you'd like to include? If not, you can skip this step.`,
        };
      }

      // Ask for additional contact information if not provided
      if (!fields["Contact Information"]) {
        return {
          message: `Do you have any contact information for this company, such as an email, phone number, or address, to include in the content?`,
        };
      }

      // Summarize all fields before creation
      const summarizedFields = {
        Name: fields.Name,
        Description: fields.Description,
        "Client Company Name": fields["Client Company Name"],
        "Client URL": fields["Client URL"],
        Status: fields.Status || "New",
        Industry: fields.Industry,
        "Primary Contact Person": fields["Primary Contact Person"],
        "About the Client": fields["About the Client"],
        "Primary Objective": fields["Primary Objective"],
        "Talking Points": fields["Talking Points"],
        "Contact Information": fields["Contact Information"],
        "Priority Image": fields["Priority Image"],
      };

      return {
        message: `Here are the details for the new account creation:\n\n${JSON.stringify(
          summarizedFields,
          null,
          2
        )}\n\nWe don't have information for some fields. Can I proceed with these suggestions, or would you like to update any field?`,
      };
    } catch (error) {
      console.error("[TOOL] Error creating account in Airtable:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
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
