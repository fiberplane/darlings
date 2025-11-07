import { useMemo } from 'preact/hooks';
import type { ProgressEvent } from '../../types';

interface MetricsPanelProps {
  events: ProgressEvent[];
}

export function MetricsPanel({ events }: MetricsPanelProps) {
  const metrics = useMemo(() => computeMetrics(events), [events]);

  return (
    <div className="panel metrics-panel">
      <h2>Metrics</h2>

      {metrics.bestAccuracy > 0 ? (
        <>
          <h3>Best Accuracy</h3>
          <div className="metric-value">{(metrics.bestAccuracy * 100).toFixed(1)}%</div>
          <ProgressBar value={metrics.bestAccuracy} />

          {metrics.paretoFront.length > 0 && (
            <>
              <h3>Pareto Front ({metrics.paretoFront.length})</h3>
              <div className="scatter-plot">
                <div style={{ textAlign: 'center' }}>
                  <div>Scatter Plot</div>
                  <div style={{ fontSize: '0.75em', marginTop: '0.5rem' }}>
                    Accuracy vs Description Length
                  </div>
                  <div style={{ fontSize: '0.75em', marginTop: '1rem' }}>
                    {metrics.paretoFront.map((c, i) => (
                      <div key={i}>
                        • {(c.accuracy * 100).toFixed(0)}% / {Math.round(c.avgLength)}ch
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {metrics.accuracyByGen.length > 0 && (
            <>
              <h3>Progress</h3>
              <div className="line-chart">
                <div style={{ textAlign: 'center' }}>
                  <div>Accuracy by Generation</div>
                  <div style={{ fontSize: '0.75em', marginTop: '1rem' }}>
                    {metrics.accuracyByGen.map((point, i) => (
                      <div key={i}>
                        Gen {point.generation + 1}: {(point.accuracy * 100).toFixed(1)}%
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          <h3>Current Best</h3>
          <dl style={{ fontSize: '0.9rem' }}>
            <dt style={{ fontWeight: 600, marginTop: '0.5rem' }}>Accuracy:</dt>
            <dd>{(metrics.bestAccuracy * 100).toFixed(1)}%</dd>
            <dt style={{ fontWeight: 600, marginTop: '0.5rem' }}>Avg Length:</dt>
            <dd>{Math.round(metrics.bestLength)} chars</dd>
          </dl>
        </>
      ) : (
        <div className="loading">No metrics yet</div>
      )}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress-bar">
      <div
        className="progress-bar-fill"
        style={{ width: `${value * 100}%` }}
      >
        {(value * 100).toFixed(0)}%
      </div>
    </div>
  );
}

function computeMetrics(events: ProgressEvent[]) {
  const paretoEvents = events.filter(
    (e): e is Extract<ProgressEvent, { type: 'pareto_front' }> =>
      e.type === "pareto_front"
  );
  const paretoFront = paretoEvents[paretoEvents.length - 1]?.candidates || [];

  const accuracyByGen: Array<{ generation: number; accuracy: number }> = [];
  const generationDone = events.filter(
    (e): e is Extract<ProgressEvent, { type: 'generation_done' }> =>
      e.type === "generation_done"
  );

  generationDone.forEach(e => {
    accuracyByGen.push({
      generation: e.generation,
      accuracy: e.bestAccuracy,
    });
  });

  return {
    paretoFront,
    accuracyByGen,
    bestAccuracy: Math.max(...paretoFront.map(c => c.accuracy), 0),
    bestLength: paretoFront.length > 0
      ? Math.min(...paretoFront.map(c => c.avgLength))
      : Infinity,
  };
}
