"use strict";

/**
 * Automates the release process from MAINTAINERS.md:
 *   1. Verifies the working tree is clean, on main, and up to date
 *   2. Verifies this version isn't already published to npm
 *   3. Installs dependencies (which unzips binding/muhammara.node via `prepare`)
 *   4. Sanity-checks the binary inside the AWS Lambda base image (requires Docker)
 *   5. Publishes to npm
 *   6. Tags the release and pushes the tag
 *   7. Creates the GitHub release via the GitHub API (needs a token from
 *      GITHUB_TOKEN, GH_TOKEN, or a logged-in `gh` CLI if one is installed)
 *
 * Usage: npm run release [-- --dry-run] [-- --skip-verify]
 *   --dry-run      runs every check but publishes with `npm publish --dry-run`
 *                  and skips tagging/GitHub release
 *   --skip-verify  skips the Docker sanity check (e.g. if Docker isn't installed)
 *
 * Requires npm >= 12 (enforced by devEngines in package.json).
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// The Lambda base image tag to sanity-check against. Keep in sync with the
// runtime named in package.json's "description".
const LAMBDA_NODE_VERSION = "22";

const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("--dryrun");
const SKIP_VERIFY = process.argv.includes("--skip-verify");

const ROOT = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version;
const muhammaraVersion = pkg.peerDependencies.muhammara;
// e.g. "QbDVision-Inc/lambda-muhammara", derived from the repository URL
const repoSlug = pkg.repository.url.match(/github\.com[/:](.+?)(?:\.git)?$/)[1];

// `npm run` sets npm_execpath; invoking it through node avoids Windows .cmd issues.
const npmBin = process.env.npm_execpath
  ? { cmd: process.execPath, args: [process.env.npm_execpath] }
  : { cmd: "npm", args: [], shell: process.platform === "win32" };

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
  if (result.error) {
    return fail(`${cmd} failed to start: ${result.error.message}`);
  } else if (result.status !== 0) {
    return fail(`\`${cmd} ${args.join(" ")}\` exited with code ${result.status}`);
  } else {
    return result;
  }
}

function capture(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
  if (result.error || result.status !== 0) {
    return fail(`\`${cmd} ${args.join(" ")}\` failed: ${result.error ? result.error.message : result.stderr}`);
  } else {
    return result.stdout.trim();
  }
}

function npm(args, opts) {
  return run(npmBin.cmd, [...npmBin.args, ...args], { shell: npmBin.shell, ...opts });
}

function npmCapture(args) {
  return capture(npmBin.cmd, [...npmBin.args, ...args], { shell: npmBin.shell });
}

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function step(message) {
  console.log(`\n▶ ${message}`);
}

// A GitHub token from the environment, or from the gh CLI's stored login if gh
// happens to be installed (it isn't required). Returns null if neither exists.
function githubToken() {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
    return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  }
  const gh = spawnSync("gh", ["auth", "token"], { encoding: "utf8" });
  if (!gh.error && gh.status === 0) {
    return gh.stdout.trim();
  } else {
    return null;
  }
}

// Publish and tag have already succeeded by the time this runs, so a failure
// here warns and points at the manual release page instead of exiting non-zero.
async function createGitHubRelease() {
  const manualUrl = `https://github.com/${repoSlug}/releases/new?tag=${version}`;
  const token = githubToken();
  if (!token) {
    console.warn(
      "⚠ No GitHub token found (set GITHUB_TOKEN or GH_TOKEN) — create the release manually at:\n" +
      `  ${manualUrl}`
    );
    return;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repoSlug}/releases`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        tag_name: version,
        name: version,
        generate_release_notes: true,
      }),
    });
    if (response.ok) {
      const release = await response.json();
      console.log(`✔ Created ${release.html_url}`);
    } else {
      console.warn(
        `⚠ GitHub API returned ${response.status}: ${await response.text()}\n` +
        `  Create the release manually at:\n  ${manualUrl}`
      );
    }
  } catch (err) {
    console.warn(
      `⚠ Could not reach the GitHub API (${err.message}) — create the release manually at:\n` +
      `  ${manualUrl}`
    );
  }
}

async function release() {
  // --- 1. Git checks ---------------------------------------------------------

  step("Checking git state...");
  const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") {
    if (DRY_RUN) {
      console.warn(`⚠ Not on main (currently on "${branch}") — allowed in --dry-run.`);
    } else {
      fail(`You must release from main (currently on "${branch}").`);
    }
  }

  const dirty = capture("git", ["status", "--porcelain"]);
  if (dirty) {
    if (DRY_RUN) {
      console.warn("⚠ Working tree is not clean (allowed in --dry-run):\n" + dirty);
    } else {
      fail("Working tree is not clean. Commit or stash your changes first:\n" + dirty);
    }
  }

  run("git", ["fetch", "origin", "main"]);
  const behind = capture("git", ["rev-list", "--count", "HEAD..origin/main"]);
  if (behind !== "0") fail(`main is ${behind} commit(s) behind origin/main. Run \`git pull\` first.`);

  // --- 2. Registry check -----------------------------------------------------

  step(`Checking that ${pkg.name}@${version} is not already published...`);
  const published = npmCapture(["view", pkg.name, "versions", "--json"]);
  if (JSON.parse(published).includes(version)) {
    fail(`${pkg.name}@${version} is already on npm. Bump the version in package.json first.`);
  }
  console.log(`✔ ${version} is unpublished (latest on npm: ${npmCapture(["view", pkg.name, "version"])})`);

  // --- 3. Install (unzips the binary via the `prepare` script) ---------------

  step("Installing dependencies (unzips binding/muhammara.node)...");
  npm(["ci"]);
  if (!fs.existsSync(path.join(ROOT, "binding", "muhammara.node"))) {
    fail("binding/muhammara.node was not created — check install.js / binding/muhammara.node.zip.");
  }

  // --- 4. Sanity-check the binary in the Lambda base image -------------------

  if (SKIP_VERIFY) {
    console.warn("\n⚠ Skipping the Docker sanity check (--skip-verify).");
  } else {
    step(`Verifying the binary loads in the Lambda nodejs${LAMBDA_NODE_VERSION} image (muhammara@${muhammaraVersion})...`);
    const dockerCheck = spawnSync("docker", ["--version"], { encoding: "utf8" });
    if (dockerCheck.error) {
      fail("Docker is not available. Install/start Docker, or re-run with --skip-verify.");
    }
    run("docker", [
      "run", "--rm", "--platform", "linux/amd64", "--entrypoint", "bash",
      "-v", `${ROOT}:/pkg`,
      `public.ecr.aws/lambda/nodejs:${LAMBDA_NODE_VERSION}`,
      "-c",
      `cd /tmp && npm init -y >/dev/null &&
       npm install muhammara@${muhammaraVersion} /pkg &&
       cp node_modules/lambda-muhammara/binding/muhammara.node node_modules/muhammara/binding/muhammara.node &&
       node -e "const m = require('muhammara'); const w = m.createWriter('/tmp/out.pdf'); w.writePage(w.createPage(0,0,595,842)); w.end(); console.log('muhammara OK on', process.version);"`,
    ]);
  }

  // --- 5. Publish ------------------------------------------------------------

  step(DRY_RUN ? "Publishing (dry run)..." : "Publishing to npm...");
  npm(DRY_RUN ? ["publish", "--dry-run"] : ["publish"]);

  if (DRY_RUN) {
    console.log("\n✔ Dry run complete. No publish, tag, or GitHub release was made.");
    return;
  }

  // --- 6. Tag ----------------------------------------------------------------

  step(`Tagging ${version} and pushing the tag...`);
  run("git", ["tag", version]);
  run("git", ["push", "origin", version]);

  // --- 7. GitHub release -----------------------------------------------------

  step("Creating the GitHub release...");
  await createGitHubRelease();

  console.log(`\n✔ Released ${pkg.name}@${version}`);
}

release();
