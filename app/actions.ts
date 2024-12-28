export async function continueConversation(
  history: Message[],
  pageType: string,
  recordId: string,
  fields: Record<string, any>
) {
  "use server";

  try {
    // Determine if a tool (e.g., modifyRecord) is required
    const requiresTool = history.some((msg) =>
      /(update|change|modify)/i.test(msg.content)
    );

    console.log("[DEBUG] Tool Required:", requiresTool);

    const systemPrompt = `
      You are an assistant for managing and modifying Airtable records. You have access to the following actions:
      - modifyRecord: Modify any field of an Airtable record dynamically.
      
      Current record details:
      ${requiresTool ? JSON.stringify(fields) : "Details are available upon request."}

      Confirm changes before making updates.
    `;

    const { text, toolResults } = await generateText({
      model: openai("gpt-4"),
      system: systemPrompt,
      messages: history,
      maxToolRoundtrips: requiresTool ? 5 : 0, // Only invoke tools if necessary
      tools: requiresTool ? { modifyRecord } : undefined,
    });

    console.log("[DEBUG] Assistant Response Text:", text);
    console.log("[DEBUG] Tool Results:", toolResults);

    const assistantMessages = [
      ...history,
      {
        role: "assistant" as const,
        content: text || toolResults.map((toolResult) => toolResult.result).join("\n"),
      },
    ];

    return {
      messages: assistantMessages,
    };
  } catch (error) {
    console.error("[ERROR] Processing Conversation:", error);

    return {
      messages: [
        ...history,
        {
          role: "assistant" as const,
          content: "An error occurred while processing your request. Please try again.",
        },
      ],
    };
  }
}
