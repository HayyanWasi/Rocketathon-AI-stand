# Quick Start & Setup Guide

This guide contains everything you need to run **Sir Mahad’s Physics Stand-In** on a fresh computer after cloning the repository.

---

## 1. System Prerequisites

Ensure you have the following installed on your operating system:

| Dependency | Minimum Version | Installation Command / Link |
|---|---|---|
| **Node.js** | `v22+` | [nodejs.org](https://nodejs.org/) or via `nvm install 22` |
| **Python** | `3.10+` | Standard system Python (comes with `python3-venv`) |
| **Ollama** | Latest | [ollama.com](https://ollama.com/download) (`curl -fsSL https://ollama.com/install.sh \| sh`) |
| **eSpeak NG** (TTS) | Latest | Linux: `sudo apt install espeak-ng`<br>macOS: `brew install espeak-ng`<br>Windows: via WSL2 or binary |

---

## 2. Clone the Repository

```bash
git clone https://github.com/HayyanWasi/Rocketathon-AI-stand.git
cd Rocketathon-AI-stand
```

---

## 3. Install Node.js Dependencies

```bash
npm ci
```

---

## 4. Install Python Dependencies (Speech-to-Text)

To avoid system Python conflicts (PEP 668 on Ubuntu 24.04+ and modern distros), set up a local virtual environment:

```bash
# 1. Create a local virtual environment
python3 -m venv .venv

# 2. Install requirements (faster-whisper)
.venv/bin/pip install -r requirements.txt

# 3. Register the virtualenv python executable for the backend
mkdir -p runtime
echo "$PWD/.venv/bin/python" > runtime/python-path.txt
```

> **Windows (PowerShell) equivalent:**
> ```powershell
> python -m venv .venv
> .venv\Scripts\pip install -r requirements.txt
> mkdir runtime -Force
> (Get-Item .venv\Scripts\python.exe).FullName | Out-File -FilePath runtime\python-path.txt -Encoding utf8 -NoNewline
> ```

---

## 5. Configure & Start the LLM (Ollama)

Ensure the Ollama service is running:
```bash
ollama serve &
```

### Choose an LLM Option

You can run **locally on CPU** (no internet needed after download) or via **Ollama Cloud**:

#### Option A: High Performance Cloud Model (Recommended for Speed & Quality)
```bash
# Pull the 120B cloud model manifest
ollama pull gpt-oss:120b-cloud

# Set it in the app configuration
echo "gpt-oss:120b-cloud" > runtime/ollama-model.txt
```

#### Option B: Lightweight Fully Offline CPU Model
```bash
# Pull a small, fast local model (~398 MB)
ollama pull qwen2.5:0.5b

# Set it in the app configuration
echo "qwen2.5:0.5b" > runtime/ollama-model.txt
```

*(For a stronger local model, pull `qwen2.5:1.5b` or `qwen2.5:3b` and update `runtime/ollama-model.txt` accordingly).*

---

## 6. Run the Application

```bash
npm start
```

You should see startup output confirming the services:
```
Sir Mahad’s Physics Stand-In · http://127.0.0.1:4317
Model: gpt-oss:120b-cloud (available)
TTS: eSpeak NG | STT: faster-whisper
```

Open your browser and navigate to:
👉 **[http://127.0.0.1:4317](http://127.0.0.1:4317)**

---

## 7. Verify the Setup (Automated Tests)

Run the backend, classroom, voice, source adapter, and isolated server contract tests:

```bash
npm test
```

The integrated version has 70 tests. The server contract test uses a temporary copy and a loopback model fixture, so it does not change real student memory or require Ollama. Passing tests do not establish real model teaching quality. See [integration notes](docs/integration.md) for the actual provider checks and known backend limitations.

---

## 8. Common Troubleshooting

### 1. `STT: unavailable` on server startup
- Verify that `runtime/python-path.txt` points to a Python binary that has `faster_whisper` installed:
  ```bash
  cat runtime/python-path.txt
  $(cat runtime/python-path.txt) -c "import faster_whisper; print('OK')"
  ```

### 2. `TTS: unavailable` on server startup
- In Windows, the existing backend's `which` check may report unavailable even with eSpeak installed. The classroom falls back to an installed browser voice. That is a generic synthetic voice, not Sir Mahad's clone.
- Make sure `espeak-ng` is in your system `$PATH`:
  ```bash
  which espeak-ng
  # If missing, install it:
  sudo apt install espeak-ng
  ```

### 3. Ollama model says `unavailable` or `404 model not found`
- Verify that the model name in `runtime/ollama-model.txt` matches one listed in `ollama list`:
  ```bash
  ollama list
  cat runtime/ollama-model.txt
  ```

### 4. Port 4317 is already in use
- Run with a custom port:
  ```bash
  PORT=5000 npm start
  ```

  PowerShell: `$env:PORT='5000'; npm start`.

### 5. Configuring a different model or endpoint

- `OLLAMA_MODEL` overrides `runtime/ollama-model.txt`; the default is `qwen2.5:0.5b`.
- `OLLAMA_HOST` must be an Ollama host supporting native `/api/chat` and `/api/tags`, not an OpenAI-compatible `/v1` base URL.
- `.env` is not automatically loaded by `npm start`. On Node 22 use `node --env-file=.env server.mjs`, or set variables in your shell.
- The current backend uses one shared device student profile under `runtime/student/`. **Start a new session** also clears that shared conversation.
