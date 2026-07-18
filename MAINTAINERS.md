# To Create A New Release

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
7. Run the release script (see below):
   ```
   npm run release
   ```

## Releasing

Once main contains the new version, run:

```
npm run release
```

Prerequisites: npm >= 12 (`npm install -g npm@12`), Docker running, an npm auth
token with publish rights, and a GitHub token for the release step — set
`GITHUB_TOKEN` (or `GH_TOKEN`), or be logged into the `gh` CLI if you have it.
Without a token the script still publishes and tags, and prints the URL to
create the GitHub release manually.

The script automates the rest of the process:
1. Verifies you're on a clean, up-to-date main
2. Verifies the version in package.json isn't already on npm
3. Runs `npm ci` (unzips `binding/muhammara.node` via the `prepare` script)
4. Sanity checks the binary inside the `public.ecr.aws/lambda/nodejs:22` image
   (loads muhammara and writes a PDF)
5. Runs `npm publish`
6. Tags the release (e.g. `6.0.5`) and pushes the tag
7. Creates the GitHub release via the GitHub API (or prints the URL to do it manually)

Flags: `npm run release -- --dry-run` runs all checks and a `publish --dry-run`
without tagging or publishing; `-- --skip-verify` skips the Docker check.
(Note the `--` — it's how npm passes flags through to the script.)

## Fallback: building manually on EC2

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
3. Continue from step 3 above (zip, verify, publish).
