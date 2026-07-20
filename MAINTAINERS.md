# Maintainers Guide

## Releasing

Once main contains the new version (see [Authoring a release](#authoring-a-release)),
releasing is a single command, which runs the script in `scripts/release.js`:

```
npm run release
```

To test the process first without publishing, tagging, or creating a release,
do a dry run (note the `--` — it's how npm passes flags through to the script):

```
npm run release -- --dryrun
```

Prerequisites:
- npm >= 12 (`npm install -g npm@12`)
- Docker running (or pass `-- --skip-verify` to skip the sanity check)
- An npm auth token with publish rights
- A GitHub token for the release step — set `GITHUB_TOKEN` (or `GH_TOKEN`), or
  be logged into the `gh` CLI if you have it. Without a token the script still
  publishes and tags, and prints the URL to create the GitHub release manually.

### How it works

The script automates the steps that used to be manual:

1. Verifies you're on a clean, up-to-date main (a dry run only warns, so you
   can test from a branch or with uncommitted changes)
2. Verifies the version in package.json isn't already on npm
3. Runs `npm ci` (unzips `binding/muhammara.node` via the `prepare` script)
4. Sanity checks the binary inside the `public.ecr.aws/lambda/nodejs:22` image
   (loads muhammara and writes a PDF)
5. Runs `npm publish` (`npm publish --dry-run` in a dry run, which stops here)
6. Tags the release (e.g. `6.0.5`) and pushes the tag
7. Creates the GitHub release via the GitHub API

### How to release manually

If the release script doesn't work for whatever reason, these are the same
steps by hand:

1. Sanity check the binary loads on the target runtime using the AWS Lambda
   base image:
   ```
   docker run --rm --platform linux/amd64 --entrypoint bash \
     -v "$PWD":/pkg public.ecr.aws/lambda/nodejs:22 -c '
       cd /tmp && npm init -y >/dev/null &&
       npm install muhammara@6.0.5 /pkg &&
       cp node_modules/lambda-muhammara/binding/muhammara.node node_modules/muhammara/binding/muhammara.node &&
       node -e "const m = require(\"muhammara\"); const w = m.createWriter(\"/tmp/out.pdf\"); w.writePage(w.createPage(0,0,595,842)); w.end(); console.log(\"OK on\", process.version);"'
   ```
2. Publish it
   1. `npm publish`
3. Tag the release and push the tag
   1. `git tag 6.0.5`
   2. `git push origin 6.0.5`
4. Create [a new release on GitHub](https://github.com/QbDVision-Inc/lambda-muhammara/releases/new)

## Authoring a release

Muhammara publishes official pre-built binaries for every release on GitHub, keyed by Node ABI
version, so building on an EC2 instance is no longer necessary for most releases.

Steps:
1. Find the Node ABI version for the Lambda runtime you're targeting at
   https://nodejs.org/en/download/releases (the `NODE_MODULE_VERSION` column), e.g.:
   - Node 20.x → `node-v115`
   - Node 22.x → `node-v127`
   - Node 24.x → `node-v137`
2. Download the matching prebuild from the MuhammaraJS release page:
   ```
   curl -LO https://github.com/julianhille/MuhammaraJS/releases/download/{muhammara-version}/node-v{ABI}-linux-x64-glibc.tar.gz
   ```
   e.g. for muhammara 6.0.5 on Node 22: `.../download/6.0.5/node-v127-linux-x64-glibc.tar.gz`
3. Extract the binary and zip it up:
   ```
   tar xzf node-v{ABI}-linux-x64-glibc.tar.gz   # extracts binding/muhammara.node
   cd binding/
   rm muhammara.node.zip                        # remove the old one, if it exists
   zip muhammara.node.zip muhammara.node
   rm muhammara.node                            # delete the unzipped version
   ```
   (or on Windows using 7zip: `7z a muhammara.node.zip muhammara.node`)
4. Update package.json with the new version info (and the muhammara dependency version, if it changed)
5. Update the README.md versions, if necessary
6. Commit, get the PR merged to main, and pull main
7. Run the release script (see [Releasing](#releasing) above):
   ```
   npm run release
   ```

### Fallback: building manually on EC2

Only needed if MuhammaraJS doesn't publish a prebuild for the ABI you need
(e.g. linux-arm64 glibc is not published).

1. Start an EC2 instance and install the **version of node** that you want.
   1. `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash`
   2. `source ~/.nvm/nvm.sh`
   3. `nvm install v22` # or whatever version you want
   4. `node -v` # make sure you have the right node version
   5. `yum install git -y && yum install vi -y`
   6. `git clone https://github.com/QbDVision-Inc/lambda-muhammara.git`
   7. `cd lambda-muhammara/`
   8. `vi package.json` # Update the muhammara version
   9. `npm install` # Installs muhammara
   10. `cp node_modules/muhammara/binding/muhammara.node /tmp`
2. Back at yet another terminal on your local machine, copy the binary created back to your machine
    1. `scp ctemp:/tmp/muhammara.node binding/muhammara.node`
3. Continue from step 3 of [Authoring a release](#authoring-a-release) above (zip, verify, publish).
