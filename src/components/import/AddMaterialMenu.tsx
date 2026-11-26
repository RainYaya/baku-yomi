import { useEffect, useRef, useState } from 'react';
import { FiCpu, FiEdit3, FiFilm, FiGlobe, FiHeadphones, FiPlus, FiUpload, FiVideo } from 'react-icons/fi';

interface Props {
  onEpub: (file: File) => void;
  onPaste: () => void;
  onSubtitle?: () => void;
  onVideo?: () => void;
  onServerAudio?: () => void;
  onGenerate?: () => void;
  onNote?: () => void;
  uploading?: boolean;
  /** `card` renders the larger home-page tile. */
  variant?: 'btn' | 'card';
}

/**
 * One place to add a material. Options whose milestone has not landed yet are
 * rendered disabled instead of disappearing, so the menu explains what is
 * coming without pretending it works.
 */
export function AddMaterialMenu({
  onEpub,
  onPaste,
  onSubtitle,
  onVideo,
  onServerAudio,
  onGenerate,
  onNote,
  uploading = false,
  variant = 'btn',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const closeAnd = (action?: () => void) => {
    setOpen(false);
    action?.();
  };

  return (
    <div className={`add-material-menu${variant === 'card' ? ' is-card' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={variant === 'card' ? 'home-add-card add-material-trigger' : 'shelf-btn add-material-trigger'}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="添加材料"
      >
        <FiPlus size={14} aria-hidden="true" />
        {variant === 'card' ? (
          <span>
            <b>添加材料</b>
            <small>EPUB、网页、字幕、视频、AI 情景</small>
          </span>
        ) : (
          <span>添加材料</span>
        )}
      </button>

      {open && (
        <div className="add-material-popover" role="menu" aria-label="添加材料">
          <label className="add-material-item" data-disabled={uploading ? 'true' : undefined}>
            <FiUpload size={15} aria-hidden="true" />
            <span>
              <b>{uploading ? '正在导入…' : '导入 EPUB'}</b>
              <small>双语小说、章节和注音</small>
            </span>
            <input
              type="file"
              accept=".epub"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) closeAnd(() => onEpub(file));
              }}
              hidden
            />
          </label>

          <button
            type="button"
            className="add-material-item"
            role="menuitem"
            onClick={() => closeAnd(onPaste)}
          >
            <FiEdit3 size={15} aria-hidden="true" />
            <span>
              <b>粘贴 / URL</b>
              <small>网页、公众号、TXT、Markdown</small>
            </span>
          </button>

          <button
            type="button"
            className="add-material-item"
            role="menuitem"
            disabled={!onSubtitle}
            title={onSubtitle ? undefined : '字幕导入即将支持'}
            onClick={() => closeAnd(onSubtitle)}
          >
            <FiFilm size={15} aria-hidden="true" />
            <span>
              <b>导入字幕</b>
              <small>SRT / VTT，双语或单语</small>
            </span>
          </button>

          <button
            type="button"
            className="add-material-item"
            role="menuitem"
            disabled={!onServerAudio}
            title={onServerAudio ? undefined : '服务器有声书即将支持'}
            onClick={() => closeAnd(onServerAudio)}
          >
            <FiHeadphones size={15} aria-hidden="true" />
            <span>
              <b>服务器有声书</b>
              <small>已放在本机服务器上的整本书 + 语音</small>
            </span>
          </button>

          <button
            type="button"
            className="add-material-item"
            role="menuitem"
            disabled={!onVideo}
            title={onVideo ? undefined : '视频导入即将支持'}
            onClick={() => closeAnd(onVideo)}
          >
            <FiVideo size={15} aria-hidden="true" />
            <span>
              <b>导入视频</b>
              <small>YouTube 或本地视频，带日文字幕</small>
            </span>
          </button>

          <button
            type="button"
            className="add-material-item"
            role="menuitem"
            disabled={!onGenerate}
            title={onGenerate ? undefined : 'AI 情景材料即将支持'}
            onClick={() => closeAnd(onGenerate)}
          >
            <FiCpu size={15} aria-hidden="true" />
            <span>
              <b>AI 生成情景</b>
              <small>描述场景，生成双语对话</small>
            </span>
          </button>

          <button
            type="button"
            className="add-material-item"
            role="menuitem"
            disabled={!onNote}
            title={onNote ? undefined : 'note 来源即将支持'}
            onClick={() => closeAnd(onNote)}
          >
            <FiGlobe size={15} aria-hidden="true" />
            <span>
              <b>note 来源</b>
              <small>话题 / 作者的最新文章</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
