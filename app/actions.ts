"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import users from "./users.json";
export interface Message {
  role: "user" | "assistant";
  content: string;
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
    const { text, toolResults } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a the Sinarmas bank assistant! You only know things about the Sinarmas bank. Reply with nicely formatted markdown. Keep your reply short and concise. Don't overwhelm the user with too much information. 

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
        transferMoney,
        getBalance,
        verifyPhoneNumber,
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

const transferMoney = tool({
  description:
    "Schedule the money transfer to another account. Only collect the parameters for this tool and call this tool when the user has successfully verified their account via OTP verification.",
  parameters: z.object({
    amount: z.number().min(1).describe("The amount of money to transfer"),
    destination: z
      .string()
      .min(4)
      .describe(
        "The destination account of the transfer. It should alphanumeric, minimum 4 characters, no spaces, and no special characters."
      ),
    executionDateTime: z
      .union([
        z.date(), // Directly accept Date objects.
        z.string().transform((str) => new Date(str)), // Convert strings to Date objects.
      ])
      .refine((date) => date > new Date(), {
        message: "The date must be in the future",
      })
      .describe(
        "The date and time of the transfer. It should be in the future. Convert the date time given by the user to a date object."
      ),
  }),
  execute: async ({ amount, destination, executionDateTime }) => {
    console.log(
      "[TOOL] transferMoney",
      `Amount: ${amount}`,
      `Destination: ${destination}`,
      `Execution date time: ${executionDateTime}`
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(currentUserData);

    // check if the destination account number exists in the user database and it is not the same as the current account number
    const recipient = users.find(
      (user) =>
        user.accountNumber !== destination &&
        user.accountNumber !== currentUserData.accountNumber
    );

    if (!recipient) {
      return {
        transactionId: nanoid(),
        transactionStatus: "failed",
        message: "The destination account number does not exist.",
      };
    }

    const beforeTransferBalance = currentUserData.balance;
    const afterTransferBalance = currentUserData.balance - amount;

    if (afterTransferBalance < 0) {
      return {
        transactionId: nanoid(),
        transactionStatus: "failed",
        recipientName: recipient.name,
        message: `The transfer of ${amount} to ${destination} (${recipient.name}) failed. The current user has insufficient funds.`,
      };
    }

    currentUserData.balance = afterTransferBalance;

    // TODO: append the transaction to the transaction history in transactions.json

    return {
      transactionId: nanoid(),
      transactionStatus: "success",
      recipientName: recipient.name,
      message: `The transfer of ${amount} to ${destination} (${recipient.name}) will be executed at ${executionDateTime}. Current balance: ${beforeTransferBalance}. After transfer, balance: ${afterTransferBalance}`,
    };
  },
});

const getBalance = tool({
  description:
    "Get the current balance of the account. Only collect the parameters for this tool and call this tool when the user has successfully verified their account via OTP verification.",
  parameters: z.object({
    accountNumber: z
      .string()
      .min(4)
      .describe(
        "The account number of the account. It should alphanumeric, minimum 4 characters, no spaces, and no special characters."
      ),
  }),
  execute: async ({ accountNumber }) => {
    console.log("[TOOL] getBalance", `Account number: ${accountNumber}`);
    console.log(currentUserData);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // check if the phone number and account number matches.
    return {
      transactionId: nanoid(),
      balance: currentUserData.balance,
      userName: currentUserData.name,
      message: `The balance of the user's account (${currentUserData.name}) is ${currentUserData.balance} USD.`,
    };
  },
});

const verifyPhoneNumber = tool({
  description: "Send the OTP code to the user's phone number.",
  parameters: z.object({
    accountNumber: z
      .string()
      .min(4)
      .describe(
        "The account number of the account. It should alphanumeric, minimum 4 characters, no spaces, and no special characters."
      ),
    phoneNumber: z
      .string()
      .min(10)
      .describe(
        "The phone number of the account. It should be a valid phone number."
      ),
  }),
  execute: async ({ accountNumber, phoneNumber }) => {
    console.log(
      "[TOOL] verifyPhoneNumber",
      `Account number: ${accountNumber}`,
      `Phone number: ${phoneNumber}`
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // search the user given the phone number and account number
    const user = users.find(
      (user) =>
        user.phoneNumber === phoneNumber && user.accountNumber === accountNumber
    );

    if (!user) {
      return {
        transactionId: nanoid(),
        transactionStatus: "failed",
        message: "The account number and phone number do not match.",
      };
    }

    // in production, we would need to store this information in database
    otpSentData.accountNumber = accountNumber;
    otpSentData.phoneNumber = phoneNumber;
    otpSentData.verificationCode = generateFourDigitNumber();

    console.log(
      "[TOOL] verifyPhoneNumber",
      `Verification code: ${otpSentData.verificationCode}`
    );

    return {
      transactionId: nanoid(),
      message:
        "Verification code has been sent to the user's phone number. User needs to enter the code to confirm the request.",
    };
  },
});

const verifyOTP = tool({
  description: "Verify the OTP code that the user entered.",
  parameters: z.object({
    otpCode: z
      .string()
      .refine(
        (value) => {
          return /^\d{4}$/.test(value.toString());
        },
        {
          message: "Number must have exactly 4 digits",
        }
      )
      .describe(
        "The OTP code sent to the user's phone number. It should be a 4-digit number. User must provide this code."
      ),
    onRequireToolSuccess: z
      .string()
      .min(1)
      .describe(
        "The tool to call when the verfication code is valid. It should be a valid tool name. This parameter must not be provided by the user."
      ),
    phoneNumber: z
      .string()
      .min(10)
      .describe(
        "The phone number of the account. It should be a valid phone number."
      ),
  }),
  execute: async ({ phoneNumber, otpCode, onRequireToolSuccess }) => {
    console.log(
      "[TOOL] verifyPhoneNumber",
      `Phone number: ${phoneNumber}`,
      `OTP code: ${otpCode}`,
      `On require tool success: ${onRequireToolSuccess}`
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (otpCode !== otpSentData.verificationCode) {
      return {
        verified: false,
        message: "The verification code is invalid.",
      };
    }

    // find user based on phone number and account number
    const user = users.find(
      (user) =>
        user.phoneNumber === otpSentData.phoneNumber &&
        user.accountNumber === otpSentData.accountNumber
    );

    if (!user) {
      return {
        verified: false,
        message: "The account number and phone number do not match.",
      };
    }

    // pretend that we have a session with the user
    currentUserData.name = user.name;
    currentUserData.accountNumber = user.accountNumber;
    currentUserData.phoneNumber = user.phoneNumber;
    currentUserData.balance = user.balance;
    currentUserData.verificationCode = "";
    currentUserData.lastVerifiedAt = new Date().toISOString();

    return {
      message: `OTP code successfully verified. The name of the user is ${currentUserData.name}. Perform the next function: ${onRequireToolSuccess}`,
      verified: true,
      verifiedAt: new Date().toISOString(),
      onRequireToolSuccess,
      userName: currentUserData.name,
    };
  },
});

here's my current server side script that works its route.ts it needs to use actions.ts


import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai("gpt-4-turbo"),
    messages,
  });

  // Create the AI stream response
  const aiStreamResponse = result.toAIStreamResponse();

  // Clone the response to modify headers
  const response = new Response(aiStreamResponse.body, aiStreamResponse);

  // Set CORS headers
  response.headers.set("Access-Control-Allow-Origin", "https://www.wonderland.guru");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");

  return response;
}

// Handle preflight OPTIONS request
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "https://www.wonderland.guru",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400", // Cache preflight response for 24 hours
    },
  });
}
