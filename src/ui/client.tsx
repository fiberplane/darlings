import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { ConfigPanel } from './components/ConfigPanel';
import { ActivityFeed } from './components/ActivityFeed';
import { MetricsPanel } from './components/MetricsPanel';
import type { ProgressEvent } from '../types';

function App() {
  const [view, setView] = useState<'setup' | 'optimize'>('setup');
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const startOptimization = async (serverId: string, config: any) => {
    setIsRunning(true);
    setView('optimize');
    setEvents([]);

    try {
      const response = await fetch('http://localhost:3000/api/optimize/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, config }),
      });

      if (!response.ok) {
        throw new Error('Failed to start optimization');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const event = JSON.parse(data);
              setEvents(prev => [...prev, event]);
            } catch (e) {
              console.error('Failed to parse event:', e);
            }
          }
        }
      }

      setIsRunning(false);
    } catch (error) {
      console.error('Optimization error:', error);
      setIsRunning(false);
    }
  };

  const stopOptimization = () => {
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    setIsRunning(false);
  };

  return (
    <div className="app">
      <header>
        <h1>MCP Tool Description Optimizer</h1>
      </header>

      <div className="main-layout">
        <ConfigPanel
          onStart={startOptimization}
          onStop={stopOptimization}
          isRunning={isRunning}
        />
        <ActivityFeed events={events} />
        <MetricsPanel events={events} />
      </div>
    </div>
  );
}

render(<App />, document.getElementById('root')!);
