import { useRef, useEffect, useState } from 'preact/hooks';
import type { ProgressEvent } from '../../types';

interface ActivityFeedProps {
  events: ProgressEvent[];
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="panel activity-feed" ref={feedRef}>
      <h2>Activity Feed</h2>
      {events.length === 0 ? (
        <div className="loading">Waiting for optimization to start...</div>
      ) : (
        <div className="events">
          {events.map((event, i) => (
            <EventRow key={i} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: ProgressEvent }) {
  const [expanded, setExpanded] = useState(false);

  switch (event.type) {
    case "generation_start":
      return (
        <div className="event generation-start">
          <strong>Generation {event.generation + 1}</strong> started
        </div>
      );

    case "candidate_start":
      return (
        <div className="event">
          Evaluating candidate (Gen {event.generation + 1})
        </div>
      );

    case "evaluation":
      return (
        <div className={`event ${event.result.correct ? "success" : "failure"}`}>
          <span>{event.result.correct ? "✓" : "✗"}</span>{" "}
          <span style={{ fontStyle: 'italic' }}>"{event.testCase}"</span>
          {" → "}
          <strong>{event.result.selected || "none"}</strong>
          {!event.result.correct && (
            <span style={{ color: '#dc3545', fontSize: '0.85em', marginLeft: '0.5rem' }}>
              (expected: {event.result.expected})
            </span>
          )}
        </div>
      );

    case "reflection_start":
      return (
        <div className="event">
          🔄 Reflecting on <strong>{event.tool}</strong> failure...
        </div>
      );

    case "reflection_done":
      return (
        <div className="event">
          <div
            style={{ cursor: 'pointer' }}
            onClick={() => setExpanded(!expanded)}
          >
            🔄 Mutated: <strong>{event.tool}</strong>
            <span style={{ marginLeft: '0.5rem', fontSize: '0.85em' }}>
              {expanded ? "▼" : "▶"}
            </span>
          </div>
          {expanded && (
            <div className="reflection-details">
              <div className="diff">
                <div className="old">
                  <label>Old:</label>
                  <div>{event.oldDesc}</div>
                </div>
                <div className="new">
                  <label>New:</label>
                  <div>{event.newDesc}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      );

    case "candidate_done":
      return (
        <div className="event success">
          ✓ Candidate complete
          <span style={{ marginLeft: '0.5rem', fontSize: '0.85em' }}>
            Accuracy: {(event.accuracy * 100).toFixed(1)}%,
            Avg len: {Math.round(event.avgLength)} chars
          </span>
        </div>
      );

    case "pareto_front":
      return (
        <div className="event" style={{ borderLeftColor: '#ffc107', background: '#fff9e6' }}>
          📊 Pareto front: <strong>{event.candidates.length}</strong> candidates
        </div>
      );

    case "generation_done":
      return (
        <div className="event generation-start">
          <strong>Generation {event.generation + 1}</strong> complete
          <span style={{ marginLeft: '0.5rem', fontSize: '0.85em' }}>
            Best accuracy: {(event.bestAccuracy * 100).toFixed(1)}%
          </span>
        </div>
      );

    case "mutation_start":
      return (
        <div className="event">
          🧬 Mutating candidate...
        </div>
      );

    default:
      return null;
  }
}
