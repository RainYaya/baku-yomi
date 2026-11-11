import { useCallback, useEffect, useRef, useState } from 'react';
import { FiAlertTriangle, FiDownload, FiRefreshCw, FiUpload } from 'react-icons/fi';
import {
  backupFilename,
  createBackup,
  formatStorageSize,
  isBackupFile,
  isStorageNearLimit,
  measureStorage,
  restoreBackup,
  STORAGE_ERROR_EVENT,
  type BackupFile,
  type StorageUsage,
} from '../../lib/storage';

function readUsage(): StorageUsage | null {
  try {
    return measureStorage(window.localStorage);
  } catch {
    return null;
  }
}

export function DataSettingsPanel() {
  const [usage, setUsage] = useState<StorageUsage | null>(() => readUsage());
  const [error, setError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    setUsage(readUsage());
  }, []);

  useEffect(() => {
    const onStorage = () => refresh();
    const onStorageError = () => {
      setError('本地存储写入失败，最新改动可能没有保存。请先导出备份。');
      refresh();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(STORAGE_ERROR_EVENT, onStorageError);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(STORAGE_ERROR_EVENT, onStorageError);
    };
  }, [refresh]);

  const handleExport = () => {
    setError(null);
    try {
      const backup = createBackup(window.localStorage);
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = backupFilename();
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败');
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setPendingImport(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isBackupFile(parsed)) {
        setError('这不是有效的 baku-yomi 备份文件。');
        return;
      }
      setPendingImport(parsed);
    } catch {
      setError('读取备份失败：文件不是有效的 JSON。');
    }
  };

  const confirmRestore = () => {
    if (!pendingImport) return;
    setRestoring(true);
    setError(null);
    try {
      const written = restoreBackup(window.localStorage, pendingImport);
      if (written === 0) {
        setError('备份里没有可恢复的数据。');
        setRestoring(false);
        return;
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '恢复失败');
      setRestoring(false);
    }
  };

  const nearLimit = usage ? isStorageNearLimit(usage) : false;
  const percent = usage ? Math.min(100, Math.round(usage.ratio * 100)) : 0;

  return (
    <section className="data-panel">
      <div className="data-usage">
        <div className="data-usage-head">
          <span className="settings-label" style={{ marginBottom: 0 }}>
            本地存储
          </span>
          <button
            type="button"
            className="data-icon-btn"
            onClick={refresh}
            title="刷新用量"
            aria-label="刷新本地存储用量"
          >
            <FiRefreshCw size={13} />
          </button>
        </div>

        {usage ? (
          <>
            <div className="data-usage-number">
              {formatStorageSize(usage.bytes)}
              <span> / {formatStorageSize(usage.limit)}</span>
            </div>
            <div
              className="data-usage-bar"
              data-warning={nearLimit ? 'true' : 'false'}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="本地存储使用率"
            >
              <span className="data-usage-fill" style={{ width: `${percent}%` }} />
            </div>
            {nearLimit && (
              <p className="data-warning">
                <FiAlertTriangle size={13} />
                已接近 localStorage 的 5MB 上限，建议导出备份，或减少书籍/封面数量。
              </p>
            )}
          </>
        ) : (
          <p className="settings-note">无法读取本地存储用量。</p>
        )}
      </div>

      <div className="data-actions">
        <button type="button" className="data-action" onClick={handleExport}>
          <FiDownload size={14} />
          导出备份
        </button>
        <button
          type="button"
          className="data-action"
          onClick={() => fileRef.current?.click()}
        >
          <FiUpload size={14} />
          导入备份
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = '';
          }}
        />
      </div>

      <p className="settings-note">
        备份包含书籍、译文/练习记录和书签，不包含 AI API Key。恢复会覆盖当前数据并刷新页面。
      </p>

      {pendingImport && (
        <div className="data-confirm" role="alert">
          <p>
            确定恢复这份备份？
            <span>当前书籍、练习和书签会被覆盖。</span>
          </p>
          <div className="data-confirm-actions">
            <button
              type="button"
              className="data-action data-action-danger"
              onClick={confirmRestore}
              disabled={restoring}
            >
              {restoring ? '恢复中…' : '覆盖并恢复'}
            </button>
            <button
              type="button"
              className="data-action"
              onClick={() => setPendingImport(null)}
              disabled={restoring}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="data-error" role="alert">
          <FiAlertTriangle size={13} />
          {error}
        </p>
      )}
    </section>
  );
}
