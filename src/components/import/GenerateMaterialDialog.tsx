import { useEffect, useRef, useState } from 'react';
import { FiCpu, FiRefreshCw, FiX } from 'react-icons/fi';
import { useSettingsStore } from '../../stores/settingsSlice';
import { useBookStore } from '../../stores/bookSlice';
import { useUIStore } from '../../stores/uiSlice';
import { isKeylessProvider } from '../../types';
import { registerKeyboardHandler } from '../../lib/keyboard';
import { generateMaterial } from '../../lib/ai/materialClient';
import {
  MATERIAL_LEVELS,
  type GeneratedMaterial,
  type MaterialFormat,
  type MaterialLength,
  type MaterialLevel,
} from '../../lib/ai/materialJson';
import { MATERIAL_LENGTH_LABEL } from '../../lib/ai/materialPrompts';
import { buildGeneratedBook } from '../../lib/import/generatedMaterial';

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_LEVEL: MaterialLevel = 'N3';
const DEFAULT_LENGTH: MaterialLength = 'short';

/**
 * Scenario → generate → preview/edit → save.
 *
 * The preview is the contract: nothing is added to the shelf until the reader
 * has seen the Japanese and its Chinese and chosen to keep it.
 */
export function GenerateMaterialDialog({ open, onClose }: Props) {
  const provider = useSettingsStore((s) => s.getActiveAIProvider());
  const addBook = useBookStore((s) => s.addBook);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  const [scenario, setScenario] = useState('');
  const [level, setLevel] = useState<MaterialLevel>(DEFAULT_LEVEL);
  const [format, setFormat] = useState<MaterialFormat>('dialogue');
  const [length, setLength] = useState<MaterialLength>(DEFAULT_LENGTH);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [material, setMaterial] = useState<GeneratedMaterial | null>(null);
  const scenarioRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setScenario('');
    setLevel(DEFAULT_LEVEL);
    setFormat('dialogue');
    setLength(DEFAULT_LENGTH);
    setError(null);
    setMaterial(null);
    setGenerating(false);
    const frame = requestAnimationFrame(() => scenarioRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return registerKeyboardHandler('generate-material', 100, (event) => {
      if (event.key !== 'Escape' || generating) return false;
      onClose();
      return true;
    });
  }, [generating, onClose, open]);

  if (!open) return null;

  const handleGenerate = async () => {
    const trimmed = scenario.trim();
    if (trimmed.length < 2) {
      setError('请先描述情景（至少 2 个字）。');
      return;
    }
    if (trimmed.length > 500) {
      setError('情景最多 500 字。');
      return;
    }
    if (!provider.apiKey && !isKeylessProvider(provider.type)) {
      setError('请先在设置中配置 AI API Key。');
      return;
    }

    setError(null);
    setGenerating(true);
    try {
      const result = await generateMaterial(provider, {
        scenario: trimmed,
        level,
        format,
        length,
      });
      setMaterial(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败，请重试。');
    } finally {
      setGenerating(false);
    }
  };

  const updateLine = (
    index: number,
    field: 'japanese' | 'chinese',
    value: string
  ) => {
    setMaterial((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line, i) =>
              i === index ? { ...line, [field]: value } : line
            ),
          }
        : current
    );
  };

  const handleSave = () => {
    if (!material) return;
    const lines = material.lines
      .map((line) => ({ ...line, japanese: line.japanese.trim(), chinese: line.chinese.trim() }))
      .filter((line) => line.japanese && line.chinese);
    const title = material.title.trim();

    if (!title) {
      setError('材料标题不能为空。');
      return;
    }
    if (lines.length === 0) {
      setError('至少保留一行日语和中文。');
      return;
    }

    const book = buildGeneratedBook({
      scenario: scenario.trim(),
      material: { ...material, title, lines },
    });
    addBook(book);
    setCurrentBook(book.id);
    setCurrentChapter(0);
    setCurrentView('reader');
    onClose();
  };

  return (
    <div className="paste-overlay" onClick={onClose}>
      <section
        className="paste-dialog generate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="paste-head">
          <div>
            <span className="paste-kicker">AI MATERIAL</span>
            <h2 id="generate-title">
              {material ? '预览与编辑' : 'AI 生成情景材料'}
            </h2>
          </div>
          <button className="settings-close-btn" onClick={onClose} aria-label="关闭">
            <FiX size={18} />
          </button>
        </header>

        <div className="paste-body">
          {!material ? (
            <>
              <label className="paste-field generate-scenario">
                <span>
                  情景描述
                  <small>例如「在日本买衣服时和店员对话」「和同事聊动漫」。</small>
                </span>
                <textarea
                  ref={scenarioRef}
                  value={scenario}
                  onChange={(event) => setScenario(event.target.value)}
                  placeholder="描述你想练的情景…"
                  rows={4}
                  maxLength={500}
                />
              </label>

              <div className="generate-options">
                <label className="paste-field">
                  <span>水平</span>
                  <select
                    value={level}
                    onChange={(event) => setLevel(event.target.value as MaterialLevel)}
                  >
                    {MATERIAL_LEVELS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="paste-field">
                  <span>形式</span>
                  <select
                    value={format}
                    onChange={(event) => setFormat(event.target.value as MaterialFormat)}
                  >
                    <option value="dialogue">对话</option>
                    <option value="prose">短文</option>
                  </select>
                </label>
                <label className="paste-field">
                  <span>长度</span>
                  <select
                    value={length}
                    onChange={(event) => setLength(event.target.value as MaterialLength)}
                  >
                    {(['short', 'medium', 'long'] as const).map((item) => (
                      <option key={item} value={item}>
                        {MATERIAL_LENGTH_LABEL[item]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {error && <p className="paste-error">{error}</p>}

              <div className="generate-actions">
                <button
                  className="shelf-btn primary"
                  onClick={() => void handleGenerate()}
                  disabled={generating || !scenario.trim()}
                >
                  <FiCpu size={13} /> {generating ? '生成中…' : '生成材料'}
                </button>
                <span className="generate-hint">
                  会用当前激活的 AI 供应商生成，保存前可以先改。
                </span>
              </div>
            </>
          ) : (
            <>
              <label className="paste-field">
                <span>标题</span>
                <input
                  value={material.title}
                  onChange={(event) =>
                    setMaterial({ ...material, title: event.target.value })
                  }
                />
              </label>

              <div className="generate-meta">
                <span>{material.level}</span>
                <span>{material.format === 'dialogue' ? '对话' : '短文'}</span>
                <span>{material.lines.length} 行</span>
              </div>

              <ol className="generate-lines">
                {material.lines.map((line, index) => (
                  <li key={index} className="generate-line">
                    {line.speaker && (
                      <span className="generate-speaker">{line.speaker}</span>
                    )}
                    <textarea
                      className="generate-ja"
                      value={line.japanese}
                      onChange={(event) =>
                        updateLine(index, 'japanese', event.target.value)
                      }
                      rows={2}
                      aria-label={`第 ${index + 1} 行日语`}
                    />
                    <textarea
                      className="generate-zh"
                      value={line.chinese}
                      onChange={(event) =>
                        updateLine(index, 'chinese', event.target.value)
                      }
                      rows={2}
                      aria-label={`第 ${index + 1} 行中文`}
                    />
                  </li>
                ))}
              </ol>

              {material.notes.length > 0 && (
                <div className="generate-notes">
                  <span className="mini-label">关键词</span>
                  <ul>
                    {material.notes.map((note) => (
                      <li key={`${note.word}-${note.reading}`}>
                        <b>{note.word}</b>
                        {note.reading && <span>{note.reading}</span>}
                        {note.meaning && <small>{note.meaning}</small>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {error && <p className="paste-error">{error}</p>}

              <div className="generate-actions">
                <button className="shelf-btn primary" onClick={handleSave}>
                  保存并阅读
                </button>
                <button
                  className="shelf-btn"
                  onClick={() => {
                    setError(null);
                    void handleGenerate();
                  }}
                  disabled={generating}
                >
                  <FiRefreshCw size={13} /> {generating ? '生成中…' : '重新生成'}
                </button>
                <button className="quiet-link" onClick={() => setMaterial(null)}>
                  修改情景
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
