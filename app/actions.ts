"use server";

import { InvalidToolArgumentsError, generateText, nanoid, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

const userData = {
  accountNumber: "ABCD1234",
  phoneNumber: "0212345678",
  verificationCode: "",
  balance: 100,
};

const otherUserAccounts = ["EFGH6789", "IJKL9876", "MNOP4567"];

// generate 4 digit random number
function generateFourDigitNumber(): string {
  return Math.floor(0 + Math.random() * 10000)
    .toString()
    .padStart(4, "0");
}

export async function continueConversation(history: Message[]) {
  "use server";

  try {
    const { text, toolResults } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a the bank assistant! Reply with nicely formatted markdown. Keep your reply short and concise. Don't overwhelm the user with too much information.
        You can only perform the following actions:
        - transferMoney: Perform a transfer of money. Call the transferMoney tool only when you have required information. Otherwise, keep asking the user. Don't come up with the information yourself. Once you have the complete information, ask the user to confirm the transfer before calling the tool by showing the transfer information.
        - requestBalance: Request to get the current balance of the account. Call the requestBalance tool only when you have required information. Otherwise, keep asking the user. Don't come up with the information yourself. Once you have the complete information, ask the user to confirm the request before calling the tool by showing the request information.
        - getBalance: Get the current balance of the account. Call the getBalance tool only when you have required information. Otherwise, keep asking the user. Don't come up with the information yourself. Once you have the complete information, ask the user to confirm the request before calling the tool by showing the request information.
        - verifyPhoneNumber: Verify the phone number of the account. Only call this tool when the previous tool call requires phone number verification. Call the verifyPhoneNumber tool only when you have required information. Otherwise, keep asking the user. Don't come up with the information yourself. Once you have the complete information, ask the user to confirm the request before calling the tool by showing the request information.
        `,
      messages: history,
      maxToolRoundtrips: 5,
      tools: {
        transferMoney,
        requestBalance,
        getBalance,
        verifyPhoneNumber,
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
  description: "Perform a transfer of money",
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

    if (!otherUserAccounts.includes(destination)) {
      return {
        transactionId: nanoid(),
        transactionStatus: "failed",
        message: `The transfer of ${amount} to ${destination} failed. The destination account is not in our database.`,
      };
    }

    const beforeTransferBalance = userData.balance;
    const afterTransferBalance = userData.balance - amount;

    if (afterTransferBalance < 0) {
      return {
        transactionId: nanoid(),
        transactionStatus: "failed",
        message: `The transfer of ${amount} to ${destination} failed. The user has insufficient funds.`,
      };
    }

    userData.balance = afterTransferBalance;

    return {
      transactionId: nanoid(),
      transactionStatus: "success",
      message: `The transfer of ${amount} to ${destination} will be executed at ${executionDateTime}. Current balance: ${beforeTransferBalance}. After transfer, balance: ${afterTransferBalance}`,
    };
  },
});

const requestBalance = tool({
  description: "Request to get the current balance of the account.",
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
      "[TOOL] requestBalance",
      `Account number: ${accountNumber}`,
      `Phone number: ${phoneNumber}`
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // check if the phone number and account number matches.
    if (
      userData.accountNumber !== accountNumber ||
      userData.phoneNumber !== phoneNumber
    ) {
      return {
        transactionId: nanoid(),
        transactionStatus: "failed",
        message: "The account number and phone number do not match.",
      };
    }

    userData.verificationCode = generateFourDigitNumber();

    console.log(
      "[TOOL] requestBalance",
      `Verification code: ${userData.verificationCode}`
    );

    return {
      transactionId: nanoid(),
      requireTool: "verifyPhoneNumber",
      onRequireToolSuccess: "getBalance",
      message:
        "Verification code sent to your phone number. Please enter the code to confirm the request.",
    };
  },
});

const getBalance = tool({
  description:
    "Get the current balance of the account. Only call this tool when the requestBalance has been called and verifyPhoneNumber has been called and succeeded.",
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
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // check if the phone number and account number matches.
    return {
      transactionId: nanoid(),
      balance: userData.balance,
      message: `Your balance is ${userData.balance} USD.`,
    };
  },
});

const verifyPhoneNumber = tool({
  description:
    "Verify the phone number of the account. Only call this tool when the previous tool call requires phone number verification.",
  parameters: z.object({
    verificationCode: z
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
        "The verification code sent to the user's phone number. It should be a 4-digit number. User must provide this code."
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
  execute: async ({ phoneNumber, verificationCode, onRequireToolSuccess }) => {
    console.log(
      "[TOOL] verifyPhoneNumber",
      `Phone number: ${phoneNumber}`,
      `Verification code: ${verificationCode}`,
      `On require tool success: ${onRequireToolSuccess}`
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // check if the phone number and verification code matches.
    // if validated, get the account balance.
    // in practice, maybe perform the transsaction based on the ID

    if (verificationCode !== userData.verificationCode) {
      return {
        verified: false,
        message: "The verification code is invalid.",
      };
    }

    return {
      message: `Verification code successfully verified.`,
      verified: true,
      onRequireToolSuccess,
    };
  },
});
