import './Skeleton.css';

/**
 * A content-shaped shimmer placeholder that communicates "data is loading"
 * much more effectively than a centered spinner.
 *
 * Usage:
 *   <Skeleton width="60%" height={20} />           — inline text line
 *   <Skeleton width="100%" height={48} rounded />  — a rounded card row
 *   <Skeleton circle size={40} />                   — an avatar
 */
export default function Skeleton({
  width = '100%',
  height = 16,
  rounded = false,
  circle = false,
  size,
  className = '',
  style = {},
}) {
  const resolvedWidth = circle ? (size || height) : width;
  const resolvedHeight = circle ? (size || height) : height;

  return (
    <div
      className={`skeleton ${circle ? 'skeleton--circle' : ''} ${rounded ? 'skeleton--rounded' : ''} ${className}`}
      aria-hidden="true"
      style={{
        width: typeof resolvedWidth === 'number' ? `${resolvedWidth}px` : resolvedWidth,
        height: typeof resolvedHeight === 'number' ? `${resolvedHeight}px` : resolvedHeight,
        ...style,
      }}
    />
  );
}

/**
 * Pre-composed skeleton layout for the doctor queue table.
 * Mimics 5 table rows with risk edge, patient name, timestamp, badge, and status.
 */
export function QueueSkeleton({ rows = 5 }) {
  return (
    <div className="skeleton-queue" aria-label="Loading screening cases" role="status">
      {/* Toolbar skeleton */}
      <div className="skeleton-queue__toolbar">
        <Skeleton width={70} height={28} rounded />
        <Skeleton width={80} height={28} rounded />
        <Skeleton width={90} height={28} rounded />
        <Skeleton width={85} height={28} rounded />
      </div>

      {/* Table skeleton */}
      <div className="skeleton-queue__table">
        {Array.from({ length: rows }).map((_, i) => (
          <div className="skeleton-queue__row" key={i}>
            <div className="skeleton-queue__edge" />
            <div className="skeleton-queue__patient">
              <Skeleton width="65%" height={14} />
              <Skeleton width="40%" height={11} style={{ marginTop: 6 }} />
            </div>
            <Skeleton width={48} height={12} />
            <Skeleton width={64} height={22} rounded />
            <Skeleton width={96} height={12} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Pre-composed skeleton for a case detail view.
 * Mimics the heading, patient summary, photo gallery, and review form.
 */
export function CaseSkeleton() {
  return (
    <div className="skeleton-case" aria-label="Loading case details" role="status">
      {/* Heading */}
      <div className="skeleton-case__heading">
        <div>
          <Skeleton width={100} height={11} />
          <Skeleton width="55%" height={22} style={{ marginTop: 8 }} />
          <Skeleton width="35%" height={13} style={{ marginTop: 6 }} />
        </div>
        <Skeleton width={72} height={24} rounded />
      </div>

      {/* Sections */}
      <div className="skeleton-case__section">
        <Skeleton width={140} height={14} style={{ marginBottom: 12 }} />
        <Skeleton width="90%" height={12} />
        <Skeleton width="75%" height={12} style={{ marginTop: 8 }} />
        <Skeleton width="60%" height={12} style={{ marginTop: 8 }} />
      </div>

      <div className="skeleton-case__section">
        <Skeleton width={130} height={14} style={{ marginBottom: 12 }} />
        <div className="skeleton-case__photos">
          <Skeleton width={100} height={80} rounded />
          <Skeleton width={100} height={80} rounded />
          <Skeleton width={100} height={80} rounded />
        </div>
      </div>

      <div className="skeleton-case__section">
        <Skeleton width={110} height={14} style={{ marginBottom: 12 }} />
        <Skeleton width="100%" height={40} rounded />
        <Skeleton width="100%" height={80} rounded style={{ marginTop: 12 }} />
      </div>
    </div>
  );
}

/**
 * Pre-composed skeleton for the questionnaire form loading state.
 * Mimics the heading, duration dropdown, toggle card, and notes textarea.
 */
export function QuestionnaireSkeleton() {
  return (
    <div className="skeleton-questionnaire" aria-label="Loading your answers" role="status">
      <Skeleton width="70%" height={24} />
      <Skeleton width="85%" height={13} style={{ marginTop: 10 }} />

      {/* Duration dropdown */}
      <div style={{ marginTop: 24 }}>
        <Skeleton width={180} height={12} style={{ marginBottom: 8 }} />
        <Skeleton width="100%" height={44} rounded />
      </div>

      {/* Toggle card */}
      <div className="skeleton-questionnaire__toggles">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="skeleton-questionnaire__toggle-row" key={i}>
            <Skeleton width={`${50 + Math.random() * 30}%`} height={13} />
            <Skeleton width={46} height={26} rounded />
          </div>
        ))}
      </div>

      {/* Notes */}
      <div style={{ marginTop: 20 }}>
        <Skeleton width={240} height={12} style={{ marginBottom: 8 }} />
        <Skeleton width="100%" height={80} rounded />
      </div>

      <Skeleton width="100%" height={48} rounded style={{ marginTop: 24 }} />
    </div>
  );
}
