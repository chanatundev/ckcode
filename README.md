# CKcode

**CKcode is a fork of [T3 Code](https://github.com/pingdotgg/t3code).** Credit and thanks go to the [T3 Code contributors](https://github.com/pingdotgg/t3code/graphs/contributors) for creating and maintaining the original project.

This fork follows upstream T3 Code's nightly releases while preserving the CKcode-specific additions below. Each sync merges the newest upstream nightly and takes its version (for example `0.0.46-nightly.20261004.2648`), so the desktop app is CKcode (Nightly). Desktop SSH environments start the upstream `t3` release with that same version on the remote machine. See the [upstream README](https://github.com/pingdotgg/t3code#readme) for shared setup and documentation.

## Where edits are targeted

My setup uses a hybrid local/remote workflow tailored for multi-environment development:

- **macOS Desktop App as the primary client:** The desktop app on macOS is used as the single front-end interface for navigating projects, chatting, and directing agents.
- **Server-hosted projects for specific repositories:** Rather than hosting every repository on the server, only specific projects are hosted and managed on the remote server (running the core service in the background). Other repositories remain local on the Mac.
- **Remote core execution:** For server-managed repositories, the core backend (`t3 serve` / background service) runs directly on the remote machine. When interacting with these projects from the macOS desktop app (connected via T3 Connect, SSH, or private network), all file operations, terminal commands, agent turns, and MCP tools execute natively on the server where the codebase lives.

## Fork-specific additions

### Desktop branding

- The desktop app uses the CKcode name and icon in its UI and installers.

### Thread workflows

- `/goal` saves, shows, or clears a persistent goal for a thread. The goal carries into upstream's native thread forks and provider handoffs.
- `/pipeline` builds a Plan → Build → Review prompt with a provider and model selected for each stage. Review the generated prompt in the composer before sending it.

### MCP tools

- When enabled in Integrations settings, agents can inspect and control desktop apps through MCP, including accessibility inspection, screenshots, clicks, typing, and key presses.

### Issue-link context

When a message includes a supported public GitHub, GitLab, Linear, or Jira issue URL, T3 Code adds available issue details to the provider prompt. If details cannot be fetched, the message is sent with its link unchanged.

### Upstream nightly notice

CKcode has no automatic updates. When upstream T3 Code publishes a nightly newer than the one CKcode was merged from, the update button in the desktop sidebar points to that release. To update, run the `update-ckcode-from-t3code` agent skill, then rebuild and reinstall the desktop app.
