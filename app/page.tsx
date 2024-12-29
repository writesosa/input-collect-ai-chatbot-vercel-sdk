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
  const { conversation: conversationString, setConversation } =
    useConversationStore();
  const conversation = JSON.parse(conversationString) as Message[];
  const [optimisticConversation, addOptimisticMessage] = useOptimistic(
    conversation,
    (current, optimisticVal: Message[]) => {
      return [...current, ...optimisticVal];
    }
  );
  const [input, setInput] = useState<string>(
    "I want to transfer money to my friend"
  );
  const [isTyping, setIsTyping] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null); // Added state to store the Airtable record ID
  const lastElementRef = useRef<HTMLDivElement>(null);

  // Extract recordId from the URL query parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get("recordId");
    if (id) {
      console.log(`[LOG] Extracted recordId from URL: ${id}`);
      setRecordId(id);
    } else {
      console.warn(`[WARN] No recordId found in the URL.`);
    }
  }, []);

  // Log when conversation updates
  useEffect(() => {
    if (conversation.length > 0) {
      console.log(`[LOG] Conversation updated. Length: ${conversation.length}`);
      setInput("");
    }
  }, [conversation.length]);

  // Log when optimistic conversation updates
  useEffect(() => {
    if (optimisticConversation.length > 0) {
      console.log(`[LOG] Optimistic conversation updated.`);
      lastElementRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [optimisticConversation.length]);

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch pb-36 space-y-2">
      {optimisticConversation
        .filter((m) =>
          m.role === "assistant"
            ? m.content.startsWith("[METADATA]")
              ? false
              : true
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
            <div className="mx-2">
              {message.role === "assistant" ? "🤖" : "🧔"}
            </div>
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

          console.log(`[LOG] User input: "${userInput}"`);

          if (userInput === "reset" || userInput === "clear") {
            console.log(`[LOG] Resetting conversation.`);
            setConversation([]); // Reset conversation correctly
            return;
          }

          addOptimisticMessage([
            {
              role: "assistant",
              content: `[METADATA] Current date and time: ${new Date().toLocaleString()}`,
            } as Message,
            { role: "user", content: userInput } as Message,
          ]);
          setIsTyping(true);

          try {
            const { messages } = await continueConversation(
              [
                ...conversation,
                {
                  role: "assistant",
                  content: `[METADATA] Current date and time: ${new Date().toLocaleString()}`,
                } as Message,
                { role: "user", content: userInput } as Message,
              ],
              recordId // Pass the recordId as the second argument
            );
            console.log(`[LOG] Server response:`, messages);
            setConversation(messages); // Update conversation with the new messages array
          } catch (error) {
            console.error(`[ERROR] Sending conversation failed:`, error);
          } finally {
            setIsTyping(false);
          }
        }}
      >
        <div className="fixed bottom-0 w-full max-w-md flex flex-col space-y-2 py-4 bg-white">
          {isTyping ? (
            <p className="text-gray-400 italic text-sm">Bot is typing ...</p>
          ) : null}
          <input
            className="p-2 border border-gray-300 rounded shadow-xl"
            type="text"
            value={input}
            placeholder="Enter a message"
            onChange={(event) => {
              setInput(event.target.value);
            }}
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
