# Security Policy

## Reporting a Vulnerability

**Do not file security issues as public GitHub issues.**

Instead, email **security@testmuai.com** with:

- Description of the vulnerability
- Steps to reproduce
- Impact assessment (if known)
- Your contact information

We will acknowledge your report and keep you updated on the fix.

## Scope

This policy covers:

- The `rook` binary and its behaviour
- The installation scripts and release archives published in this repository
- The local browser view `rook` serves on `127.0.0.1`
- The sample agents published here

It does not cover the agent *you* point `rook` at. That software is yours.

## Things worth knowing before you report

Some behaviour looks alarming and is deliberate. `rook` generates adversarial
test scenarios — prompt injection, data exfiltration, jailbreak and PII-leakage
payloads — and stores them on disk with the responses they provoked. So:

- **A workspace legitimately contains hostile strings.** They are test inputs,
  not a compromise. The browser view escapes everything it renders and never
  serves an artifact as HTML, precisely because that data is untrusted by
  design. A rendering path that *executes* one of those strings is a real
  vulnerability, and we want to hear about it.
- **`rook` invokes the agent under test for real, with your credentials**, and
  says so. That is the product working as documented, not a flaw.

Reports we take seriously include: credential exposure, a path that escapes the
workspace, anything in the local viewer that executes untrusted content, and any
route by which scenario text influences a command or a request it should not.
