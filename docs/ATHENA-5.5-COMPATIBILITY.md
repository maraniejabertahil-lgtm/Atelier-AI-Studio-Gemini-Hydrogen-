# Athena 5.5 compatibility in Atelier

This document describes the host capabilities that are actually implemented. The uploaded `Athena 5.5.txt` remains unchanged and is loaded as the governing instruction source for cloud chat and live voice sessions.

## Available without per-session setup

- **Read / Write / Edit / Glob / Grep** — native Atelier function-call adapters backed by an isolated workspace at `data/athena-workspace`.
  - Paths are relative to that workspace; absolute paths and path traversal are rejected.
  - Symbolic links are rejected.
  - Text files are limited to 256 KB; search results are bounded.
  - These tools cannot read or modify the Atelier application source tree, server secrets, or arbitrary host files.
- **Studio skills and memory** — existing Atelier skill-router and memory tools, when their corresponding Atelier plugins are enabled.
- **Custom tools and connectors** — existing Atelier-configured tools and HTTP connectors, when mounted in the session.
- **Web search and URL context** — the existing Gemini grounding integrations, when enabled in Atelier.

## Capabilities that need additional infrastructure or configuration

| Athena capability | Why it is not silently emulated | Requirement |
| --- | --- | --- |
| Bash / shell execution | The existing terminal endpoint executes commands in the server process; it is not an isolated execution sandbox and is not safe to expose as Athena Bash. | A separately isolated container/VM runner with resource limits, workspace mounts, network policy, and per-run cleanup. |
| Browser and computer control | Atelier has no attached authenticated browser-control runtime. | A browser automation service, browser session/authentication, and explicit permission model. |
| Agent spawning and task orchestration | There is no multi-agent scheduler or durable task coordinator in the current runtime. | An orchestration service with isolated workers, task state, cancellation, and budget limits. |
| Claude Artifact publishing | Claude's private artifact hosting and runtime APIs are specific to claude.ai. | An Atelier artifact host or an explicitly connected publishing provider. |
| Cron / scheduled triggers / wakeups | The current app has no durable scheduler or worker process. | A persistent scheduler/queue and a deployment that keeps its worker available. |
| Push notifications / outbound user messages | No notification transport is configured. | A notification provider, destination identity, and user consent. |
| Claude conversation, memory, and Claude Docs tools | These are private Claude-host integrations, not generic web APIs. | The corresponding provider integration or an Atelier-native replacement. |

## Model-mode limitation

The in-browser SmolLM2 and Qwen models cannot load the 953 KB Athena instruction file or run server-side tools. Atelier labels this honestly in the local-model system context. Use a cloud Gemini model for Athena 5.5 behavior. Cloud execution still requires the existing `GEMINI_API_KEY` secret, and the full prompt must fit the selected model's actual request/context limits.

## Deployment notes

- The workspace is stored under `data/athena-workspace`. On an ephemeral host, mount `data` (or the workspace directory) to persistent storage if files must survive restarts or redeployments.
- Do not enable the existing terminal endpoint as a substitute for Bash. It is not a sandbox.
- No provider/model IDs, selectors, model settings, or existing API integrations were changed by this adaptation.
- The original `Athena 5.5.txt` file is intentionally not edited.
