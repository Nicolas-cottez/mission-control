const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const HOME_DIR = os.homedir();
const WORKSPACE_DIR = path.join(HOME_DIR, '.openclaw', 'workspace');
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');
const LOG_FILE = path.join(HOME_DIR, '.openclaw', 'logs', 'openclaw.log');

async function runCommand(command, args = [], options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      ...options,
      maxBuffer: 10_485_760
    });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const message = error?.message || String(error);
    return { success: false, stdout: '', stderr: message };
  }
}

function parseAgentsListText(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const agents = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('- ')) {
      if (current) {
        agents.push(current);
      }
      const rest = line.slice(2).trim();
      const isDefault = rest.includes('(default)');
      const name = rest.replace('(default)', '').trim();
      current = {
        name,
        default: isDefault,
        attributes: {}
      };
      continue;
    }
    if (!current) {
      continue;
    }
    if (!line.includes(':')) {
      continue;
    }
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
    current.attributes[normalizedKey] = value;
  }

  if (current) {
    agents.push(current);
  }
  return agents;
}

function parseStatusText(text) {
  const lines = text.split(/\r?\n/);
  const overview = {};
  const sessions = [];
  let currentSection = null;

  for (const raw of lines) {
    const line = raw.replace(/\r/g, '');
    if (!line.includes('│')) {
      if (line.includes('Overview')) {
        currentSection = 'overview';
      } else if (line.includes('Security audit')) {
        currentSection = 'security';
      } else if (line.includes('Channels')) {
        currentSection = 'channels';
      } else if (line.includes('Sessions')) {
        currentSection = 'sessions';
      }
      continue;
    }
    if (line.startsWith('┌') || line.startsWith('├') || line.startsWith('└') || line.includes('Item') || line.includes('Key')) {
      continue;
    }
    const parts = line.split('│').map((segment) => segment.trim());
    if (currentSection === 'overview' && parts.length >= 3) {
      const key = parts[1];
      const value = parts[2];
      if (key) {
        overview[key] = value;
      }
    } else if (currentSection === 'sessions' && parts.length >= 6) {
      sessions.push({
        key: parts[1],
        kind: parts[2],
        age: parts[3],
        model: parts[4],
        tokens: parts[5]
      });
    }
  }
  return { overview, sessions };
}

async function getAgentsList() {
  const result = await runCommand('openclaw', ['agents', 'list']);
  const payload = result.success ? result.stdout : result.stderr;
  return parseAgentsListText(payload);
}

async function getStatusOverview() {
  const result = await runCommand('openclaw', ['status']);
  const payload = result.success ? result.stdout : result.stderr;
  return parseStatusText(payload);
}

async function getCronJobs() {
  const result = await runCommand('openclaw', ['cron', 'list']);
  const output = result.stdout || result.stderr;
  if (!output) {
    return [];
  }
  if (output.toLowerCase().includes('no cron jobs')) {
    return [];
  }
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((description) => ({ description }));
}

const TASKS_FILE = path.join(MEMORY_DIR, 'tasks_board.md');

async function readTasksBoard() {
  try {
    const raw = await fs.readFile(TASKS_FILE, 'utf-8');
    const lines = raw.split(/\r?\n/);
    const headerIndex = lines.findIndex((line) => line.includes('| ID |'));
    if (headerIndex === -1) {
      return [];
    }
    const dataLines = lines.slice(headerIndex + 2);
    const tasks = [];
    for (const line of dataLines) {
      if (!line.trim().startsWith('|')) {
        break;
      }
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      if (cells.length < 9) {
        continue;
      }
      const [id, title, owner, status, priority, model, dependencies, deliverable, notes] = cells;
      tasks.push({
        id,
        title,
        owner,
        status: status.toLowerCase(),
        priority,
        model,
        dependencies,
        deliverable,
        notes: notes.replace(/^"|"$/g, '')
      });
    }
    return tasks;
  } catch (error) {
    return [];
  }
}

async function collectMemoryFiles(directory) {
  const entries = [];
  try {
    const items = await fs.readdir(directory, { withFileTypes: true });
    for (const item of items) {
      const entryPath = path.join(directory, item.name);
      if (item.isDirectory()) {
        const nested = await collectMemoryFiles(entryPath);
        entries.push(...nested);
      } else if (item.isFile()) {
        entries.push(entryPath);
      }
    }
  } catch (error) {
    return [];
  }
  return entries;
}

async function readMemoryEntries(limit = 6) {
  try {
    const files = await collectMemoryFiles(MEMORY_DIR);
    const entries = [];
    for (const filePath of files) {
      try {
        const stats = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        const snippet = content
          .split(/\r?\n/)
          .slice(0, 4)
          .map((line) => line.trim())
          .filter(Boolean)
          .join(' · ');
        entries.push({
          name: path.relative(MEMORY_DIR, filePath),
          updatedAt: stats.mtime.toISOString(),
          snippet,
          path: filePath
        });
      } catch (error) {
        continue;
      }
    }
    entries.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return entries.slice(0, limit);
  } catch (error) {
    return [];
  }
}

async function readLogs(limit = 60) {
  try {
    const result = await runCommand('tail', ['-n', String(limit), LOG_FILE]);
    if (!result.success) {
      return { source: LOG_FILE, lines: [result.stderr] };
    }
    const lines = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-limit)
      .reverse();
    return { source: LOG_FILE, lines };
  } catch (error) {
    return { source: LOG_FILE, lines: [`error reading logs: ${error.message}`] };
  }
}

function parseUptime(output) {
  if (!output) return { load: { one: 0, five: 0, fifteen: 0 }, uptimeText: '' };
  const loadMatch = output.match(/load average: ([0-9.,]+),\s*([0-9.,]+),\s*([0-9.,]+)/);
  const uptimeTextMatch = output.match(/up ([^,]+),\s+\d+ user[s]?/);
  const uptimeText = uptimeTextMatch ? uptimeTextMatch[1] : '';
  return {
    load: {
      one: loadMatch ? parseFloat(loadMatch[1]) : 0,
      five: loadMatch ? parseFloat(loadMatch[2]) : 0,
      fifteen: loadMatch ? parseFloat(loadMatch[3]) : 0
    },
    uptimeText
  };
}

function parseMem(output) {
  if (!output) return null;
  const line = output.split(/\r?\n/).find((row) => row.toLowerCase().startsWith('mem:'));
  if (!line) return null;
  const parts = line.split(/\s+/).filter(Boolean);
  const total = parseInt(parts[1], 10);
  const used = parseInt(parts[2], 10);
  const free = parseInt(parts[3], 10);
  const percent = total ? Math.round((used / total) * 100) : 0;
  return { total, used, free, percent };
}

function parseDf(output) {
  if (!output) return null;
  const lines = output.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const row = lines[1].split(/\s+/).filter(Boolean);
  return {
    filesystem: row[0],
    size: row[1],
    used: row[2],
    available: row[3],
    percent: row[4],
    mount: row[5]
  };
}

function parseTemperature(output) {
  if (!output) return null;
  const raw = parseInt(output.trim(), 10);
  if (Number.isNaN(raw)) {
    return null;
  }
  return (raw / 1000).toFixed(1);
}

async function getSystemVitals() {
  const [uptimeResult, freeResult, dfResult, tempResult] = await Promise.all([
    runCommand('uptime', []),
    runCommand('free', ['-m']),
    runCommand('df', ['-h', '/']),
    runCommand('cat', ['/sys/class/thermal/thermal_zone0/temp'])
  ]);
  return {
    uptimeRaw: uptimeResult.stdout,
    uptime: parseUptime(uptimeResult.stdout),
    memory: parseMem(freeResult.stdout),
    disk: parseDf(dfResult.stdout),
    temperature: parseTemperature(tempResult.stdout)
  };
}

async function getServiceStatus(serviceName) {
  const result = await runCommand('systemctl', ['status', serviceName, '--no-pager']);
  const keyLine = (result.stdout || '').split(/\r?\n/).find((line) => line.trim().startsWith('Active:'));
  const activeState = keyLine ? keyLine.split(/Active:/)[1].trim() : 'unknown';
  return {
    command: `systemctl status ${serviceName}`,
    output: result.stdout || result.stderr,
    activeState
  };
}

async function fetchDashboardData() {
  const [agents, statusData, tasks, memoryEntries, logs, cronJobs, systemVitals, serviceStatus] = await Promise.all([
    getAgentsList(),
    getStatusOverview(),
    readTasksBoard(),
    readMemoryEntries(8),
    readLogs(80),
    getCronJobs(),
    getSystemVitals(),
    getServiceStatus('openclaw.service')
  ]);

  return {
    timestamp: new Date().toISOString(),
    agents,
    statusOverview: statusData.overview,
    sessions: statusData.sessions,
    tasks,
    cronJobs,
    memoryEntries,
    logs,
    systemVitals,
    serviceStatus
  };
}

module.exports = {
  fetchDashboardData,
  runCommand
};
