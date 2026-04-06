import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell } from 'lucide-react';
import { api } from '../lib/api';
import { getSocialSocket } from '../lib/social-socket';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Fetch unread count on mount
  useEffect(() => {
    api.getUnreadNotificationCount().then((res) => {
      setUnreadCount(res.count);
    }).catch(() => {
      // Silently fail — notifications are non-critical
    });
  }, []);

  // Listen for real-time notifications via Socket.IO /social namespace
  useEffect(() => {
    const socket = getSocialSocket();

    const handleNewNotification = (data: Notification) => {
      setUnreadCount((c) => c + 1);
      setNotifications((prev) => [data, ...prev].slice(0, 20));
    };

    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleDropdown = useCallback(async () => {
    const willOpen = !isOpen;
    setIsOpen(willOpen);

    if (willOpen && notifications.length === 0) {
      setLoading(true);
      try {
        const res = await api.getNotifications();
        setNotifications(res.data);
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
  }, [isOpen, notifications.length]);

  const handleNotificationClick = async (notif: Notification) => {
    // Mark as read
    if (!notif.read) {
      try {
        await api.markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Non-critical
      }
    }

    // Navigate to relevant match
    const matchId = notif.data?.matchId as string | undefined;
    if (matchId) {
      navigate(`/matches/${matchId}/scorecard`);
    }
    setIsOpen(false);
  };

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Non-critical
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div ref={dropdownRef} className="relative">
      <motion.button
        onClick={toggleDropdown}
        className="flex items-center justify-center w-9 h-9 min-h-0 min-w-0 rounded-xl transition-colors duration-200 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] relative"
        whileTap={{ scale: 0.9 }}
        title="Notifications"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={16} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute right-0 top-11 w-80 max-h-96 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                Notifications
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-cricket-green hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Notification list */}
            <div className="overflow-y-auto max-h-72">
              {loading && (
                <div className="flex items-center justify-center py-8 text-sm text-[var(--text-muted)]">
                  Loading...
                </div>
              )}

              {!loading && notifications.length === 0 && (
                <div className="flex items-center justify-center py-8 text-sm text-[var(--text-muted)]">
                  No notifications yet
                </div>
              )}

              {!loading &&
                notifications.map((notif) => (
                  <button
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`w-full text-left px-4 py-3 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors duration-150 ${
                      !notif.read ? 'bg-cricket-green/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!notif.read && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-cricket-green shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {notif.title}
                        </p>
                        {notif.body && (
                          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-0.5">
                            {notif.body}
                          </p>
                        )}
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                          {formatTime(notif.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
