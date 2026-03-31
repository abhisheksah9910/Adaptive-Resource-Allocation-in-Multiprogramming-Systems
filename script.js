/**
 * Adaptive OS Kernel Simulator - Pro Architecture
 * Implements strict separation of concerns (Abstraction Layers)
 */

// ==========================================
// 1. Data Models (The PCB)
// ==========================================
class Process {
    constructor(id, burst, memory, color) {
        this.id = id;
        this.burst = burst;
        this.remaining = burst;
        this.memory = memory;
        
        // State Management
        this.state = "NEW"; 
        this.queue = 1; // All start in Q1
        this.quantumUsed = 0;
        
        // Telemetry Metrics (Real Systems Engineering)
        this.arrivalTime = SystemClock.time;
        this.firstRunTime = null; 
        this.completionTime = null; 
        this.waitTime = 0; 
        
        this.color = color;
    }
}

// ==========================================
// 2. Hardware Simulation Layers
// ==========================================
const SystemClock = {
    time: 0,
    tick: function() { this.time++; }
};

class MemoryManager {
    constructor(totalMB, blockSizeMB) {
        this.TOTAL_MEMORY = totalMB;
        this.BLOCK_SIZE = blockSizeMB;
        this.NUM_BLOCKS = totalMB / blockSizeMB;
        this.map = Array.from({ length: this.NUM_BLOCKS }, (_, i) => ({ processId: null, index: i }));
    }

    getUsedMemory() {
        return this.map.filter(b => b.processId !== null).length * this.BLOCK_SIZE;
    }

    allocate(process) {
        let blocksNeeded = Math.ceil(process.memory / this.BLOCK_SIZE);
        let startBlock = -1, contiguous = 0;

        for (let j = 0; j < this.NUM_BLOCKS; j++) {
            if (this.map[j].processId === null) {
                contiguous++;
                if (contiguous === blocksNeeded) { 
                    startBlock = j - blocksNeeded + 1; 
                    break; 
                }
            } else { contiguous = 0; }
        }

        if (startBlock !== -1) {
            for (let j = startBlock; j < startBlock + blocksNeeded; j++) {
                this.map[j].processId = process.id;
            }
            return true; 
        }
        return false; 
    }

    deallocate(pid) {
        let freed = 0;
        this.map.forEach(b => { 
            if (b.processId === pid) { b.processId = null; freed++; } 
        });
        return freed * this.BLOCK_SIZE;
    }
}

class Scheduler {
    constructor() {
        this.Q1 = []; // RR, quantum 2
        this.Q2 = []; // RR, quantum 4
        this.Q3 = []; // FCFS
        this.diskSwap = []; 
    }

    addProcessToSwap(process) {
        this.diskSwap.push(process);
        process.state = "SWAP";
    }

    killProcess(pid) {
        this.Q1 = this.Q1.filter(p => p.id !== pid);
        this.Q2 = this.Q2.filter(p => p.id !== pid);
        this.Q3 = this.Q3.filter(p => p.id !== pid);
        this.diskSwap = this.diskSwap.filter(p => p.id !== pid);
    }

    pageInWaitingProcesses(memoryManager, logger) {
        for (let i = this.diskSwap.length - 1; i >= 0; i--) {
            let p = this.diskSwap[i];
            if (memoryManager.allocate(p)) {
                this.diskSwap.splice(i, 1);
                p.state = "READY";
                
                if(p.queue === 1) this.Q1.push(p);
                else if(p.queue === 2) this.Q2.push(p);
                else this.Q3.push(p);
                
                logger.log(`Memory Manager: Paged in ${p.id} to Q${p.queue}.`, "info");
            }
        }
    }

    getNextProcessToRun() {
        if (this.Q1.length > 0) return this.Q1[0];
        if (this.Q2.length > 0) return this.Q2[0];
        if (this.Q3.length > 0) return this.Q3[0];
        return null;
    }

    handleContextSwitchingAndAging(logger, uiController) {
        // 1. Demotion (CPU Load Balancing)
        [this.Q1, this.Q2].forEach((queue, index) => {
            if (queue.length > 0) {
                let p = queue[0];
                let maxQuantum = (index === 0) ? 2 : 4;
                
                if (p.state === "RUNNING" && p.quantumUsed >= maxQuantum) {
                    p.state = "READY"; 
                    p.quantumUsed = 0; 
                    p.queue++; 
                    let demoted = queue.shift();
                    
                    if (p.queue === 2) this.Q2.push(demoted); 
                    else this.Q3.push(demoted);
                    
                    // Trigger your exact UI strings
                    logger.log(`Preemption: ${p.id} quantum expired. Demoted to Q${p.queue}.`, "warn");
                    logger.log(`AI Decision: Reducing CPU load for process ${p.id}`, "ai");
                    uiController.updateAutoProtection("Reducing low priority processes", "Balancing CPU load", "#fbbf24");
                }
            }
        });

        // 2. Aging (Starvation Prevention)
        [this.Q1, this.Q2, this.Q3].forEach(queue => { queue.forEach(p => { if(p.state === "READY") p.waitTime++; }); });

        for (let i = this.Q3.length - 1; i >= 0; i--) {
            let p = this.Q3[i];
            if (p.waitTime > 10) { 
                p.waitTime = 0; 
                p.queue = 1;
                this.Q1.push(this.Q3.splice(i, 1)[0]);
                
                // Trigger your exact UI strings
                logger.log(`Aging Active: ${p.id} starved in Q3. Promoted to Q1.`, "warn");
                logger.log(`AI Decision: Boosting high priority process ${p.id}`, "ai");
                uiController.updateAutoProtection("Anti-Starvation Protocol Active", `Boosting priority for ${p.id}`, "#38bdf8");
            }
        }
    }
}

// ==========================================
// 3. System Utilities (Logging & Telemetry)
// ==========================================
class Logger {
    constructor(logsElement) {
        this.logsEl = logsElement;
    }

    log(msg, type = "info") {
        let prefix = `[${SystemClock.time.toString().padStart(4, '0')}] `;
        if (type === "ai") {
            this.logsEl.innerHTML += `<span class="ai-log">🧠 ${prefix}${msg}</span><br>`;
        } else {
            this.logsEl.innerHTML += `<span style="color:${type === 'warn' ? '#fbbf24' : type === 'crit' ? '#ef4444' : '#4ade80'}">${prefix}${msg}</span><br>`;
        }
        this.logsEl.scrollTop = this.logsEl.scrollHeight;
    }

    clear() { this.logsEl.innerHTML = ""; }
}

class TelemetryEngine {
    static generateReport(allProcesses, logger) {
        let completed = allProcesses.filter(p => p.state === "FINISHED");
        if(completed.length === 0) return;

        let totalTurnaround = 0, totalWait = 0, totalResponse = 0;
        completed.forEach(p => {
            totalTurnaround += (p.completionTime - p.arrivalTime);
            totalWait += p.waitTime;
            totalResponse += (p.firstRunTime !== null ? p.firstRunTime - p.arrivalTime : 0);
        });

        logger.log(`--- SIMULATION TELEMETRY REPORT ---`, "ai");
        logger.log(`Avg Turnaround Time: ${(totalTurnaround / completed.length).toFixed(2)} ticks`, "info");
        logger.log(`Avg Waiting Time: ${(totalWait / completed.length).toFixed(2)} ticks`, "info");
        logger.log(`Avg Response Time: ${(totalResponse / completed.length).toFixed(2)} ticks`, "info");
        logger.log(`-----------------------------------`, "ai");
    }
}

// ==========================================
// 4. UI Rendering Engine
// ==========================================
class UIController {
    constructor() {
        this.chart = null;
        this.colors = ["#38bdf8", "#fbbf24", "#ef4444", "#a855f7", "#ec4899", "#14b8a6"];
    }

    initChart() {
        if (this.chart) this.chart.destroy();
        const ctx = document.getElementById("chart").getContext("2d");
        this.chart = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [{ label: "RAM Used (MB)", data: [], borderColor: "#10b981", fill: true, backgroundColor: "rgba(16, 185, 129, 0.1)", tension: 0.2 }] },
            options: { animation: false, responsive: true, maintainAspectRatio: false, scales: { y: { max: 1024, min: 0 } } }
        });
    }

    updateChart(usedRamMB) {
        if (!this.chart) return; 
        this.chart.data.labels.push(SystemClock.time);
        this.chart.data.datasets[0].data.push(usedRamMB);
        if(this.chart.data.labels.length > 25) { 
            this.chart.data.labels.shift(); 
            this.chart.data.datasets[0].data.shift(); 
        }
        this.chart.update();
    }

    updateAutoProtection(action1, action2, color) {
        const a1 = document.getElementById("ap-action1");
        const a2 = document.getElementById("ap-action2");
        a1.innerText = action1;
        a2.innerText = action2;
        a1.style.color = color;
    }

    render(kernel) {
        document.getElementById("q1-visual").innerHTML = kernel.scheduler.Q1.map(p => `<div class="q-block" style="background:${p.color}">${p.id}</div>`).join('');
        document.getElementById("q2-visual").innerHTML = kernel.scheduler.Q2.map(p => `<div class="q-block" style="background:${p.color}">${p.id}</div>`).join('');
        document.getElementById("q3-visual").innerHTML = kernel.scheduler.Q3.map(p => `<div class="q-block" style="background:${p.color}">${p.id}</div>`).join('');

        const memContainer = document.getElementById("memory-map-container");
        memContainer.innerHTML = "";
        kernel.memoryManager.map.forEach(b => {
            let div = document.createElement("div");
            div.className = "mem-block";
            if (b.processId) {
                let p = kernel.allProcesses.find(x => x.id === b.processId);
                div.classList.add("occupied");
                div.style.backgroundColor = p ? p.color : "#666";
                div.innerText = b.processId;
            }
            memContainer.appendChild(div);
        });

        let usedRam = kernel.memoryManager.getUsedMemory();
        document.getElementById("ram-usage").innerText = usedRam;
        document.getElementById("swap-usage").innerText = kernel.scheduler.diskSwap.length;
        document.getElementById("sys-time").innerText = SystemClock.time;

        const t = document.getElementById("ptable");
        t.innerHTML = "<tr><th>PID</th><th>Rem. Burst</th><th>RAM (MB)</th><th>Queue</th><th>Status</th><th>Action</th></tr>";
        kernel.allProcesses.forEach(p => {
            let tr = t.insertRow();
            let tagClass = p.state === "RUNNING" ? "running" : p.state === "READY" ? "ready" : p.state === "SWAP" ? "waiting" : "finished";
            tr.innerHTML = `
                <td><strong style="color:${p.color}">${p.id}</strong></td>
                <td>${p.remaining} / ${p.burst}</td>
                <td>${p.memory}</td>
                <td>Q${p.queue}</td>
                <td><span class="status-tag ${tagClass}">${p.state}</span></td>
                <td><button class="btn-delete" onclick="deleteProcess('${p.id}')">Kill</button></td>
            `;
        });
    }

    drawGantt(pid, color) {
        let g = document.getElementById("gantt");
        let div = document.createElement("div");
        div.className = "gantt-block";
        if (pid !== "IDLE") {
           div.classList.add("active");
           div.style.backgroundColor = color;
        }
        div.innerText = pid;
        g.appendChild(div);
        if(g.children.length > 20) g.removeChild(g.firstChild);
    }
}

// ==========================================
// 5. The Kernel (Main Controller)
// ==========================================
class Kernel {
    constructor() {
        this.memoryManager = new MemoryManager(1024, 64);
        this.scheduler = new Scheduler();
        this.logger = new Logger(document.getElementById("logs"));
        this.ui = new UIController();
        
        this.allProcesses = [];
        this.isRunning = false;
        this.simulationInterval = null;
    }

    addProcessFromUI() {
        const pidInput = document.getElementById("pid").value;
        const pid = pidInput || `P${this.allProcesses.length + 1}`;
        const burst = parseInt(document.getElementById("burst").value);
        const mem = parseInt(document.getElementById("memory").value);

        if (burst <= 0 || mem <= 0) return alert("Invalid CPU or Memory inputs.");

        let color = this.ui.colors[this.allProcesses.length % this.ui.colors.length];
        let newProcess = new Process(pid, burst, mem, color);

        this.allProcesses.push(newProcess);
        this.scheduler.addProcessToSwap(newProcess);
        
        this.logger.log(`Process ${newProcess.id} deployed (${mem}MB). Sent to Disk Swap.`, "info");
        this.ui.render(this);
        
        document.getElementById("pid").value = ""; 
    }

    killProcess(pid) {
        this.allProcesses = this.allProcesses.filter(p => p.id !== pid);
        this.scheduler.killProcess(pid);
        let freedMemory = this.memoryManager.deallocate(pid);

        this.logger.log(`[SIGKILL] Task ${pid} terminated by user. Freed ${freedMemory}MB.`, "crit");
        this.ui.render(this);
    }

    start() {
        if (this.isRunning || this.allProcesses.length === 0) return;
        this.isRunning = true;
        
        SystemClock.time = 0; 
        document.getElementById("gantt").innerHTML = "";
        
        document.getElementById("ap-status").innerText = "ON";
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
        if (!this.allProcesses.some(p => p.remaining > 0)) {
            this.stop();
            this.logger.log("All processes completed. System entering idle state.", "info");
            document.getElementById("ap-status").innerText = "STANDBY";
            document.getElementById("ap-status").style.color = "#94a3b8";
            this.ui.updateAutoProtection("System idle.", "Monitoring load...", "#94a3b8");
            
            // Print the new Telemetry Report!
            TelemetryEngine.generateReport(this.allProcesses, this.logger);
            return;
        }

        this.scheduler.pageInWaitingProcesses(this.memoryManager, this.logger);
        this.scheduler.handleContextSwitchingAndAging(this.logger, this.ui);

        let activeP = this.scheduler.getNextProcessToRun();

        if (activeP) {
            if (activeP.firstRunTime === null) activeP.firstRunTime = SystemClock.time;

            document.getElementById("cpu-status").innerText = `RUNNING (${activeP.id})`;
            document.getElementById("cpu-status").className = "status-indicator active";
            activeP.state = "RUNNING";
            
            activeP.remaining--;
            activeP.quantumUsed++;
            this.ui.drawGantt(activeP.id, activeP.color);
            
            if (activeP.remaining === 0) {
                activeP.state = "FINISHED";
                activeP.completionTime = SystemClock.time + 1; 
                
                if (activeP.queue === 1) this.scheduler.Q1.shift();
                else if (activeP.queue === 2) this.scheduler.Q2.shift();
                else this.scheduler.Q3.shift();
                
                let freed = this.memoryManager.deallocate(activeP.id);
                this.logger.log(`Process ${activeP.id} terminated normally. Freed ${freed}MB.`, "info");
            }
        } else {
            document.getElementById("cpu-status").innerText = "IDLE";
            document.getElementById("cpu-status").className = "status-indicator idle";
            this.ui.drawGantt("IDLE", "#334155");
        }

        this.ui.render(this);
        this.ui.updateChart(this.memoryManager.getUsedMemory());
        SystemClock.tick();
    }
}

// ==========================================
// 6. Global Setup
// ==========================================
const OS = new Kernel();
OS.ui.render(OS); 

function addProcess() { OS.addProcessFromUI(); }
function runSimulation() { OS.start(); }
function deleteProcess(pid) { OS.killProcess(pid); }
