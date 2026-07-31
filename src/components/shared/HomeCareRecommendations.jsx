import { useMemo } from 'react';
import { motion } from 'motion/react';
import { HeartHandshake, CheckCircle2 } from 'lucide-react';
import './HomeCareRecommendations.css';

/**
 * Normalizes raw recommendations data into a structured array of items.
 * Handles string arrays, object arrays, single multi-line strings, bulleted strings, etc.
 */
function normalizeRecommendations(raw) {
  if (!raw) return [];

  const parseItem = (item) => {
    if (!item) return null;
    if (typeof item === 'string') {
      const clean = item.replace(/^[\s\-\*\d\.\)\•\>]+/, '').trim();
      return clean ? { text: clean } : null;
    }
    if (typeof item === 'object') {
      const title = item.title || item.heading || item.header || '';
      const text = item.description || item.text || item.tip || item.details || item.recommendation || '';
      if (title || text) {
        return {
          title: title ? String(title).trim() : undefined,
          text: text ? String(text).trim() : undefined,
        };
      }
    }
    const fallback = String(item).trim();
    return fallback ? { text: fallback } : null;
  };

  if (Array.isArray(raw)) {
    return raw.map(parseItem).filter(Boolean);
  }

  if (typeof raw === 'object') {
    const list = raw.tips || raw.recommendations || raw.items || raw.list;
    if (list && Array.isArray(list)) return normalizeRecommendations(list);
    const parsed = parseItem(raw);
    return parsed ? [parsed] : [];
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    const lines = trimmed
      .split(/\r?\n+/)
      .map((line) => line.replace(/^[\s\-\*\d\.\)\•\>]+/, '').trim())
      .filter((line) => line.length > 0);

    if (lines.length > 1) {
      return lines.map((l) => ({ text: l }));
    }

    return [{ text: trimmed }];
  }

  return [];
}

export default function HomeCareRecommendations({ recommendations }) {
  const items = useMemo(() => normalizeRecommendations(recommendations), [recommendations]);

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="home-care-section">
      <div className="home-care__header">
        <div className="home-care__header-icon-wrapper" aria-hidden="true">
          <HeartHandshake size={20} />
        </div>
        <div>
          <h3 id="home-care-title" className="home-care__title">
            Daily Home Care Tips
          </h3>
          <p className="home-care__subhead">
            Recommended actions you can start doing daily at home
          </p>
        </div>
      </div>

      <ul className="home-care__list" role="list">
        {items.map((item, index) => (
          <motion.li
            key={index}
            className="home-care__item"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: 0.15 + index * 0.05, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="home-care__item-bullet" aria-hidden="true">
              <CheckCircle2 size={16} />
            </div>
            <div className="home-care__item-content">
              {item.title && <h4 className="home-care__item-title">{item.title}</h4>}
              {item.text && <p className="home-care__item-text">{item.text}</p>}
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
