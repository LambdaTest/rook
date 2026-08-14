## [0.1.0] - 2026-08-14

### 0.1.0

Initial public release.

`rook` reads an agent's own codebase, writes a scenario suite for it, runs the agent for real, and grades the result with evidence — reporting what it could not verify rather than guessing. See the [README](https://github.com/LambdaTest/rook) for the full picture.

Install:
- npm: `npm install -g @testmuai/rook`
- curl: `curl -fsSL https://raw.githubusercontent.com/LambdaTest/rook/main/install.sh | bash`
- Homebrew: `brew tap lambdatest/rook https://github.com/LambdaTest/rook.git && brew install lambdatest/rook/rook`

macOS and Linux, x64 and arm64. The curl and Homebrew installs need no local Node — each bundles its own runtime. (The npm install still needs npm itself, to fetch it.)

# Changelog

All notable changes to rook are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
