import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { FiBookOpen, FiFeather, FiLayers, FiMoon, FiX } from 'react-icons/fi';
import guideMarkdown from '../../../docs/welcome-guide.md?raw';
import { useMachine } from '../../machines/react';
import { welcomeMachine } from '../../machines/welcome';
import { registerKeyboardHandler } from '../../lib/keyboard';

const GUIDE_STORAGE_KEY = 'baku-yomi-welcome-guide-seen-v1';

type GuideSection = {
  title: string;
  paragraphs: string[];
  bullets: string[];
  notes: string[];
};

type ParsedGuide = {
  title: string;
  intro: string[];
  sections: GuideSection[];
};

function appendParagraph(target: string[], line: string) {
  const previous = target[target.length - 1];
  if (!previous) {
    target.push(line);
    return;
  }

  target[target.length - 1] = `${previous} ${line}`;
}

function parseGuide(markdown: string): ParsedGuide {
  const lines = markdown.split(/\r?\n/);
  const intro: string[] = [];
  const sections: GuideSection[] = [];
  let title = '欢迎来到 Baku-yomi';
  let currentSection: GuideSection | null = null;

  const commitSection = () => {
    if (currentSection) {
      sections.push(currentSection);
      currentSection = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('# ')) {
      title = line.slice(2).trim();
      continue;
    }

    if (line.startsWith('## ')) {
      commitSection();
      currentSection = {
        title: line.slice(3).trim(),
        paragraphs: [],
        bullets: [],
        notes: [],
      };
      continue;
    }

    if (line.startsWith('- ')) {
      if (currentSection) {
        currentSection.bullets.push(line.slice(2).trim());
      } else {
        intro.push(line.slice(2).trim());
      }
      continue;
    }

    if (line.startsWith('> ')) {
      if (currentSection) {
        currentSection.notes.push(line.slice(2).trim());
      } else {
        appendParagraph(intro, line.slice(2).trim());
      }
      continue;
    }

    if (currentSection) {
      appendParagraph(currentSection.paragraphs, line);
    } else {
      appendParagraph(intro, line);
    }
  }

  commitSection();

  return {
    title,
    intro,
    sections,
  };
}

function getSectionEyebrow(title: string): string {
  if (title.includes('导入')) return 'Import';
  if (title.includes('阅读') || title.includes('操作')) return 'Navigate';
  if (title.includes('练习')) return 'Practice';
  if (title.includes('主题') || title.includes('快捷键')) return 'Theme';
  return 'Guide';
}

function getSectionIcon(title: string): ReactNode {
  if (title.includes('导入')) return <FiBookOpen size={18} />;
  if (title.includes('阅读') || title.includes('操作')) return <FiFeather size={18} />;
  if (title.includes('练习')) return <FiLayers size={18} />;
  return <FiMoon size={18} />;
}

export function WelcomeGuide() {
  const { state, send } = useMachine(welcomeMachine, { debugId: 'welcome' });
  const guide = useMemo(() => parseGuide(guideMarkdown), []);

  const dismissGuide = useCallback(() => {
    try {
      window.localStorage.setItem(GUIDE_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage write failures and just close the guide.
    }
    send({ type: 'DISMISS' });
  }, [send]);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(GUIDE_STORAGE_KEY) === 'true';
      send({ type: 'HYDRATED', seen });
    } catch {
      send({ type: 'HYDRATED', seen: false });
    }
  }, [send]);

  useEffect(() => {
    if (state.status !== 'visible') return;

    return registerKeyboardHandler('welcome', 100, (event) => {
      if (event.key !== 'Escape') return false;
      dismissGuide();
      return true;
    });
  }, [dismissGuide, state.status]);

  if (state.status !== 'visible') {
    return null;
  }

  return (
    <div
      className="welcome-guide-overlay"
      data-welcome-state={state.status}
      onClick={dismissGuide}
    >
      <section
        className="welcome-guide-dialog animate-fade-in"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-guide-title"
      >
        <div className="welcome-guide-header">
          <div className="welcome-guide-kicker">First Session</div>
          <button
            type="button"
            className="welcome-guide-close"
            onClick={dismissGuide}
            aria-label="关闭首次指南"
          >
            <FiX size={16} />
          </button>
        </div>

        <div className="welcome-guide-hero">
          <p className="welcome-guide-brand">BAKU-YOMI</p>
          <h2 id="welcome-guide-title" className="welcome-guide-title">
            {guide.title}
          </h2>
          <div className="welcome-guide-copy-stack">
            {guide.intro.map((paragraph) => (
              <p key={paragraph} className="welcome-guide-copy">
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <div className="welcome-guide-grid">
          {guide.sections.map((section) => (
            <article key={section.title} className="welcome-guide-card">
              <div className="welcome-guide-card-top">
                <span className="welcome-guide-icon">{getSectionIcon(section.title)}</span>
                <span className="welcome-guide-eyebrow">{getSectionEyebrow(section.title)}</span>
              </div>
              <h3 className="welcome-guide-card-title">{section.title}</h3>

              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="welcome-guide-card-body">
                  {paragraph}
                </p>
              ))}

              {section.bullets.length > 0 ? (
                <ul className="welcome-guide-list">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}

              {section.notes.map((note) => (
                <p key={note} className="welcome-guide-meta">
                  {note}
                </p>
              ))}
            </article>
          ))}
        </div>

        <div className="welcome-guide-footer">
          <p className="welcome-guide-footnote">以后你只需要编辑 `docs/welcome-guide.md`，这里的内容就会一起变。</p>
          <button type="button" className="btn btn-primary welcome-guide-action" onClick={dismissGuide}>
            开始使用
          </button>
        </div>
      </section>
    </div>
  );
}
