"use server";

import { InvalidToolArgumentsError, generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

function transferMoney({
  amount,
  destination,
  executionDateTime,
}: {
  amount: number;
  destination: string;
  executionDateTime: Date;
}) {
  return {
    amount,
    destination,
    executionDateTime,
    currentBalance: 100,
    afterTransferBalance: 100 - amount,
  };
}

export async function continueConversation(history: Message[]) {
  "use server";

  try {
    const { text, toolResults } = await generateText({
      model: openai("gpt-4o"),
      system: `You are a the bank assistant! Reply with nicely formatted markdown. Keep your reply short and concise. Don't overwhelm the user with too much information.
        You can only handle the request to transfer money. 
        Call the transferMoney tool only when you have required information. Otherwise, keep asking the user. Don't come up with the information yourself.
        Once you have the complete information, ask the user to confirm the transfer before calling the tool by showing the transfer information.`,
      messages: history,
      maxToolRoundtrips: 5,
      tools: {
        transferMoney: {
          description: "Perform a transfer of money",
          parameters: z.object({
            amount: z
              .number()
              .min(1)
              .describe("The amount of money to transfer"),
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
            const result = transferMoney({
              amount,
              destination,
              executionDateTime,
            });
            return `The transfer of ${amount} to ${destination} will be executed at ${executionDateTime}. Current balance: ${result.currentBalance}. After transfer, balance: ${result.afterTransferBalance}`;
          },
        },
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
