# CKcode

**CKcode is a fork of [T3 Code](https://github.com/pingdotgg/t3code).** Credit and thanks go to the [T3 Code contributors](https://github.com/pingdotgg/t3code/graphs/contributors) for creating and maintaining the original project.

This fork's `main` branch is based on an older upstream snapshot, so it does not include every recent upstream change. This README covers only the fork-specific additions; see the [upstream README](https://github.com/pingdotgg/t3code#readme) for shared setup and documentation.

## Fork-specific additions

### Desktop branding

- The desktop app uses the CKcode name and icon in its UI and installers.

### Thread workflows

- `/goal` saves, shows, or clears a persistent goal for a thread.
- `/handoff` starts a thread with another provider; `/fork` starts a parallel thread. Both carry over recent text history and the thread goal. Attachments are not copied.
- `/pipeline` builds a Plan → Build → Review prompt with a provider and model selected for each stage. Review the generated prompt in the composer before sending it.

### MCP tools

- Agents can start an independent thread through the T3 Code MCP server.
- When enabled in Integrations settings, agents can inspect and control desktop apps through MCP, including accessibility inspection, screenshots, clicks, typing, and key presses.

### Issue-link context

When a message includes a supported public GitHub, GitLab, Linear, or Jira issue URL, T3 Code adds available issue details to the provider prompt. If details cannot be fetched, the message is sent with its link unchanged.

### Settled-project shortcuts

The web and mobile clients group projects with settled threads and let you open a project in a new chat.

### Nightly update protection

The desktop app ignores an older nightly release result, preventing it from offering a downgrade over the installed nightly version.
