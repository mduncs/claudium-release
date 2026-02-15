# Prompt Optimizer Skill

The Prompt Optimizer is a Claude Code skill designed to enhance system prompts through a structured two-phase methodology.

## Core Purpose

This skill refines prompts for Claude Code agents by "applying proven prompt engineering patterns from production systems."

## Two-Phase Process

**Phase 1: Section-by-Section Analysis**
The skill decomposes prompts into logical sections (role definition, capabilities, constraints, etc.), analyzes each independently, and applies relevant patterns with attribution.

**Phase 2: Full-Pass Integration**
The complete prompt undergoes holistic review for coherence, redundancy elimination, and consistency verification before final delivery.

## Key Requirements

- Must reference `references/prompt-engineering.md` before optimization begins
- Every modification requires explicit pattern attribution
- Changes should be presented with before/after comparisons
- When pattern conflicts arise, present options for user selection

## Quality Standards

The skill enforces a comprehensive checklist ensuring:
- All changes carry pattern attribution
- No contradictions between sections
- Appropriate emphasis for critical instructions
- Clear examples for complex behaviors
- Explicit safety guidelines

## Operational Philosophy

The skill emphasizes "systematic but not mechanical" optimization, prioritizing judgment over rote pattern application and respecting already-effective existing patterns rather than changing them unnecessarily.
