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

  // Set up a readable stream to process text as chunks
  const stream = new ReadableStream({
    start(controller) {
      result.on("data", (chunk) => {
        const text = chunk.toString();
        controller.enqueue(text);
      });
      result.on("end", () => {
        controller.close();
      });
      result.on("error", (error) => {
        console.error("Stream error:", error);
        controller.error(error);
      });
    },
  });

  // Return the stream with proper headers
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain", // Streaming plain text
      "Access-Control-Allow-Origin": "https://www.wonderland.guru",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
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
