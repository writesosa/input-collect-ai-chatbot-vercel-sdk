"use server";

import Airtable from "airtable";
import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Airtable setup
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base("your_base_id");

async function fetchUsers() {
  const records = await base("Users").select().firstPage();
  return records.map((record) => ({
    id: record.id,
    ...record.fields,
  }));
}

const otpSentData = {
  accountNumber: "",
  phoneNumber: "",
  verificationCode: "",
};

const currentUserData = {
  name: "",
  accountNumber: "",
  phoneNumber: "",
  verificationCode: "",
  balance: 0,
  lastVerifiedAt: "",
};

// generate 4 digit random number
function generateFourDigitNumber(): string {
  return Math.floor(0 + Math.random() * 10000)
    .toString()
    .padStart(4, "0");
}

export async function continueConversation(history: Message[]) {
  "use server";

  try {
    console.log("[LLM] continueConversation");
    const users = await fetchUsers();
    const { text, toolResults } = await generateText({
      model: openai("gpt-4o"),
      system: `You are the Sinarmas bank assistant! You only know things about the Sinarmas bank. Reply with nicely formatted markdown. Keep your reply short and concise. Don't overwhelm the user with too much information. 
      
      You can _only_ perform the following actions:
      - transferMoney: Schedule the money transfer. This tool and the parameters' collection must only be called if the user has verified their account via OTP verification. Call the transferMoney tool only when you have all required parameters. Otherwise, keep asking the user. Don't come up with the information yourself. Once you have the complete information, ask the user to confirm the transfer before calling the tool by showing the transfer information.
      - getBalance: Get the current balance of the account. This tool and the parameters' collection must only be called if the user has verified their account via OTP verification. Call the getBalance tool only when you have required parameters. Otherwise, keep asking the user. Don't come up with the information yourself. Once you have the complete information, ask the user to confirm the request before calling the tool by showing the request information.

      Some of the actions require the user to verify their account first by providing a verification code (OTP) sent to their phone number. The verification code is valid only when the user enters it correctly. If the verification code is invalid, the user needs to request a new verification code. Subsequent verifications are required when the last verification was more than 3 minutes ago.
      - verifyPhoneNumber: Verify the phone number of the account. Only collect the parameter to call this tool when the previous tool call requires phone number verification. And then call the verifyPhoneNumber tool only when you have required information. Otherwise, keep asking the user. Don't come up with the information yourself. Once you have the complete information, ask the user to confirm the request before calling the tool by showing the request information.
      - verifyOTP: Verify the OTP sent to the user's phone number. If the OTP is valid, perform the next function. Otherwise, ask the user to request a new OTP.

      Don't perform any other actions.
      `,
      messages: history,
      maxToolRoundtrips: 5,
      tools: {
        transferMoney: createTransferMoneyTool(users),
        getBalance: createGetBalanceTool(users),
        verifyPhoneNumber: createVerifyPhoneNumberTool(users),
        verifyOTP,
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

function createTransferMoneyTool(users: any[]) {
  return tool({
    description: "Schedule the money transfer to another account...",
    parameters: z.object({
      amount: z.number().min(1).describe("The amount of money to transfer"),
      destination: z.string().min(4).describe("The destination account..."),
      executionDateTime: z.date().refine((date) => date > new Date(), { message: "The date must be in the future" }),
    }),
    execute: async ({ amount, destination, executionDateTime }) => {
      console.log("[TOOL] transferMoney", { amount, destination, executionDateTime });
      const recipient = users.find((user) => user.accountNumber === destination);

      if (!recipient) {
        return {
          transactionId: nanoid(),
          transactionStatus: "failed",
          message: "The destination account number does not exist.",
        };
      }

      const beforeTransferBalance = currentUserData.balance;
      const afterTransferBalance = beforeTransferBalance - amount;

      if (afterTransferBalance < 0) {
        return {
          transactionId: nanoid(),
          transactionStatus: "failed",
          message: "Insufficient funds for transfer.",
        };
      }

      currentUserData.balance = afterTransferBalance;

      return {
        transactionId: nanoid(),
        transactionStatus: "success",
        message: `The transfer of ${amount} to ${destination} was successful. Balance after transfer: ${afterTransferBalance}`,
      };
    },
  });
}

function createGetBalanceTool(users: any[]) {
  return tool({
    description: "Get the current balance of the account...",
    parameters: z.object({ accountNumber: z.string().min(4) }),
    execute: async ({ accountNumber }) => {
      const user = users.find((user) => user.accountNumber === accountNumber);
      if (!user) {
        return { message: "Account not found." };
      }
      return { message: `The balance is ${user.balance}.` };
    },
  });
}

function createVerifyPhoneNumberTool(users: any[]) {
  return tool({
    description: "Send OTP to phone number...",
    parameters: z.object({ accountNumber: z.string().min(4), phoneNumber: z.string().min(10) }),
    execute: async ({ accountNumber, phoneNumber }) => {
      const user = users.find((user) => user.accountNumber === accountNumber && user.phoneNumber === phoneNumber);
      if (!user) {
        return { message: "Account and phone number mismatch." };
      }

      otpSentData.verificationCode = generateFourDigitNumber();
      return { message: `OTP sent: ${otpSentData.verificationCode}` };
    },
  });
}
