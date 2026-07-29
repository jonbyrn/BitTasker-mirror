#!/usr/bin/env python3
"""
Find translation keys referenced in code that don't exist in translation files.

Usage:
    python3 scripts/find-missing-translations.py [--verbose] [--json] [--fix-suggestions]

Options:
    --verbose          Show all found keys and their locations
    --json             Output results as JSON
    --fix-suggestions  Show suggestions for similar existing keys
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict
from difflib import get_close_matches

# Configuration
PROJECT_ROOT = Path(__file__).parent.parent
SRC_DIR = PROJECT_ROOT / "src"
LOCALES_DIR = PROJECT_ROOT / "static" / "locales"
PRIMARY_LOCALE = "en"  # Use English as the source of truth

# Patterns to find translation key references in code
# Matches: $t('key'), $t("key"), $t(`key`), $t('key', ...), etc.
TRANSLATION_PATTERNS = [
    # Standard $t() calls with single quotes
    r"\$t\(\s*'([^']+)'",
    # Standard $t() calls with double quotes
    r'\$t\(\s*"([^"]+)"',
    # Template literal $t() calls (simple cases)
    r'\$t\(\s*`([^`$]+)`',
    # Fallback patterns with ||
    r"\$t\(\s*'([^']+)'\s*\)",
    r'\$t\(\s*"([^"]+)"\s*\)',
]

# File extensions to scan
CODE_EXTENSIONS = {".svelte", ".ts", ".js"}

# Keys to ignore (dynamic keys, computed keys, etc.)
IGNORE_PATTERNS = [
    r"^\$\{",  # Template literal interpolation
    r"^\[",   # Array access
    r"^\(",   # Function call result
    r"^[a-z]+$",  # Single word without dots (likely a variable)
    r"\.\s*$",  # Ends with a dot — dynamic key prefix from concatenation (e.g. 'navbar.language.' + key)
    r"_\s*$", # Underscore at the end — likely a variable (e.g. 'navbar.language.' + key_
]


def load_all_translation_keys(locale_dir: Path) -> dict[str, set[str]]:
    """Load all translation keys from JSON files in a locale directory."""
    all_keys = set()
    keys_by_file = {}
    
    def extract_keys(obj, prefix=""):
        """Recursively extract all keys from a nested dict."""
        keys = set()
        if isinstance(obj, dict):
            for key, value in obj.items():
                full_key = f"{prefix}.{key}" if prefix else key
                keys.add(full_key)
                if isinstance(value, dict):
                    keys.update(extract_keys(value, full_key))
        return keys
    
    for json_file in locale_dir.rglob("*.json"):
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            file_keys = extract_keys(data)
            keys_by_file[str(json_file.relative_to(locale_dir))] = file_keys
            all_keys.update(file_keys)
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: Could not parse {json_file}: {e}", file=sys.stderr)
    
    return {"all": all_keys, "by_file": keys_by_file}


def find_translation_references(src_dir: Path) -> dict[str, list[tuple[str, int]]]:
    """Find all translation key references in source code."""
    references = defaultdict(list)  # key -> [(file, line_number), ...]
    
    for ext in CODE_EXTENSIONS:
        for code_file in src_dir.rglob(f"*{ext}"):
            try:
                with open(code_file, "r", encoding="utf-8") as f:
                    content = f.read()
                    lines = content.split("\n")
                
                for line_num, line in enumerate(lines, 1):
                    for pattern in TRANSLATION_PATTERNS:
                        for match in re.finditer(pattern, line):
                            key = match.group(1)
                            
                            # Skip dynamic/computed keys
                            if any(re.search(ignore, key) for ignore in IGNORE_PATTERNS):
                                continue
                            
                            # Skip if key contains template literal interpolation
                            if "${" in key or "{" in key:
                                continue
                            
                            rel_path = str(code_file.relative_to(PROJECT_ROOT))
                            references[key].append((rel_path, line_num))
                            
            except IOError as e:
                print(f"Warning: Could not read {code_file}: {e}", file=sys.stderr)
    
    return references


def find_similar_keys(missing_key: str, existing_keys: set[str], n: int = 3) -> list[str]:
    """Find similar existing keys for a missing key."""
    # Try to find close matches
    matches = get_close_matches(missing_key, existing_keys, n=n, cutoff=0.6)
    
    if not matches:
        # Try matching just the last part of the key
        key_parts = missing_key.split(".")
        if len(key_parts) > 1:
            last_part = key_parts[-1]
            partial_matches = [k for k in existing_keys if k.endswith(f".{last_part}")]
            matches = partial_matches[:n]
    
    return matches


def analyze_missing_keys(
    references: dict[str, list[tuple[str, int]]],
    existing_keys: set[str],
    show_suggestions: bool = False
) -> dict:
    """Analyze which referenced keys are missing from translations."""
    missing = {}
    found = {}
    
    for key, locations in references.items():
        if key in existing_keys:
            found[key] = locations
        else:
            # Check if it's a partial key (parent exists but not the exact key)
            # e.g., "common.buttons" exists but "common.buttons.save" is referenced
            missing[key] = {
                "locations": locations,
                "suggestions": find_similar_keys(key, existing_keys) if show_suggestions else []
            }
    
    return {
        "missing": missing,
        "found": found,
        "stats": {
            "total_referenced": len(references),
            "missing_count": len(missing),
            "found_count": len(found),
            "missing_percentage": round(len(missing) / len(references) * 100, 2) if references else 0
        }
    }


def print_results(results: dict, verbose: bool = False, as_json: bool = False):
    """Print the analysis results."""
    if as_json:
        # Simplify for JSON output
        output = {
            "missing_keys": {
                key: {
                    "locations": [{"file": f, "line": l} for f, l in data["locations"]],
                    "suggestions": data["suggestions"]
                }
                for key, data in results["missing"].items()
            },
            "stats": results["stats"]
        }
        print(json.dumps(output, indent=2))
        return
    
    stats = results["stats"]
    missing = results["missing"]
    
    print("=" * 70)
    print("TRANSLATION KEY ANALYSIS REPORT")
    print("=" * 70)
    print(f"\nTotal keys referenced in code: {stats['total_referenced']}")
    print(f"Keys found in translations:    {stats['found_count']}")
    print(f"Keys MISSING from translations: {stats['missing_count']} ({stats['missing_percentage']}%)")
    
    if missing:
        print("\n" + "=" * 70)
        print("MISSING TRANSLATION KEYS")
        print("=" * 70)
        
        # Group by file for better readability
        by_file = defaultdict(list)
        for key, data in missing.items():
            for file_path, line_num in data["locations"]:
                by_file[file_path].append((key, line_num, data["suggestions"]))
        
        for file_path in sorted(by_file.keys()):
            print(f"\n📁 {file_path}")
            for key, line_num, suggestions in sorted(by_file[file_path], key=lambda x: x[1]):
                print(f"   Line {line_num}: '{key}'")
                if suggestions:
                    print(f"      💡 Did you mean: {', '.join(suggestions)}")
        
        # Also show unique missing keys grouped by namespace
        print("\n" + "=" * 70)
        print("UNIQUE MISSING KEYS BY NAMESPACE")
        print("=" * 70)
        
        by_namespace = defaultdict(list)
        for key in missing.keys():
            parts = key.split(".")
            namespace = parts[0] if parts else "root"
            by_namespace[namespace].append(key)
        
        for namespace in sorted(by_namespace.keys()):
            keys = by_namespace[namespace]
            print(f"\n🏷️  {namespace} ({len(keys)} missing):")
            for key in sorted(keys):
                ref_count = len(missing[key]["locations"])
                print(f"   • {key} (referenced {ref_count}x)")
    else:
        print("\n✅ All translation keys are present!")
    
    if verbose and results["found"]:
        print("\n" + "=" * 70)
        print("FOUND KEYS (verbose)")
        print("=" * 70)
        for key in sorted(results["found"].keys()):
            locations = results["found"][key]
            print(f"  ✓ {key} ({len(locations)} references)")


def main():
    args = sys.argv[1:]
    verbose = "--verbose" in args
    as_json = "--json" in args
    show_suggestions = "--fix-suggestions" in args or not as_json
    
    print("🔍 Scanning translation files...", file=sys.stderr)
    locale_path = LOCALES_DIR / PRIMARY_LOCALE
    if not locale_path.exists():
        print(f"Error: Locale directory not found: {locale_path}", file=sys.stderr)
        sys.exit(1)
    
    translation_data = load_all_translation_keys(locale_path)
    existing_keys = translation_data["all"]
    print(f"   Found {len(existing_keys)} translation keys in {PRIMARY_LOCALE}/", file=sys.stderr)
    
    print("🔍 Scanning source code for translation references...", file=sys.stderr)
    references = find_translation_references(SRC_DIR)
    print(f"   Found {len(references)} unique key references", file=sys.stderr)
    
    print("📊 Analyzing...\n", file=sys.stderr)
    results = analyze_missing_keys(references, existing_keys, show_suggestions)
    
    print_results(results, verbose=verbose, as_json=as_json)
    
    # Exit with error code if there are missing keys
    if results["missing"]:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
