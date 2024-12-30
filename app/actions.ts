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
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base("your_base_id");

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
    if (error instanceof InvalidToolArgumentsError) {
      console.log(error.toJSON());
    } else {
      console.log(error);
    }
    return {
      messages: [
        ...history,
        {
          role: "assistant" as const,
          content: "There's a problem executing the request. Please try again.",
        },
      ],
    };
  }
}

const createAccount = tool({
  description: "Simulate creating a new account in Wonderland.",
  parameters: z.object({
    name: z.string().min(1).describe("The name of the account holder."),
    description: z.string().min(1).describe("A description for the account."),
  }),
  execute: async ({ name, description }) => {
    console.log("[TOOL] createAccount", { name, description });

    // Simulate account creation
    const newAccountNumber = nanoid();
    console.log(
      `[SIMULATION] Account Created: Name: ${name}, Description: ${description}, Account Number: ${newAccountNumber}`
    );

    // Log to Airtable
    await airtableBase("Accounts").create({
      Name: name,
      Description: description,
      AccountNumber: newAccountNumber,
    });

    return {
      message: `Successfully simulated creating an account for ${name} with the description: ${description}. Account Number: ${newAccountNumber}`,
    };
  },
});

const modifyAccount = tool({
  description: "Simulate modifying an account in Wonderland.",
  parameters: z.object({
    accountNumber: z
      .string()
      .min(4)
      .describe("The account number of the account to modify."),
    fieldToUpdate: z
      .string()
      .min(1)
      .describe(
        "The field to update (e.g., name, phoneNumber, balance). Must be a valid field."
      ),
    newValue: z
      .string()
      .min(1)
      .describe("The new value to assign to the specified field."),
  }),
  execute: async ({ accountNumber, fieldToUpdate, newValue }) => {
    console.log("[TOOL] modifyAccount", { accountNumber, fieldToUpdate, newValue });

    // Simulate account modification
    console.log(
      `[SIMULATION] Account Modified: Account Number: ${accountNumber}, Field Updated: ${fieldToUpdate}, New Value: ${newValue}`
    );

    // Update Airtable record
    const records = await airtableBase("Accounts")
      .select({ filterByFormula: `{AccountNumber} = "${accountNumber}"` })
      .firstPage();

    if (records.length > 0) {
      const recordId = records[0].id;
      await airtableBase("Accounts").update(recordId, {
        [fieldToUpdate]: newValue,
      });
    }

    return {
      message: `Successfully simulated modifying account ${accountNumber}. Updated ${fieldToUpdate} to ${newValue}.`,
    };
  },
});

// Event listener for chatbot container interaction
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    const chatbotContainer = document.getElementById("chatbot-container");

    if (chatbotContainer) {
      chatbotContainer.addEventListener("click", sendCurrentRecord);
      chatbotContainer.addEventListener("mouseover", sendCurrentRecord);
    }

    async function sendCurrentRecord() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const recordId = urlParams.get("recordId");

        const type = recordId ? "accounts" : "home";

        if (recordId) {
          const response = await fetch(
            `https://www.wonderland.guru/accounts/account-details?recordId=${recordId}`
          );
          const record = await response.json();

          const filteredRecord = {
            recordId: record.id,
            accountName: record.fields["Name"],
            clientFile: record.fields["Client File"],
          };

          console.log("[Frontend] Current record fetched:", filteredRecord);

          // Send record to Airtable
          await airtableBase("Records").create(filteredRecord);
        } else {
          console.log("[Frontend] Sending page type only:", type);
          await airtableBase("Records").create({ type });
        }
      } catch (error) {
        console.error("[Frontend] Error fetching or sending record:", error);
      }
    }
  });
}
