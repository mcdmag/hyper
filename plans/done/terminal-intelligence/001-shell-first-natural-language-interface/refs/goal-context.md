---
schemaVersion: 1
sourceTool: cue_commit_plan
topic: 001-shell-first-natural-language-interface
producedAt: 2026-07-21T23:30:21.869Z
---

## Original Goal

i want to support natural language interface for the hyper. i.e. user will just type -> commit the changes and create a pr. then terminal will execute the appropriate commands asking user approval. this will use ai if the text type by user is not a valid terminal commands. if there are multiple command choices, user is presented with options. i want ai not interfering with execution speed when its a valid command, so we need to reverse the exec order. any text user entered will be treated as the original hyper does. if it shows error that its not a valid command, then ai will kickin and interpret it as NLI natural language interface. allow codex oauth to provide the ai.

## Grill-Me Conversation

(no grill-me / Socratic dialogue was conducted)

## AI Restatement

# Clarified intent

Build a natural-language fallback inside Hyper where shell execution always happens first. Valid terminal commands must keep current latency and behavior. Only a genuine unresolved command lookup may invoke AI. Codex/ChatGPT OAuth supplies the model through the official Codex app-server; Codex only proposes exact command choices and cannot execute tools. The user chooses/edits/rejects and explicitly approves before Hyper writes the accepted command through the original terminal PTY. The feature must be per-session, private, accessible, safe against stale/replayed proposals, robust to auth/offline errors, and packaged without a second visible terminal. The initial truthful automatic adapter supports PowerShell 5.1/7; unsupported shells remain untouched for semantic correctness.
