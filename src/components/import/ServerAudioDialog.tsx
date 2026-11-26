import { useEffect, useState } from 'react';
import { FiHeadphones, FiRefreshCw, FiX } from 'react-icons/fi';
import {
  listServerAudio,
  loadServerAudio,
  type ServerAudioSummary,
} from '../../lib/audio/serverAssets';
import { formatTimecode } from '../../lib/video/timeline';
import type { Book } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Ids already on the shelf; those rows offer nothing to add. */
  existingIds: ReadonlySet<string>;
  onImport: (book: Book) => void;
}

function sizeLabel(bytes: number): string {
  if (bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

/**
 * Audiobooks already placed on the server. The reader drops a folder into
 * `~/baku-yomi-data/audio/<id>/` and adds it here with one click; nothing is
 * uploaded from the browser.
 */
export function ServerAudioDialog({ open, onClose, existingIds, onImport }: Props) {
  /** `null` means the list has not arrived yet. */
  const [assets, setAssets] = useState<ServerAudioSummary[] | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listServerAudio().then((found) => {
      if (!cancelled) setAssets(found);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const refresh = () => {
    setAssets(null);
    setError(null);
    void listServerAudio().then(setAssets);
  };

  const handleImport = async (asset: ServerAudioSummary) => {
    if (importingId) return;
    setImportingId(asset.id);
    setError(null);
    const book = await loadServerAudio(asset.id);
    setImportingId(null);
    if (!book) {
      setError(`「${asset.title}」读不出来。检查 asset.json 和章节文件是否完整。`);
      return;
    }
    onImport(book);
  };

  return (
    <div className="paste-overlay" onClick={onClose}>
      <section
        className="paste-dialog server-audio-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-audio-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="paste-head">
          <div>
            <span className="paste-kicker">AUDIOBOOK</span>
            <h2 id="server-audio-title">服务器有声书</h2>
          </div>
          <button className="settings-close-btn" onClick={onClose} aria-label="关闭">
            <FiX size={18} />
          </button>
        </header>

        <div className="paste-body">
          {assets === null ? (
            <p className="server-audio-note">正在查看服务器…</p>
          ) : assets.length === 0 ? (
            <div className="server-audio-empty">
              <p>服务器上还没有有声书。</p>
              <p className="server-audio-note">
                把整本有声书的文件夹放到 <code>~/baku-yomi-data/audio/&lt;id&gt;/</code>
                ，再刷新这里。
              </p>
            </div>
          ) : (
            <ul className="server-audio-list">
              {assets.map((asset) => {
                const kept = existingIds.has(asset.id);
                const busy = importingId === asset.id;
                return (
                  <li key={asset.id} className="server-audio-item">
                    <span className="server-audio-icon" aria-hidden="true">
                      <FiHeadphones size={16} />
                    </span>
                    <div className="server-audio-copy">
                      <b>{asset.title}</b>
                      <span>
                        {[
                          asset.author,
                          formatTimecode(asset.durationMs),
                          sizeLabel(asset.sizeBytes),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <button
                      className={`shelf-btn${kept ? '' : ' primary'}`}
                      disabled={kept || busy || Boolean(importingId)}
                      onClick={() => void handleImport(asset)}
                    >
                      {kept ? '已在书架' : busy ? '添加中…' : '添加到书架'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && <p className="paste-error">{error}</p>}

          <div className="generate-actions">
            <button
              className="shelf-btn"
              onClick={refresh}
              disabled={assets === null}
            >
              <FiRefreshCw size={12} /> 刷新
            </button>
            <span className="video-hint">
              音频留在服务器；书架里只存文字和章节索引。
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
