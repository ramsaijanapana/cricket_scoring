import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import {
  getSocialSocket,
  joinChatRoom,
  leaveChatRoom,
  sendTypingIndicator,
  sendReadReceipt,
} from '../lib/social-socket';

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string | null;
  senderAvatar: string | null;
  content: string;
  createdAt: string;
}

interface MatchChatProps {
  matchId: string;
}

const MAX_MESSAGE_LENGTH = 200;
const RATE_LIMIT_MS = 1000; // 1 message per second

export function MatchChat({ matchId }: MatchChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [lastSentAt, setLastSentAt] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize chat room
  useEffect(() => {
    if (!isOpen || roomId) return;

    const initRoom = async () => {
      setLoading(true);
      try {
        const room = await api.getOrCreateMatchRoom(matchId);
        setRoomId(room.id);

        // Fetch existing messages
        const res = await api.getChatMessages(room.id);
        setMessages(res.data.reverse()); // API returns desc, we want asc

        // Join the Socket.IO chat room
        joinChatRoom(room.id);
        sendReadReceipt(room.id);
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    };

    initRoom();
  }, [isOpen, matchId, roomId]);

  // Listen for real-time messages
  useEffect(() => {
    if (!roomId) return;

    const socket = getSocialSocket();

    const handleMessage = (data: { roomId: string; message: ChatMessage }) => {
      if (data.roomId !== roomId) return;
      setMessages((prev) => [...prev, data.message]);
    };

    const handleTyping = (data: { roomId: string; userId: string }) => {
      if (data.roomId !== roomId) return;
      setTypingUsers((prev) => new Set(prev).add(data.userId));

      // Clear typing after 3 seconds
      setTimeout(() => {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(data.userId);
          return next;
        });
      }, 3000);
    };

    const handleRead = (data: { roomId: string; userId: string; readAt: string }) => {
      // Could update read receipts UI here
    };

    socket.on('chat:message', handleMessage);
    socket.on('chat:typing', handleTyping);
    socket.on('chat:read', handleRead);

    return () => {
      socket.off('chat:message', handleMessage);
      socket.off('chat:typing', handleTyping);
      socket.off('chat:read', handleRead);
      leaveChatRoom(roomId);
    };
  }, [roomId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!roomId || !input.trim()) return;

    // Rate limit: 1 message per second
    const now = Date.now();
    if (now - lastSentAt < RATE_LIMIT_MS) return;

    const content = input.trim().slice(0, MAX_MESSAGE_LENGTH);
    setInput('');
    setLastSentAt(now);

    try {
      await api.sendChatMessage(roomId, content);
      // Message will appear via WebSocket
    } catch {
      // Revert input on failure
      setInput(content);
    }
  }, [roomId, input, lastSentAt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.slice(0, MAX_MESSAGE_LENGTH);
    setInput(value);

    // Send typing indicator (debounced)
    if (roomId) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingIndicator(roomId);
      }, 300);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* Toggle button */}
      {!isOpen && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-cricket-green text-white shadow-lg flex items-center justify-center hover:bg-cricket-green/90 transition-colors z-40"
          title="Match Chat"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <MessageCircle size={20} />
        </motion.button>
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed bottom-6 right-6 w-80 h-[28rem] bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-2xl flex flex-col overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
              <div className="flex items-center gap-2">
                <MessageCircle size={16} className="text-cricket-green" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  Match Chat
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
              {loading && (
                <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)]">
                  Loading chat...
                </div>
              )}

              {!loading && messages.length === 0 && (
                <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)]">
                  No messages yet. Start the conversation!
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-cricket-green/10 flex items-center justify-center text-[10px] font-bold text-cricket-green shrink-0 mt-0.5">
                    {msg.senderAvatar ? (
                      <img src={msg.senderAvatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      (msg.senderName || '?')[0].toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        {msg.senderName || 'User'}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] break-words">
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing indicator */}
            <AnimatePresence>
              {typingUsers.size > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 py-1 text-[10px] text-[var(--text-muted)] italic"
                >
                  Someone is typing...
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input area */}
            <div className="border-t border-[var(--border-subtle)] p-2">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  maxLength={MAX_MESSAGE_LENGTH}
                  className="flex-1 text-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-cricket-green/50 transition-colors"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || Date.now() - lastSentAt < RATE_LIMIT_MS}
                  className="p-2 rounded-lg bg-cricket-green text-white disabled:opacity-40 hover:bg-cricket-green/90 transition-colors"
                >
                  <Send size={14} />
                </button>
              </div>
              {input.length > MAX_MESSAGE_LENGTH * 0.8 && (
                <div className="text-right text-[10px] text-[var(--text-muted)] mt-1">
                  {input.length}/{MAX_MESSAGE_LENGTH}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
