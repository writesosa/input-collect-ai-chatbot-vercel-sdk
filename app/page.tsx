"use client";

import { useEffect, useOptimistic, useState } from "react";
import Markdown from "react-markdown";
import { Message, continueConversation } from "./actions";
import useConversationStore from "./use-conversation-store";

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

  useEffect(() => {
    if (conversation.length > 0) {
      setInput("");
    }
  }, [conversation.length]);

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch pb-36">
      {optimisticConversation
        .filter((m) =>
          m.role === "assistant"
            ? m.content.startsWith("[METADATA]")
              ? false
              : true
            : true
        )
        .map((message, index) => (
          <div key={index} className="flex flex-row space-x-2 p-2">
            <div>{message.role === "assistant" ? "🤖" : "🧔"}</div>
            <div className="flex flex-col space-y-2">
              <Markdown>{message.content}</Markdown>
            </div>
          </div>
        ))}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const userInput = input.trim();
          setInput("");
          addOptimisticMessage([
            {
              role: "assistant",
              content: `[METADATA] Current date and time: ${new Date().toLocaleString()}`,
            } as const,
            { role: "user", content: userInput } as const,
          ]);

          const { messages } = await continueConversation([
            ...conversation,
            {
              role: "assistant",
              content: `[METADATA] Current date and time: ${new Date().toLocaleString()}`,
            } as const,
            { role: "user", content: userInput } as const,
          ]);

          setConversation(messages);
        }}
      >
        <div className="fixed bottom-0 w-full max-w-md flex flex-col space-y-2 py-4">
          <input
            className=" p-2 border border-gray-300 rounded shadow-xl"
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
