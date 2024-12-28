"use client";

import { useState, useEffect, useRef } from "react";
import { continueConversation } from "./actions";

export default function Home() {
  const [conversation, setConversation] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const lastElementRef = useRef(null);

  useEffect(() => {
    if (lastElementRef.current) {
      lastElementRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input.trim() };
    const updatedConversation = [...conversation, userMessage];
    setConversation(updatedConversation);
    setInput("");
    setIsTyping(true);

    const response = await continueConversation(updatedConversation, "accounts", "rec12345");
    setConversation(response.messages);
    setIsTyping(false);
  };

  return (
    <div>
      <div>
        {conversation.map((msg, idx) => (
          <div key={idx}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
        <div ref={lastElementRef}></div>
      </div>
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
        />
        <button type="submit">Send</button>
      </form>
      {isTyping && <p>Typing...</p>}
    </div>
  );
}
