document.addEventListener('DOMContentLoaded', () => {
  const modules = document.querySelectorAll('[data-module-panel]');
  const navButtons = document.querySelectorAll('[data-module]');
  const clock = document.getElementById('live-clock');
  const presenceBadge = document.getElementById('presence-status');
  const missionState = document.getElementById('mission-state');
  let activeModule = 'overview';
  let latestData = null;

  const activateModule = (name) => {
    modules.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.modulePanel === name);
    });

    navButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.module === name);
    });

    activeModule = name;
  };

  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activateModule(button.dataset.module);
    });
  });

  const formatClock = () => {
    const now = new Date();
    return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const updateClock = () => {
    if (clock) {
      clock.textContent = formatClock();
    }
  };

  function createPanelCard(title, content) {
    const card = document.createElement('article');
    card.className = 'panel-card';
    const header = document.createElement('h3');
    header.textContent = title;
    card.appendChild(header);
    if (typeof content === 'string') {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = content;
      card.appendChild(wrapper);
    } else if (content instanceof HTMLElement) {
      card.appendChild(content);
    }
    return card;
  }

  function buildStatusGrid(vitals) {
    const grid = document.createElement('div');
    grid.className = 'status-grid';

    const addCard = (label, value, note) => {
      const card = document.createElement('div');
      card.className = 'status-card';
      const strong = document.createElement('strong');
      strong.textContent = value;
      const small = document.createElement('small');
      small.textContent = note;
      card.appendChild(strong);
      card.appendChild(small);
      grid.appendChild(card);
    };

    const load = vitals?.uptime?.load;
    if (load) {
      addCard('Load 1m', load.one.toFixed(2), 'Load average (1m)');
      addCard('Load 5m', load.five.toFixed(2), 'Load average (5m)');
      addCard('Load 15m', load.fifteen.toFixed(2), 'Load average (15m)');
    }

    if (vitals?.memory) {
      addCard(`${vitals.memory.percent}%`, `${vitals.memory.used}MB / ${vitals.memory.total}MB`, 'Memory usage');
    }

    if (vitals?.disk) {
      addCard(vitals.disk.percent, `${vitals.disk.used} / ${vitals.disk.size}`, 'Disk /');
    }

    if (vitals?.temperature) {
      addCard(`${vitals.temperature}°C`, 'CPU temperature', 'Sensor');
    }

    return grid;
  }

  function createListGroup(items, renderCallback) {
    const container = document.createElement('div');
    container.className = 'list-group';
    items.forEach((item) => {
      const entry = document.createElement('div');
      entry.className = 'list-item';
      const meta = document.createElement('div');
      meta.className = 'meta';
      const content = renderCallback(item);
      meta.appendChild(content);
      entry.appendChild(meta);
      if (item.badge) {
        const span = document.createElement('span');
        span.className = 'pill';
        span.textContent = item.badge;
        entry.appendChild(span);
      }
      container.appendChild(entry);
    });
    return container;
  }

  function createTimeline(items) {
    const list = document.createElement('ul');
    list.className = 'timeline';
    if (!items || !items.length) {
      const li = document.createElement('li');
      li.innerHTML = '<strong>No events logged</strong>';
      list.appendChild(li);
      return list;
    }
    items.forEach((item) => {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = item.title;
      const small = document.createElement('small');
      small.textContent = item.subtitle;
      li.appendChild(strong);
      li.appendChild(small);
      list.appendChild(li);
    });
    return list;
  }

  function updatePresenceIndicator(data) {
    if (!presenceBadge) {
      return;
    }
    const sessionCount = data?.sessions?.length || 0;
    const text = sessionCount ? `Active · ${sessionCount} session${sessionCount > 1 ? 's' : ''}` : 'Awaiting command';
    presenceBadge.textContent = text;
    const accent = sessionCount ? '#24c8a8' : '#8a5afc';
    presenceBadge.style.background = `${accent}20`;
    presenceBadge.style.borderColor = accent;
    presenceBadge.style.color = '#fff';
  }

  function renderOverview(data) {
    const grid = document.getElementById('overview-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const summary = document.createElement('div');
    summary.className = 'command-summary';
    summary.innerHTML = `
      <h3>Command summary</h3>
      <p>Main orchestrates intent; architect outlines plans; builder & UI execute; observer & memory monitor.</p>
      <p>Last sync: ${new Date(data.timestamp).toLocaleString()}</p>
    `;
    grid.appendChild(summary);

    const healthCard = createPanelCard('Live health summary', buildStatusGrid(data.systemVitals));
    grid.appendChild(healthCard);

    const agentsList = (data.agents || []).map((agent) => {
      const focusTask = (data.tasks || []).find((t) => t.owner && t.owner.toLowerCase() === agent.name.toLowerCase());
      const activeSessions = new Set((data.sessions || []).map((session) => session.key?.split(':')[1]));
      const status = activeSessions.has(agent.name) ? 'Active' : 'Standby';
      return {
        badge: status,
        focus: focusTask ? focusTask.title : 'No running task',
        node: (() => {
          const wrapper = document.createElement('div');
          const title = document.createElement('strong');
          title.textContent = agent.name;
          const subtitle = document.createElement('span');
          subtitle.textContent = agent.attributes?.model || 'UNK model';
          const focus = document.createElement('small');
          focus.textContent = `Focus: ${focusTask ? focusTask.title : 'Idle'}`;
          wrapper.appendChild(title);
          wrapper.appendChild(subtitle);
          wrapper.appendChild(focus);
          return wrapper;
        })()
      };
    });

    const activeAgentsCard = createPanelCard('Active agents', createListGroup(agentsList, (item) => item.node));
    grid.appendChild(activeAgentsCard);

    const priorityItems = (data.tasks || [])
      .slice()
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
      .slice(0, 3)
      .map((task) => ({
        title: `${task.title} (${task.owner})`,
        subtitle: `Status: ${capitalize(task.status)} · Priority: ${task.priority}`
      }));
    const prioritiesCard = createPanelCard('Current priorities', createTimeline(priorityItems));
    grid.appendChild(prioritiesCard);

    const recentEvents = ((data.logs?.lines || []).slice(0, 4)).map((line) => ({
      title: line,
      subtitle: ''
    }));
    const eventsCard = createPanelCard('Recent activity', createTimeline(recentEvents));
    grid.appendChild(eventsCard);

    const scheduleTimeline = (data.cronJobs || []).map((job, index) => ({
      title: job.description,
      subtitle: `Scheduled job #${index + 1}`
    }));
    if (!scheduleTimeline.length) {
      scheduleTimeline.push({ title: 'No cron jobs configured', subtitle: 'Configure via openclaw cron' });
    }
    const scheduleCard = createPanelCard('Upcoming jobs', createTimeline(scheduleTimeline));
    grid.appendChild(scheduleCard);

    const snapshotCard = createPanelCard(
      'System snapshot',
      `
        <div class="list-group">
          <div class="list-item">
            <div class="meta">
              <strong>Load (1m)</strong>
              <span>${data.systemVitals?.uptime?.load?.one?.toFixed(2) ?? '—'}</span>
            </div>
          </div>
          <div class="list-item">
            <div class="meta">
              <strong>Memory used</strong>
              <span>${data.systemVitals?.memory ? `${data.systemVitals.memory.used} / ${data.systemVitals.memory.total} MB` : '—'}</span>
            </div>
          </div>
          <div class="list-item">
            <div class="meta">
              <strong>Disk /</strong>
              <span>${data.systemVitals?.disk?.percent ?? '—'}</span>
            </div>
          </div>
        </div>
        <p>${data.statusOverview['Gateway'] || data.statusOverview['Gateway service'] || 'Gateway status unknown'}</p>
      `
    );
    grid.appendChild(snapshotCard);
  }

  function renderTasks(data) {
    const grid = document.getElementById('tasks-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const board = document.createElement('article');
    board.className = 'panel-card';
    const heading = document.createElement('h3');
    heading.textContent = 'Operational task board';
    board.appendChild(heading);
    const columns = document.createElement('div');
    columns.className = 'board-columns';
    const statuses = [
      { id: 'queued', label: 'Queued', matcher: (s) => /todo|queued/i.test(s) },
      { id: 'active', label: 'Active', matcher: (s) => /implementation|design|active/i.test(s) },
      { id: 'review', label: 'Review', matcher: (s) => /review|waiting|blocked/i.test(s) },
      { id: 'blocked', label: 'Blocked', matcher: (s) => /blocked|waiting|watch/i.test(s) }
    ];
    statuses.forEach((column) => {
      const columnEl = document.createElement('div');
      columnEl.className = 'board-column';
      const title = document.createElement('h4');
      title.textContent = column.label;
      columnEl.appendChild(title);
      const columnTasks = (data.tasks || []).filter((task) => column.matcher(task.status));
      columnTasks.forEach((task) => {
        const card = document.createElement('div');
        card.className = 'board-card';
        const strong = document.createElement('strong');
        strong.textContent = task.title;
        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent = `${task.owner} · Priority: ${task.priority}`;
        const pill = document.createElement('span');
        pill.className = 'pill';
        pill.textContent = capitalize(task.status);
        const progress = document.createElement('div');
        progress.className = 'progress-track';
        const fill = document.createElement('span');
        fill.className = 'progress-fill';
        fill.style.width = `${Math.min(100, progressFromStatus(task.status))}%`;
        progress.appendChild(fill);
        card.appendChild(strong);
        card.appendChild(meta);
        card.appendChild(pill);
        card.appendChild(progress);
        columnEl.appendChild(card);
      });
      columns.appendChild(columnEl);
    });
    board.appendChild(columns);
    grid.appendChild(board);

    const detail = createPanelCard('Task detail panel', (() => {
      const detailDiv = document.createElement('div');
      const focusTask = (data.tasks || []).find((task) => /high|haute|critical/i.test(task.priority));
      detailDiv.innerHTML = focusTask
        ? `<p><strong>${focusTask.title}</strong> · ${focusTask.owner} · ${focusTask.status}</p><p>${focusTask.notes}</p>`
        : '<p>No critical tasks active.</p>';
      const progress = document.createElement('div');
      progress.className = 'progress-track';
      const fill = document.createElement('span');
      fill.className = 'progress-fill';
      fill.style.width = `${focusTask ? progressFromStatus(focusTask.status) : 20}%`;
      progress.appendChild(fill);
      detailDiv.appendChild(progress);
      return detailDiv;
    })());
    grid.appendChild(detail);

    const updates = createPanelCard('Updates & signals', createTimeline((data.tasks || []).slice(0, 4).map((task) => ({
      title: `${task.title} · ${task.owner}`,
      subtitle: `${capitalize(task.status)} · Priority ${task.priority}`
    }))));
    grid.appendChild(updates);
  }

  function renderCalendar(data) {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const timeline = createTimeline(
      (data.cronJobs || []).map((job, index) => ({
        title: job.description,
        subtitle: `Cron job ${index + 1}`
      }))
    );
    const timelineCard = createPanelCard('Schedule timeline', timeline);
    grid.appendChild(timelineCard);

    const cronList = (data.cronJobs || []).length
      ? `<div class="list-group">${data.cronJobs
          .map((job) =>
            `<div class="list-item"><div class="meta"><strong>${job.description}</strong><span>status: scheduled</span></div></div>`
          )
          .join('')}</div>`
      : '<p>No cron jobs configured.</p>';
    const cronCard = createPanelCard('Cron visibility', cronList);
    grid.appendChild(cronCard);

    const nextRun = (data.cronJobs && data.cronJobs[0]) ? data.cronJobs[0].description : 'No cron jobs';
    const lastRun = (data.logs?.lines?.[0]) || 'No recent executions logged';
    const runCard = createPanelCard('Next / Last run', `
      <div class="list-group">
        <div class="list-item">
          <div class="meta">
            <strong>Next run</strong>
            <span>${nextRun}</span>
          </div>
        </div>
        <div class="list-item">
          <div class="meta">
            <strong>Last run</strong>
            <span>${lastRun}</span>
          </div>
        </div>
      </div>
    `);
    grid.appendChild(runCard);
  }

  function renderTeam(data) {
    const grid = document.getElementById('team-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const agentInfo = data.agents || [];
    agentInfo.forEach((agent) => {
      const card = document.createElement('article');
      card.className = 'team-card';
      const heading = document.createElement('h4');
      heading.textContent = agent.name;
      card.appendChild(heading);
      const role = document.createElement('small');
      role.textContent = roleDescription(agent.name);
      card.appendChild(role);
      const model = document.createElement('small');
      model.textContent = `Model: ${agent.attributes?.model || 'unknown'}`;
      card.appendChild(model);
      const status = document.createElement('small');
      const activeSessions = new Set((data.sessions || []).map((session) => session.key?.split(':')[1]));
      status.textContent = `Status: ${activeSessions.has(agent.name) ? 'Active' : 'Standby'}`;
      card.appendChild(status);
      const focus = document.createElement('small');
      const focusTask = (data.tasks || []).find((task) => task.owner && task.owner.toLowerCase() === agent.name.toLowerCase());
      focus.textContent = `Current focus: ${focusTask ? focusTask.title : 'Awaiting signal'}`;
      card.appendChild(focus);
      const reports = document.createElement('p');
      reports.textContent = reportingLine(agent.name);
      card.appendChild(reports);
      grid.appendChild(card);
    });

    const reportingCard = createPanelCard('Reporting lines', '<p>Main → architect / observer / memory · Architect → builder & UI.</p>');
    grid.appendChild(reportingCard);
    const delegationCard = createPanelCard('Delegation', '<p>Architect funnels tasks to builder & UI; observer & memory remain advisory.</p>');
    grid.appendChild(delegationCard);
  }

  function renderOffice(data) {
    const grid = document.getElementById('office-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const sessionAgents = new Set((data.sessions || []).map((session) => session.key?.split(':')[1]));
    (data.agents || []).forEach((agent) => {
      const card = document.createElement('article');
      card.className = 'office-card';
      const heading = document.createElement('h4');
      heading.textContent = agent.name;
      card.appendChild(heading);
      const status = document.createElement('span');
      status.textContent = `Status: ${sessionAgents.has(agent.name) ? 'Active' : 'Standby'}`;
      card.appendChild(status);
      const focusTask = (data.tasks || []).find((task) => task.owner && task.owner.toLowerCase() === agent.name.toLowerCase());
      const focus = document.createElement('span');
      focus.textContent = `Focus: ${focusTask ? focusTask.title : 'Idle'}`;
      card.appendChild(focus);
      grid.appendChild(card);
    });
  }

  function renderMemory(data) {
    const grid = document.getElementById('memory-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const entries = data.memoryEntries || [];
    if (!entries.length) {
      grid.appendChild(createPanelCard('Memory overview', '<p>No memory entries yet.</p>'));
      return;
    }

    entries.forEach((entry) => {
      const card = document.createElement('article');
      card.className = 'memory-card';
      const heading = document.createElement('h4');
      heading.textContent = entry.name;
      const updated = document.createElement('small');
      updated.textContent = `Updated: ${new Date(entry.updatedAt).toLocaleString()}`;
      const snippet = document.createElement('p');
      snippet.textContent = entry.snippet;
      card.appendChild(heading);
      card.appendChild(updated);
      card.appendChild(snippet);
      grid.appendChild(card);
    });

    const categories = entries.reduce((memo, entry) => {
      const parts = entry.name.split('/');
      const category = parts.length > 1 ? parts[0] : 'root';
      memo[category] = (memo[category] || 0) + 1;
      return memo;
    }, {});
    const summary = document.createElement('p');
    summary.textContent = Object.entries(categories)
      .map(([cat, count]) => `${cat}: ${count}`)
      .join(' · ');
    const summaryCard = createPanelCard('Memory categories', summary);
    grid.appendChild(summaryCard);
  }

  function renderSystem(data) {
    const grid = document.getElementById('system-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const vitalsContent = document.createElement('div');
    vitalsContent.appendChild(buildStatusGrid(data.systemVitals));
    const vitalsCard = createPanelCard('Machine vitals (untrusted)', vitalsContent);
    grid.appendChild(vitalsCard);

    const servicesCard = createPanelCard(
      'Service health',
      `<div class="list-group">
         <div class="list-item">
           <div class="meta">
             <strong>OpenClaw service</strong>
             <span>${data.serviceStatus.activeState}</span>
           </div>
           <span class="pill">${data.serviceStatus.command}</span>
         </div>
       </div>`
    );
    grid.appendChild(servicesCard);

    const postureCard = createPanelCard('Gateway posture', `<p>${data.statusOverview['Gateway'] || data.statusOverview['Gateway service'] || 'Gateway data unavailable.'}</p>`);
    grid.appendChild(postureCard);
  }

  function renderActivity(data) {
    const grid = document.getElementById('activity-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const events = document.createElement('article');
    events.className = 'panel-card';
    const header = document.createElement('div');
    header.className = 'activity-header';
    const heading = document.createElement('h3');
    heading.textContent = 'Runtime event stream';
    const indicator = document.createElement('small');
    indicator.textContent = 'Live log tail';
    header.appendChild(heading);
    header.appendChild(indicator);
    events.appendChild(header);
    const stream = document.createElement('div');
    stream.className = 'activity-stream';
    (data.logs?.lines || []).slice(0, 6).forEach((line) => {
      const item = document.createElement('div');
      item.className = 'activity-item';
      const strong = document.createElement('strong');
      strong.textContent = line;
      item.appendChild(strong);
      stream.appendChild(item);
    });
    events.appendChild(stream);
    grid.appendChild(events);

    const taskChanges = createPanelCard(
      'Task changes',
      createTimeline((data.tasks || []).slice(0, 4).map((task) => ({
        title: task.title,
        subtitle: `${task.owner} · ${capitalize(task.status)}`
      })))
    );
    grid.appendChild(taskChanges);

    const signals = createPanelCard('Signals & events', (() => {
      const list = document.createElement('div');
      list.className = 'list-group';
      const sync = document.createElement('div');
      sync.className = 'list-item';
      sync.innerHTML = `
        <div class="meta">
          <strong>Agent sync</strong>
          <span>Sessions: ${data.sessions?.length || 0}</span>
        </div>
        <span class="pill">status</span>
      `;
      list.appendChild(sync);
      const cron = document.createElement('div');
      cron.className = 'list-item';
      cron.innerHTML = `
        <div class="meta">
          <strong>Cron queue</strong>
          <span>${(data.cronJobs || []).length} jobs</span>
        </div>
        <span class="pill">queued</span>
      `;
      list.appendChild(cron);
      return list;
    })());
    grid.appendChild(signals);
  }

  function renderDashboard(data) {
    renderOverview(data);
    renderTasks(data);
    renderCalendar(data);
    renderTeam(data);
    renderOffice(data);
    renderMemory(data);
    renderSystem(data);
    renderActivity(data);
    if (missionState && data.statusOverview) {
      missionState.textContent = data.statusOverview['Dashboard'] ? 'Operational' : 'Monitoring';
    }
    updatePresenceIndicator(data);
  }

  async function fetchData() {
    try {
      const response = await fetch('/api/data');
      if (!response.ok) {
        throw new Error('Unable to fetch mission data');
      }
      const payload = await response.json();
      latestData = payload;
      renderDashboard(payload);
    } catch (error) {
      console.error('Failed to refresh data', error);
    }
  }

  const progressFromStatus = (status) => {
    const lookup = {
      todo: 20,
      queued: 30,
      design: 50,
      implementation: 70,
      review: 85,
      blocked: 15,
      waiting: 25
    };
    const key = (status || '').toLowerCase();
    return lookup[key] || 40;
  };

  const priorityRank = (priority) => {
    const value = priority?.toLowerCase();
    if (value?.includes('crit')) return 10;
    if (value?.includes('high') || value?.includes('haute')) return 8;
    if (value?.includes('moyenne')) return 5;
    return 2;
  };

  const capitalize = (text) => text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;

  const roleDescription = (agentName) => {
    const map = {
      main: 'Chief of Staff · Executive orchestrator',
      architect: 'Chief Engineer · Systems architect',
      builder: 'Implementation Engineer',
      ui: 'Design Engineer · Interface design',
      observer: 'Operations Analyst · QA monitoring',
      memory: 'Knowledge Manager · Memory curation'
    };
    return map[agentName] || 'Agent';
  };

  const reportingLine = (agentName) => {
    if (agentName === 'main') return 'Reports to Nicolas · Owns architect / observer / memory';
    if (agentName === 'architect') return 'Reports to main · Delegates to builder / UI';
    if (agentName === 'builder' || agentName === 'ui') return 'Reports to architect';
    return 'Reports to main';
  };

  updateClock();
  setInterval(updateClock, 1000);
  fetchData();
  setInterval(fetchData, 10_000);
  activateModule(activeModule);
});
