// PR agent definitions for GitHub PR search queries.
//
// Detection patterns for PRs differ from commits. Agents that operate as GitHub
// Apps (bots) are the PR *author*, so we use "author:bot[bot]". Agents that
// commit under the human's identity but create branches with a known prefix
// are detected via "head:prefix/" which matches the PR's head branch name.
//
// Some agents (Aider, Amp, Windsurf, Cline) rarely create PRs in meaningful
// numbers (<10/day) and are omitted.

export interface PRAgent {
  name: string; // display name
  key: string; // CSV identifier
  query: string; // GitHub search query fragment (appended to "is:pr created:DATE")
}

export const PR_AGENTS: PRAgent[] = [
  // Claude Code creates branches named "claude/..." when opening PRs.
  // The head: qualifier matches the PR's head (source) branch name.
  { name: "Claude Code", key: "claude", query: "head:claude/" },

  // Codex CLI creates branches named "codex/..." when opening PRs.
  // The bot (chatgpt-codex-connector[bot]) doesn't create PRs — only commits.
  // This captures the much larger CLI user base whose commits lack markers.
  { name: "OpenAI Codex", key: "codex", query: "head:codex/" },

  // GitHub App bot — the PR author is copilot-swe-agent[bot].
  { name: "GitHub Copilot", key: "copilot", query: "author:copilot-swe-agent[bot]" },

  // Cursor Background Agent creates branches named "cursor/...".
  { name: "Cursor", key: "cursor", query: "head:cursor/" },

  // GitHub App bot — the PR author is devin-ai-integration[bot].
  { name: "Devin AI", key: "devin", query: "author:devin-ai-integration[bot]" },

  // GitHub App bot — the PR author is google-labs-jules[bot].
  { name: "Google Jules", key: "jules", query: "author:google-labs-jules[bot]" },

  // GitHub App bot — the PR author is amazon-q-developer[bot].
  { name: "Amazon Q", key: "amazonq", query: "author:amazon-q-developer[bot]" },

  // OpenCode creates branches named "opencode/..." when opening PRs.
  { name: "OpenCode", key: "opencode", query: "head:opencode/" },
];
