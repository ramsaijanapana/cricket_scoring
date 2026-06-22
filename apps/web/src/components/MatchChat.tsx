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
const RATE_LIMIT_MS = 1000;

export function MatchChat({ matchId }: MatchChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [lastSentAt, setLastSentAt] = useState(0);
  const [rateLimited, setRateLimited] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRoomId(null);
    setMessages([]);
    setError(null);
    setIsOpen(false);
  }, [matchId]);

  useEffect(() => {
    if (!isOpen || roomId) return;

    const initRoom = async () => {
      setLoading(true);
      setError(null);
      try {
        const room = await api.getOrCreateMatchRoom(matchId);
        setRoomId(room.id);

        const res = await api.getChatMessages(room.id);
        setMessages(res.data.reverse());

        joinChatRoom(room.id);
        sendReadReceipt(room.id);
      } catch (err) {
        setError((err as Error)?.message || 'Could not load chat');
      } finally {
        setLoading(false);
      }
    };

    void initRoom();
  }, [isOpen, matchId, roomId]);

  useEffect(() => {
    if (!roomId) return;

    const socket = getSocialSocket();
    if (!socket) {
      setError('Sign in to use match chat');
      return;
    }

    const handleMessage = (data: { roomId: string; message: ChatMessage }) => {
      if (data.roomId !== roomId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
    };

    const handleTyping = (data: { roomId: string; userId: string }) => {
      if (data.roomId !== roomId) return;
      setTypingUsers((prev) => new Set(prev).add(data.userId));

      setTimeout(() => {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(data.userId);
          return next;
        });
      }, 3000);
    };

    socket.on('chat:message', handleMessage);
    socket.on('chat:typing', handleTyping);

    return () => {
      socket.off('chat:message', handleMessage);
      socket.off('chat:typing', handleTyping);
      leaveChatRoom(roomId);
    };
  }, [roomId]);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen, loading]);

  useEffect(() => {
    if (!showScrollDown) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showScrollDown]);

  useEffect(() => {
    return () => {
      if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
    };
  }, []);

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(distanceFromBottom > 80);
  };

  const scrollToBottom = () => {
    setShowScrollDown(false);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = useCallback(async () => {
    if (!roomId || !input.trim()) return;

    const now = Date.now();
    if (now - lastSentAt < RATE_LIMIT_MS) {
      setRateLimited(true);
      if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
      rateLimitTimerRef.current = setTimeout(() => setRateLimited(false), RATE_LIMIT_MS);
      return;
    }

    const content = input.trim().slice(0, MAX_MESSAGE_LENGTH);
    setInput('');
    setLastSentAt(now);
    setRateLimited(false);

    try {
      await api.sendChatMessage(roomId, content);
    } catch (err) {
      setInput(content);
      setError((err as Error)?.message || 'Failed to send message');
    }
  }, [roomId, input, lastSentAt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.slice(0, MAX_MESSAGE_LENGTH);
    setInput(value);

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

  const sendDisabled = !input.trim() || Date.now() - lastSentAt < RATE_LIMIT_MS;

  return (
    <>
      {!isOpen && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-cricket-green text-white shadow-lg flex items-center justify-center hover:bg-cricket-green/90 transition-colors z-40"
          title="Match Chat"
          aria-label="Open match chat"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <MessageCircle size={20} />
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed bottom-6 right-6 w-80 h-[28rem] bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-2xl flex flex-col overflow-hidden z-50"
            role="dialog"
            aria-label="Match chat"
          >
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
                aria-label="Close chat"
              >
                <X size={16} />
              </button>
            </div>

            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="relative flex-1 overflow-y-auto px-3 py-2 space-y-2"
            >
              {loading && (
                <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)]">
                  Loading chat...
                </div>
              )}

              {!loading && error && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
                  <p className="text-sm text-cricket-red">{error}</p>
                  <button
                    onClick={() => {
                      setRoomId(null);
                      setError(null);
                    }}
                    className="text-xs text-cricket-green hover:underline"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!loading && !error && messages.length === 0 && (
                <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)] text-center px-4">
                  No messages yet. Say hello to other spectators!
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-cricket-green/10 flex items-center justify-center text-[10px] font-bold text-cricket-green shrink-0 mt-0.5 overflow-hidden">
                    {msg.senderAvatar ? (
                      <img src={msg.senderAvatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      (msg.senderName || '?')[0].toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {msg.senderName || 'Spectator'}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">
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

              {showScrollDown && (
                <button
                  onClick={scrollToBottom}
                  className="sticky bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] shadow-sm hover:text-[var(--text-primary)] transition-colors"
                  aria-label="Scroll to latest messages"
                >
                  <ChevronDown size={12} />
                  New messages
                </button>
              )}
            </div>

            <AnimatePresence>
              {typingUsers.size > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 py-1 text-[10px] text-[var(--text-muted)] italic"
                >
                  {typingUsers.size === 1 ? 'Someone is typing…' : `${typingUsers.size} people typing…`}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="border-t border-[var(--border-subtle)] p-2">
              {error && messages.length > 0 && (
                <p className="text-[10px] text-cricket-red mb-1 px-1">{error}</p>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  maxLength={MAX_MESSAGE_LENGTH}
                  disabled={!roomId || loading}
                  className="flex-1 text-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-cricket-green/50 transition-colors disabled:opacity-50"
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={sendDisabled || !roomId || loading}
                  className="p-2 rounded-lg bg-cricket-green text-white disabled:opacity-40 hover:bg-cricket-green/90 transition-colors"
                  aria-label="Send message"
                >
                  <Send size={14} />
                </button>
              </div>
              {(rateLimited || input.length > MAX_MESSAGE_LENGTH * 0.8) && (
                <div className="flex justify-between text-[10px] mt-1 px-1">
                  {rateLimited && (
                    <span className="text-cricket-gold">Slow down — one message per second</span>
                  )}
                  {input.length > MAX_MESSAGE_LENGTH * 0.8 && (
                    <span className="text-[var(--text-muted)] ml-auto">
                      {input.length}/{MAX_MESSAGE_LENGTH}
                    </span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
