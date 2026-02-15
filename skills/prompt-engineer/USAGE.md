# Prompt Optimizer Skill - Usage Guide

## Overview

This skill optimizes Claude Code agent system prompts using proven prompt engineering patterns from production systems. It enforces rigorous pattern attribution to ensure every change is justified and auditable.

## Structure

```
prompt-engineer/
├── SKILL.md                           # Main skill instructions
├── USAGE.md                           # This file
└── references/
    └── prompt-engineering.md          # Complete pattern catalog
```

## How It Works

The skill implements a two-phase optimization process:

### Phase 1: Section-by-Section Analysis
1. Decomposes your prompt into logical sections
2. Analyzes each section independently
3. Applies relevant patterns with explicit attribution
4. Presents findings per section

### Phase 2: Full-Pass Integration
1. Assembles the complete optimized prompt
2. Reviews for global coherence
3. Eliminates redundancies
4. Ensures consistency across sections

## Key Features

### Mandatory Pattern Attribution

"Every single change" requires pattern name, rationale, behavioral impact, and before/after comparison. This creates accountability and an audit trail for modifications.

### Conflict Resolution

When multiple patterns apply, the skill identifies conflicts, demonstrates each option, explains trade-offs, provides recommendations, and requests your preference.

### Quality Assurance

Built-in checklist ensures no contradictory instructions, proper emphasis hierarchy, addressed anti-patterns, verbose safety-critical operations, unambiguous output formats, and default behaviors for edge cases.

## Usage Example

Submit your agent prompt with a request to optimize it using this skill. The system will decompose sections, analyze each with attribution, flag conflicts for your input, assemble the optimized version, perform coherence review, and present results with a summary.

## Important Notes

### Pattern Attribution is Critical

Attribution prevents changes without justification, enforces thoughtful pattern application, maintains accountability, and enables future reference and learning.

### Hybrid Approach Implemented

"Major changes" receive individual attribution with full rationale; minor modifications group by section with shared rationale; global changes receive separate Phase 2 attribution.

### The Guide is Embedded Verbatim

The reference file remains unaltered—it functions as the canonical pattern source during execution.

## Customization

Modify SKILL.md for section decomposition logic, attribution format, domain-specific patterns, or conflict resolution processes. Do not alter the reference patterns file to maintain its canonical status.

## Next Steps

1. Test on your actual prompts
2. Refine based on results
3. Add domain-specific patterns discovered
