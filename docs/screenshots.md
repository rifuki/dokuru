# Screenshot Gallery

This gallery is the visual walkthrough for Dokuru. The README stays short and links here when a reader wants to inspect the product flow in more detail.

## Capture Rules

- Use dark theme for public README/docs screenshots.
- Prefer clean states without transient toast notifications.
- Keep auth, landing, and highly repetitive resource pages out of the README.
- Keep the README preview varied: empty dashboard, add-agent modal, live audit scan, then saved audit result.
- Redact real tokens, secrets, and private hostnames before publishing.

## README Preview Flow

These are the screenshots that belong in the main README preview. They cover onboarding, the core agent view, audit execution, saved results, remediation, and one inventory detail page without turning the README into a long product tour.

<table>
  <tr>
    <td width="50%">
      <strong>1. Dashboard after login</strong><br />
      Initial agents page before any Docker host has been connected.<br /><br />
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
      <strong>5. Live audit scan</strong><br />
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
      <strong>7. Fix progress and evidence</strong><br />
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

## App Gallery Details

These screenshots stay in the docs gallery. They are useful when someone wants to inspect the deeper app flows, but they should not be added to the README preview unless the README is being redesigned around a full walkthrough.

<table>
  <tr>
    <td width="50%">
      <strong>9. Fix confirmation</strong><br />
      Bulk remediation starts with selected rules, affected pillars, and restart risk called out before any change is applied.<br /><br />
      <img src="screenshots/09-fix-confirm.png" alt="Fix confirmation panel" width="100%" />
    </td>
    <td width="50%">
      <strong>10. Fix configuration</strong><br />
      Configure cgroup, memory, CPU share, and PID limits before the selected fixes are applied.<br /><br />
      <img src="screenshots/10-fix-configure.png" alt="Fix configuration panel" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>11. Fix applying and evidence</strong><br />
      Live remediation progress with applied rules, evidence events, and streamed command output.<br /><br />
      <img src="screenshots/11-fix-applying.png" alt="Fix applying with evidence" width="100%" />
    </td>
    <td width="50%">
      <strong>12. VPS shell</strong><br />
      Browser shell connected to the Docker host for direct inspection and operational follow-up.<br /><br />
      <img src="screenshots/12-vps-shell.png" alt="VPS shell" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>13. Container detail expanded</strong><br />
      Expanded container row with overview tabs, image metadata, port bindings, and network address details.<br /><br />
      <img src="screenshots/13-container-detail-expanded.png" alt="Expanded container detail" width="100%" />
    </td>
    <td width="50%">
      <strong>14. Stack inventory</strong><br />
      Compose stack summary with running containers, compose files, and per-container status.<br /><br />
      <img src="screenshots/14-stacks.png" alt="Stack inventory" width="100%" />
    </td>
  </tr>
</table>

## Future Captures

These are useful later if the gallery needs a longer Docker inventory appendix:

- Images list and image detail.
- Networks list and network detail.
- Volumes list and volume detail.
- Events stream.
- Installer/onboarding CLI, only with generated URLs, one-time tokens, and private hostnames redacted.
- Audit history.
