import { io, type Socket } from "socket.io-client";

const CHAT_SERVICE_URL =
  import.meta.env.VITE_CHAT_SERVICE_URL || "http://localhost:3004";

export type ChatMessage = {
  session_id: string;
  sender_id: string;
  content: string;
  timestamp: string;
};

export function createChatSocket(): Socket {
  return io(CHAT_SERVICE_URL, { transports: ["websocket"] });
}