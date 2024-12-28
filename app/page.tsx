"use client";

import { useState, useRef, useEffect } from "react";
import { continueConversation } from "./actions";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const lastElementRef = useRef(null);

  useEffect(() => {
    lastElementRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);

    const { messages: updatedMessages } = await continueConversation(
      [...messages, userMessage],
      "accounts", // Example pageType
      "rec12345", // Example recordId
      { Name: "Current Name" } // Example fields
    );

    setMessages(updatedMessages);
    setInput("");
  };

  return (
    <div>
      <div>
        {messages.map((msg, idx) => (
          <div key={idx} ref={idx === messages.length - 1 ? lastElementRef : null}>
            {msg.role === "user" ? "You: " : "Assistant: "}
            {msg.content}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
