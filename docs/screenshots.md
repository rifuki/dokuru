# Screenshot Gallery

This gallery is the visual walkthrough for Dokuru. The README stays short and links here when a reader wants to inspect the product flow in more detail.

## Capture Rules

- Use dark theme for public README/docs screenshots.
- Prefer clean states without transient toast notifications.
- Keep auth, landing, and highly repetitive resource pages out of the README.
- Redact real tokens, secrets, and private hostnames before publishing.

## Flow

<table>
  <tr>
    <td width="50%">
      <strong>1. First-run agents</strong><br />
      Initial dashboard after login, before any Docker host has been connected.<br /><br />
      <img src="screenshots/01-agents-empty-state.png" alt="Agents empty state" width="100%" />
    </td>
    <td width="50%">
      <strong>2. Add Docker agent</strong><br />
      Connection mode, agent URL, and one-time token entry in the add-agent modal.<br /><br />
      <img src="screenshots/02-add-docker-agent.png" alt="Add Docker Agent modal" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>3. Connected agents</strong><br />
      Agents page after hosts have been added, with one agent expanded in the sidebar.<br /><br />
      <img src="screenshots/03-agents-connected.png" alt="Connected agents" width="100%" />
    </td>
    <td width="50%">
      <strong>4. Agent dashboard</strong><br />
      Per-agent security posture, Docker inventory, control dock, and host facts.<br /><br />
      <img src="screenshots/04-agent-dashboard.png" alt="Agent dashboard" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>5. Audit running</strong><br />
      Live CIS Docker Benchmark checks with progress, current rule, and checked containers.<br /><br />
      <img src="screenshots/05-audit-running.png" alt="Audit running" width="100%" />
    </td>
    <td width="50%">
      <strong>6. Audit result</strong><br />
      Score, pass/fail counts, security pillars, affected containers, and available fixes.<br /><br />
      <img src="screenshots/06-audit-result.png" alt="Audit result" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>7. Fix progress</strong><br />
      Controlled remediation workflow with selected rules, progress, evidence, and live output.<br /><br />
      <img src="screenshots/07-fix-progress.png" alt="Fix progress" width="100%" />
    </td>
    <td width="50%">
      <strong>8. Container detail</strong><br />
      One Docker management detail page to prove the inventory surface without repeating every resource page.<br /><br />
      <img src="screenshots/08-container-detail.png" alt="Container detail" width="100%" />
    </td>
  </tr>
</table>

## Optional Extra Captures

These are useful for deeper docs, but should stay out of the README unless a release specifically focuses on Docker inventory:

- Stacks list and stack detail.
- Images list and image detail.
- Networks list and network detail.
- Volumes list and volume detail.
- Events stream.
- VPS shell, only with sanitized command output.
- Audit history.
- Fix confirmation and configuration panels.
