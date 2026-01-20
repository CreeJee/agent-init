#!/bin/bash

# Migration script: Team-based → Workspace-based structure
# Converts .agent-init/{team}/ to .agent-init/storage/{team}/ + workspaces/

set -e  # Exit on error

AGENT_INIT_DIR="${AGENT_INIT_DIR:-.agent-init}"
STORAGE_DIR="$AGENT_INIT_DIR/storage"
WORKSPACE_DIR="$AGENT_INIT_DIR/workspaces"
DEFAULT_WORKSPACE="default"

echo "🚀 Starting migration to workspace-based structure..."
echo "   Base dir: $AGENT_INIT_DIR"
echo ""

# 1. Create directory structure
echo "📁 Creating new directory structure..."
mkdir -p "$STORAGE_DIR"
mkdir -p "$WORKSPACE_DIR/$DEFAULT_WORKSPACE"
echo "   ✓ Created $STORAGE_DIR"
echo "   ✓ Created $WORKSPACE_DIR/$DEFAULT_WORKSPACE"
echo ""

# 2. Move team directories to storage/
echo "📦 Moving team directories to storage/..."
for team_dir in "$AGENT_INIT_DIR"/*; do
  if [ -d "$team_dir" ]; then
    team_name=$(basename "$team_dir")

    # Skip storage, workspaces directories
    if [ "$team_name" = "storage" ] || [ "$team_name" = "workspaces" ]; then
      continue
    fi

    # Check if team directory has .md files
    if ls "$team_dir"/*.md &> /dev/null; then
      echo "   Moving $team_name/ → storage/$team_name/"
      mv "$team_dir" "$STORAGE_DIR/"
    fi
  fi
done
echo ""

# 3. Create symlinks in default workspace
echo "🔗 Creating symlinks in default workspace..."
link_count=0
for team_dir in "$STORAGE_DIR"/*; do
  if [ -d "$team_dir" ]; then
    team_name=$(basename "$team_dir")

    for md_file in "$team_dir"/*.md; do
      if [ -f "$md_file" ]; then
        file_name=$(basename "$md_file")
        # Create alias: {team}-{file}
        alias_name="${team_name}-${file_name}"

        # Relative symlink path: ../../storage/{team}/{file}
        relative_source="../../storage/$team_name/$file_name"
        symlink_target="$WORKSPACE_DIR/$DEFAULT_WORKSPACE/$alias_name"

        echo "   $alias_name → storage/$team_name/$file_name"
        ln -s "$relative_source" "$symlink_target"
        ((link_count++))
      fi
    done
  fi
done
echo ""

# 4. Verify migration
echo "✅ Migration completed!"
echo ""
echo "📊 Summary:"
echo "   Storage teams: $(ls -1 "$STORAGE_DIR" | wc -l)"
echo "   Symlinks created: $link_count"
echo ""

echo "🔍 Verifying structure..."
echo ""
echo "Storage:"
ls -lh "$STORAGE_DIR"
echo ""
echo "Default workspace:"
ls -lh "$WORKSPACE_DIR/$DEFAULT_WORKSPACE"
echo ""

echo "✨ Done! New structure:"
echo "   $AGENT_INIT_DIR/"
echo "   ├── storage/        (actual files)"
echo "   └── workspaces/"
echo "       └── default/    (symlinks)"
