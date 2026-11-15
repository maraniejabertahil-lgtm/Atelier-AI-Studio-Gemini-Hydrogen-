import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match inline code, links, bold, italic
  const regex = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={keyIdx++}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-200/75 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(
          <a
            key={keyIdx++}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={keyIdx++} className="font-semibold text-slate-900 dark:text-slate-100">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={keyIdx++} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="my-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 bg-slate-900/90 text-xs text-slate-400">
        <span className="font-mono">{lang || 'text'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[13px] leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  if (!content) return null;

  // Strip optional YAML frontmatter cleanly for display if rendering Skills.md
  let body = content;
  let frontmatterBlock: string | null = null;
  if (body.startsWith('---\n')) {
    const endIdx = body.indexOf('\n---', 4);
    if (endIdx !== -1) {
      frontmatterBlock = body.slice(4, endIdx).trim();
      body = body.slice(endIdx + 4).trimStart();
    }
  }

  const lines = body.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  if (frontmatterBlock) {
    blocks.push(
      <div
        key="fm"
        className="mb-4 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/60 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap"
      >
        {frontmatterBlock}
      </div>
    );
  }

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(<CodeBlock key={`code-${i}`} lang={lang} code={codeLines.join('\n')} />);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(<hr key={`hr-${i}`} className="my-4 border-slate-200 dark:border-slate-800" />);
      i++;
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const styles: Record<number, string> = {
        1: 'text-xl font-semibold text-slate-900 dark:text-slate-50 mt-5 mb-2.5',
        2: 'text-lg font-semibold text-slate-900 dark:text-slate-50 mt-4 mb-2',
        3: 'text-base font-semibold text-slate-900 dark:text-slate-100 mt-3.5 mb-1.5',
        4: 'text-sm font-semibold text-slate-800 dark:text-slate-200 mt-3 mb-1',
      };
      blocks.push(
        <div key={`h-${i}`} className={styles[level] || styles[3]}>
          {renderInline(text)}
        </div>
      );
      i++;
      continue;
    }

    // Markdown table
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])
    ) {
      const parseRow = (r: string) =>
        r
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());

      const headers = parseRow(line);
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(parseRow(lines[i]));
        i++;
      }

      blocks.push(
        <div
          key={`tbl-${i}`}
          className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"
        >
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/70">
                {headers.map((h, idx) => (
                  <th
                    key={idx}
                    className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300"
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                  {headers.map((_, cIdx) => (
                    <td
                      key={cIdx}
                      className="px-3 py-2 text-slate-700 dark:text-slate-300 tabular-nums"
                    >
                      {renderInline(row[cIdx] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-2 pl-5 space-y-1.5 list-disc text-slate-700 dark:text-slate-300">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="my-2 pl-5 space-y-1.5 list-decimal text-slate-700 dark:text-slate-300">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        quoteLines.push(lines[i].trimStart().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={`bq-${i}`}
          className="my-2.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 text-sm"
        >
          {renderInline(quoteLines.join(' '))}
        </blockquote>
      );
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith('>')
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`p-${i}`} className="my-2 leading-relaxed text-slate-700 dark:text-slate-200">
        {renderInline(paraLines.join(' '))}
      </p>
    );
  }

  return <div className={`text-[14.5px] leading-relaxed ${className}`}>{blocks}</div>;
};
