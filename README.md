# ⚙️ Adaptive OS Kernel Simulator (Pro Edition v3.0)

🚀 **Interactive OS-level simulation of process scheduling, memory management, and adaptive CPU allocation — built for deep understanding of Operating Systems concepts.**

---

## 🌐 Live Demo

🚀 **Try the Simulator Here:**
👉 https://abhisheksah9910.github.io/Adaptive-Resource-Allocation-in-Multiprogramming-Systems/

⚡ No installation required — runs directly in your browser.

---

## 🧠 Overview

This project simulates how an operating system kernel manages:

* Process scheduling
* Memory allocation
* CPU utilization
* System performance

Unlike basic simulations, this system integrates:

* **MLFQ Scheduling**
* **Adaptive CPU Allocation**
* **Policy-based decision making**
* **Real-time telemetry & alerts**

It bridges the gap between **theoretical OS concepts** and **visual understanding**.

---

## 🔥 Features

### 🧩 CPU Scheduling (MLFQ)

* Multi-Level Feedback Queue

  * Q1 → Round Robin (q = 2)
  * Q2 → Round Robin (q = 4)
  * Q3 → FCFS
* Dynamic priority adjustment
* Starvation prevention (aging)

---

### 🧠 Adaptive CPU Allocator

* Dynamically redistributes CPU time
* Based on process priority score
* Prevents resource domination
* Improves fairness & efficiency

---

### ⚙️ Policy Engine

Detects system conditions in real-time:

* High CPU consumption
* Process starvation
* RAM pressure
* Swap delays

Generates alerts and triggers system adjustments.

---

### 💾 Memory Management

* First-Fit contiguous allocation
* Fixed block size (64 MB)
* Disk swap support
* Real-time memory visualization

---

### 📊 Visualization & UI

* 📈 RAM usage graph (Chart.js)
* 🧾 PCB Table (Process Control Block)
* 📊 CPU utilization indicators
* 🧩 Queue visualizations (Q1, Q2, Q3)
* 🧱 Memory block mapping
* 📜 Kernel logs (live terminal)
* 📉 Gantt chart (CPU execution timeline)

---

## 🛠️ Tech Stack

* **HTML5** → UI structure 
* **CSS3** → Styling & animations 
* **JavaScript (ES6)** → Core logic & simulation 
* **Chart.js** → Data visualization

---

## 📂 Project Structure

```bash
OS-Kernel-Simulator/
│
├── index.html      # UI layout
├── style.css       # Styling & animations
├── script.js       # Core simulation engine
└── README.md       # Documentation
```

---

## ▶️ How to Run Locally

1. Clone the repository:

```bash
git clone https://github.com/your-username/your-repo-name.git
```

2. Open the project folder

3. Run:

```bash
open index.html
```

Or simply double-click `index.html`

---

## 🎮 How to Use

### ➤ Add Process

* Enter:

  * Process ID
  * CPU Burst
  * Memory Requirement
* Click **Inject Process**

### ➤ Start Simulation

* Click **Initialize Boot Sequence**

### ➤ Demo Mode

* Click **Load Demo Processes**

### ➤ Controls

* Kill process manually
* Reset entire system
* Monitor system in real-time

---

## ⚙️ System Components

### 🔹 Scheduler

* Implements MLFQ
* Handles context switching
* Prevents starvation via aging

### 🔹 Memory Manager

* Allocates RAM using First-Fit
* Handles fragmentation
* Manages swap space

### 🔹 Policy Engine

* Computes priority score (0–100)
* Detects system bottlenecks
* Generates alerts

### 🔹 Adaptive Allocator

* Redistributes CPU resources periodically
* Based on system load & process priority

---

## ⚠️ Limitations

* Single-core CPU simulation
* No real parallel execution
* Simplified memory model
* No actual OS-level execution (educational simulation only)

---

## 🚀 Future Improvements

* Multi-core CPU simulation
* Virtual memory & paging
* I/O scheduling simulation
* Process dependencies
* Performance benchmarking

---

## 👨‍💻 Author

**Abhishek Kumar**

---

## ⭐ Contribution

Feel free to fork this project, improve it, or add new features.

---

## 📜 License

This project is open-source and available under the MIT License.

---
