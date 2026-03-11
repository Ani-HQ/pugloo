import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

function git(command) {
  return execSync(command, { encoding: "utf8", cwd: repoRoot }).trim();
}

function htmlEscape(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function updateChangelogPage() {
  const changelogPath = resolve(repoRoot, "docs/changelog.html");
  const startMarker = "<!-- AUTO_COMMIT_FEED_START -->";
  const endMarker = "<!-- AUTO_COMMIT_FEED_END -->";

  const logRows = git("git log -20 --date=short --pretty='format:%h%x1f%ad%x1f%s'")
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const first = row.indexOf("\u001f");
      const second = row.indexOf("\u001f", first + 1);
      const hash = row.slice(0, first);
      const date = row.slice(first + 1, second);
      const subject = row.slice(second + 1);
      return { hash, date, subject };
    });

  const items = logRows
    .map(({ hash, date, subject }) =>
      `      <li><code>${htmlEscape(hash)}</code><span>${htmlEscape(date)}</span><span>${htmlEscape(subject)}</span></li>`
    )
    .join("\n");

  const replacement = `${startMarker}
    <ul class="commit-feed">
${items}
    </ul>
${endMarker}`;

  const original = readFileSync(changelogPath, "utf8");
  if (!original.includes(startMarker) || !original.includes(endMarker)) {
    throw new Error("Missing changelog feed markers in docs/changelog.html");
  }

  const updated = original.replace(
    new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, "m"),
    replacement
  );
  writeFileSync(changelogPath, updated, "utf8");
}

updateChangelogPage();
