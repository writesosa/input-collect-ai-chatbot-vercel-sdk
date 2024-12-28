"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Message, continueConversation } from "./actions";
import useConversationStore from "./use-conversation-store";
import { cn } from "./util";

// Force the page to be dynamic and allow streaming responses up to 30 seconds
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default function Home() {
  const { conversation, setConversation } = useConversationStore();
  const [input, setInput] = useState<string>("I want to transfer money to my friend");
  const [isTyping, setIsTyping] = useState(false);
  const lastElementRef = useRef<HTMLDivElement>(null); // Explicitly define the type

  useEffect(() => {
    if (lastElementRef.current) {
      lastElementRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation]);

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch pb-36 space-y-2">
      {conversation.map((message, index) => (
        <div
          key={index}
          className={cn(
            "flex flex-row space-x-2 p-2 rounded-md",
            message.role === "user" ? "flex-row-reverse  self-end" : ""
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
      <div className="w-full h-1 bg-transparent" ref={lastElementRef}></div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const userInput = input.trim();
          setInput("");

          if (userInput === "reset" || userInput === "clear") {
            setConversation([]);
            return;
          }

          const updatedConversation = [
            ...conversation,
            { role: "user", content: userInput } as Message,
          ];
          setConversation(updatedConversation); // Pass the raw array
          setIsTyping(true);

          try {
            const response = await continueConversation(
              updatedConversation,
              "accounts",
              "rec12345"
            );
            setConversation(response.messages);
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
