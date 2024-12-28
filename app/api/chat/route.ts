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

  // Set up a readable stream that outputs cleaned text
  const stream = new ReadableStream({
    start(controller) {
      result.on("data", (chunk) => {
        try {
          const parsedChunk = JSON.parse(chunk.toString());
          const text = Object.values(parsedChunk).join(""); // Combine the text values
          controller.enqueue(text);
        } catch (error) {
          console.error("Failed to parse chunk:", error);
          controller.error(error);
        }
      });
      result.on("end", () => controller.close());
      result.on("error", (error) => {
        console.error("Stream error:", error);
        controller.error(error);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain",
      "Access-Control-Allow-Origin": "https://www.wonderland.guru",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
