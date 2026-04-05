document.addEventListener('DOMContentLoaded', () => {
  /* ======================================================
     DOM REFS
     ====================================================== */
  const modules = document.querySelectorAll('[data-module-panel]');
  const navButtons = document.querySelectorAll('[data-module]');
  const clockEl = document.getElementById('live-clock');
  const presenceDot = document.getElementById('presence-dot');
  const presenceLabel = document.getElementById('presence-label');
  const presenceDetail = document.getElementById('presence-detail');
  const missionChip = document.getElementById('mission-state');

  let activeModule = 'overview';
  let latestData = null;

  /* ======================================================
     MODULE SWITCHING
     ====================================================== */
  const activateModule = (name) => {
    modules.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.modulePanel === name);
    });
    navButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.module === name);
    });
    activeModule = name;
    // Re-render active module with latest data
    if (latestData) renderModule(name, latestData);
  };

  navButtons.forEach((button) => {
    button.addEventListener('click', () => activateModule(button.dataset.module));
  });

  // Keyboard shortcuts: 1-8 for modules
  const moduleKeys = ['overview', 'tasks', 'calendar', 'team', 'office', 'memory', 'system', 'activity'];
  document.addEventListener('keydown', (e) => {
    const idx = parseInt(e.key, 10);
    if (idx >= 1 && idx <= 8 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const target = e.target.tagName;
      if (target === 'INPUT' || target === 'TEXTAREA') return;
      activateModule(moduleKeys[idx - 1]);
    }
  });

  /* ======================================================
     CLOCK
     ====================================================== */
  const updateClock = () => {
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  /* ======================================================
     HELPERS
     ====================================================== */
  const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

  const priorityRank = (p) => {
    const v = (p || '').toLowerCase();
    if (v.includes('crit')) return 10;
    if (v.includes('high') || v.includes('haute')) return 8;
    if (v.includes('moyen')) return 5;
    return 2;
  };

  const progressFromStatus = (s) => {
    const map = { todo: 15, queued: 25, design: 50, implementation: 65, active: 70, review: 85, done: 100, blocked: 10, waiting: 20 };
    return map[(s || '').toLowerCase()] || 35;
  };

  const priorityVariant = (p) => {
    const v = (p || '').toLowerCase();
    if (v.includes('crit')) return 'red';
    if (v.includes('high') || v.includes('haute')) return 'amber';
    return 'neutral';
  };

  const statusVariant = (s) => {
    const v = (s || '').toLowerCase();
    if (v.includes('active') || v.includes('implementation') || v.includes('design')) return 'violet';
    if (v.includes('review')) return 'amber';
    if (v.includes('done') || v.includes('complete')) return 'green';
    if (v.includes('blocked')) return 'red';
    return 'neutral';
  };

  const roleMap = {
    main: { title: 'Chief of Staff', role: 'Executive orchestrator', type: 'leader' },
    architect: { title: 'Chief Engineer', role: 'Systems architect', type: 'leader' },
    builder: { title: 'Implementation Engineer', role: 'Code execution', type: 'executor' },
    ui: { title: 'Design Engineer', role: 'Interface design', type: 'executor' },
    observer: { title: 'Operations Analyst', role: 'QA & monitoring', type: 'monitor' },
    memory: { title: 'Knowledge Manager', role: 'Memory curation', type: 'support' }
  };

  const reportingLines = {
    main: 'Reports to Nicolas · Owns architect, observer, memory',
    architect: 'Reports to main · Delegates to builder, ui',
    builder: 'Reports to architect',
    ui: 'Reports to architect',
    observer: 'Reports to main',
    memory: 'Reports to main'
  };

  const getAgentStatus = (agentName, data) => {
    const active = new Set((data.sessions || []).map((s) => s.key?.split(':')[1]));
    return active.has(agentName) ? 'Active' : 'Standby';
  };

  const getAgentFocus = (agentName, data) => {
    const task = (data.tasks || []).find((t) => t.owner && t.owner.toLowerCase() === agentName.toLowerCase());
    return task ? task.title : 'Awaiting signal';
  };

  /* ======================================================
     COMPONENT FACTORIES
     ====================================================== */

  /** Glass panel with optional accent */
  function glassPanel(title, contentEl, options = {}) {
    const panel = document.createElement('div');
    let cls = 'glass-panel';
    if (options.accent) cls += ' accent';
    if (options.accentStrong) cls += ' accent-strong';
    if (options.className) cls += ` ${options.className}`;
    panel.className = cls;

    if (title) {
      const h3 = document.createElement('h3');
      h3.innerHTML = title;
      panel.appendChild(h3);
    }

    if (typeof contentEl === 'string') {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = contentEl;
      panel.appendChild(wrapper);
    } else if (contentEl) {
      panel.appendChild(contentEl);
    }
    return panel;
  }

  /** Metric tile */
  function metricTile(value, label, variant = '') {
    const tile = document.createElement('div');
    tile.className = 'metric-tile';
    const val = document.createElement('div');
    val.className = `metric-value ${variant}`;
    val.textContent = value;
    const lbl = document.createElement('div');
    lbl.className = 'metric-label';
    lbl.textContent = label;
    tile.appendChild(val);
    tile.appendChild(lbl);
    return tile;
  }

  /** Badge pill */
  function badge(text, variant = 'neutral') {
    const span = document.createElement('span');
    span.className = `badge-pill ${variant}`;
    span.textContent = text;
    return span;
  }

  /** Status dot */
  function statusDot(variant = 'green') {
    const dot = document.createElement('span');
    dot.className = `status-dot ${variant}`;
    return dot;
  }

  /** Progress bar */
  function progressBar(percent, variant = '') {
    const track = document.createElement('div');
    track.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = `progress-fill ${variant}`;
    fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    track.appendChild(fill);
    return track;
  }

  /** Timeline list */
  function timelineList(items) {
    const ul = document.createElement('ul');
    ul.className = 'timeline-list';
    if (!items.length) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="tl-title text-dim">No entries</span>';
      ul.appendChild(li);
      return ul;
    }
    items.forEach((item) => {
      const li = document.createElement('li');
      const title = document.createElement('span');
      title.className = 'tl-title';
      title.textContent = item.title;
      li.appendChild(title);
      if (item.subtitle) {
        const sub = document.createElement('span');
        sub.className = 'tl-sub';
        sub.textContent = item.subtitle;
        li.appendChild(sub);
      }
      ul.appendChild(li);
    });
    return ul;
  }

  /** List entry */
  function listEntry(title, subtitle, badgeEl) {
    const entry = document.createElement('div');
    entry.className = 'list-entry';
    const content = document.createElement('div');
    content.className = 'entry-content';
    const t = document.createElement('span');
    t.className = 'entry-title';
    t.textContent = title;
    content.appendChild(t);
    if (subtitle) {
      const s = document.createElement('span');
      s.className = 'entry-sub';
      s.textContent = subtitle;
      content.appendChild(s);
    }
    entry.appendChild(content);
    if (badgeEl) entry.appendChild(badgeEl);
    return entry;
  }

  /* ======================================================
     PRESENCE INDICATOR
     ====================================================== */
  function updatePresence(data) {
    const count = data?.sessions?.length || 0;
    if (presenceDot) {
      presenceDot.className = count ? 'presence-dot' : 'presence-dot standby';
    }
    if (presenceLabel) {
      presenceLabel.textContent = count ? 'System Active' : 'Standby';
    }
    if (presenceDetail) {
      presenceDetail.textContent = count ? `${count} session${count > 1 ? 's' : ''}` : '';
    }
  }

  function updateMission(data) {
    if (!missionChip) return;
    const gateway = data.statusOverview?.['Gateway'] || data.statusOverview?.['Gateway service'] || '';
    const isOk = gateway.toLowerCase().includes('running') || gateway.toLowerCase().includes('ok') || !gateway;
    missionChip.textContent = isOk ? 'Operational' : 'Degraded';
    missionChip.className = isOk ? 'mission-chip' : 'mission-chip warning';
  }

  /* ======================================================
     RENDER: OVERVIEW
     ====================================================== */
  function renderOverview(data) {
    const root = document.getElementById('overview-root');
    if (!root) return;
    root.innerHTML = '';

    // Command hero
    const hero = document.createElement('div');
    hero.className = 'command-hero';
    const agents = data.agents || [];
    const tasks = data.tasks || [];
    const sessions = data.sessions || [];
    hero.innerHTML = `
      <h2>Command Summary</h2>
      <p>Main orchestrates intent · Architect outlines plans · Builder & UI execute · Observer & Memory monitor continuously.</p>
      <div class="hero-meta">
        <span><strong>${agents.length}</strong> agents registered</span>
        <span><strong>${sessions.length}</strong> active sessions</span>
        <span><strong>${tasks.length}</strong> tracked tasks</span>
        <span>Last sync: ${new Date(data.timestamp).toLocaleTimeString('en-GB')}</span>
      </div>
    `;
    root.appendChild(hero);

    // Metrics row
    const metrics = document.createElement('div');
    metrics.className = 'metric-row mb-base';
    const activeCount = sessions.length;
    const highPriority = tasks.filter(t => priorityRank(t.priority) >= 8).length;
    const mem = data.systemVitals?.memory;
    const memPct = mem ? `${mem.percent}%` : '—';
    const memVariant = mem ? (mem.percent > 85 ? 'critical' : mem.percent > 70 ? 'warning' : 'positive') : '';
    const load = data.systemVitals?.uptime?.load;

    metrics.appendChild(metricTile(String(activeCount), 'Active Sessions', activeCount > 0 ? 'positive' : ''));
    metrics.appendChild(metricTile(String(highPriority), 'High Priority', highPriority > 0 ? 'warning' : 'positive'));
    metrics.appendChild(metricTile(memPct, 'Memory Usage', memVariant));
    metrics.appendChild(metricTile(load ? load.one.toFixed(2) : '—', 'Load (1m)', ''));
    root.appendChild(metrics);

    // Three-column info section
    const grid = document.createElement('div');
    grid.className = 'grid-3 gap-md';

    // Active agents
    const agentStack = document.createElement('div');
    agentStack.className = 'list-stack';
    agents.forEach((a) => {
      const st = getAgentStatus(a.name, data);
      const focus = getAgentFocus(a.name, data);
      const entry = listEntry(
        a.name,
        `${a.attributes?.model || 'unknown'} · ${focus}`,
        badge(st, st === 'Active' ? 'green' : 'neutral')
      );
      agentStack.appendChild(entry);
    });
    grid.appendChild(glassPanel('Active Agents <span class="panel-count">' + agents.length + '</span>', agentStack));

    // Priorities
    const priItems = tasks.slice().sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority)).slice(0, 5).map(t => ({
      title: `${t.title} — ${t.owner}`,
      subtitle: `${capitalize(t.status)} · Priority: ${t.priority}`
    }));
    grid.appendChild(glassPanel('Current Priorities', timelineList(priItems)));

    // Recent activity
    const logItems = (data.logs?.lines || []).slice(0, 5).map(line => ({ title: line, subtitle: '' }));
    grid.appendChild(glassPanel('Recent Activity', timelineList(logItems)));

    root.appendChild(grid);

    // Second row
    const row2 = document.createElement('div');
    row2.className = 'grid-2 gap-md mt-base';

    // Upcoming jobs
    const cronItems = (data.cronJobs || []).map((j, i) => ({
      title: j.description,
      subtitle: `Scheduled job #${i + 1}`
    }));
    if (!cronItems.length) cronItems.push({ title: 'No cron jobs configured', subtitle: 'Configure via openclaw cron' });
    row2.appendChild(glassPanel('Scheduled Jobs', timelineList(cronItems)));

    // System snapshot
    const snapStack = document.createElement('div');
    snapStack.className = 'list-stack';
    snapStack.appendChild(listEntry('Load (1m)', load ? load.one.toFixed(2) : '—'));
    snapStack.appendChild(listEntry('Memory', mem ? `${mem.used}MB / ${mem.total}MB (${mem.percent}%)` : '—'));
    snapStack.appendChild(listEntry('Disk /', data.systemVitals?.disk?.percent || '—'));
    if (data.systemVitals?.temperature) {
      snapStack.appendChild(listEntry('CPU Temp', `${data.systemVitals.temperature}°C`));
    }
    row2.appendChild(glassPanel('System Snapshot', snapStack));

    root.appendChild(row2);
  }

  /* ======================================================
     RENDER: TASKS
     ====================================================== */
  function renderTasks(data) {
    const root = document.getElementById('tasks-root');
    if (!root) return;
    root.innerHTML = '';

    const tasks = data.tasks || [];

    // Kanban board
    const board = document.createElement('div');
    board.className = 'kanban-board mb-base';

    const columns = [
      { id: 'queued', label: 'Queued', match: (s) => /todo|queued/i.test(s) },
      { id: 'active', label: 'Active', match: (s) => /implementation|design|active/i.test(s) },
      { id: 'review', label: 'Review', match: (s) => /review|waiting/i.test(s) },
      { id: 'done', label: 'Blocked / Watch', match: (s) => /blocked|watch|done/i.test(s) }
    ];

    columns.forEach((col) => {
      const colEl = document.createElement('div');
      colEl.className = `kanban-column ${col.id}`;
      const colTasks = tasks.filter(t => col.match(t.status));

      const header = document.createElement('div');
      header.className = 'kanban-column-header';
      const h4 = document.createElement('h4');
      h4.textContent = col.label;
      const count = document.createElement('span');
      count.className = 'col-count';
      count.textContent = colTasks.length;
      header.appendChild(h4);
      header.appendChild(count);
      colEl.appendChild(header);

      colTasks.forEach((task) => {
        const card = document.createElement('div');
        card.className = 'kanban-card';

        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = task.title;
        card.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'card-meta';
        const avatar = document.createElement('span');
        avatar.className = 'card-owner';
        avatar.textContent = (task.owner || '?')[0].toUpperCase();
        const ownerName = document.createElement('span');
        ownerName.className = 'card-owner-name';
        ownerName.textContent = task.owner || 'unassigned';
        meta.appendChild(avatar);
        meta.appendChild(ownerName);
        meta.appendChild(badge(task.priority || 'normal', priorityVariant(task.priority)));
        card.appendChild(meta);

        card.appendChild(progressBar(progressFromStatus(task.status)));

        if (task.notes) {
          const notes = document.createElement('div');
          notes.className = 'card-notes';
          notes.textContent = task.notes;
          card.appendChild(notes);
        }

        colEl.appendChild(card);
      });

      board.appendChild(colEl);
    });

    root.appendChild(board);

    // Task detail section
    const detailGrid = document.createElement('div');
    detailGrid.className = 'grid-2 gap-md';

    // Focus task
    const focusTask = tasks.find(t => /high|haute|critical/i.test(t.priority));
    const focusContent = document.createElement('div');
    focusContent.className = 'stack stack-sm';
    if (focusTask) {
      focusContent.innerHTML = `
        <div class="flex-between">
          <strong>${focusTask.title}</strong>
          ${badge(capitalize(focusTask.status), statusVariant(focusTask.status)).outerHTML}
        </div>
        <span class="text-dim" style="font-size:0.78rem">${focusTask.owner} · Priority: ${focusTask.priority}</span>
        <span class="text-muted" style="font-size:0.78rem">${focusTask.notes || 'No notes'}</span>
      `;
      focusContent.appendChild(progressBar(progressFromStatus(focusTask.status)));
    } else {
      focusContent.innerHTML = '<span class="text-dim">No high-priority tasks active</span>';
    }
    detailGrid.appendChild(glassPanel('Priority Focus', focusContent, { accent: true }));

    // Recent task updates
    const updateItems = tasks.slice(0, 5).map(t => ({
      title: `${t.title} — ${t.owner}`,
      subtitle: `${capitalize(t.status)} · ${t.priority}`
    }));
    detailGrid.appendChild(glassPanel('Recent Updates', timelineList(updateItems)));

    root.appendChild(detailGrid);
  }

  /* ======================================================
     RENDER: CALENDAR
     ====================================================== */
  function renderCalendar(data) {
    const root = document.getElementById('calendar-root');
    if (!root) return;
    root.innerHTML = '';

    const cronJobs = data.cronJobs || [];
    const logs = data.logs?.lines || [];

    const grid = document.createElement('div');
    grid.className = 'grid-2 gap-md';

    // Schedule timeline
    const schedItems = cronJobs.map((j, i) => ({
      title: j.description,
      subtitle: `Scheduled position #${i + 1}`
    }));
    if (!schedItems.length) schedItems.push({ title: 'No jobs scheduled', subtitle: '' });
    grid.appendChild(glassPanel('Schedule Timeline', timelineList(schedItems), { accent: true }));

    // Upcoming / past
    const upcomingContent = document.createElement('div');
    upcomingContent.className = 'stack stack-md';

    const schedStack = document.createElement('div');
    schedStack.className = 'list-stack';
    cronJobs.forEach((j) => {
      schedStack.appendChild(listEntry(j.description, 'Scheduled', badge('pending', 'neutral')));
    });
    if (!cronJobs.length) {
      schedStack.appendChild(listEntry('No cron jobs configured', 'Configure via openclaw cron'));
    }
    upcomingContent.appendChild(schedStack);
    grid.appendChild(glassPanel('Cron Jobs', upcomingContent));

    root.appendChild(grid);

    // Recent executions
    const recentPanel = document.createElement('div');
    recentPanel.className = 'mt-base';
    const recentStack = document.createElement('div');
    recentStack.className = 'list-stack';
    const nextRun = cronJobs[0] ? cronJobs[0].description : 'None';
    const lastRun = logs[0] || 'No recent executions';
    recentStack.appendChild(listEntry('Next run', nextRun, badge('next', 'violet')));
    recentStack.appendChild(listEntry('Last logged', lastRun, badge('past', 'neutral')));
    recentPanel.appendChild(glassPanel('Execution History', recentStack));
    root.appendChild(recentPanel);
  }

  /* ======================================================
     RENDER: TEAM
     ====================================================== */
  function renderTeam(data) {
    const root = document.getElementById('team-root');
    if (!root) return;
    root.innerHTML = '';

    const agents = data.agents || [];

    // Build org chart
    const chart = document.createElement('div');
    chart.className = 'org-chart';

    const buildCard = (agent) => {
      const info = roleMap[agent.name] || { title: 'Agent', role: 'General', type: 'executor' };
      const status = getAgentStatus(agent.name, data);
      const focus = getAgentFocus(agent.name, data);

      const card = document.createElement('div');
      card.className = `agent-card${info.type === 'leader' ? ' leadership' : ''}`;

      // Header
      const header = document.createElement('div');
      header.className = 'agent-header';
      const avatar = document.createElement('div');
      avatar.className = `agent-avatar ${info.type}`;
      avatar.textContent = agent.name[0].toUpperCase();
      const nameBlock = document.createElement('div');
      const nameEl = document.createElement('span');
      nameEl.className = 'agent-name';
      nameEl.textContent = agent.name;
      const titleEl = document.createElement('span');
      titleEl.className = 'agent-title';
      titleEl.textContent = info.title;
      nameBlock.appendChild(nameEl);
      nameBlock.appendChild(titleEl);
      header.appendChild(avatar);
      header.appendChild(nameBlock);
      header.appendChild(statusDot(status === 'Active' ? 'green' : 'amber'));
      card.appendChild(header);

      // Details
      const details = [
        { label: 'Role', value: info.role },
        { label: 'Model', value: agent.attributes?.model || 'unknown' },
        { label: 'Status', value: status },
        { label: 'Focus', value: focus },
        { label: 'Reports', value: reportingLines[agent.name] || 'Reports to main' }
      ];

      details.forEach((d) => {
        const row = document.createElement('div');
        row.className = 'agent-detail-row';
        const lbl = document.createElement('span');
        lbl.className = 'detail-label';
        lbl.textContent = d.label;
        const val = document.createElement('span');
        val.className = 'detail-value';
        val.textContent = d.value;
        row.appendChild(lbl);
        row.appendChild(val);
        card.appendChild(row);
      });

      return card;
    };

    // Tier: main
    const mainAgent = agents.find(a => a.name === 'main');
    if (mainAgent) {
      const tier1 = document.createElement('div');
      tier1.className = 'org-tier';
      tier1.appendChild(buildCard(mainAgent));
      chart.appendChild(tier1);
    }

    // Tier: architect, observer, memory
    const tier2Names = ['architect', 'observer', 'memory'];
    const tier2Agents = tier2Names.map(n => agents.find(a => a.name === n)).filter(Boolean);
    if (tier2Agents.length) {
      const tier2 = document.createElement('div');
      tier2.className = 'org-tier';
      tier2Agents.forEach(a => {
        const wrapper = document.createElement('div');
        wrapper.className = 'org-connector';
        wrapper.appendChild(buildCard(a));
        tier2.appendChild(wrapper);
      });
      chart.appendChild(tier2);
    }

    // Tier: builder, ui
    const tier3Names = ['builder', 'ui'];
    const tier3Agents = tier3Names.map(n => agents.find(a => a.name === n)).filter(Boolean);
    if (tier3Agents.length) {
      const tier3 = document.createElement('div');
      tier3.className = 'org-tier';
      tier3Agents.forEach(a => {
        const wrapper = document.createElement('div');
        wrapper.className = 'org-connector';
        wrapper.appendChild(buildCard(a));
        tier3.appendChild(wrapper);
      });
      chart.appendChild(tier3);
    }

    // Any remaining agents
    const covered = new Set([...tier2Names, ...tier3Names, 'main']);
    const remaining = agents.filter(a => !covered.has(a.name));
    if (remaining.length) {
      const tierExtra = document.createElement('div');
      tierExtra.className = 'org-tier';
      remaining.forEach(a => {
        const wrapper = document.createElement('div');
        wrapper.className = 'org-connector';
        wrapper.appendChild(buildCard(a));
        tierExtra.appendChild(wrapper);
      });
      chart.appendChild(tierExtra);
    }

    root.appendChild(chart);

    // Reporting summary
    const summaryGrid = document.createElement('div');
    summaryGrid.className = 'grid-2 gap-md mt-xl';
    summaryGrid.appendChild(glassPanel('Reporting Lines', '<p style="font-size:0.82rem;color:var(--text-secondary);line-height:1.6">Main → architect / observer / memory<br>Architect → builder & UI<br>Observer & memory remain advisory to main.</p>'));
    summaryGrid.appendChild(glassPanel('Delegation Model', '<p style="font-size:0.82rem;color:var(--text-secondary);line-height:1.6">Architect funnels engineering tasks to builder & UI.<br>Observer maintains quality oversight.<br>Memory ensures continuity across sessions.</p>'));
    root.appendChild(summaryGrid);
  }

  /* ======================================================
     RENDER: OFFICE
     ====================================================== */
  function renderOffice(data) {
    const root = document.getElementById('office-root');
    if (!root) return;
    root.innerHTML = '';

    const agents = data.agents || [];
    const sessionAgents = new Set((data.sessions || []).map(s => s.key?.split(':')[1]));

    const grid = document.createElement('div');
    grid.className = 'workspace-grid';

    agents.forEach((agent) => {
      const isActive = sessionAgents.has(agent.name);
      const info = roleMap[agent.name] || { title: 'Agent', role: 'General', type: 'executor' };
      const focus = getAgentFocus(agent.name, data);

      const block = document.createElement('div');
      block.className = `workspace-block${isActive ? ' active-work' : ''}`;

      // Activity pulse
      const pulse = document.createElement('span');
      pulse.className = `ws-pulse${isActive ? '' : ' idle'}`;
      block.appendChild(pulse);

      // Header
      const header = document.createElement('div');
      header.className = 'ws-header';
      const name = document.createElement('span');
      name.className = 'ws-agent';
      name.textContent = agent.name;
      const statusEl = document.createElement('span');
      statusEl.className = 'ws-status';
      statusEl.appendChild(statusDot(isActive ? 'green' : 'amber'));
      const statusText = document.createElement('span');
      statusText.textContent = isActive ? 'Working' : 'Standby';
      statusText.style.color = isActive ? 'var(--green)' : 'var(--text-tertiary)';
      statusEl.appendChild(statusText);
      header.appendChild(name);
      header.appendChild(statusEl);
      block.appendChild(header);

      // Body
      const body = document.createElement('div');
      body.className = 'ws-body';

      const rows = [
        { label: 'Role', value: info.title },
        { label: 'Model', value: agent.attributes?.model || 'unknown' },
        { label: 'Focus', value: focus },
        { label: 'Type', value: capitalize(info.type) }
      ];

      rows.forEach(r => {
        const row = document.createElement('div');
        row.className = 'ws-row';
        const lbl = document.createElement('span');
        lbl.className = 'ws-label';
        lbl.textContent = r.label;
        const val = document.createElement('span');
        val.className = 'ws-value';
        val.textContent = r.value;
        row.appendChild(lbl);
        row.appendChild(val);
        body.appendChild(row);
      });

      block.appendChild(body);
      grid.appendChild(block);
    });

    root.appendChild(grid);
  }

  /* ======================================================
     RENDER: MEMORY
     ====================================================== */
  function renderMemory(data) {
    const root = document.getElementById('memory-root');
    if (!root) return;
    root.innerHTML = '';

    const entries = data.memoryEntries || [];

    if (!entries.length) {
      root.appendChild(glassPanel('Memory Store', '<p class="text-dim" style="font-size:0.82rem">No memory entries recorded yet.</p>'));
      return;
    }

    // Category summary
    const categories = entries.reduce((acc, e) => {
      const parts = e.name.split(/[/\\]/);
      const cat = parts.length > 1 ? parts[0] : 'root';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const catRow = document.createElement('div');
    catRow.className = 'memory-categories mb-base';
    Object.entries(categories).forEach(([cat, count]) => {
      catRow.appendChild(badge(`${cat}: ${count}`, 'violet'));
    });
    const catPanel = glassPanel(`Memory Categories <span class="panel-count">${entries.length} entries</span>`, catRow);
    root.appendChild(catPanel);

    // Memory cards grid
    const grid = document.createElement('div');
    grid.className = 'memory-grid';

    entries.forEach((entry) => {
      const card = document.createElement('div');
      card.className = 'memory-card';

      const h4 = document.createElement('h4');
      h4.textContent = entry.name;
      card.appendChild(h4);

      const time = document.createElement('span');
      time.className = 'memory-time';
      time.textContent = `Updated: ${new Date(entry.updatedAt).toLocaleString()}`;
      card.appendChild(time);

      const snippet = document.createElement('p');
      snippet.className = 'memory-snippet';
      snippet.textContent = entry.snippet;
      card.appendChild(snippet);

      grid.appendChild(card);
    });

    root.appendChild(grid);
  }

  /* ======================================================
     RENDER: SYSTEM
     ====================================================== */
  function renderSystem(data) {
    const root = document.getElementById('system-root');
    if (!root) return;
    root.innerHTML = '';

    const vitals = data.systemVitals || {};
    const service = data.serviceStatus || {};

    // Vitals grid
    const grid = document.createElement('div');
    grid.className = 'vitals-grid mb-base';

    const load = vitals.uptime?.load;
    if (load) {
      [{ key: 'one', label: 'Load 1m' }, { key: 'five', label: 'Load 5m' }, { key: 'fifteen', label: 'Load 15m' }].forEach(l => {
        const card = document.createElement('div');
        card.className = 'vital-card';
        const header = document.createElement('div');
        header.className = 'vital-header';
        const lbl = document.createElement('span');
        lbl.className = 'vital-label';
        lbl.textContent = l.label;
        header.appendChild(lbl);
        header.appendChild(statusDot(load[l.key] < 2 ? 'green' : load[l.key] < 4 ? 'amber' : 'red'));
        card.appendChild(header);
        const val = document.createElement('div');
        val.className = 'vital-value';
        val.textContent = load[l.key].toFixed(2);
        card.appendChild(val);
        grid.appendChild(card);
      });
    }

    if (vitals.memory) {
      const memCard = document.createElement('div');
      memCard.className = 'vital-card';
      const mh = document.createElement('div');
      mh.className = 'vital-header';
      const ml = document.createElement('span');
      ml.className = 'vital-label';
      ml.textContent = 'Memory';
      mh.appendChild(ml);
      mh.appendChild(statusDot(vitals.memory.percent < 70 ? 'green' : vitals.memory.percent < 85 ? 'amber' : 'red'));
      memCard.appendChild(mh);
      const mv = document.createElement('div');
      mv.className = 'vital-value';
      mv.textContent = `${vitals.memory.percent}%`;
      memCard.appendChild(mv);
      const md = document.createElement('span');
      md.className = 'vital-detail';
      md.textContent = `${vitals.memory.used}MB / ${vitals.memory.total}MB`;
      memCard.appendChild(md);
      memCard.appendChild(progressBar(vitals.memory.percent, vitals.memory.percent > 85 ? 'red' : vitals.memory.percent > 70 ? 'amber' : 'green'));
      grid.appendChild(memCard);
    }

    if (vitals.disk) {
      const diskCard = document.createElement('div');
      diskCard.className = 'vital-card';
      const dh = document.createElement('div');
      dh.className = 'vital-header';
      const dl = document.createElement('span');
      dl.className = 'vital-label';
      dl.textContent = 'Disk /';
      dh.appendChild(dl);
      diskCard.appendChild(dh);
      const dv = document.createElement('div');
      dv.className = 'vital-value';
      dv.textContent = vitals.disk.percent || '—';
      diskCard.appendChild(dv);
      const dd = document.createElement('span');
      dd.className = 'vital-detail';
      dd.textContent = `${vitals.disk.used} / ${vitals.disk.size}`;
      diskCard.appendChild(dd);
      grid.appendChild(diskCard);
    }

    if (vitals.temperature) {
      const tempCard = document.createElement('div');
      tempCard.className = 'vital-card';
      const th = document.createElement('div');
      th.className = 'vital-header';
      const tl = document.createElement('span');
      tl.className = 'vital-label';
      tl.textContent = 'CPU Temperature';
      th.appendChild(tl);
      const tempVal = parseFloat(vitals.temperature);
      th.appendChild(statusDot(tempVal < 60 ? 'green' : tempVal < 75 ? 'amber' : 'red'));
      tempCard.appendChild(th);
      const tv = document.createElement('div');
      tv.className = 'vital-value';
      tv.textContent = `${vitals.temperature}°C`;
      tempCard.appendChild(tv);
      grid.appendChild(tempCard);
    }

    root.appendChild(grid);

    // Service status
    const serviceGrid = document.createElement('div');
    serviceGrid.className = 'grid-2 gap-md';

    const serviceStack = document.createElement('div');
    serviceStack.className = 'list-stack';
    serviceStack.appendChild(listEntry('OpenClaw Service', service.activeState || 'unknown', badge(service.activeState?.includes('running') ? 'running' : 'stopped', service.activeState?.includes('running') ? 'green' : 'red')));
    serviceGrid.appendChild(glassPanel('Service Health', serviceStack));

    const gatewayText = data.statusOverview?.['Gateway'] || data.statusOverview?.['Gateway service'] || 'Gateway data unavailable';
    serviceGrid.appendChild(glassPanel('Gateway Posture', `<p style="font-size:0.82rem;color:var(--text-secondary)">${gatewayText}</p>`));

    root.appendChild(serviceGrid);
  }

  /* ======================================================
     RENDER: ACTIVITY
     ====================================================== */
  function renderActivity(data) {
    const root = document.getElementById('activity-root');
    if (!root) return;
    root.innerHTML = '';

    const logs = data.logs?.lines || [];
    const tasks = data.tasks || [];

    // Event stream
    const streamPanel = document.createElement('div');
    const streamHeader = document.createElement('div');
    streamHeader.className = 'flex-between mb-md';
    streamHeader.innerHTML = `<h3 style="font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-secondary);margin:0;">Runtime Event Stream</h3>`;
    streamHeader.appendChild(badge('live', 'green'));

    const stream = document.createElement('div');
    stream.className = 'event-stream';

    logs.slice(0, 10).forEach((line, i) => {
      const item = document.createElement('div');
      item.className = 'event-item';

      const time = document.createElement('span');
      time.className = 'event-time';
      // Try to extract timestamp from line
      const timeMatch = line.match(/\d{2}:\d{2}:\d{2}/);
      time.textContent = timeMatch ? timeMatch[0] : `#${i + 1}`;

      const body = document.createElement('div');
      body.className = 'event-body';
      const text = document.createElement('strong');
      text.textContent = line;
      body.appendChild(text);

      item.appendChild(time);
      item.appendChild(body);
      stream.appendChild(item);
    });

    streamPanel.appendChild(streamHeader);
    streamPanel.appendChild(stream);
    const eventPanel = glassPanel(null, streamPanel);
    root.appendChild(eventPanel);

    // Bottom row
    const bottomGrid = document.createElement('div');
    bottomGrid.className = 'grid-2 gap-md mt-base';

    // Task changes
    const taskItems = tasks.slice(0, 5).map(t => ({
      title: t.title,
      subtitle: `${t.owner} · ${capitalize(t.status)}`
    }));
    bottomGrid.appendChild(glassPanel('Task Changes', timelineList(taskItems)));

    // Signals
    const signalStack = document.createElement('div');
    signalStack.className = 'list-stack';
    signalStack.appendChild(listEntry('Agent sync', `${(data.sessions || []).length} sessions`, badge('status', 'violet')));
    signalStack.appendChild(listEntry('Cron queue', `${(data.cronJobs || []).length} jobs`, badge('queued', 'neutral')));
    signalStack.appendChild(listEntry('Memory entries', `${(data.memoryEntries || []).length} records`, badge('stored', 'cyan')));
    bottomGrid.appendChild(glassPanel('Signals & Events', signalStack));

    root.appendChild(bottomGrid);
  }

  /* ======================================================
     RENDER DISPATCHER
     ====================================================== */
  function renderModule(name, data) {
    switch (name) {
      case 'overview': renderOverview(data); break;
      case 'tasks': renderTasks(data); break;
      case 'calendar': renderCalendar(data); break;
      case 'team': renderTeam(data); break;
      case 'office': renderOffice(data); break;
      case 'memory': renderMemory(data); break;
      case 'system': renderSystem(data); break;
      case 'activity': renderActivity(data); break;
    }
  }

  function renderAllModules(data) {
    renderOverview(data);
    renderTasks(data);
    renderCalendar(data);
    renderTeam(data);
    renderOffice(data);
    renderMemory(data);
    renderSystem(data);
    renderActivity(data);
    updatePresence(data);
    updateMission(data);
  }

  /* ======================================================
     DATA FETCHING
     ====================================================== */
  async function fetchData() {
    try {
      const response = await fetch('/api/data');
      if (!response.ok) throw new Error('Unable to fetch mission data');
      const payload = await response.json();
      latestData = payload;
      renderAllModules(payload);
    } catch (error) {
      console.error('Data fetch failed:', error);
    }
  }

  /* ======================================================
     INIT
     ====================================================== */
  updateClock();
  setInterval(updateClock, 1000);
  fetchData();
  setInterval(fetchData, 10000);
  activateModule(activeModule);
});
