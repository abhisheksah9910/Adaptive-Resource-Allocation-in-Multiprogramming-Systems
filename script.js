// ==========================================
// 1. Data Models
// ==========================================
class Process {
  constructor(id, burst, memory, color) {
    this.id       = id;
    this.burst    = burst;
    this.remaining = burst;
    this.memory   = memory;
    this.state    = "NEW";
    this.queue    = 1;
    this.quantumUsed = 0;
    this.arrivalTime    = SystemClock.time;
    this.firstRunTime   = null;
    this.completionTime = null;
    this.waitTime = 0;
    this.color    = color;
    // NEW: adaptive allocation fields
    this.allocatedCPU  = 100;   // % of CPU time budget (starts equal)
    this.cpuUsedTicks  = 0;     // ticks actually run
    this.priorityScore = 50;    // 0-100, computed by policy engine
  }
}

// ==========================================
// 2. System Clock
// ==========================================
const SystemClock = { time: 0, tick() { this.time++; } };

// ==========================================
// 3. Memory Manager (original + truncation fix)
// ==========================================
class MemoryManager {
  constructor(totalMB, blockSizeMB) {
    this.TOTAL_MEMORY = totalMB;
    this.BLOCK_SIZE   = blockSizeMB;
    this.NUM_BLOCKS   = totalMB / blockSizeMB;
    this.map = Array.from({ length: this.NUM_BLOCKS }, (_, i) => ({ processId: null, index: i }));
  }

  getUsedMemory() {
    return this.map.filter(b => b.processId !== null).length * this.BLOCK_SIZE;
  }

  allocate(process) {
    let needed = Math.ceil(process.memory / this.BLOCK_SIZE);
    let start = -1, contiguous = 0;
    for (let j = 0; j < this.NUM_BLOCKS; j++) {
      if (this.map[j].processId === null) {
        contiguous++;
        if (contiguous === needed) { start = j - needed + 1; break; }
      } else { contiguous = 0; }
    }
    if (start !== -1) {
      for (let j = start; j < start + needed; j++) this.map[j].processId = process.id;
      return true;
    }
    return false;
  }

  deallocate(pid) {
    let freed = 0;
    this.map.forEach(b => { if (b.processId === pid) { b.processId = null; freed++; } });
    return freed * this.BLOCK_SIZE;
  }
}

// ==========================================
// 4. Scheduler (original + kill fix + swap fix)
// ==========================================
class Scheduler {
  constructor() {
    this.Q1 = []; this.Q2 = []; this.Q3 = [];
    this.diskSwap = [];
  }

  addProcessToSwap(process) {
    this.diskSwap.push(process);
    process.state = "SWAP";
  }

  // FIX: kill removes from ALL queues safely and returns true if found
  killProcess(pid) {
    const before = this.Q1.length + this.Q2.length + this.Q3.length + this.diskSwap.length;
    this.Q1       = this.Q1.filter(p => p.id !== pid);
    this.Q2       = this.Q2.filter(p => p.id !== pid);
    this.Q3       = this.Q3.filter(p => p.id !== pid);
    this.diskSwap = this.diskSwap.filter(p => p.id !== pid);
    const after   = this.Q1.length + this.Q2.length + this.Q3.length + this.diskSwap.length;
    return before !== after;
  }

  // FIX: swap now tries every waiting process, not just from end
  pageInWaitingProcesses(memoryManager, logger) {
    for (let i = 0; i < this.diskSwap.length; i++) {
      let p = this.diskSwap[i];
      if (memoryManager.allocate(p)) {
        this.diskSwap.splice(i, 1);
        i--;
        p.state = "READY";
        if (p.queue === 1)      this.Q1.push(p);
        else if (p.queue === 2) this.Q2.push(p);
        else                    this.Q3.push(p);
        logger.log(`Memory Manager: Paged in ${p.id} → Q${p.queue}.`, "info");
      }
    }
  }

  getNextProcessToRun() {
    if (this.Q1.length > 0) return this.Q1[0];
    if (this.Q2.length > 0) return this.Q2[0];
    if (this.Q3.length > 0) return this.Q3[0];
    return null;
  }

  handleContextSwitchingAndAging(logger, uiCtrl) {
    // Demotion
    [this.Q1, this.Q2].forEach((queue, idx) => {
      if (queue.length === 0) return;
      let p = queue[0];
      let maxQ = idx === 0 ? 2 : 4;
      if (p.state === "RUNNING" && p.quantumUsed >= maxQ) {
        p.state = "READY"; p.quantumUsed = 0; p.queue++;
        let demoted = queue.shift();
        if (p.queue === 2) this.Q2.push(demoted);
        else               this.Q3.push(demoted);
        logger.log(`Preemption: ${p.id} quantum expired. Demoted to Q${p.queue}.`, "warn");
        logger.log(`AI Decision: Reducing CPU load for process ${p.id}`, "ai");
        uiCtrl.updateAutoProtection("Reducing low priority processes", "Balancing CPU load", "#fbbf24");
      }
    });

    // Aging — wait counter for all READY processes
    [this.Q1, this.Q2, this.Q3].forEach(q => q.forEach(p => { if (p.state === "READY") p.waitTime++; }));

    for (let i = this.Q3.length - 1; i >= 0; i--) {
      let p = this.Q3[i];
      if (p.waitTime > 10) {
        p.waitTime = 0; p.queue = 1;
        this.Q1.push(this.Q3.splice(i, 1)[0]);
        logger.log(`Aging Active: ${p.id} starved in Q3. Promoted to Q1.`, "warn");
        logger.log(`AI Decision: Boosting high priority process ${p.id}`, "ai");
        uiCtrl.updateAutoProtection("Anti-Starvation Protocol Active", `Boosting priority for ${p.id}`, "#38bdf8");
      }
    }
  }
}

// ==========================================
// 5. NEW: Policy Engine
// ==========================================
class PolicyEngine {
  constructor() {
    this.alerts = [];
  }

  // Returns priority score 0-100 for a process
  computeScore(p) {
    let score = 50;
    const pctUsed = p.burst > 0 ? ((p.burst - p.remaining) / p.burst) * 100 : 0;
    if (pctUsed >= 80)   score += 30; // near completion → high priority
    if (p.waitTime > 10) score += 20; // starving → boost
    if (p.queue === 3)   score -= 15; // already in FCFS → lower
    if (p.memory > 512)  score -= 10; // memory hog → lower priority
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // Evaluate all active processes and generate alerts
  evaluate(allProcesses, memManager, logger) {
    this.alerts = [];
    const usedRAM  = memManager.getUsedMemory();
    const pctRAM   = (usedRAM / memManager.TOTAL_MEMORY) * 100;

    // RAM pressure check
    if (usedRAM >= 768) {
      this.alerts.push({ sev: 'critical', msg: `RAM pressure: ${usedRAM} MB used (${pctRAM.toFixed(0)}%)` });
    } else if (usedRAM >= 512) {
      this.alerts.push({ sev: 'warning', msg: `High RAM usage: ${usedRAM} MB` });
    }

    allProcesses.forEach(p => {
      if (p.state === "FINISHED") return;
      p.priorityScore = this.computeScore(p);

      const pctUsed = p.burst > 0 ? ((p.burst - p.remaining) / p.burst) * 100 : 0;

      // CPU burst near exhaustion
      if (pctUsed >= 80 && p.state !== "FINISHED") {
        this.alerts.push({ sev: 'warning', msg: `${p.id}: ${pctUsed.toFixed(0)}% burst consumed` });
      }
      // Starvation
      if (p.waitTime > 10 && p.state === "READY") {
        this.alerts.push({ sev: 'critical', msg: `${p.id}: Starvation detected (wait=${p.waitTime})` });
      }
      // Swap stuck
      if (p.state === "SWAP") {
        this.alerts.push({ sev: 'info', msg: `${p.id}: Waiting in disk swap` });
      }
    });

    // Deduplicate to last 6
    this.alerts = this.alerts.slice(0, 6);
  }

  getAlerts() { return this.alerts; }
}

// ==========================================
// 6. NEW: Adaptive Allocator
// ==========================================
class AdaptiveAllocator {
  constructor() {
    this.lastRunTick = 0;
    this.INTERVAL    = 5; // ticks between reallocation passes
  }

  // Runs every INTERVAL ticks. Redistributes CPU budget based on priority score.
  reallocate(allProcesses, logger, uiCtrl, currentTick) {
    if (currentTick - this.lastRunTick < this.INTERVAL) return;
    this.lastRunTick = currentTick;

    const active = allProcesses.filter(p => p.state !== "FINISHED" && p.state !== "SWAP");
    if (active.length === 0) return;

    // Total score for proportional share
    const totalScore = active.reduce((s, p) => s + p.priorityScore, 0) || 1;

    active.forEach(p => {
      const oldAlloc = p.allocatedCPU;
      // Weighted fair share: score/total × 100 per process, capped 10–90
      p.allocatedCPU = Math.max(10, Math.min(90, Math.round((p.priorityScore / totalScore) * 100 * active.length)));

      if (Math.abs(p.allocatedCPU - oldAlloc) >= 5) {
        const dir = p.allocatedCPU > oldAlloc ? "boosted" : "throttled";
        logger.log(`Allocator: ${p.id} CPU budget ${dir} → ${p.allocatedCPU}% (score=${p.priorityScore})`, "ai");
        uiCtrl.flashRow(p.id);
      }
    });

    uiCtrl.updateAutoProtection("Reallocation pass complete", `${active.length} processes adjusted`, "#10b981");
    logger.log(`Adaptive reallocation complete. ${active.length} processes rebalanced.`, "ai");
  }
}

// ==========================================
// 7. Telemetry Engine (original)
// ==========================================
class TelemetryEngine {
  static generateReport(allProcesses, logger) {
    let completed = allProcesses.filter(p => p.state === "FINISHED");
    if (completed.length === 0) return;
    let totalTurnaround = 0, totalWait = 0, totalResponse = 0;
    completed.forEach(p => {
      totalTurnaround += (p.completionTime - p.arrivalTime);
      totalWait       += p.waitTime;
      totalResponse   += (p.firstRunTime !== null ? p.firstRunTime - p.arrivalTime : 0);
    });
    logger.log(`--- SIMULATION TELEMETRY REPORT ---`, "ai");
    logger.log(`Processes completed: ${completed.length}`, "info");
    logger.log(`Avg Turnaround Time: ${(totalTurnaround / completed.length).toFixed(2)} ticks`, "info");
    logger.log(`Avg Waiting Time:    ${(totalWait       / completed.length).toFixed(2)} ticks`, "info");
    logger.log(`Avg Response Time:   ${(totalResponse   / completed.length).toFixed(2)} ticks`, "info");
    logger.log(`-----------------------------------`, "ai");
  }
}

// ==========================================
// 8. Logger
// ==========================================
class Logger {
  constructor(el) { this.el = el; }

  log(msg, type = "info") {
    const prefix = `[${SystemClock.time.toString().padStart(4, '0')}] `;
    const colors  = { info: '#4ade80', warn: '#fbbf24', crit: '#ef4444' };
    if (type === "ai") {
      this.el.innerHTML += `<span class="ai-log">🧠 ${prefix}${msg}</span><br>`;
    } else {
      const c = colors[type] || colors.info;
      this.el.innerHTML += `<span style="color:${c}">${prefix}${msg}</span><br>`;
    }
    this.el.scrollTop = this.el.scrollHeight;
  }

  clear() { this.el.innerHTML = ""; }
}

// ==========================================
// 9. UI Controller (original + new methods)
// ==========================================
class UIController {
  constructor() {
    this.chart  = null;
    this.colors = ["#38bdf8","#fbbf24","#ef4444","#a855f7","#ec4899","#14b8a6","#f97316","#84cc16"];
  }

  initChart() {
    if (this.chart) this.chart.destroy();
    const ctx = document.getElementById("chart").getContext("2d");
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: "RAM Used (MB)", data: [],
          borderColor: "#10b981", fill: true,
          backgroundColor: "rgba(16,185,129,0.1)", tension: 0.2
        }]
      },
      options: {
        animation: false, responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { max: 1024, min: 0, ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
          x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
        }
      }
    });
  }

  updateChart(usedMB) {
    if (!this.chart) return;
    this.chart.data.labels.push(SystemClock.time);
    this.chart.data.datasets[0].data.push(usedMB);
    if (this.chart.data.labels.length > 25) {
      this.chart.data.labels.shift();
      this.chart.data.datasets[0].data.shift();
    }
    this.chart.update();
  }

  updateAutoProtection(a1, a2, color) {
    document.getElementById("ap-action1").innerText  = a1;
    document.getElementById("ap-action2").innerText  = a2;
    document.getElementById("ap-action1").style.color = color;
  }

  // NEW: flash a PCB table row after reallocation
  flashRow(pid) {
    const rows = document.querySelectorAll(`#ptable tr[data-pid="${pid}"]`);
    rows.forEach(r => {
      r.classList.remove('realloc-flash');
      void r.offsetWidth; // reflow
      r.classList.add('realloc-flash');
    });
  }

  // NEW: update bottleneck pill in header
  updateBottleneck(alerts) {
    const pill = document.getElementById("bottleneck-pill");
    const txt  = document.getElementById("bottleneck-text");
    const crits = alerts.filter(a => a.sev === 'critical').length;
    const warns = alerts.filter(a => a.sev === 'warning').length;
    if (crits > 0) {
      pill.className = 'bottleneck-pill critical';
      txt.textContent = `CRITICAL — ${crits} BOTTLENECK${crits > 1 ? 'S' : ''}`;
    } else if (warns > 0) {
      pill.className = 'bottleneck-pill warning';
      txt.textContent = `WARNING — ${warns} ALERT${warns > 1 ? 'S' : ''}`;
    } else {
      pill.className = 'bottleneck-pill normal';
      txt.textContent = 'SYSTEM NORMAL';
    }
  }

  // NEW: render policy alerts panel
  renderAlerts(alerts) {
    const box = document.getElementById("alert-panel");
    if (alerts.length === 0) {
      box.innerHTML = '<div class="no-alerts">No active alerts</div>';
      return;
    }
    box.innerHTML = alerts.map(a =>
      `<div class="alert-row ${a.sev}">
        <span class="alert-sev ${a.sev}">${a.sev.toUpperCase()}</span>
        <span style="font-size:.8rem">${a.msg}</span>
      </div>`
    ).join('');
  }

  // NEW: update sidebar CPU% gauge
  updateCPUGauge(runningCount, totalActive) {
    const pct = totalActive > 0 ? Math.round((runningCount / Math.max(totalActive, 1)) * 100) : 0;
    const fill = document.getElementById("cpu-pct-bar");
    const lbl  = document.getElementById("cpu-pct-label");
    fill.style.width = pct + '%';
    fill.style.background = pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#10b981';
    lbl.textContent = pct + '%';
  }

  render(kernel) {
    // MLFQ queue visualizers
    ["q1","q2","q3"].forEach((q, i) => {
      const queue = [kernel.scheduler.Q1, kernel.scheduler.Q2, kernel.scheduler.Q3][i];
      document.getElementById(`${q}-visual`).innerHTML =
        queue.map(p =>
          `<div class="q-block" style="background:${p.color}" title="${p.id}">${p.id.length > 7 ? p.id.slice(0,6)+'…' : p.id}</div>`
        ).join('');
    });

    // Memory map — FIX: truncate long IDs
    const memCont = document.getElementById("memory-map-container");
    memCont.innerHTML = "";
    kernel.memoryManager.map.forEach(b => {
      const div = document.createElement("div");
      div.className = "mem-block";
      if (b.processId) {
        const p = kernel.allProcesses.find(x => x.id === b.processId);
        div.classList.add("occupied");
        div.style.backgroundColor = p ? p.color : "#666";
        // FIX: show only first 4 chars to prevent overflow
        div.innerText = b.processId.slice(0, 4);
        div.title     = b.processId;
      }
      memCont.appendChild(div);
    });

    // Sidebar stats
    const usedRAM = kernel.memoryManager.getUsedMemory();
    document.getElementById("ram-usage").innerText  = usedRAM;
    document.getElementById("swap-usage").innerText = kernel.scheduler.diskSwap.length;
    document.getElementById("sys-time").innerText   = SystemClock.time;

    // PCB table — NEW columns: CPU Util, Priority Score
    const t = document.getElementById("ptable");
    t.innerHTML = `<tr>
      <th>PID</th><th>Rem. Burst</th><th>RAM (MB)</th>
      <th>Queue</th><th>Wait</th><th>CPU Util.</th>
      <th>Priority Score</th><th>Status</th><th>Action</th>
    </tr>`;

    kernel.allProcesses.forEach(p => {
      const tr = t.insertRow();
      tr.setAttribute('data-pid', p.id);

      const tagClass = {
        RUNNING:'running', READY:'ready', SWAP:'swap', FINISHED:'finished'
      }[p.state] || 'waiting';

      // CPU utilisation = burst consumed %
      const pctUsed  = p.burst > 0 ? Math.round(((p.burst - p.remaining) / p.burst) * 100) : 100;
      const barColor = pctUsed >= 80 ? '#ef4444' : pctUsed >= 50 ? '#f59e0b' : '#10b981';

      // Priority score colour
      const scoreColor = p.priorityScore >= 70 ? '#ef4444'
                       : p.priorityScore >= 50 ? '#f59e0b' : '#10b981';

      tr.innerHTML = `
        <td><strong style="color:${p.color}">${p.id}</strong></td>
        <td>${p.remaining} / ${p.burst}</td>
        <td>${p.memory}</td>
        <td>Q${p.queue}</td>
        <td>${p.waitTime}</td>
        <td>
          <div class="proc-bar-wrap">
            <div class="proc-bar-track">
              <div class="proc-bar-fill" style="width:${pctUsed}%;background:${barColor}"></div>
            </div>
            <span class="proc-bar-pct">${pctUsed}%</span>
          </div>
        </td>
        <td><span style="font-weight:700;color:${scoreColor}">${p.priorityScore}</span></td>
        <td><span class="status-tag ${tagClass}">${p.state}</span></td>
        <td><button class="btn-delete" onclick="deleteProcess('${p.id}')">Kill</button></td>
      `;
    });
  }

  drawGantt(pid, color) {
    const g   = document.getElementById("gantt");
    const div = document.createElement("div");
    div.className = "gantt-block";
    if (pid !== "IDLE") { div.classList.add("active"); div.style.backgroundColor = color; }
    div.innerText = pid !== "IDLE" ? (pid.length > 6 ? pid.slice(0,5)+'…' : pid) : "IDLE";
    g.appendChild(div);
    if (g.children.length > 24) g.removeChild(g.firstChild);
  }
}

// ==========================================
// 10. Kernel (original + new engines wired in)
// ==========================================
class Kernel {
  constructor() {
    this.memoryManager = new MemoryManager(1024, 64);
    this.scheduler     = new Scheduler();
    this.logger        = new Logger(document.getElementById("logs"));
    this.ui            = new UIController();
    this.policy        = new PolicyEngine();       // NEW
    this.allocator     = new AdaptiveAllocator();  // NEW

    this.allProcesses      = [];
    this.isRunning         = false;
    this.simulationInterval = null;
  }

  addProcessFromUI() {
    const pidVal  = document.getElementById("pid").value.trim();
    const pid     = pidVal || `P${this.allProcesses.length + 1}`;
    const burst   = parseInt(document.getElementById("burst").value);
    const mem     = parseInt(document.getElementById("memory").value);

    if (!burst || burst <= 0 || !mem || mem <= 0) {
      alert("Please enter valid CPU Burst and Memory values.");
      return;
    }

    const color = this.ui.colors[this.allProcesses.length % this.ui.colors.length];
    const proc  = new Process(pid, burst, mem, color);

    this.allProcesses.push(proc);
    this.scheduler.addProcessToSwap(proc);
    this.logger.log(`Process ${proc.id} deployed (${mem} MB, ${burst} ticks). Queued to Disk Swap.`, "info");

    document.getElementById("pid").value = "";
    this.ui.render(this);
  }

  // FIX: kill is now safe mid-simulation
  killProcess(pid) {
    const proc = this.allProcesses.find(p => p.id === pid);
    if (!proc) return;

    // If currently running at head of a queue, shift it off first
    if (proc.state === "RUNNING") {
      if      (this.scheduler.Q1[0]?.id === pid) this.scheduler.Q1.shift();
      else if (this.scheduler.Q2[0]?.id === pid) this.scheduler.Q2.shift();
      else if (this.scheduler.Q3[0]?.id === pid) this.scheduler.Q3.shift();
    }

    this.scheduler.killProcess(pid);
    const freed = this.memoryManager.deallocate(pid);
    // Mark finished instead of removing — keeps PCB history visible
    proc.state = "FINISHED";
    proc.completionTime = SystemClock.time;

    this.logger.log(`[SIGKILL] ${pid} terminated by user. Freed ${freed} MB.`, "crit");
    this.ui.render(this);
  }

  start() {
    if (this.isRunning) return;
    if (this.allProcesses.length === 0) {
      alert("No processes deployed. Use 'Load Demo Processes' or inject one manually.");
      return;
    }
    this.isRunning = true;
    document.getElementById("gantt").innerHTML = "";
    document.getElementById("ap-status").innerText   = " ON";
    document.getElementById("ap-status").style.color = "#4ade80";
    this.ui.updateAutoProtection("Monitoring queues...", "Active memory tracking.", "#4ade80");
    this.ui.initChart();
    this.logger.log("Kernel Boot Sequence Initiated...", "info");
    this.simulationInterval = setInterval(() => this.tick(), 500);
  }

  stop() {
    this.isRunning = false;
    clearInterval(this.simulationInterval);
  }

  tick() {
    // Check if all done
    if (!this.allProcesses.some(p => p.remaining > 0)) {
      this.stop();
      this.logger.log("All processes completed. System entering idle state.", "info");
      document.getElementById("ap-status").innerText   = " STANDBY";
      document.getElementById("ap-status").style.color = "#94a3b8";
      this.ui.updateAutoProtection("System idle.", "Monitoring load...", "#94a3b8");
      TelemetryEngine.generateReport(this.allProcesses, this.logger);
      return;
    }

    this.scheduler.pageInWaitingProcesses(this.memoryManager, this.logger);
    this.scheduler.handleContextSwitchingAndAging(this.logger, this.ui);

    // NEW: run policy engine every tick
    this.policy.evaluate(this.allProcesses, this.memoryManager, this.logger);

    // NEW: run adaptive allocator every INTERVAL ticks
    this.allocator.reallocate(this.allProcesses, this.logger, this.ui, SystemClock.time);

    const activeP = this.scheduler.getNextProcessToRun();

    if (activeP) {
      if (activeP.firstRunTime === null) activeP.firstRunTime = SystemClock.time;
      document.getElementById("cpu-status").innerText   = `RUNNING (${activeP.id})`;
      document.getElementById("cpu-status").className   = "status-indicator active";
      activeP.state = "RUNNING";
      activeP.remaining--;
      activeP.quantumUsed++;
      activeP.cpuUsedTicks++;
      this.ui.drawGantt(activeP.id, activeP.color);

      if (activeP.remaining === 0) {
        activeP.state = "FINISHED";
        activeP.completionTime = SystemClock.time + 1;
        if      (activeP.queue === 1) this.scheduler.Q1.shift();
        else if (activeP.queue === 2) this.scheduler.Q2.shift();
        else                          this.scheduler.Q3.shift();
        const freed = this.memoryManager.deallocate(activeP.id);
        this.logger.log(`Process ${activeP.id} completed normally. Freed ${freed} MB.`, "info");
      }
    } else {
      document.getElementById("cpu-status").innerText = "IDLE";
      document.getElementById("cpu-status").className = "status-indicator idle";
      this.ui.drawGantt("IDLE", "#334155");
    }

    // NEW: CPU gauge
    const totalActive  = this.allProcesses.filter(p => p.state !== "FINISHED").length;
    const runningCount = activeP ? 1 : 0;
    this.ui.updateCPUGauge(runningCount, totalActive);

    // NEW: bottleneck + alerts panel
    const alerts = this.policy.getAlerts();
    this.ui.updateBottleneck(alerts);
    this.ui.renderAlerts(alerts);

    this.ui.render(this);
    this.ui.updateChart(this.memoryManager.getUsedMemory());
    SystemClock.tick();
  }
}

// ==========================================
// 11. Global Setup + new helpers
// ==========================================
const OS = new Kernel();
OS.ui.render(OS);

function addProcess()    { OS.addProcessFromUI(); }
function runSimulation() { OS.start(); }

// FIX: kill is now safe
function deleteProcess(pid) { OS.killProcess(pid); }

// NEW: load demo processes so the sim has content immediately
function loadDemoProcesses() {
  if (OS.isRunning) { alert("Stop the simulation before loading demo processes."); return; }
  const demos = [
    { id: "WEB_SRV", burst: 10, mem: 128 },
    { id: "DB_PROC", burst: 16, mem: 256 },
    { id: "ML_JOB",  burst: 20, mem: 512 },
    { id: "LOG_AGT", burst: 6,  mem: 64  },
    { id: "API_GW",  burst: 12, mem: 192 },
  ];
  demos.forEach((d, i) => {
    const color = OS.ui.colors[OS.allProcesses.length % OS.ui.colors.length];
    const proc  = new Process(d.id, d.burst, d.mem, color);
    OS.allProcesses.push(proc);
    OS.scheduler.addProcessToSwap(proc);
    OS.logger.log(`Demo: ${d.id} deployed (${d.mem} MB, ${d.burst} ticks).`, "info");
  });
  OS.ui.render(OS);
}

// NEW: full reset
function resetSimulation() {
  OS.stop();
  OS.allProcesses      = [];
  OS.memoryManager     = new MemoryManager(1024, 64);
  OS.scheduler         = new Scheduler();
  OS.policy            = new PolicyEngine();
  OS.allocator         = new AdaptiveAllocator();
  SystemClock.time     = 0;

  document.getElementById("gantt").innerHTML    = "";
  document.getElementById("logs").innerHTML     = "";
  document.getElementById("ap-status").innerText   = " STANDBY";
  document.getElementById("ap-status").style.color = "#94a3b8";
  document.getElementById("bottleneck-pill").className = "bottleneck-pill normal";
  document.getElementById("bottleneck-text").textContent = "SYSTEM NORMAL";
  OS.ui.updateAutoProtection("System idle.", "Monitoring load...", "#94a3b8");
  OS.ui.updateBottleneck([]);
  OS.ui.renderAlerts([]);
  if (OS.ui.chart) { OS.ui.chart.destroy(); OS.ui.chart = null; }
  OS.ui.render(OS);
  OS.logger.log("System reset. Ready for new simulation.", "info");
}
