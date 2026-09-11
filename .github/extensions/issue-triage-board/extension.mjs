import { createServer } from "node:http";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";

const repository = "BnkTCh/tailspin-toys";
const servers = new Map();

const priorityReasons = {
    6: "Pagination addresses catalog performance and discoverability as the number of games grows.",
    5: "A catalog summary is a small, high-visibility improvement that can be built from existing data.",
    4: "Publisher pages unlock a reusable navigation path and establish a foundation for richer catalog browsing.",
};

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

async function fetchIssues() {
    const response = await fetch(
        `https://api.github.com/repos/${repository}/issues?state=open&per_page=100`,
        { headers: { Accept: "application/vnd.github+json", "User-Agent": "issue-triage-board" } },
    );
    if (!response.ok) {
        throw new Error(`GitHub returned HTTP ${response.status} while loading issues.`);
    }
    const issues = await response.json();
    return issues
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({
            number: issue.number,
            title: issue.title,
            body: issue.body || "No description provided.",
            url: issue.html_url,
            updatedAt: issue.updated_at,
        }))
        .sort((left, right) => {
            const leftPriority = priorityReasons[left.number] ? 1 : 0;
            const rightPriority = priorityReasons[right.number] ? 1 : 0;
            return rightPriority - leftPriority || right.number - left.number;
        });
}

function renderIssueCard(issue, isPriority) {
    const reason = priorityReasons[issue.number];
    return `<article class="card ${isPriority ? "priority" : ""}">
      <div class="card-heading">
        <span class="issue-number">#${issue.number}</span>
        <a href="${escapeHtml(issue.url)}" target="_blank" rel="noreferrer">${escapeHtml(issue.title)}</a>
      </div>
      <p>${escapeHtml(issue.body)}</p>
      ${reason ? `<div class="why"><strong>Why now:</strong> ${escapeHtml(reason)}</div>` : ""}
      <button data-issue-number="${issue.number}">Add to current context</button>
    </article>`;
}

function renderHtml(instanceId, issues, errorMessage) {
    if (errorMessage) {
        return `<!doctype html><html><body><main><h1>Issue triage board</h1><p class="error">${escapeHtml(errorMessage)}</p></main></body></html>`;
    }
    const priorityIssues = issues.filter((issue) => priorityReasons[issue.number]).slice(0, 3);
    const remainingIssues = issues.filter((issue) => !priorityReasons[issue.number] || !priorityIssues.includes(issue));
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Issue triage board</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; padding: 24px; background: var(--background-color-default, #fff); color: var(--text-color-default, #1f2328); font: 14px/1.5 var(--font-sans, system-ui, sans-serif); }
      main { max-width: 980px; margin: 0 auto; }
      h1 { margin: 0 0 6px; font-size: 26px; }
      .intro { color: var(--text-color-muted, #656d76); margin: 0 0 24px; }
      h2 { margin: 24px 0 12px; font-size: 18px; }
      .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
      .card { display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--border-color-default, #d0d7de); border-radius: 8px; padding: 16px; background: var(--background-color-secondary, #f6f8fa); }
      .card.priority { border-color: var(--true-color-blue, #0969da); }
      .card-heading { display: flex; gap: 8px; align-items: baseline; }
      .card-heading a { color: var(--text-color-default, #1f2328); font-weight: 600; }
      .issue-number { color: var(--text-color-muted, #656d76); font-family: var(--font-mono, monospace); }
      .card p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .why { padding: 10px; border-left: 3px solid var(--true-color-blue, #0969da); color: var(--text-color-muted, #656d76); }
      button { align-self: flex-start; border: 1px solid var(--border-color-default, #d0d7de); border-radius: 6px; padding: 7px 12px; background: var(--background-color-default, #fff); color: inherit; cursor: pointer; }
      button:hover { border-color: var(--true-color-blue, #0969da); }
      button:focus-visible { outline: 2px solid var(--color-focus-outline, #0969da); outline-offset: 2px; }
      .status { min-height: 20px; color: var(--text-color-muted, #656d76); }
      .error { color: var(--true-color-red, #cf222e); }
    </style>
  </head>
  <body>
    <main>
      <h1>Issue triage board</h1>
      <p class="intro">Top three issues are prioritized for likely impact and momentum. Use the button on any card to load its details into this session.</p>
      <div id="status" class="status" role="status" aria-live="polite"></div>
      <h2>Needs attention now</h2>
      <section class="board" aria-label="Top priority issues">${priorityIssues.map((issue) => renderIssueCard(issue, true)).join("") || "<p>No priority issues found.</p>"}</section>
      <h2>Remaining open issues</h2>
      <section class="board" aria-label="Remaining open issues">${remainingIssues.map((issue) => renderIssueCard(issue, false)).join("") || "<p>No remaining open issues.</p>"}</section>
    </main>
    <script>
      const status = document.querySelector("#status");
      document.querySelectorAll("button[data-issue-number]").forEach((button) => {
        button.addEventListener("click", async () => {
          const issueNumber = button.dataset.issueNumber;
          button.disabled = true;
          status.textContent = "Adding issue to the current context…";
          try {
            const response = await fetch("/api/context/" + issueNumber, { method: "POST" });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Unable to add issue.");
            status.textContent = result.message;
          } catch (error) {
            status.textContent = error.message;
            button.disabled = false;
          }
        });
      });
    </script>
  </body>
</html>`;
}

async function startServer(instanceId) {
    let issues;
    let errorMessage;
    try {
        issues = await fetchIssues();
    } catch (error) {
        errorMessage = error instanceof Error ? error.message : "Unable to load GitHub issues.";
    }
    const state = { issues: issues || [], errorMessage };
    const server = createServer(async (req, res) => {
        const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
        if (req.method === "POST" && requestUrl.pathname.startsWith("/api/context/")) {
            const issueNumber = Number(requestUrl.pathname.split("/").pop());
            const issue = state.issues.find((candidate) => candidate.number === issueNumber);
            if (!issue) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Issue not found on the open issue list." }));
                return;
            }
            await session.send({
                prompt: `Add GitHub issue #${issue.number} to the current working context.\n\nTitle: ${issue.title}\nURL: ${issue.url}\n\nDescription:\n${issue.body}`,
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: `Issue #${issue.number} added to the current context.` }));
            return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderHtml(instanceId, state.issues, state.errorMessage));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/`, state };
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "issue-triage-board",
            displayName: "Issue triage board",
            description: "Kanban board showing the three GitHub issues most likely to need attention now, with context-loading buttons.",
            actions: [
                {
                    name: "refresh_issues",
                    description: "Reload the board from the repository's current open GitHub issues.",
                    handler: async (ctx) => {
                        const entry = servers.get(ctx.instanceId);
                        if (!entry) throw new CanvasError("canvas_not_open", "The issue triage board is not open.");
                        const refreshed = await fetchIssues();
                        entry.state.issues = refreshed;
                        entry.state.errorMessage = undefined;
                        return { issueCount: refreshed.length, message: "Issue board refreshed." };
                    },
                },
            ],
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId);
                    servers.set(ctx.instanceId, entry);
                }
                return { title: "Issue triage board", url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
