import { useCallback, useEffect, useState } from 'react';
import { FiAlertTriangle, FiX } from 'react-icons/fi';
import {
  formatStorageSize,
  isStorageNearLimit,
  measureStorage,
  STORAGE_ERROR_EVENT,
  type StorageUsage,
} from '../../lib/storage';
import { useUIStore } from '../../stores/uiSlice';

function readUsage(): StorageUsage | null {
  try {
    return measureStorage(window.localStorage);
  } catch {
    return null;
  }
}

export function StorageHealthNotice() {
  const openSettings = useUIStore((state) => state.openSettings);
  const [usage, setUsage] = useState<StorageUsage | null>(() => readUsage());
  const [writeError, setWriteError] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(() => {
    setUsage(readUsage());
  }, []);

  useEffect(() => {
    const onStorage = () => refresh();
    const onStorageError = () => {
      setWriteError(true);
      setDismissed(false);
      refresh();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(STORAGE_ERROR_EVENT, onStorageError);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(STORAGE_ERROR_EVENT, onStorageError);
    };
  }, [refresh]);

  if (dismissed) return null;

  const nearLimit = usage ? isStorageNearLimit(usage) : false;
  if (!writeError && !nearLimit) return null;

  return (
    <div
      className="storage-notice"
      data-tone={writeError ? 'error' : 'warning'}
      role="status"
      aria-live="polite"
    >
      <FiAlertTriangle size={15} aria-hidden="true" />
      <p>
        {writeError
          ? '本地存储写入失败，最新改动可能没有保存。'
          : '本地存储空间接近上限。'}
        {usage && !writeError && (
          <span>
            {' '}
            已用 {formatStorageSize(usage.bytes)} /{' '}
            {formatStorageSize(usage.limit)}。
          </span>
        )}
        <span> 建议先导出备份。</span>
      </p>
      <button
        type="button"
        className="storage-notice-action"
        onClick={() => {
          openSettings();
          setDismissed(true);
        }}
      >
        去导出
      </button>
      <button
        type="button"
        className="storage-notice-close"
        onClick={() => setDismissed(true)}
        aria-label="忽略存储提示"
      >
        <FiX size={14} />
      </button>
    </div>
  );
}
