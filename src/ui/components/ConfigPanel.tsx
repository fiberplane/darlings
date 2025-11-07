import { useState, useEffect } from 'preact/hooks';

interface ConfigPanelProps {
  onStart: (serverId: string, config: any) => void;
  onStop: () => void;
  isRunning: boolean;
}

export function ConfigPanel({ onStart, onStop, isRunning }: ConfigPanelProps) {
  const [servers, setServers] = useState<any[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [testCases, setTestCases] = useState<any[]>([]);

  // Configuration
  const [iterations, setIterations] = useState(10);
  const [populationSize, setPopulationSize] = useState(8);
  const [testsPerTool, setTestsPerTool] = useState(5);
  const [model, setModel] = useState('claude-sonnet-4-5');
  const [parallelEvals, setParallelEvals] = useState(3);

  // MCP connection
  const [mcpType, setMcpType] = useState<'stdio' | 'http'>('stdio');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgs, setMcpArgs] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpName, setMcpName] = useState('');

  useEffect(() => {
    loadServers();
  }, []);

  useEffect(() => {
    if (selectedServer) {
      loadTestCases(selectedServer);
    }
  }, [selectedServer]);

  const loadServers = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/mcp/servers');
      const data = await res.json();
      setServers(data);
      if (data.length > 0) {
        setSelectedServer(data[0].id);
      }
    } catch (error) {
      console.error('Failed to load servers:', error);
    }
  };

  const loadTestCases = async (serverId: string) => {
    try {
      const res = await fetch(`http://localhost:3000/api/tests?serverId=${serverId}`);
      const data = await res.json();
      setTestCases(data);
    } catch (error) {
      console.error('Failed to load test cases:', error);
    }
  };

  const handleConnectMCP = async () => {
    const config = mcpType === 'stdio'
      ? { type: 'stdio', command: mcpCommand, args: mcpArgs.split(' ').filter(Boolean) }
      : { type: 'http', url: mcpUrl };

    try {
      const res = await fetch('http://localhost:3000/api/mcp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: mcpName, config }),
      });

      if (res.ok) {
        await loadServers();
        setMcpName('');
        setMcpCommand('');
        setMcpArgs('');
        setMcpUrl('');
      } else {
        const error = await res.json();
        alert('Connection failed: ' + error.error);
      }
    } catch (error) {
      alert('Connection failed: ' + error);
    }
  };

  const handleGenerateTests = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/tests/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: selectedServer,
          testsPerTool,
          model,
        }),
      });

      if (res.ok) {
        await loadTestCases(selectedServer);
      }
    } catch (error) {
      console.error('Failed to generate tests:', error);
    }
  };

  const handleStart = () => {
    if (!selectedServer) {
      alert('Please connect to an MCP server first');
      return;
    }

    if (testCases.length === 0) {
      alert('Please generate test cases first');
      return;
    }

    onStart(selectedServer, {
      iterations,
      populationSize,
      testsPerTool,
      model,
      parallelEvals,
    });
  };

  return (
    <div className="panel config-panel">
      <h2>Configuration</h2>

      <h3>MCP Server</h3>
      <div className="form-group">
        <label>Server Name</label>
        <input
          type="text"
          value={mcpName}
          onChange={(e) => setMcpName((e.target as HTMLInputElement).value)}
          placeholder="My MCP Server"
        />
      </div>

      <div className="form-group">
        <label>Connection Type</label>
        <select value={mcpType} onChange={(e) => setMcpType((e.target as HTMLSelectElement).value as any)}>
          <option value="stdio">stdio</option>
          <option value="http">HTTP</option>
        </select>
      </div>

      {mcpType === 'stdio' ? (
        <>
          <div className="form-group">
            <label>Command</label>
            <input
              type="text"
              value={mcpCommand}
              onChange={(e) => setMcpCommand((e.target as HTMLInputElement).value)}
              placeholder="node"
            />
          </div>
          <div className="form-group">
            <label>Arguments</label>
            <input
              type="text"
              value={mcpArgs}
              onChange={(e) => setMcpArgs((e.target as HTMLInputElement).value)}
              placeholder="server.js"
            />
          </div>
        </>
      ) : (
        <div className="form-group">
          <label>URL</label>
          <input
            type="text"
            value={mcpUrl}
            onChange={(e) => setMcpUrl((e.target as HTMLInputElement).value)}
            placeholder="http://localhost:8080"
          />
        </div>
      )}

      <button onClick={handleConnectMCP} disabled={!mcpName}>
        Connect to MCP Server
      </button>

      {servers.length > 0 && (
        <>
          <h3>Active Server</h3>
          <select
            value={selectedServer}
            onChange={(e) => setSelectedServer((e.target as HTMLSelectElement).value)}
          >
            {servers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </>
      )}

      <h3>Optimization</h3>
      <div className="form-group">
        <label>Iterations: {iterations}</label>
        <input
          type="range"
          min="1"
          max="20"
          value={iterations}
          onChange={(e) => setIterations(parseInt((e.target as HTMLInputElement).value))}
        />
      </div>

      <div className="form-group">
        <label>Population Size: {populationSize}</label>
        <input
          type="range"
          min="2"
          max="16"
          value={populationSize}
          onChange={(e) => setPopulationSize(parseInt((e.target as HTMLInputElement).value))}
        />
      </div>

      <div className="form-group">
        <label>Tests Per Tool: {testsPerTool}</label>
        <input
          type="range"
          min="1"
          max="10"
          value={testsPerTool}
          onChange={(e) => setTestsPerTool(parseInt((e.target as HTMLInputElement).value))}
        />
      </div>

      <div className="form-group">
        <label>Model</label>
        <select value={model} onChange={(e) => setModel((e.target as HTMLSelectElement).value)}>
          <optgroup label="Claude">
            <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
            <option value="claude-opus-4-1">Claude Opus 4.1</option>
            <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
          </optgroup>
          <optgroup label="OpenAI">
            <option value="gpt-5">GPT-5</option>
            <option value="gpt-4o">GPT-4o</option>
          </optgroup>
        </select>
      </div>

      <h3>Test Cases ({testCases.length})</h3>
      <button onClick={handleGenerateTests} disabled={!selectedServer}>
        Generate Test Cases
      </button>

      <ul className="test-list">
        {testCases.slice(0, 5).map(tc => (
          <li key={tc.id} className="test-item">
            <span>{tc.query}</span>
          </li>
        ))}
        {testCases.length > 5 && (
          <li className="test-item">
            <span>...and {testCases.length - 5} more</span>
          </li>
        )}
      </ul>

      <h3>Run</h3>
      {isRunning ? (
        <button onClick={onStop} className="secondary">Stop Optimization</button>
      ) : (
        <button onClick={handleStart}>Start Optimization</button>
      )}
    </div>
  );
}
