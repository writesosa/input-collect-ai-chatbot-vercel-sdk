"use client";

import { useEffect, useOptimistic, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Message, continueConversation } from "./actions";
import useConversationStore from "./use-conversation-store";
import { cn } from "./util";

// Force the page to be dynamic and allow streaming responses up to 30 seconds
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default function Home() {
  const { conversation: conversationString, setConversation } = useConversationStore();
  const conversation = JSON.parse(conversationString || "[]") as Message[];
  const [optimisticConversation, addOptimisticMessage] = useOptimistic(
    conversation,
    (current, optimisticVal: Message[]) => [...current, ...optimisticVal]
  );
  const [input, setInput] = useState<string>("I want to transfer money to my friend");
  const [isTyping, setIsTyping] = useState(false);
  const lastElementRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the last message
  useEffect(() => {
    if (optimisticConversation.length > 0) {
      lastElementRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [optimisticConversation.length]);

  // Clear the input when a new message is added
  useEffect(() => {
    if (conversation.length > 0) {
      setInput("");
    }
  }, [conversation.length]);

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch pb-36 space-y-2">
      {optimisticConversation
        .filter((m) =>
          m.role === "assistant"
            ? !m.content.startsWith("[METADATA]") // Hide metadata messages
            : true
        )
        .map((message, index) => (
          <div
            key={index}
            className={cn(
              "flex flex-row space-x-2 p-2 rounded-md",
              message.role === "user" ? "flex-row-reverse self-end" : ""
            )}
          >
            <div className="mx-2">{message.role === "assistant" ? "🤖" : "🧔"}</div>
            <div
              className={cn(
                "flex flex-col space-y-2 p-2 px-4 rounded-md",
                message.role === "user"
                  ? "flex-row-reverse bg-blue-500 text-white self-end"
                  : "bg-slate-100"
              )}
            >
              <Markdown>{message.content}</Markdown>
            </div>
          </div>
        ))}
      <div className="w-full h-1 bg-transparent" ref={lastElementRef} />

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const userInput = input.trim();
          setInput("");

          if (userInput === "reset" || userInput === "clear") {
            setConversation([]); // Reset conversation to an empty array
            return;
          }

          // Add optimistic messages to the UI
          addOptimisticMessage([
            {
              role: "assistant",
              content: `[METADATA] Current date and time: ${new Date().toLocaleString()}`,
            } as const,
            { role: "user", content: userInput } as const,
          ]);
          setIsTyping(true);

          try {
            const { messages } = await continueConversation([
              ...conversation,
              {
                role: "assistant",
                content: `[METADATA] Current date and time: ${new Date().toLocaleString()}`,
              } as const,
              { role: "user", content: userInput } as const,
            ]);
            setConversation(messages); // Update conversation with the new messages array
          } catch (error) {
            console.error("[ERROR] Sending conversation:", error);
          } finally {
            setIsTyping(false);
          }
        }}
      >
        <div className="fixed bottom-0 w-full max-w-md flex flex-col space-y-2 py-4 bg-white">
          {isTyping && <p className="text-gray-400 italic text-sm">Bot is typing ...</p>}
          <input
            className="p-2 border border-gray-300 rounded shadow-xl"
            type="text"
            value={input}
            placeholder="Enter a message"
            onChange={(event) => setInput(event.target.value)}
          />
          <button
            className="p-2 border bg-slate-700 text-white rounded shadow-xl"
            type="submit"
          >
            Send Message
          </button>
        </div>
      </form>
    </div>
  );
}
