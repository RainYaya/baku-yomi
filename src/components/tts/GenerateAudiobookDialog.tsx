import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiHeadphones, FiPlay, FiStopCircle, FiX } from 'react-icons/fi';
import { useBookStore } from '../../stores/bookSlice';
import type { Book } from '../../types';
import { useUIStore } from '../../stores/uiSlice';
import { loadServerAudio } from '../../lib/audio/serverAssets';
import { untranslatedPairs } from '../../lib/tts/readiness';
import {
  cancelTtsJob,
  createTtsJob,
  fetchTtsConfig,
  fetchTtsJob,
  fetchTtsJobs,
  fetchTtsStatus,
  jobProgress,
  pickActiveJob,
  pickLatestJob,
  toAudioId,
  type TtsJob,
  type TtsStatus,
} from '../../lib/tts/workerApi';

interface Props {
  open: boolean;
  bookId: string | null;
  onClose: () => void;
}

interface BodyProps {
  bookId: string;
  onClose: () => void;
}

const POLL_MS = 2000;
/** Ten seconds of silence from the worker before the dialog gives up. */
const POLL_FAILURES = 5;
const POLL_LOST =
  '连不上 worker，进度停止更新。任务可能还在后台跑，关掉这个窗口再打开可以继续查看。';
const IMPORT_FAILED = '生成完成，但读不出资产。检查服务器上的章节文件是否完整。';
const UNAVAILABLE = '生成服务没开（4080 上的 worker）';

const STATUS_LABEL: Record<TtsJob['status'], string> = {
  queued: '排队中',
  running: '生成中',
  done: '已完成',
  failed: '生成失败',
  cancelled: '已取消',
};

/**
 * A text input until the speech server advertises choices, then a dropdown.
 * The configured value is always kept as an option so the field never shows
 * a blank selection.
 */
function ChoiceField({
  label,
  value,
  options,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  disabled: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  if (options.length === 0) {
    return (
      <label className="paste-field">
        <span>{label}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      </label>
    );
  }

  const values = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label className="paste-field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {values.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Generate a whole-book audiobook on the LAN worker, then pull the finished
 * asset back into the shelf. The browser only talks to this server; polling is
 * the one long-lived piece of state.
 *
 * The body is a separate component so closing the dialog (or switching books)
 * throws away the job snapshot and the inputs without any reset effect.
 */
export function GenerateAudiobookDialog({ open, bookId, onClose }: Props) {
  if (!open || !bookId) return null;
  return <DialogBody key={bookId} bookId={bookId} onClose={onClose} />;
}

function DialogBody({ bookId, onClose }: BodyProps) {
  const book = useBookStore((s) =>
    s.books.find((item) => item.id === bookId) ?? null
  );
  const upsertBook = useBookStore((s) => s.upsertBook);
  const setCurrentBook = useBookStore((s) => s.setCurrentBook);
  const setCurrentChapter = useBookStore((s) => s.setCurrentChapter);
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  const [status, setStatus] = useState<TtsStatus | null>(null);
  const [model, setModel] = useState('');
  const [voice, setVoice] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [voices, setVoices] = useState<string[]>([]);
  const [job, setJob] = useState<TtsJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [addedBookId, setAddedBookId] = useState<string | null>(null);
  const [replaced, setReplaced] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importedRef = useRef(false);

  const jobId = job?.id ?? null;
  const jobStatus = job?.status ?? null;
  const jobAudioId = job?.audioId ?? null;
  const audioId = toAudioId(bookId);
  const missing = useMemo(
    () => (book ? untranslatedPairs(book) : 0),
    [book]
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchTtsStatus(), fetchTtsConfig(), fetchTtsJobs()]).then(
      ([nextStatus, config, jobs]) => {
        if (cancelled) return;
        setStatus(nextStatus);
        if (config) {
          setModel(config.model);
          setVoice(config.voice);
          setModels(config.models);
          setVoices(config.voices);
        } else if (nextStatus.model || nextStatus.voice) {
          setModel(nextStatus.model ?? '');
          setVoice(nextStatus.voice ?? '');
        }
        // Closing the dialog does not stop the worker, so reopening this book
        // shows the job that is still going instead of offering a second one.
        const active = pickActiveJob(jobs, audioId);
        if (active) {
          setJob(active);
          return;
        }
        // A job that finished while the dialog was closed was never imported:
        // adopt it so the audiobook reaches the shelf without regenerating it.
        const latest = pickLatestJob(jobs, audioId);
        const alreadyOnShelf = useBookStore
          .getState()
          .books.some((item) => item.id === audioId);
        if (latest?.status === 'done' && !alreadyOnShelf) setJob(latest);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [audioId]);

  useEffect(() => {
    if (!jobId) return;
    if (jobStatus !== 'queued' && jobStatus !== 'running') return;

    let stopped = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const next = await fetchTtsJob(jobId);
      if (stopped) return;
      if (next) {
        failures = 0;
        setJob(next);
      } else {
        // An unreachable worker would otherwise poll forever behind a frozen
        // progress bar. Say so, and leave the job running on the other machine.
        failures += 1;
        if (failures >= POLL_FAILURES) {
          setError(POLL_LOST);
          return;
        }
      }
      const stillRunning =
        !next || next.status === 'queued' || next.status === 'running';
      if (stillRunning) timer = setTimeout(tick, POLL_MS);
    };

    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, jobStatus]);

  const applyImported = useCallback(
    (asset: Book | null) => {
      if (!asset) {
        setImportError(IMPORT_FAILED);
        return;
      }
      // Regenerating replaces the earlier audiobook instead of stacking a
      // second shelf card with the same id.
      const existed = useBookStore
        .getState()
        .books.some((item) => item.id === jobAudioId);
      upsertBook(asset);
      setReplaced(existed);
      setAddedBookId(jobAudioId);
    },
    [jobAudioId, upsertBook]
  );

  const handleRetryImport = async () => {
    setImporting(true);
    setImportError(null);
    applyImported(await loadServerAudio(jobAudioId ?? ''));
    setImporting(false);
  };

  useEffect(() => {
    if (jobStatus !== 'done' || importedRef.current) return;
    importedRef.current = true;
    // The job finishing is the external event; the import lands after its
    // fetch resolves, so the state updates happen in the promise callback.
    loadServerAudio(jobAudioId ?? '').then(applyImported);
  }, [jobStatus, jobAudioId, applyImported]);

  const available = status?.available === true;
  const running = jobStatus === 'queued' || jobStatus === 'running';
  const progress = job ? jobProgress(job) : 0;

  const handleStart = async () => {
    if (!book || !available || starting) return;
    const modelValue = model.trim();
    const voiceValue = voice.trim();
    if (!modelValue || !voiceValue) {
      setError('请填写 model 和 voice。');
      return;
    }

    setError(null);
    setAddedBookId(null);
    setReplaced(false);
    setImportError(null);
    importedRef.current = false;
    setStarting(true);
    const created = await createTtsJob(book, {
      model: modelValue,
      voice: voiceValue,
    });
    setStarting(false);
    if (!created) {
      setError('提交失败：检查服务器能否连上 worker。');
      return;
    }
    setJob(created);
  };

  const handleCancel = async () => {
    if (!job || cancelling) return;
    setCancelling(true);
    const next = await cancelTtsJob(job.id);
    setCancelling(false);
    if (next) setJob(next);
    else setError('取消失败，稍后再试。');
  };

  const handleOpen = () => {
    const id = addedBookId ?? (job ? job.audioId : toAudioId(bookId));
    setCurrentBook(id);
    setCurrentChapter(0);
    setCurrentView('reader');
    onClose();
  };

  /** Back to the model/voice form, ready for another attempt. */
  const resetForm = () => {
    setJob(null);
    setAddedBookId(null);
    setReplaced(false);
    setImportError(null);
    setError(null);
    importedRef.current = false;
  };

  return (
    <div className="paste-overlay" onClick={onClose}>
      <section
        className="paste-dialog tts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tts-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="paste-head">
          <div>
            <span className="paste-kicker">AUDIOBOOK · TTS</span>
            <h2 id="tts-title">生成有声书</h2>
          </div>
          <button className="settings-close-btn" onClick={onClose} aria-label="关闭">
            <FiX size={18} />
          </button>
        </header>

        <div className="paste-body">
          <p className="server-audio-note">
            {book ? `《${book.title}》` : '没有找到这本书。'}
            {book && ' 会逐句合成、按章打包，然后上传到服务器。'}
          </p>

          {status === null && <p className="server-audio-note">正在检查生成服务…</p>}
          {status !== null && !available && (
            <p className="paste-error">{UNAVAILABLE}</p>
          )}

          {!job && (
            <>
              {missing > 0 && (
                <p className="server-audio-note">
                  这本书有 {missing} 句还没有中文译文。朗读不受影响，只是回译练习时没有对照。
                </p>
              )}

              <div className="paste-row">
                <ChoiceField
                  label="model"
                  value={model}
                  options={models}
                  disabled={!available || starting}
                  placeholder="omnivoice"
                  onChange={setModel}
                />
                <ChoiceField
                  label="voice"
                  value={voice}
                  options={voices}
                  disabled={!available || starting}
                  placeholder="default"
                  onChange={setVoice}
                />
              </div>

              <div className="generate-actions">
                <button
                  className="shelf-btn primary"
                  onClick={() => void handleStart()}
                  disabled={
                    !available ||
                    !book ||
                    starting ||
                    !model.trim() ||
                    !voice.trim()
                  }
                >
                  <FiHeadphones size={13} />
                  {starting ? '提交中…' : '开始生成'}
                </button>
                <span className="generate-hint">
                  生成在局域网的另一台机器上进行，关掉这个窗口也不会中断。
                </span>
              </div>
            </>
          )}

          {job && (
            <>
              <div className="tts-job">
                <div className="tts-job-head">
                  <b>{STATUS_LABEL[job.status]}</b>
                  <span>
                    {job.pairsDone} / {job.pairsTotal} 句 · {job.chaptersDone} /{' '}
                    {job.chaptersTotal} 章
                  </span>
                </div>

                <div
                  className="tts-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>

                {job.currentChapterTitle && running && (
                  <p className="server-audio-note">
                    当前章节：{job.currentChapterTitle}
                  </p>
                )}
                <p className="server-audio-note tts-job-voice">
                  {job.model} · {job.voice}
                </p>
                {job.error && (
                  <>
                    <p className="paste-error">{job.error}</p>
                    <p className="server-audio-note">
                      检查 4080 上的 voicestudio 和 worker 是否都在运行。
                    </p>
                  </>
                )}
              </div>

              {running && (
                <div className="generate-actions">
                  <button
                    className="shelf-btn"
                    onClick={() => void handleCancel()}
                    disabled={cancelling}
                  >
                    <FiStopCircle size={13} />
                    {cancelling ? '取消中…' : '取消生成'}
                  </button>
                </div>
              )}

              {job.status === 'done' && (
                <div className="generate-actions">
                  {addedBookId ? (
                    <>
                      <span className="tts-added">
                        {replaced ? '已更新有声版' : '已加入书架'}
                      </span>
                      <button className="shelf-btn primary" onClick={handleOpen}>
                        <FiPlay size={12} /> 打开有声书
                      </button>
                      <button className="shelf-btn" onClick={resetForm}>
                        重新生成
                      </button>
                    </>
                  ) : importError ? (
                    <>
                      <span className="server-audio-note">{importError}</span>
                      <button
                        className="shelf-btn primary"
                        onClick={() => void handleRetryImport()}
                        disabled={importing}
                      >
                        {importing ? '导入中…' : '重新导入'}
                      </button>
                    </>
                  ) : (
                    <span className="server-audio-note">正在加入书架…</span>
                  )}
                </div>
              )}

              {(job.status === 'failed' || job.status === 'cancelled') && (
                <div className="generate-actions">
                  <button className="shelf-btn" onClick={resetForm}>
                    重新设置
                  </button>
                </div>
              )}
            </>
          )}

          {error && <p className="paste-error">{error}</p>}
        </div>
      </section>
    </div>
  );
}
