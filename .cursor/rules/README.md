# Cursor Rules Documentation

## Structure

This directory contains organized Cursor rules for the BitTasker project, structured hierarchically for better maintainability and AI assistant effectiveness.

```
.cursor/rules/
├── core/                    # Always applied project-wide rules
│   ├── project-overview.mdc
│   ├── development-philosophy.mdc
│   ├── security-guidelines.mdc
│   └── agent-best-practices.mdc
├── frontend/                # Frontend-specific rules
│   ├── svelte5-sveltekit2.mdc
│   └── ui-patterns.mdc
├── blockchain/              # Blockchain integration rules
│   ├── nostr-tools.mdc
│   └── breez-sdk-liquid-rules.mdc
├── backend/                 # Backend/API rules
│   ├── api-rules.mdc
│   └── data-models.mdc
├── testing/                 # Testing guidelines
│   └── testing-overview.mdc
└── README.md               # This file
```

## Rules by Purpose

### Always Applied (core/*)
These rules are always included in the AI context:
- **project-overview.mdc**: High-level project context and architecture
- **development-philosophy.mdc**: Coding patterns and best practices
- **security-guidelines.mdc**: Security requirements and cryptographic guidelines
- **agent-best-practices.mdc**: Agent guidelines for quality code generation

### Auto-attached (globs patterns)
Rules that are automatically included based on file patterns:
- **frontend/svelte5-sveltekit2.mdc**: Applied to `**/*.svelte`, `src/routes/**/*`, `src/lib/components/**/*`
- **frontend/ui-patterns.mdc**: Applied to `**/*.svelte`, `src/lib/components/**/*`, `**/*.css`
- **blockchain/nostr-tools.mdc**: Applied to `**/nostr/**/*`, `**/integrations/nostr/**/*`
- **blockchain/breez-sdk-liquid-rules.mdc**: Applied to `**/wallet/**/*`, `**/integrations/breez/**/*`
- **backend/api-rules.mdc**: Applied to `**/api/**/*`, `**/services/**/*`
- **backend/data-models.mdc**: Applied to `**/types/**/*`, `**/models/**/*`
- **testing/testing-overview.mdc**: Applied to `**/*.test.ts`, `**/*.spec.ts`, `**/tests/**/*`

### Agent-requested
Comprehensive documentation files that the AI can request when needed:
- All blockchain integration rules
- Backend API patterns
- Testing strategies

## File Organization Principles

### Size Limits
- Each rule file is under 1,000 lines
- Focused content for better AI comprehension
- Clear separation of concerns

### Metadata Standards
All rule files include proper metadata:
```yaml
---
description: Clear description of the rule's purpose
globs: ["pattern1", "pattern2"]  # File patterns for auto-attachment
alwaysApply: true/false          # Whether to always include
---
```

### Content Guidelines
- **Actionable**: Provide specific, implementable guidance
- **Contextual**: Include rationale and examples
- **Comprehensive**: Cover all relevant aspects
- **Maintainable**: Easy to update and extend

## Maintenance

### When to Update Rules
- Technology versions change (Svelte 5 → 6, etc.)
- New patterns emerge in the codebase
- Best practices evolve
- Project requirements change
- New integrations are added

### How to Update Rules
1. **Identify the scope**: Which rule file needs updating?
2. **Update content**: Add new patterns, remove deprecated ones
3. **Update metadata**: Adjust globs and descriptions if needed
4. **Test changes**: Verify rules work as expected
5. **Document changes**: Update this README if structure changes

### Adding New Rules
1. **Determine category**: Which directory should it go in?
2. **Create the file**: Follow naming conventions
3. **Add metadata**: Include proper description and globs
4. **Update this README**: Add to the structure documentation
5. **Test integration**: Verify the rule works with Cursor

## Quality Standards

### Rule Content
- **Accuracy**: Information must be current and correct
- **Completeness**: Cover all relevant aspects
- **Clarity**: Easy to understand and follow
- **Examples**: Include practical code examples
- **Consistency**: Follow established patterns

### File Structure
- **Logical organization**: Related content grouped together
- **Clear headings**: Easy navigation and scanning
- **Consistent formatting**: Follow markdown best practices
- **Proper metadata**: All required fields included

## Agent Best Practices Integration

The `core/agent-best-practices.mdc` file provides comprehensive guidelines for:
- Code generation workflow
- Testing requirements (including Cursor browser testing)
- Quality standards
- Self-validation checklists
- Error handling procedures
- Iterative improvement processes

This ensures the AI assistant produces high-quality, tested, on-brand code with minimal human intervention.

## Troubleshooting

### Common Issues
1. **Rules not applying**: Check glob patterns and file paths
2. **Conflicting rules**: Review rule priorities and content
3. **Outdated information**: Update rules when technologies change
4. **Performance issues**: Keep rule files focused and under size limits

### Getting Help
- Review this README for structure guidance
- Check individual rule files for specific guidance
- Update rules based on project evolution
- Maintain consistency across all rule files

## Future Enhancements

### Planned Improvements
- **Dynamic rule loading**: Context-aware rule selection
- **Rule dependencies**: Automatic inclusion of related rules
- **Performance optimization**: Faster rule loading and processing
- **Analytics**: Track rule effectiveness and usage

### Extension Points
- **Custom rule categories**: Add new directories as needed
- **Rule inheritance**: Base rules with specialized extensions
- **Conditional rules**: Rules that apply based on project state
- **Integration rules**: Third-party service specific guidelines

