import { useEffect, useRef, useState } from "react";
import { createChatSocket, type ChatMessage } from "../services/chatService";
import type { Socket } from "socket.io-client";

type Props = {
  sessionId: string;
  userId: string;
  username: string;
  disabled?: boolean;
};

export default function ChatPanel({ sessionId, userId, username, disabled }: Props) {
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const socket = createChatSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("authenticate", token);
    });

    socket.on("authenticated", () => {
      setConnected(true);
    });

    socket.on("chat-history", (history: ChatMessage[]) => {
      setMessages(history);
    });

    socket.on("receive-message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("auth-error", (err: { message: string }) => {
      console.error("Chat auth error:", err.message);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId]);

  // Auto scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    if (!input.trim() || !connected || disabled) return;
    socketRef.current?.emit("send-message", input.trim());
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSend();
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 text-sm">
        {!connected ? (
          <div className="flex h-full min-h-[120px] items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full min-h-[120px] items-center justify-center">
            <p className="text-slate-400 text-xs">No messages yet.</p>
          </div>
        ) : null}

        {messages.map((msg, i) => {
          const isMe = msg.sender_id === userId;
          return (
            <div
              key={i}
              className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
            >
              <span className="text-xs text-slate-400 mb-0.5">
                {isMe ? username : "Partner"} ·{" "}
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
              <span
                className={`px-3 py-1.5 rounded-lg max-w-[80%] break-words ${
                  isMe
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {msg.content}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!connected || disabled}
          placeholder={disabled ? "Session ended" : "Type a message..."}
          className="flex-1 border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
        />
        <button
          onClick={handleSend}
          disabled={!connected || !input.trim() || disabled}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:bg-gray-300 sm:w-auto"
        >
          Send
        </button>
      </div>
    </div>
  );
}