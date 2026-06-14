import { Command } from "commander";
import { bold, cyan, green, symbols } from "../colors.js";
import { createPreview, stopPreview, PreviewError } from "../preview-core.js";

function emitResult(result, json) {
  if (json) {
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }
  console.log(`\n  ${symbols.check} Preview live: ${bold(green(result.url))}`);
  console.log(`  ${symbols.arrow} localhost:${result.port} ${result.branch ? `(${cyan(result.branch)})` : ""}`);
  console.log(`  Expires ${result.expires}. Stop with ${bold("pugloo preview --stop")}.\n`);
}

function emitError(err, json) {
  if (err instanceof PreviewError) {
    if (json) {
      process.stdout.write(JSON.stringify(err.toJSON()) + "\n");
    } else {
      process.stderr.write(`${symbols.cross} ${err.message}\n`);
      if (err.hint) process.stderr.write(`  ${err.hint}\n`);
    }
    process.exit(err.errInfo.code);
  }
  // Unexpected: internal error.
  if (json) {
    process.stdout.write(JSON.stringify({ schema: 1, error: "PUGLOO_ERR_INTERNAL", message: err.message || "Internal error" }) + "\n");
  } else {
    process.stderr.write(`${symbols.cross} ${err.message || "Internal error"}\n`);
  }
  process.exit(1);
}

const previewCommand = new Command("preview")
  .description("Create a stable public HTTPS preview URL for the app in this repo (experimental)")
  .option("--json", "Machine-readable output (JSON on stdout, exit codes per docs)")
  .option("-p, --port <port>", "Port to preview (default: auto-detect)")
  .option("--name <name>", "Override the subdomain base name")
  .option("--ttl <duration>", "Auto-expire after duration (default 24h)")
  .option("--stop", "Tear down the preview for this repo+branch")
  .action(async (opts) => {
    const json = !!opts.json;
    try {
      if (opts.stop) {
        const stopped = stopPreview();
        if (json) {
          process.stdout.write(JSON.stringify({ schema: 1, stopped }) + "\n");
        } else {
          console.log(`${symbols.check} Stopped ${stopped.length} preview(s).`);
        }
        return;
      }
      const result = await createPreview({ port: opts.port, name: opts.name, ttl: opts.ttl });
      emitResult(result, json);
    } catch (err) {
      emitError(err, json);
    }
  });

export default previewCommand;
