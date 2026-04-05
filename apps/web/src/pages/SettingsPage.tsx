import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Download,
  Trash2,
  AlertTriangle,
  Shield,
  X,
  CheckCircle,
} from 'lucide-react';
import { api, clearAuthToken } from '../lib/api';

export function SettingsPage() {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const data = await api.exportUserData();
      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cricscore-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return data;
    },
    onSuccess: () => {
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    },
  });

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="mb-4"
      >
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-theme-tertiary hover:text-theme-primary transition-colors min-h-0 min-w-0 py-1">
          <ArrowLeft size={16} />
          <span>Back</span>
        </Link>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-black tracking-tight text-theme-primary mb-6"
      >
        Settings
      </motion.h1>

      {/* Privacy & Data section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card gradient-strip-top mb-6"
      >
        <div className="flex items-center gap-2 mb-5">
          <Shield size={18} className="text-cricket-green" />
          <h2 className="text-lg font-bold text-theme-primary">Privacy & Data</h2>
        </div>

        {/* Export Data */}
        <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--bg-hover)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-theme-primary mb-1">Export My Data</h3>
              <p className="text-xs text-theme-tertiary leading-relaxed">
                Download a copy of all your personal data including profile information,
                matches scored, teams managed, and chat messages. The export will be in JSON format.
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className="btn-outline text-sm flex items-center gap-2 shrink-0"
            >
              {exportMutation.isPending ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                />
              ) : (
                <Download size={16} />
              )}
              {exportMutation.isPending ? 'Exporting...' : 'Export'}
            </motion.button>
          </div>

          <AnimatePresence>
            {exportSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 mt-3 text-cricket-green text-sm font-medium"
              >
                <CheckCircle size={16} />
                Data exported successfully
              </motion.div>
            )}
          </AnimatePresence>

          {exportMutation.isError && (
            <p className="text-cricket-red text-xs mt-2">Failed to export data. Please try again.</p>
          )}
        </div>

        {/* Delete Account */}
        <div className="p-4 rounded-xl" style={{ background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-cricket-red mb-1">Delete My Account</h3>
              <p className="text-xs text-theme-tertiary leading-relaxed">
                Permanently delete your account and all associated data. You will have a 30-day
                grace period during which you can cancel the deletion by logging in. After 30 days,
                all personal information will be permanently removed. Match data will be preserved
                in anonymized form.
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowDeleteModal(true)}
              className="btn-danger text-sm flex items-center gap-2 shrink-0"
            >
              <Trash2 size={16} />
              Delete
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <DeleteAccountModal onClose={() => setShowDeleteModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Delete Account Confirmation Modal ──────────────────────────────────────

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const isConfirmed = confirmText === 'DELETE';

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAccount('DELETE'),
    onSuccess: (data) => {
      // Show success, then redirect
      clearAuthToken();
      // Allow the user to see the success message before navigating
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="card w-full max-w-md"
      >
        {deleteMutation.isSuccess ? (
          <div className="text-center py-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="w-16 h-16 rounded-full bg-cricket-red/10 flex items-center justify-center mx-auto mb-4"
            >
              <AlertTriangle size={28} className="text-cricket-red" />
            </motion.div>
            <h3 className="text-lg font-bold text-theme-primary mb-2">Account Deletion Scheduled</h3>
            <p className="text-sm text-theme-tertiary mb-1">
              Your account will be permanently deleted in 30 days.
            </p>
            <p className="text-sm text-theme-tertiary">
              Log in within the grace period to cancel the deletion.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={20} className="text-cricket-red" />
                <h2 className="text-lg font-bold text-theme-primary">Delete Account</h2>
              </div>
              <button onClick={onClose} className="btn-close w-8 h-8 rounded-lg flex items-center justify-center min-h-0 min-w-0">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl" style={{ background: 'rgba(239, 68, 68, 0.06)' }}>
                <p className="text-sm text-theme-secondary leading-relaxed">
                  This action cannot be easily undone. After the 30-day grace period:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-theme-secondary">
                  <li className="flex items-start gap-2">
                    <span className="text-cricket-red mt-0.5">-</span>
                    Your profile and personal information will be permanently deleted
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cricket-red mt-0.5">-</span>
                    Match data will be anonymized but preserved
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cricket-red mt-0.5">-</span>
                    You will lose access to all teams and scoring history
                  </li>
                </ul>
              </div>

              <div>
                <label className="label">
                  Type <span className="text-cricket-red font-black">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Type DELETE here"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button onClick={onClose} className="btn-outline flex-1">
                  Cancel
                </button>
                <motion.button
                  whileHover={isConfirmed ? { scale: 1.02 } : {}}
                  whileTap={isConfirmed ? { scale: 0.98 } : {}}
                  onClick={() => isConfirmed && deleteMutation.mutate()}
                  disabled={!isConfirmed || deleteMutation.isPending}
                  className={`btn-danger flex-1 text-center ${!isConfirmed ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete My Account'}
                </motion.button>
              </div>

              {deleteMutation.isError && (
                <p className="text-cricket-red text-sm text-center">
                  Failed to delete account. Please try again.
                </p>
              )}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
