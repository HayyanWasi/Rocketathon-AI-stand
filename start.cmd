@echo off
cd /d "%~dp0"
if not exist node_modules call npm.cmd ci --cache .npm-cache
rem Sir Mahad's cloned voice (falls back to eSpeak if this window is closed)
if exist voice-service\models\ur_PK-sirmahad-medium.onnx start "Sir Mahad voice" /min python voice-service\server.py
node server.mjs
